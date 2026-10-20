/**
 * Badges de streams (NuvioTV: `StreamBadgeRules` / `StreamBadgeConfigServer`).
 *
 * Cada stream puede llevar badges (HDR, 4K, HEVC…) deducidos de sus
 * metadatos y/o de reglas regex personalizadas que el usuario importa desde
 * una URL. El servidor resuelve los badges en el fan-out y los expone en la
 * respuesta de streams.
 *
 * Rutas:
 *   GET    /api/stream-badges          configuración actual
 *   PUT    /api/stream-badges          reemplaza la configuración
 *   POST   /api/stream-badges/import   añade un import
 *   DELETE /api/stream-badges/import?sourceUrl=...
 *   GET    /api/stream-badges/preview?haystack=...  preview de badges
 */

import type { Router } from '../http/router.js';
import { sendJson } from '../http/router.js';
import type { AppData } from '../model.js';
import {
  badgesForStream,
  normalizeStreamBadgeConfig,
  sanitizeStreamBadgeImport,
} from '../library/stream-badges.js';
import type { StreamBadgeConfig } from '../library/stream-badges.js';

export interface StreamBadgeRouteOptions {
  getData: () => AppData;
  save: (mutate: (data: AppData) => void) => Promise<void>;
}

export function registerStreamBadgeRoutes(router: Router, options: StreamBadgeRouteOptions): void {
  const { getData, save } = options;

  const getConfig = (): StreamBadgeConfig =>
    ((getData() as AppData & { streamBadges?: StreamBadgeConfig }).streamBadges ?? { imports: [] }) as StreamBadgeConfig;

  router.get('/api/stream-badges', ({ res }) => {
    sendJson(res, 200, { config: getConfig() });
  });

  router.put('/api/stream-badges', async ({ res, body: rawBody }) => {
    const body = (rawBody ?? {}) as Record<string, unknown>;
    const imports = Array.isArray(body['imports']) ? body['imports'] : [];
    const parsed = imports
      .map((entry) => sanitizeStreamBadgeImport(entry))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const config = normalizeStreamBadgeConfig({ imports: parsed });
    await save((mutable) => {
      (mutable as AppData & { streamBadges?: StreamBadgeConfig }).streamBadges = config;
    });
    sendJson(res, 200, { config });
  });

  router.post('/api/stream-badges/import', async ({ res, body: rawBody }) => {
    const entry = sanitizeStreamBadgeImport(rawBody);
    if (!entry) {
      sendJson(res, 400, { error: 'Import no válido (sourceUrl requerido)' });
      return;
    }
    let next: StreamBadgeConfig = { imports: [] };
    await save((mutable) => {
      const current = ((mutable as AppData & { streamBadges?: StreamBadgeConfig }).streamBadges ?? { imports: [] }) as StreamBadgeConfig;
      const exists = current.imports.some((i) => i.sourceUrl.toLowerCase() === entry.sourceUrl.toLowerCase());
      const imports = exists
        ? current.imports.map((i) => (i.sourceUrl.toLowerCase() === entry.sourceUrl.toLowerCase() ? entry : i))
        : [...current.imports, entry];
      next = normalizeStreamBadgeConfig({ imports });
      (mutable as AppData & { streamBadges?: StreamBadgeConfig }).streamBadges = next;
    });
    sendJson(res, 200, { config: next });
  });

  router.delete('/api/stream-badges/import', async ({ res, query }) => {
    const sourceUrl = (query.get('sourceUrl') ?? '').trim();
    if (!sourceUrl) {
      sendJson(res, 400, { error: 'Falta sourceUrl' });
      return;
    }
    let next: StreamBadgeConfig = { imports: [] };
    await save((mutable) => {
      const current = ((mutable as AppData & { streamBadges?: StreamBadgeConfig }).streamBadges ?? { imports: [] }) as StreamBadgeConfig;
      const imports = current.imports.filter((i) => i.sourceUrl.toLowerCase() !== sourceUrl.toLowerCase());
      next = normalizeStreamBadgeConfig({ imports });
      (mutable as AppData & { streamBadges?: StreamBadgeConfig }).streamBadges = next;
    });
    sendJson(res, 200, { config: next });
  });

  router.get('/api/stream-badges/preview', ({ res, query }) => {
    const haystack = query.get('haystack') ?? '';
    const config = getConfig();
    const badges = badgesForStream(haystack, config);
    sendJson(res, 200, { badges, haystack });
  });
}
