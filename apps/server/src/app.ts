/**
 * Composicion de la app: store + registro de addons + router.
 *
 * Se separa de `index.ts` para poder montar la app en tests sin abrir un puerto.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { AddonRegistry, DebridService, HttpClient } from '@vibeflix/addon-engine';

import { loadConfig, type ServerConfig } from './config.js';
import { JsonStore } from './store.js';
import { emptyData, normalizeData, DEFAULT_PROFILE, type AppData } from './model.js';
import { Router, readJsonBody, sendJson, type RouteContext } from './http/router.js';
import { registerStremioRoutes } from './routes/stremio.js';
import { registerAddonRoutes } from './routes/addons.js';
import { registerLibraryRoutes } from './routes/library.js';
import { registerHlsRoutes } from './routes/hls.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerSubtitleRoutes } from './routes/subtitles.js';
import { registerBrowseRoutes } from './routes/browse.js';
import type { OpenSubtitlesService } from './services/opensubtitles.js';

export const APP_VERSION = '1.0.0';

/** Rutas de biblioteca protegidas cuando hay dispositivos vinculados. */
const PROTECTED_API_PREFIXES = [
  '/api/lists',
  '/api/history',
  '/api/progress',
  '/api/ratings',
  '/api/recommended',
];

export interface App {
  config: ServerConfig;
  store: JsonStore<AppData>;
  registry: AddonRegistry;
  /** Servicio de debrid (resolucion de enlaces premium en el servidor). */
  debrid: DebridService;
  router: Router;
  /** Reinstala los addons guardados (al arrancar). */
  bootstrap: () => Promise<void>;
  /** Activa/desactiva la metadata integrada segun los ajustes. */
  applyBuiltinMetadata: (data: AppData) => void;
  /** Activa/desactiva el proveedor de debrid segun los ajustes. */
  applyDebrid: (data: AppData) => void;
  handle: (ctx: RouteContext) => Promise<void>;
}

export interface CreateAppOptions extends Partial<ServerConfig> {
  /** Permite inyectar un registro de addons (tests, embed). */
  registry?: AddonRegistry;
  /** `fetch` inyectable para las descargas de subtitulos (tests). */
  fetchImpl?: typeof fetch;
  /** Factoría del servicio de OpenSubtitles (tests). */
  createOpenSubtitles?: (apiKey: string) => OpenSubtitlesService;
}

/**
 * Migra el fichero de datos antiguo (`master-hls.json`) al nuevo
 * (`vibe-flix.json`) tras el rebranding a Vibe Flix.
 */
async function migrateLegacyDataFile(dataDir: string, target: string): Promise<void> {
  const legacy = path.join(dataDir, 'master-hls.json');
  try {
    await fs.access(target);
    return; // ya existe el nuevo: no se toca nada
  } catch {
    // no existe todavia
  }
  try {
    const raw = await fs.readFile(legacy, 'utf8');
    await fs.writeFile(target, raw, 'utf8');
    console.log(`[store] datos migrados de ${legacy} a ${target}`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.warn('[store] no se pudo migrar el fichero de datos:', (error as Error).message);
    }
  }
}

