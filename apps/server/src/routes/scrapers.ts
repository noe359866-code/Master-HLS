/**
 * API de los scrapers nativos (addon de streams).
 *
 *   GET  /api/scrapers        estado y proveedores disponibles
 *   PUT  /api/scrapers        activa/desactiva y configura los proveedores
 *   POST /api/scrapers/test   prueba un proveedor con un titulo
 *
 * Los proveedores se describen por configuracion (plantilla de URL de busqueda
 * y expresiones regulares), de modo que el usuario puede anadir los suyos
 * sin tocar el codigo.
 */

import type { AddonRegistry } from '@vibeflix/addon-engine';
import {
  createConfigProvider,
  DEFAULT_PROVIDERS,
  type ProviderConfig,
  type ScrapeProvider,
  type ScraperRegistry,
} from '@vibeflix/scrapers';

import type { Router } from '../http/router.js';
import { sendJson } from '../http/router.js';
import type { AppData } from '../model.js';

export interface ScraperRouteOptions {
  scrapers: ScraperRegistry;
  registry: AddonRegistry;
  getData: () => AppData;
  save: (mutate: (data: AppData) => void) => Promise<void>;
  /** Se llama tras cambiar los ajustes para re-aplicar los proveedores. */
  onSettingsChanged?: (data: AppData) => void;
  /** `fetch` inyectable (tests). */
  fetchImpl?: typeof fetch;
}

/** Descripcion publica de un proveedor. */
function describe(provider: ScrapeProvider) {
  return {
    id: provider.id,
    name: provider.name,
    region: provider.region ?? '',
    languages: provider.languages ?? [],
    types: provider.types,
  };
}

/** Valida una configuracion de proveedor minima. */
function isValidConfig(config: unknown): config is ProviderConfig {
  if (!config || typeof config !== 'object') return false;
  const value = config as Partial<ProviderConfig>;
  if (typeof value.id !== 'string' || !value.id) return false;
  if (typeof value.name !== 'string' || !value.name) return false;
  if (!Array.isArray(value.types) || !value.types.length) return false;
  return true;
}

export function registerScraperRoutes(router: Router, options: ScraperRouteOptions): void {
  const { scrapers, getData, save } = options;

  router.get('/api/scrapers', ({ res }) => {
    const settings = getData().settings.scrapers;
    const active = new Set(settings?.providers ?? []);
    sendJson(res, 200, {
      enabled: Boolean(settings?.enabled),
      providers: scrapers.list().map(describe),
      available: DEFAULT_PROVIDERS.map(describe),
      configs: settings?.configs ?? [],
      selected: settings?.providers ?? [],
    });
  });

  router.put('/api/scrapers', async ({ res, body: rawBody }) => {
    const body = (rawBody ?? {}) as {
      enabled?: boolean;
      providers?: string[];
      configs?: ProviderConfig[];
    };

    const configs = Array.isArray(body.configs)
      ? body.configs.filter(isValidConfig).map((config) => ({
          ...config,
          types: config.types.filter((type) =>
            ['movie', 'series', 'episode'].includes(type),
          ) as ProviderConfig['types'],
        }))
      : getData().settings.scrapers?.configs ?? [];

    await save((data) => {
      data.settings.scrapers = {
        enabled: body.enabled ?? data.settings.scrapers?.enabled ?? false,
        providers: Array.isArray(body.providers) ? body.providers : [],
        configs,
      };
    });

    const data = getData();
    options.onSettingsChanged?.(data);
    sendJson(res, 200, { scrapers: data.settings.scrapers });
  });

  /**
   * Prueba un proveedor con un titulo: devuelve las fuentes que encuentra.
   * Sirve para depurar una configuracion antes de dejarla activa.
   */
  router.post('/api/scrapers/test', async ({ res, body: rawBody }) => {
    const body = (rawBody ?? {}) as {
      config?: ProviderConfig;
      title?: string;
      year?: number;
      id?: string;
    };

    const title = (body.title ?? '').trim();
    if (!title) {
      sendJson(res, 400, { error: 'Falta title' });
      return;
    }

    let provider: ScrapeProvider;
    if (body.config && isValidConfig(body.config)) {
      provider = createConfigProvider(body.config);
    } else {
      const existing = scrapers.list()[0];
      if (!existing) {
        sendJson(res, 400, { error: 'No hay proveedores configurados' });
        return;
      }
      provider = existing;
    }

    const fetchImpl = options.fetchImpl ?? fetch;
    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const context = {
      userAgent,
      fetchText: async (url: string) => {
        const response = await fetchImpl(url, { headers: { 'User-Agent': userAgent } });
        return response.text();
      },
      fetchJson: async <T>(url: string) => {
        const response = await fetchImpl(url, { headers: { 'User-Agent': userAgent } });
        return (await response.json()) as T;
      },
    };

    const result = await scrapers.runProvider(
      provider,
      { type: 'movie', id: body.id ?? 'tt0000000', title, year: body.year },
      context,
    );
    sendJson(res, 200, {
      provider: result.provider,
      sources: result.sources,
      error: result.error ?? null,
    });
  });
}
