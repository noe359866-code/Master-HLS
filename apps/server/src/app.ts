/**
 * Composicion de la app: store + registro de addons + router.
 *
 * Se separa de `index.ts` para poder montar la app en tests sin abrir un puerto.
 */

import path from 'node:path';
import { AddonRegistry, HttpClient } from '@master-hls/addon-engine';

import { loadConfig, type ServerConfig } from './config.js';
import { JsonStore } from './store.js';
import { emptyData, DEFAULT_PROFILE, type AppData } from './model.js';
import { Router, readJsonBody, sendJson, type RouteContext } from './http/router.js';
import { registerStremioRoutes } from './routes/stremio.js';
import { registerAddonRoutes } from './routes/addons.js';
import { registerLibraryRoutes } from './routes/library.js';
import { registerHlsRoutes } from './routes/hls.js';

export const APP_VERSION = '1.0.0';

export interface App {
  config: ServerConfig;
  store: JsonStore<AppData>;
  registry: AddonRegistry;
  router: Router;
  /** Reinstala los addons guardados (al arrancar). */
  bootstrap: () => Promise<void>;
  handle: (ctx: RouteContext) => Promise<void>;
}

export interface CreateAppOptions extends Partial<ServerConfig> {
  /** Permite inyectar un registro de addons (tests, embed). */
  registry?: AddonRegistry;
}

export function createApp(overrides: CreateAppOptions = {}): App {
  const { registry: registryOverride, ...configOverrides } = overrides;
  const config = { ...loadConfig(), ...configOverrides };
  const store = new JsonStore<AppData>(path.join(config.dataDir, 'master-hls.json'), emptyData());
  const registry =
    registryOverride ??
    new AddonRegistry({
      http: new HttpClient({ timeoutMs: 12_000, retries: 1 }),
      fanoutTimeoutMs: config.fanoutTimeoutMs,
    });

  const router = new Router();
  const getData = () => store.get();
  const save = async (mutate: (data: AppData) => void) => {
    store.mutate(mutate);
    await store.flush();
  };

  registerStremioRoutes(router, { registry, getData, appVersion: APP_VERSION });
  registerAddonRoutes(router, { registry, getData, save });
  registerLibraryRoutes(router, { getData, save });
  registerHlsRoutes(router, {});

  router.get('/api/health', ({ res }) => {
    sendJson(res, 200, {
      ok: true,
      version: APP_VERSION,
      addons: registry.size,
      profiles: getData().profiles.length,
    });
  });

  const app: App = {
    config,
    store,
    registry,
    router,
    async bootstrap() {
      const data = await store.load();

      // Garantiza al menos un perfil (WuPlay arranca pidiendo un perfil).
      if (!data.profiles.length) {
        const profile = { ...DEFAULT_PROFILE, id: 'default', createdAt: Date.now() };
        data.profiles.push(profile);
        data.activeProfileId = profile.id;
        await store.flush();
      }
      if (!data.activeProfileId && data.profiles[0]) {
        data.activeProfileId = data.profiles[0].id;
      }

      // Reinstala los addons guardados.
      for (const record of data.addons) {
        try {
          await registry.install(record.manifestUrl, record.config);
        } catch (error) {
          record.lastError = (error as Error).message;
          console.warn(`[addons] no se pudo instalar ${record.name}: ${record.lastError}`);
        }
      }

      // Addons por defecto en el primer arranque.
      if (!data.addons.length && config.defaultAddons.length) {
        for (const manifestUrl of config.defaultAddons) {
          try {
            const installed = await registry.install(manifestUrl);
            data.addons.push({
              id: installed.id,
              name: installed.name,
              manifestUrl: installed.manifestUrl,
              installedAt: Date.now(),
            });
          } catch (error) {
            console.warn(`[addons] addon por defecto fallido ${manifestUrl}:`, (error as Error).message);
          }
        }
        await store.flush();
      }
    },
    async handle(ctx) {
      const matched = router.match(ctx.req.method ?? 'GET', ctx.url.pathname);
      if (!matched) {
        sendJson(ctx.res, 404, { error: 'No encontrado' });
        return;
      }
      ctx.params = matched.params;
      if (ctx.req.method && ctx.req.method !== 'GET' && ctx.req.method !== 'HEAD') {
        ctx.body = await readJsonBody(ctx.req);
      }
      await matched.handler(ctx);
    },
  };

  return app;
}
