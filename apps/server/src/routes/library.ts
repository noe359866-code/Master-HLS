/**
 * API de biblioteca: perfiles, watchlists, historial y progreso de reproduccion.
 */

import { randomUUID } from 'node:crypto';
import type { Router } from '../http/router.js';
import { sendJson } from '../http/router.js';
import { DEFAULT_PROFILE, type AppData, type ProgressEntry, type WatchlistItem } from '../model.js';

export interface LibraryRouteOptions {
  getData: () => AppData;
  save: (mutate: (data: AppData) => void) => Promise<void>;
}

const MAX_HISTORY = 200;

export function registerLibraryRoutes(router: Router, options: LibraryRouteOptions): void {
  const { getData, save } = options;

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
    sendJson(res, 200, { profiles: data.profiles, activeProfileId: data.activeProfileId });
  });

  router.post('/api/profiles', async ({ res, body: rawBody }) => {
    const body = (rawBody ?? {}) as Partial<typeof DEFAULT_PROFILE>;
    const profile = {
      ...DEFAULT_PROFILE,
      ...body,
      id: randomUUID(),
      createdAt: Date.now(),
    };
    await save((data) => {
      data.profiles.push(profile);
      if (!data.activeProfileId) data.activeProfileId = profile.id;
    });
    sendJson(res, 200, { profile });
  });

  router.put('/api/profiles/:id', async ({ res, body: rawBody, params }) => {
    const id = params['id'] ?? '';
    const body = (rawBody ?? {}) as Record<string, unknown>;
    await save((data) => {
      const profile = data.profiles.find((entry) => entry.id === id);
      if (profile) Object.assign(profile, body, { id: profile.id, createdAt: profile.createdAt });
    });
    const profile = getData().profiles.find((entry) => entry.id === id);
    if (!profile) {
      sendJson(res, 404, { error: 'Perfil no encontrado' });
      return;
    }
    sendJson(res, 200, { profile });
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
    sendJson(res, 200, { deleted: true });
  });

  router.post('/api/profiles/:id/activate', async ({ res, params }) => {
    const id = params['id'] ?? '';
    await save((data) => {
      if (data.profiles.some((profile) => profile.id === id)) data.activeProfileId = id;
    });
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
      Object.assign(data.settings, body);
    });
    sendJson(res, 200, { settings: getData().settings });
  });
}
