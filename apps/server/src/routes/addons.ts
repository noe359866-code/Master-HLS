/**
 * API de gestion de addons (el "configurador" de WuPlay, pero por API).
 */

import type { AddonRegistry } from '@master-hls/addon-engine';
import type { Router } from '../http/router.js';
import { sendJson } from '../http/router.js';
import type { AppData, InstalledAddonRecord } from '../model.js';

export interface AddonRouteOptions {
  registry: AddonRegistry;
  getData: () => AppData;
  save: (mutate: (data: AppData) => void) => Promise<void>;
}

export function registerAddonRoutes(router: Router, options: AddonRouteOptions): void {
  const { registry, getData, save } = options;

  router.get('/api/addons', ({ res }) => {
    const data = getData();
    const installed = registry.list();
    sendJson(res, 200, {
      addons: installed,
      catalogs: registry.catalogs(),
      preferences: data.catalogPreferences,
    });
  });

  router.post('/api/addons', async ({ res, body: rawBody }) => {
    const body = (rawBody ?? {}) as {
      manifestUrl?: string;
      config?: Record<string, string>;
    };
    if (!body.manifestUrl) {
      sendJson(res, 400, { error: 'Falta manifestUrl' });
      return;
    }
    try {
      const installed = await registry.install(body.manifestUrl, body.config);
      await save((data) => {
        const existing = data.addons.find((record) => record.id === installed.id);
        const record: InstalledAddonRecord = {
          id: installed.id,
          name: installed.name,
          manifestUrl: installed.manifestUrl,
          config: body.config,
          installedAt: existing?.installedAt ?? Date.now(),
        };
        if (existing) Object.assign(existing, record);
        else data.addons.push(record);
      });
      sendJson(res, 200, { addon: installed });
    } catch (error) {
      sendJson(res, 400, { error: (error as Error).message });
    }
  });

  router.delete('/api/addons/:id', async ({ res, params }) => {
    const id = params['id'] ?? '';
    const removed = registry.remove(id);
    await save((data) => {
      data.addons = data.addons.filter((record) => record.id !== id);
    });
    sendJson(res, removed ? 200 : 404, { removed });
  });

  /** Auto-update: relee los manifests de todos los addons instalados. */
  router.post('/api/addons/refresh', async ({ res }) => {
    const refreshed = await registry.refreshAll();
    await save((data) => {
      for (const addon of refreshed) {
        const record = data.addons.find((entry) => entry.id === addon.id);
        if (record) {
          record.name = addon.name;
          record.lastError = undefined;
        }
      }
    });
    sendJson(res, 200, { addons: refreshed });
  });

  /** Preferencia de orden y visibilidad de catalogos. */
  router.put('/api/catalogs', async ({ res, body: rawBody }) => {
    const body = (rawBody ?? {}) as {
      preferences?: Array<{ key: string; order?: number; hidden?: boolean }>;
    };
    const preferences = body.preferences ?? [];
    await save((data) => {
      for (const preference of preferences) {
        const existing = data.catalogPreferences.find((entry) => entry.key === preference.key);
        if (existing) {
          if (preference.order !== undefined) existing.order = preference.order;
          if (preference.hidden !== undefined) existing.hidden = preference.hidden;
        } else {
          data.catalogPreferences.push({
            key: preference.key,
            order: preference.order ?? 999,
            hidden: preference.hidden ?? false,
          });
        }
      }
    });
    sendJson(res, 200, { preferences: getData().catalogPreferences });
  });
}
