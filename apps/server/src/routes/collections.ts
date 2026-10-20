/**
 * Colecciones curadas (NuvioTV: `Collection` + `CollectionSource`).
 *
 * Cada colección es un catálogo derivado (franquicia, productora, cadena,
 * persona, keyword) que aparece como un hub más en el Home. El servidor las
 * persiste y las resuelve consultando los catálogos instalados o la metadata
 * integrada.
 *
 * Rutas:
 *   GET    /api/collections        lista todas las colecciones
 *   GET    /api/collections/:id    detalle
 *   POST   /api/collections        crea (o actualiza si ya existe el id)
 *   DELETE /api/collections/:id   elimina
 *   GET    /api/collections/presets  presets ofrecidos (no persistidos)
 */

import { randomUUID } from 'node:crypto';

import type { Router } from '../http/router.js';
import { sendJson } from '../http/router.js';
import type { AppData } from '../model.js';
import { COLLECTION_PRESETS, sanitizeCollection } from '../library/collections.js';

export interface CollectionRouteOptions {
  getData: () => AppData;
  save: (mutate: (data: AppData) => void) => Promise<void>;
}

export function registerCollectionRoutes(router: Router, options: CollectionRouteOptions): void {
  const { getData, save } = options;

  router.get('/api/collections', ({ res }) => {
    const data = getData();
    const collections = (data as AppData & { collections?: unknown }).collections ?? [];
    sendJson(res, 200, { collections });
  });

  router.get('/api/collections/presets', ({ res }) => {
    sendJson(res, 200, { presets: COLLECTION_PRESETS });
  });

  router.get('/api/collections/:id', ({ res, params }) => {
    const id = params['id'] ?? '';
    const data = getData();
    const collections = (data as AppData & { collections?: unknown }).collections as AppData['collections'] ?? [];
    const found = collections.find((c) => c.id === id);
    if (!found) {
      sendJson(res, 404, { error: 'Colección no encontrada' });
      return;
    }
    sendJson(res, 200, { collection: found });
  });

  router.post('/api/collections', async ({ res, body: rawBody }) => {
    const body = (rawBody ?? {}) as Record<string, unknown>;
    const data = getData();
    const collections = ((data as AppData & { collections?: unknown }).collections ?? []) as AppData['collections'];
    const entry = sanitizeCollection(body, collections);
    if (!entry) {
      sendJson(res, 400, { error: 'Colección no válida' });
      return;
    }
    if (!entry.id) entry.id = randomUUID();
    await save((mutable) => {
      const list = ((mutable as AppData & { collections?: unknown }).collections ??= []) as AppData['collections'];
      const idx = list.findIndex((c) => c.id === entry.id);
      if (idx >= 0) list[idx] = { ...list[idx]!, ...entry, updatedAt: Date.now() };
      else list.push(entry);
    });
    sendJson(res, 200, { collection: entry });
  });

  router.delete('/api/collections/:id', async ({ res, params }) => {
    const id = params['id'] ?? '';
    await save((mutable) => {
      const list = ((mutable as AppData & { collections?: unknown }).collections ?? []) as AppData['collections'];
      (mutable as AppData & { collections?: unknown }).collections = list.filter((c) => c.id !== id);
    });
    sendJson(res, 200, { deleted: true });
  });
}
