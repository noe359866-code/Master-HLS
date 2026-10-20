/**
 * API de biblioteca: perfiles, watchlists, historial y progreso de reproduccion.
 */

import { randomUUID } from 'node:crypto';
import { normalizeLanguage } from '@vibeflix/scrapers';
import type { Router } from '../http/router.js';
import { sendJson } from '../http/router.js';
import { hashProfilePin, PIN_PLACEHOLDER, publicProfile, verifyProfilePin } from '../library/profile-pin.js';
import { normalizeParental } from '../library/parental.js';
import { saveTrackPreference, sanitizeTrackPreferencePatch } from '../library/track-prefs.js';
import { maskSecret, restoreSecret } from '../http/security.js';
import {
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  type AppData,
  type AppSettings,
  type CustomHub,
  type CustomScreen,
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

/** Límite de intentos de PIN por perfil (en memoria; se reinicia al arrancar). */
const PIN_MAX_FAILURES = 5;
const PIN_LOCK_MS = 60_000;
const pinFailures = new Map<string, { failures: number; blockedUntil: number }>();

function pinLockRemaining(profileId: string): number {
  const entry = pinFailures.get(profileId);
  if (!entry?.blockedUntil) return 0;
  const remaining = entry.blockedUntil - Date.now();
  if (remaining <= 0) {
    pinFailures.delete(profileId);
    return 0;
  }
  return Math.ceil(remaining / 1000);
}

function recordPinFailure(profileId: string): void {
  const entry = pinFailures.get(profileId) ?? { failures: 0, blockedUntil: 0 };
  entry.failures += 1;
  if (entry.failures >= PIN_MAX_FAILURES) {
    entry.failures = 0;
    entry.blockedUntil = Date.now() + PIN_LOCK_MS;
  }
  pinFailures.set(profileId, entry);
}

function clearPinFailures(profileId: string): void {
  pinFailures.delete(profileId);
}

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
  if ('currentPin' in body && body['currentPin'] !== undefined && body['currentPin'] !== null &&
      (typeof body['currentPin'] !== 'string' || body['currentPin'].length > 128)) {
    return { error: 'PIN actual no válido' };
  }
  return { name, contentLanguage };
}

function storedPin(input: unknown, current?: string): string | undefined {
  if (input === PIN_PLACEHOLDER) return current;
  return typeof input === 'string' && input ? hashProfilePin(input) : undefined;
}

