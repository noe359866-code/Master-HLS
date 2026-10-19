/**
 * API de biblioteca: perfiles, watchlists, historial y progreso de reproduccion.
 */

import { randomUUID } from 'node:crypto';
import { normalizeLanguage } from '@vibeflix/scrapers';
import type { Router } from '../http/router.js';
import { sendJson } from '../http/router.js';
import { hashProfilePin, PIN_PLACEHOLDER, publicProfile, verifyProfilePin } from '../library/profile-pin.js';
import {
  DEFAULT_PROFILE,
  type AppData,
  type AppSettings,
  type Profile,
  type ProgressEntry,
  type RatingEntry,
  type WatchlistItem,
} from '../model.js';

export interface LibraryRouteOptions {
  getData: () => AppData;
  save: (mutate: (data: AppData) => void) => Promise<void>;
  /** Se invoca cuando cambian los ajustes que afectan al registro de addons. */
  onSettingsChanged?: (data: AppData) => void;
  /** Evita devolver streams cacheados con el idioma del perfil anterior. */
  onProfileChanged?: () => void;
}

const MAX_HISTORY = 200;

/** Valida el nombre y el idioma antes de persistir el perfil. */
function profileInput(body: Record<string, unknown>): {
  name?: string;
  contentLanguage?: string;
  error?: string;
} {
  let name: string | undefined;
  let contentLanguage: string | undefined;
  if ('name' in body) {
    if (typeof body['name'] !== 'string' || !body['name'].trim() || body['name'].trim().length > 80) {
      return { error: 'El nombre del perfil debe tener entre 1 y 80 caracteres' };
    }
    name = body['name'].trim();
  }
  if ('contentLanguage' in body) {
    contentLanguage = normalizeLanguage(body['contentLanguage'] as string);
    if (!contentLanguage) return { error: 'Idioma del perfil no válido' };
  }
  if ('pin' in body && body['pin'] !== null && body['pin'] !== '' &&
      body['pin'] !== PIN_PLACEHOLDER &&
      (typeof body['pin'] !== 'string' || body['pin'].length > 128)) {
    return { error: 'PIN del perfil no válido' };
  }
  return { name, contentLanguage };
}

function storedPin(input: unknown, current?: string): string | undefined {
  if (input === PIN_PLACEHOLDER) return current;
  return typeof input === 'string' && input ? hashProfilePin(input) : undefined;
}