export function createApp(overrides: CreateAppOptions = {}): App {
  const {
    registry: registryOverride,
    fetchImpl,
    createOpenSubtitles,
    ...configOverrides
  } = overrides;
  const config = { ...loadConfig(), ...configOverrides };
  // El fichero de datos paso de `master-hls.json` a `vibe-flix.json` con el
  // rebranding: si existe el antiguo, se migra para no perder la configuracion.
  const store = new JsonStore<AppData>(path.join(config.dataDir, 'vibe-flix.json'), emptyData());
  const registry =
    registryOverride ??
    new AddonRegistry({
      http: new HttpClient({ timeoutMs: 12_000, retries: 1 }),
      fanoutTimeoutMs: config.fanoutTimeoutMs,
    });

  const debrid = new DebridService(null, {
    http: new HttpClient({ timeoutMs: 15_000, retries: 1 }),
  });

  const router = new Router();
  const getData = () => store.get();
  const save = async (mutate: (data: AppData) => void) => {
    store.mutate(mutate);
    await store.flush();
  };

  registerStremioRoutes(router, { registry, getData, appVersion: APP_VERSION, debrid });
  registerAddonRoutes(router, { registry, getData, save });
  registerLibraryRoutes(router, {
    getData,
    save,
    onSettingsChanged: (data) => {
      app.applyBuiltinMetadata(data);
      app.applyDebrid(data);
    },
  });
  registerBrowseRoutes(router, { registry, getData, save });
  registerHlsRoutes(router, {});
  registerDeviceRoutes(router, { getData, save });
  registerSubtitleRoutes(router, {
    registry,
    getData,
    cacheDir: path.join(config.dataDir, 'subtitles'),
    publicUrl: () => config.publicUrl,
    fetchImpl,
    createOpenSubtitles,
  });

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
    debrid,
    router,
    /** Activa o desactiva el addon de metadata integrada segun los ajustes. */
    applyBuiltinMetadata(data: AppData) {
      if (data.settings.builtInMetadata) {
        registry.enableBuiltinMetadata(
          data.settings.builtInMetadataUrl || config.builtInMetadataUrl,
        );
      } else {
        registry.disableBuiltinMetadata();
      }
    },
    /** Configura el proveedor de debrid segun los ajustes. */
    applyDebrid(data: AppData) {
      const provider = data.settings.debrid?.provider ?? '';
      const apiKey = data.settings.debrid?.apiKey ?? '';
      if (!provider || !apiKey) {
        debrid.setProvider(null);
        return;
      }
      try {
        debrid.setProvider(provider, apiKey);
      } catch (error) {
        console.warn('[debrid] proveedor no valido:', (error as Error).message);
        debrid.setProvider(null);
      }
    },
    async bootstrap() {
      await migrateLegacyDataFile(config.dataDir, store.path);
      // El store mantiene el mismo objeto en memoria: `normalizeData` completa
      // los campos que falten (ajustes nuevos) y se persisten.
      const data = normalizeData(await store.load());
      store.mutate(() => undefined);
      await store.flush();

      // Metadata integrada: la app es utilizable sin instalar addons.
      this.applyBuiltinMetadata(data);

      // Debrid nativo: resolucion de enlaces premium en el servidor.
      this.applyDebrid(data);

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
      // Sincronizacion multi-dispositivo: si hay dispositivos vinculados, la
      // biblioteca exige un token valido (`X-Vibe-Flix-Token`).
      if (PROTECTED_API_PREFIXES.some((prefix) => ctx.url.pathname.startsWith(prefix))) {
        const list = getData().devices ?? [];
        if (list.length) {
          const header = ctx.req.headers['x-vibe-flix-token'];
          const token = Array.isArray(header) ? header[0] : header;
          const device = list.find((entry) => entry.token === token);
          if (!device) {
            sendJson(ctx.res, 401, { error: 'Dispositivo no vinculado' });
            return;
          }
          device.lastSeenAt = Date.now();
        }
      }
      ctx.params = matched.params;
      if (ctx.req.method && ctx.req.method !== 'GET' && ctx.req.method !== 'HEAD') {
        ctx.body = await readJsonBody(ctx.req);
      }
      try {
        await matched.handler(ctx);
      } catch (error) {
        // Una ruta que falla no puede dejar la peticion colgada: se responde
        // con un 500 y el mensaje del error.
        console.error('[vibe-flix] error en la ruta', ctx.url.pathname, error);
        if (!ctx.res.headersSent) {
          sendJson(ctx.res, 500, { error: (error as Error).message || 'Error interno' });
        } else {
          ctx.res.end();
        }
      }
    },
  };

  return app;
}