/** Ajustes aptos para el cliente: las claves solo se representan con un marcador. */
function publicSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    debrid: { ...settings.debrid, apiKey: maskSecret(settings.debrid.apiKey) },
    opensubtitles: {
      ...settings.opensubtitles,
      apiKey: maskSecret(settings.opensubtitles.apiKey),
    },
  };
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
    const stringField = (key: 'avatar' | 'color', fallback: string) => {
      const value = body[key];
      return typeof value === 'string' && value && value.length <= 32 ? value : fallback;
    };
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      name: input.name ?? DEFAULT_PROFILE.name,
      avatar: stringField('avatar', DEFAULT_PROFILE.avatar),
      color: stringField('color', DEFAULT_PROFILE.color),
      autoplay: typeof body.autoplay === 'boolean' ? body.autoplay : DEFAULT_PROFILE.autoplay,
      autoplayFirstStream: typeof body.autoplayFirstStream === 'boolean'
        ? body.autoplayFirstStream : DEFAULT_PROFILE.autoplayFirstStream,
      pin: storedPin(body.pin),
      ...(body.parental ? { parental: normalizeParental(body.parental) } : {}),
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
    const data = getData();
    const current = data.profiles.find((entry) => entry.id === id);
    if (!current) {
      sendJson(res, 404, { error: 'Perfil no encontrado' });
      return;
    }
    const input = profileInput(body);
    if (input.error) {
      sendJson(res, 400, { error: input.error });
      return;
    }

    const pinProvided = 'pin' in body;
    const changingPin = pinProvided && body['pin'] !== PIN_PLACEHOLDER;
    // Cambiar el control parental exige demostrar que se conoce el PIN: si no,
    // un niño podría relajar las reglas desde el propio perfil.
    const changingParental = 'parental' in body;
    const isActive = data.activeProfileId === id;
    // Un PIN no se puede quitar ni cambiar sin conocerlo. Además, un perfil
    // protegido que no está activo no se puede editar sin desbloquearlo: así
    // tampoco se puede preparar el terreno cambiando el nombre y luego entrar.
    if (current.pin && (changingPin || changingParental || !isActive)) {
      const wait = pinLockRemaining(id);
      if (wait) {
        sendJson(res, 429, {
          error: `Demasiados intentos de PIN. Espera ${wait} s.`,
          retryAfterSeconds: wait,
          requiresPin: true,
        });
        return;
      }
      const given = typeof body['currentPin'] === 'string' ? body['currentPin'] : '';
      if (!given) {
        sendJson(res, 401, { error: 'PIN actual requerido', requiresPin: true });
        return;
      }
      if (!verifyProfilePin(current.pin, given)) {
        recordPinFailure(id);
        sendJson(res, 403, { error: 'PIN actual incorrecto', requiresPin: true });
        return;
      }
      clearPinFailures(id);
    }

    // Lista blanca de campos: ni `currentPin` ni claves arbitrarias llegan al
    // fichero de datos.
    const patch: Record<string, unknown> = {};
    if (input.name) patch['name'] = input.name;
    for (const key of ['avatar', 'color'] as const) {
      if (key in body) {
        const value = body[key];
        if (typeof value !== 'string' || !value || value.length > 32) {
          sendJson(res, 400, { error: `El campo ${key} no es válido` });
          return;
        }
        patch[key] = value;
      }
    }
    for (const key of ['autoplay', 'autoplayFirstStream'] as const) {
      if (key in body) {
        if (typeof body[key] !== 'boolean') {
          sendJson(res, 400, { error: `El campo ${key} debe ser booleano` });
          return;
        }
        patch[key] = body[key];
      }
    }
    if (input.contentLanguage) {
      patch['contentLanguage'] = input.contentLanguage;
      patch['audioLanguage'] = input.contentLanguage.split('-')[0];
      patch['subtitleLanguage'] = input.contentLanguage.split('-')[0];
    }
    if (pinProvided) {
      patch['pin'] = storedPin(body['pin'], current.pin);
    }
    if (changingParental) {
      // `null` desactiva el control parental; un objeto lo configura.
      patch['parental'] = body['parental'] === null
        ? undefined
        : normalizeParental(body['parental']);
    }

    await save((data) => {
      const profile = data.profiles.find((entry) => entry.id === id);
      if (!profile) return;
      Object.assign(profile, patch, { id: profile.id, createdAt: profile.createdAt });
    });
    if (getData().activeProfileId === id) onProfileChanged?.();
    sendJson(res, 200, { profile: publicProfile(getData().profiles.find((entry) => entry.id === id)!) });
  });

  router.delete('/api/profiles/:id', async ({ res, req, body: rawBody, params }) => {
    const id = params['id'] ?? '';
    const profile = getData().profiles.find((entry) => entry.id === id);
    if (profile?.pin) {
      const wait = pinLockRemaining(id);
      if (wait) {
        sendJson(res, 429, {
          error: `Demasiados intentos de PIN. Espera ${wait} s.`,
          retryAfterSeconds: wait,
          requiresPin: true,
        });
        return;
      }
      const body = (rawBody ?? {}) as { pin?: unknown; currentPin?: unknown };
      const header = req.headers['x-vibe-flix-pin'];
      const given = typeof body.currentPin === 'string' ? body.currentPin
        : typeof body.pin === 'string' ? body.pin
          : Array.isArray(header) ? header[0] : header;
      if (!given) {
        sendJson(res, 401, { error: 'PIN requerido para borrar el perfil', requiresPin: true });
        return;
      }
      if (!verifyProfilePin(profile.pin, given)) {
        recordPinFailure(id);
        sendJson(res, 403, { error: 'PIN incorrecto', requiresPin: true });
        return;
      }
      clearPinFailures(id);
    }
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
      const wait = pinLockRemaining(id);
      if (wait) {
        sendJson(res, 429, {
          error: `Demasiados intentos de PIN. Espera ${wait} s.`,
          retryAfterSeconds: wait,
          requiresPin: true,
        });
        return;
      }
      if (body.pin === undefined || body.pin === '') {
        sendJson(res, 401, { error: 'PIN requerido', requiresPin: true });
        return;
      }
      if (typeof body.pin !== 'string' || body.pin.length > 128 ||
          !verifyProfilePin(profile.pin, body.pin)) {
        recordPinFailure(id);
        sendJson(res, 403, { error: 'PIN incorrecto', requiresPin: true });
        return;
      }
      clearPinFailures(id);
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

  /** Valoraciones del perfil ("Me gusta" / "Loved" / "No para mi" WuPlay v0.9.1). */
  router.get('/api/ratings', ({ res, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    sendJson(res, 200, { ratings: getData().ratings?.[profileId] ?? [] });
  });

  /**
   * Guarda (o quita) la valoracion de un titulo.
   * Con `rating: ''` se elimina la valoracion. WuPlay v0.9.1: like/dislike/love.
   */
  router.post('/api/ratings', async ({ res, body: rawBody, query }) => {
    const body = (rawBody ?? {}) as {
      id?: string;
      type?: string;
      name?: string;
      poster?: string;
      rating?: 'like' | 'dislike' | 'love' | '';
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
        rating: body.rating as RatingEntry['rating'],
        genres: body.genres ?? (index >= 0 ? list[index]?.genres : undefined),
        updatedAt: Date.now(),
      };
      if (index >= 0) list[index] = entry;
      else list.push(entry);
    });
    sendJson(res, 200, { ratings: getData().ratings?.[profileId] ?? [] });
  });

  // ---------------------------------------------------------- hidden titles (WuPlay Hide Everywhere)
  router.get('/api/hidden', ({ res, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    sendJson(res, 200, { hidden: getData().hiddenTitles?.[profileId] ?? [] });
  });

  router.post('/api/hidden', async ({ res, body: rawBody, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    const body = (rawBody ?? {}) as { id?: string; type?: string; name?: string };
    const tid = (body.id ?? '').trim();
    if (!tid) { sendJson(res, 400, { error: 'Falta id' }); return; }
    await save((data) => {
      data.hiddenTitles ??= {};
      data.hiddenTitles[profileId] ??= [];
      if (!data.hiddenTitles[profileId].some((e) => e.id === tid)) {
        data.hiddenTitles[profileId].push({ id: tid, type: body.type ?? 'movie', name: body.name ?? tid, hiddenAt: Date.now() });
      }
    });
    sendJson(res, 200, { hidden: getData().hiddenTitles?.[profileId] ?? [] });
  });

  router.delete('/api/hidden/:id', async ({ res, params, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    const tid = params['id'] ?? '';
    await save((data) => {
      data.hiddenTitles ??= {};
      data.hiddenTitles[profileId] = (data.hiddenTitles[profileId] ?? []).filter((e) => e.id !== tid);
    });
    sendJson(res, 200, { hidden: getData().hiddenTitles?.[profileId] ?? [] });
  });

  router.delete('/api/hidden', async ({ res, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    await save((data) => {
      data.hiddenTitles ??= {};
      data.hiddenTitles[profileId] = [];
    });
    sendJson(res, 200, { hidden: [] });
  });

  // ---------------------------------------------------------- custom hubs/screens (WuPlay v0.8.0+)
  router.get('/api/custom-hubs', ({ res }) => {
    sendJson(res, 200, { hubs: getData().customHubs ?? [] });
  });
  router.post('/api/custom-hubs', async ({ res, body: rawBody }) => {
    const body = (rawBody ?? {}) as { name?: string; type?: string; genre?: string; keyword?: string; network?: string; preset?: string; layout?: string };
    const hub = {
      id: randomUUID(),
      name: (body.name ?? 'Nuevo hub').slice(0, 80),
      type: (body.type as CustomHub['type']) ?? 'genre',
      genre: body.genre, keyword: body.keyword, network: body.network, preset: body.preset,
      layout: (body.layout as CustomHub['layout']) ?? 'rows',
      createdAt: Date.now(),
    } as import('../model.js').CustomHub;
    await save((data) => { data.customHubs ??= []; data.customHubs.push(hub); });
    sendJson(res, 200, { hub });
  });
  router.delete('/api/custom-hubs/:id', async ({ res, params }) => {
    const cid = params['id'] ?? '';
    await save((data) => { data.customHubs = (data.customHubs ?? []).filter((h) => h.id !== cid); });
    sendJson(res, 200, { deleted: true });
  });
  router.get('/api/custom-screens', ({ res }) => {
    sendJson(res, 200, { screens: getData().customScreens ?? [] });
  });
  router.post('/api/custom-screens', async ({ res, body: rawBody }) => {
    const body = (rawBody ?? {}) as { name?: string; hubs?: string[]; layout?: string };
    const screen = {
      id: randomUUID(),
      name: (body.name ?? 'Nueva pantalla').slice(0, 80),
      hubs: Array.isArray(body.hubs) ? body.hubs.slice(0, 20) : [],
      layout: (body.layout as CustomScreen['layout']) ?? 'rows',
      createdAt: Date.now(),
    } as import('../model.js').CustomScreen;
    await save((data) => { data.customScreens ??= []; data.customScreens.push(screen); });
    sendJson(res, 200, { screen });
  });
  router.delete('/api/custom-screens/:id', async ({ res, params }) => {
    const cid = params['id'] ?? '';
    await save((data) => { data.customScreens = (data.customScreens ?? []).filter((s) => s.id !== cid); });
    sendJson(res, 200, { deleted: true });
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

  // Next-up: siguiente episodio a ver (NuvioTV: ContinueWatchingNextUpReconciliation)
  router.get('/api/progress/next-up', async ({ res, query }) => {
    const contentId = (query.get('contentId') ?? '').trim();
    if (!contentId) {
      sendJson(res, 400, { error: 'Falta contentId' });
      return;
    }
    const season = query.get('season') ? Number(query.get('season')) : undefined;
    const episode = query.get('episode') ? Number(query.get('episode')) : undefined;
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    const progress = profileScope(profileId).progress;
    const current = progress.find(
      (p) => p.id === contentId && (season === undefined || p.season === season) && (episode === undefined || p.episode === episode),
    );
    // La lista de episodios viene de la metadata; aquí devolvemos el estado
    // del progreso para que el cliente proyecte el siguiente.
    const completed = current ? current.position / Math.max(1, current.duration) >= 0.9 : false;
    sendJson(res, 200, {
      current: current ? { id: current.id, season: current.season, episode: current.episode, position: current.position, duration: current.duration } : null,
      isCurrentCompleted: completed,
      // El cliente resuelve nextEpisode contra meta.videos localmente.
    });
  });

  // --------------------------------------------- preferencias de pista (Nuvio)
  // Audio, subtítulo, desfase y velocidad por videoId (NuvioTV:
  // `TrackPreferenceDataStore`): un desfase calibrado para un episodio no
  // sirve para el siguiente, así que cada vídeo guarda lo suyo.

  router.get('/api/track-prefs/:videoId', ({ res, params, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    const videoId = params['videoId'] ?? '';
    const pref = getData().trackPrefs[profileId]?.[videoId] ?? null;
    sendJson(res, 200, { pref });
  });

  router.put('/api/track-prefs/:videoId', async ({ res, params, body: rawBody, query }) => {
    const videoId = params['videoId'] ?? '';
    if (!videoId || videoId.length > 128) {
      sendJson(res, 400, { error: 'videoId no válido' });
      return;
    }
    const body = (rawBody ?? {}) as Record<string, unknown> & { profileId?: string };
    const profileId = body.profileId ?? query.get('profileId') ?? getData().activeProfileId;
    const patch = sanitizeTrackPreferencePatch(body);
    if (!Object.keys(patch).length) {
      sendJson(res, 400, { error: 'Preferencia de pista sin campos válidos' });
      return;
    }
    let saved: ReturnType<typeof saveTrackPreference> = null;
    await save((data) => {
      data.trackPrefs ??= {};
      saved = saveTrackPreference(data.trackPrefs, profileId, videoId, patch);
    });
    sendJson(res, 200, { pref: saved });
  });

  router.delete('/api/track-prefs/:videoId', async ({ res, params, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    const videoId = params['videoId'] ?? '';
    await save((data) => {
      delete data.trackPrefs[profileId]?.[videoId];
    });
    sendJson(res, 200, { deleted: true });
  });

  // --------------------------------------------------------------- ajustes

  router.get('/api/settings', ({ res }) => {
    // Las claves nunca vuelven al cliente: solo el marcador que indica que
    // existen. Al guardar, el marcador se sustituye por el valor real.
    sendJson(res, 200, { settings: publicSettings(getData().settings) });
  });

  router.get('/api/export', ({ res }) => {
    // Copia de datos del usuario (WuPlay: «Privacy & Data» de la configuración
    // web). Los secretos (PIN, claves de API) salen como marcadores, nunca en
    // claro: el fichero puede compartirse para soporte sin filtrar credenciales.
    const data = getData();
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader('content-disposition', `attachment; filename="vibeflix-export-${day}.json"`);
    sendJson(res, 200, {
      app: 'vibe-flix',
      exportedAt: new Date().toISOString(),
      ...data,
      // `publicProfile` sustituye el PIN por un marcador; `publicSettings`
      // hace lo propio con las claves de API (debrid, OpenSubtitles...).
      profiles: data.profiles.map(publicProfile),
      settings: publicSettings(data.settings),
    });
  });

  router.put('/api/settings', async ({ res, body: rawBody }) => {
    const body = (rawBody ?? {}) as Record<string, unknown>;
    await save((data) => {
      // Los objetos anidados (debrid, device) se fusionan en vez de sustituirse.
      const { debrid, device, opensubtitles, skipIntro, filters, scrapers, playback, ...rest } = body as {
        debrid?: Partial<AppSettings['debrid']>;
        device?: Partial<AppSettings['device']>;
        opensubtitles?: Partial<AppSettings['opensubtitles']>;
        skipIntro?: Partial<AppSettings['skipIntro']>;
        filters?: Partial<AppSettings['filters']>;
        scrapers?: Partial<AppSettings['scrapers']>;
        playback?: Partial<AppSettings['playback']>;
      } & Record<string, unknown>;
      // `uiMode` solo admite los dos modos documentados (NuvioTV: Essential /
      // Advanced); cualquier otro valor se ignora y conserva el anterior.
      if ('uiMode' in rest && rest.uiMode !== 'essential' && rest.uiMode !== 'advanced') {
        delete rest.uiMode;
      }
      Object.assign(data.settings, rest);
      if (playback) {
        const next = { ...playback };
        // «¿Sigues viendo?»: entero 0-20 (0 = nunca); fuera de rango cae al
        // por defecto (3 episodios, WuPlay v0.6.5), igual que al cargar.
        if ('stillWatchingAfter' in next) {
          const value = Number(next.stillWatchingAfter);
          next.stillWatchingAfter =
            Number.isInteger(value) && value >= 0 && value <= 20
              ? value
              : DEFAULT_SETTINGS.playback.stillWatchingAfter;
        }
        data.settings.playback = { ...data.settings.playback, ...next };
      }
      if (debrid) {
        const next = { ...debrid };
        if ('apiKey' in next) {
          next.apiKey = restoreSecret(next.apiKey, data.settings.debrid.apiKey);
        }
        data.settings.debrid = { ...data.settings.debrid, ...next };
      }
      if (device) data.settings.device = { ...data.settings.device, ...device };
      if (opensubtitles) {
        const next = { ...opensubtitles };
        if ('apiKey' in next) {
          next.apiKey = restoreSecret(next.apiKey, data.settings.opensubtitles.apiKey);
        }
        data.settings.opensubtitles = { ...data.settings.opensubtitles, ...next };
      }
      if (skipIntro) data.settings.skipIntro = { ...data.settings.skipIntro, ...skipIntro };
      if (filters) data.settings.filters = { ...data.settings.filters, ...filters };
      if (scrapers) data.settings.scrapers = { ...data.settings.scrapers, ...scrapers };
    });
    // La metadata integrada vive en el registro de addons y el debrid en el
    // servicio de resolucion: hay que aplicar los cambios.
    onSettingsChanged?.(getData());
    // La respuesta tampoco revela las claves: reenviar el marcador las
    // conserva, así que un PUT puede responder solo con `••••`.
    sendJson(res, 200, { settings: publicSettings(getData().settings) });
  });
}