export function registerLibraryRoutes(router: Router, options: LibraryRouteOptions): void {
  const { getData, save, onSettingsChanged, onProfileChanged } = options;

  const profileScope = (profileId: string) => {
    const data = getData();
    return {
      watchlists: data.watchlists[profileId] ?? [],
      history: data.history[profileId] ?? [],
      progress: data.progress[profileId] ?? [],
    };
  };

  // ---------------------------------------------------------------- perfiles

  router.get('/api/profiles', ({ res }) => {
    const data = getData();
    sendJson(res, 200, {
      profiles: data.profiles.map(publicProfile), activeProfileId: data.activeProfileId,
    });
  });

  router.post('/api/profiles', async ({ res, body: rawBody }) => {
    const body = (rawBody ?? {}) as Partial<Profile>;
    const input = profileInput(body as Record<string, unknown>);
    if (input.error || body.pin === PIN_PLACEHOLDER) {
      sendJson(res, 400, { error: input.error ?? 'PIN del perfil no válido' });
      return;
    }
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      ...body,
      name: input.name ?? DEFAULT_PROFILE.name,
      pin: storedPin(body.pin),
      ...(input.contentLanguage ? {
        contentLanguage: input.contentLanguage,
        audioLanguage: input.contentLanguage.split('-')[0],
        subtitleLanguage: input.contentLanguage.split('-')[0],
      } : {}),
      id: randomUUID(),
      createdAt: Date.now(),
    };
    await save((data) => {
      data.profiles.push(profile);
      if (!data.activeProfileId) data.activeProfileId = profile.id;
    });
    sendJson(res, 200, { profile: publicProfile(profile) });
  });

  router.put('/api/profiles/:id', async ({ res, body: rawBody, params }) => {
    const id = params['id'] ?? '';
    const body = (rawBody ?? {}) as Record<string, unknown>;
    const current = getData().profiles.find((entry) => entry.id === id);
    if (!current) {
      sendJson(res, 404, { error: 'Perfil no encontrado' });
      return;
    }
    const input = profileInput(body);
    if (input.error) {
      sendJson(res, 400, { error: input.error });
      return;
    }
    const pin = 'pin' in body ? storedPin(body['pin'], current.pin) : undefined;
    await save((data) => {
      const profile = data.profiles.find((entry) => entry.id === id)!;
      Object.assign(profile, body, {
        id: profile.id,
        createdAt: profile.createdAt,
        ...('pin' in body ? { pin } : {}),
        ...(input.name ? { name: input.name } : {}),
        ...(input.contentLanguage ? {
          contentLanguage: input.contentLanguage,
          audioLanguage: input.contentLanguage.split('-')[0],
          subtitleLanguage: input.contentLanguage.split('-')[0],
        } : {}),
      });
    });
    if (getData().activeProfileId === id) onProfileChanged?.();
    sendJson(res, 200, { profile: publicProfile(getData().profiles.find((entry) => entry.id === id)!) });
  });

  router.delete('/api/profiles/:id', async ({ res, params }) => {
    const id = params['id'] ?? '';
    await save((data) => {
      data.profiles = data.profiles.filter((profile) => profile.id !== id);
      delete data.watchlists[id];
      delete data.history[id];
      delete data.progress[id];
      if (data.activeProfileId === id) {
        data.activeProfileId = data.profiles[0]?.id ?? '';
      }
    });
    onProfileChanged?.();
    sendJson(res, 200, { deleted: true });
  });

  router.post('/api/profiles/:id/activate', async ({ res, body: rawBody, params }) => {
    const id = params['id'] ?? '';
    const body = (rawBody ?? {}) as { pin?: string };
    const profile = getData().profiles.find((entry) => entry.id === id);
    if (!profile) {
      sendJson(res, 404, { error: 'Perfil no encontrado' });
      return;
    }
    // Perfil protegido por PIN (WuPlay: "Profile Set PIN").
    if (profile.pin) {
      if (body.pin === undefined || body.pin === '') {
        sendJson(res, 401, { error: 'PIN requerido', requiresPin: true });
        return;
      }
      if (typeof body.pin !== 'string' || body.pin.length > 128 ||
          !verifyProfilePin(profile.pin, body.pin)) {
        sendJson(res, 403, { error: 'PIN incorrecto', requiresPin: true });
        return;
      }
    }
    await save((data) => {
      if (data.profiles.some((entry) => entry.id === id)) data.activeProfileId = id;
    });
    onProfileChanged?.();
    sendJson(res, 200, { activeProfileId: getData().activeProfileId });
  });

  // -------------------------------------------------------------- watchlists

  router.get('/api/lists', ({ res, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    sendJson(res, 200, { lists: profileScope(profileId).watchlists });
  });

  router.post('/api/lists', async ({ res, body: rawBody, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    const body = (rawBody ?? {}) as { name?: string; description?: string };
    const list = {
      id: randomUUID(),
      name: body.name ?? 'Nueva lista',
      description: body.description,
      items: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await save((data) => {
      const lists = data.watchlists[profileId] ?? (data.watchlists[profileId] = []);
      lists.push(list);
    });
    sendJson(res, 200, { list });
  });

  router.put('/api/lists/:id', async ({ res, body: rawBody, params, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    const listId = params['id'] ?? '';
    const body = (rawBody ?? {}) as { name?: string; description?: string };
    await save((data) => {
      const list = (data.watchlists[profileId] ?? []).find((entry) => entry.id === listId);
      if (list) {
        if (body.name !== undefined) list.name = body.name;
        if (body.description !== undefined) list.description = body.description;
        list.updatedAt = Date.now();
      }
    });
    const list = (getData().watchlists[profileId] ?? []).find((entry) => entry.id === listId);
    if (!list) {
      sendJson(res, 404, { error: 'Lista no encontrada' });
      return;
    }
    sendJson(res, 200, { list });
  });

  router.delete('/api/lists/:id', async ({ res, params, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    const listId = params['id'] ?? '';
    await save((data) => {
      data.watchlists[profileId] = (data.watchlists[profileId] ?? []).filter(
        (list) => list.id !== listId,
      );
    });
    sendJson(res, 200, { deleted: true });
  });

  router.post('/api/lists/:id/items', async ({ res, body: rawBody, params, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    const listId = params['id'] ?? '';
    const body = (rawBody ?? {}) as { item?: WatchlistItem };
    const item = body.item;
    if (!item?.id) {
      sendJson(res, 400, { error: 'Falta item' });
      return;
    }
    await save((data) => {
      const list = (data.watchlists[profileId] ?? []).find((entry) => entry.id === listId);
      if (!list) return;
      const existing = list.items.findIndex(
        (entry) => entry.id === item.id && entry.episodeId === item.episodeId,
      );
      if (existing >= 0) list.items.splice(existing, 1);
      else list.items.push(item);
      list.updatedAt = Date.now();
    });
    const list = (getData().watchlists[profileId] ?? []).find((entry) => entry.id === listId);
    sendJson(res, 200, { list });
  });

  /**
   * Anade varios titulos a una lista de una vez (WuPlay: "Save search results
   * to list"). No alterna: si el titulo ya esta, se conserva.
   */
  router.post('/api/lists/:id/items/batch', async ({ res, body: rawBody, params, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    const listId = params['id'] ?? '';
    const body = (rawBody ?? {}) as { items?: WatchlistItem[] };
    const items = Array.isArray(body.items) ? body.items.filter((item) => item?.id) : [];
    if (!items.length) {
      sendJson(res, 400, { error: 'Falta items' });
      return;
    }
    await save((data) => {
      const list = (data.watchlists[profileId] ?? []).find((entry) => entry.id === listId);
      if (!list) return;
      for (const item of items) {
        const existing = list.items.findIndex(
          (entry) => entry.id === item.id && entry.episodeId === item.episodeId,
        );
        if (existing >= 0) continue;
        list.items.push({ ...item, addedAt: item.addedAt ?? Date.now() });
      }
      list.updatedAt = Date.now();
    });
    const list = (getData().watchlists[profileId] ?? []).find((entry) => entry.id === listId);
    sendJson(res, 200, { list, added: items.length });
  });

  // ---------------------------------------------------------------- historial

  router.get('/api/history', ({ res, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    sendJson(res, 200, { history: profileScope(profileId).history });
  });

  router.post('/api/history', async ({ res, body: rawBody, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    const body = (rawBody ?? {}) as {
      id?: string;
      type?: string;
      name?: string;
      poster?: string;
      streamName?: string;
    };
    const id = body.id;
    if (!id) {
      sendJson(res, 400, { error: 'Falta id' });
      return;
    }
    const entry = body;
    await save((data) => {
      const history = data.history[profileId] ?? (data.history[profileId] = []);
      const existing = history.find((item) => item.id === id);
      if (existing) {
        existing.lastWatchedAt = Date.now();
        if (entry.streamName) existing.streamName = entry.streamName;
      } else {
        history.unshift({
          id,
          type: entry.type ?? 'movie',
          name: entry.name ?? id,
          poster: entry.poster,
          streamName: entry.streamName,
          lastWatchedAt: Date.now(),
        });
      }
      if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    });
    sendJson(res, 200, { history: profileScope(profileId).history });
  });

  router.delete('/api/history', async ({ res, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    await save((data) => {
      data.history[profileId] = [];
    });
    sendJson(res, 200, { history: [] });
  });

  // ------------------------------------------------------------- valoracion

  /** Valoraciones del perfil ("Me gusta" / "No para mi"). */
  router.get('/api/ratings', ({ res, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    sendJson(res, 200, { ratings: getData().ratings?.[profileId] ?? [] });
  });

  /**
   * Guarda (o quita) la valoracion de un titulo.
   * Con `rating: ''` se elimina la valoracion.
   */
  router.post('/api/ratings', async ({ res, body: rawBody, query }) => {
    const body = (rawBody ?? {}) as {
      id?: string;
      type?: string;
      name?: string;
      poster?: string;
      rating?: 'like' | 'dislike' | '';
      genres?: string[];
    };
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    const id = body.id ?? '';
    if (!id) {
      sendJson(res, 400, { error: 'Falta id' });
      return;
    }
    await save((data) => {
      const list = data.ratings[profileId] ?? (data.ratings[profileId] = []);
      const index = list.findIndex((entry) => entry.id === id);
      if (!body.rating) {
        if (index >= 0) list.splice(index, 1);
        return;
      }
      const entry: RatingEntry = {
        id,
        type: body.type ?? 'movie',
        name: body.name ?? id,
        poster: body.poster,
        rating: body.rating,
        genres: body.genres ?? (index >= 0 ? list[index]?.genres : undefined),
        updatedAt: Date.now(),
      };
      if (index >= 0) list[index] = entry;
      else list.push(entry);
    });
    sendJson(res, 200, { ratings: getData().ratings?.[profileId] ?? [] });
  });

  // ----------------------------------------------------------------- progreso

  router.get('/api/progress', ({ res, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    sendJson(res, 200, { progress: profileScope(profileId).progress });
  });

  router.post('/api/progress', async ({ res, body: rawBody, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    const body = (rawBody ?? {}) as Partial<ProgressEntry>;
    const id = body.id;
    if (!id) {
      sendJson(res, 400, { error: 'Falta id' });
      return;
    }
    await save((data) => {
      const progress = data.progress[profileId] ?? (data.progress[profileId] = []);
      const existing = progress.find((item) => item.id === id);
      if (existing) Object.assign(existing, body, { updatedAt: Date.now() });
      else {
        progress.unshift({
          id,
          type: body.type ?? 'movie',
          name: body.name ?? id,
          poster: body.poster,
          position: body.position ?? 0,
          duration: body.duration ?? 0,
          mediaType: body.mediaType ?? 'movie',
          season: body.season,
          episode: body.episode,
          updatedAt: Date.now(),
        });
      }
    });
    sendJson(res, 200, { progress: profileScope(profileId).progress });
  });

  router.delete('/api/progress/:id', async ({ res, params, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    const id = params['id'] ?? '';
    await save((data) => {
      data.progress[profileId] = (data.progress[profileId] ?? []).filter(
        (entry) => entry.id !== id,
      );
    });
    sendJson(res, 200, { deleted: true });
  });

  // --------------------------------------------------------------- ajustes

  router.get('/api/settings', ({ res }) => {
    sendJson(res, 200, { settings: getData().settings });
  });

  router.put('/api/settings', async ({ res, body: rawBody }) => {
    const body = (rawBody ?? {}) as Record<string, unknown>;
    await save((data) => {
      // Los objetos anidados (debrid, device) se fusionan en vez de sustituirse.
      const { debrid, device, opensubtitles, skipIntro, filters, scrapers, ...rest } = body as {
        debrid?: Partial<AppSettings['debrid']>;
        device?: Partial<AppSettings['device']>;
        opensubtitles?: Partial<AppSettings['opensubtitles']>;
        skipIntro?: Partial<AppSettings['skipIntro']>;
        filters?: Partial<AppSettings['filters']>;
        scrapers?: Partial<AppSettings['scrapers']>;
      } & Record<string, unknown>;
      Object.assign(data.settings, rest);
      if (debrid) data.settings.debrid = { ...data.settings.debrid, ...debrid };
      if (device) data.settings.device = { ...data.settings.device, ...device };
      if (opensubtitles) {
        data.settings.opensubtitles = { ...data.settings.opensubtitles, ...opensubtitles };
      }
      if (skipIntro) data.settings.skipIntro = { ...data.settings.skipIntro, ...skipIntro };
      if (filters) data.settings.filters = { ...data.settings.filters, ...filters };
      if (scrapers) data.settings.scrapers = { ...data.settings.scrapers, ...scrapers };
    });
    // La metadata integrada vive en el registro de addons y el debrid en el
    // servicio de resolucion: hay que aplicar los cambios.
    onSettingsChanged?.(getData());
    sendJson(res, 200, { settings: getData().settings });
  });
}
