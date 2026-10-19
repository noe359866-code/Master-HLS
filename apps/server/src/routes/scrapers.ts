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
  createScrapeContext,
  DEFAULT_PROVIDERS,
  normalizeLanguage,
  parseEpisodeId,
  STREAMFLIX_PROVIDER_CATALOG,
  STREAMFLIX_UPSTREAM_COMMIT,
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
    // Implementado y probado con mocks no significa reproducción verificada.
    verification: DEFAULT_PROVIDERS.some((builtin) => builtin.id === provider.id)
      ? 'mock-tested' as const : 'not-tested' as const,
    liveVerified: false,
  };
}

/** Valida una configuracion de proveedor minima. */
function isValidConfig(config: unknown): config is ProviderConfig {
  if (!config || typeof config !== 'object') return false;
  const value = config as Partial<ProviderConfig>;
  if (typeof value.id !== 'string' || !value.id ||
      DEFAULT_PROVIDERS.some((provider) => provider.id === value.id)) return false;
  if (typeof value.name !== 'string' || !value.name) return false;
  if (!Array.isArray(value.types) || !value.types.length ||
      !value.types.every((type) => ['movie', 'series', 'episode', 'anime', 'dorama'].includes(type))) return false;
  if (value.languages !== undefined && (!Array.isArray(value.languages) ||
      !value.languages.every((language) => !!normalizeLanguage(language)))) return false;
  return Boolean(value.searchUrl || value.itemUrl || value.episodeUrl);
}

export function registerScraperRoutes(router: Router, options: ScraperRouteOptions): void {
  const { scrapers, getData, save } = options;

  router.get('/api/scrapers', ({ res }) => {
    const settings = getData().settings.scrapers;
    sendJson(res, 200, {
      enabled: Boolean(settings?.enabled),
      providers: scrapers.list().map(describe),
      available: DEFAULT_PROVIDERS.map(describe),
      configs: settings?.configs ?? [],
      selected: settings?.providers ?? [],
      upstreamInventory: '/api/scrapers/upstream',
    });
  });

  /** Inventario de investigación: NO se confunde con los adaptadores activos. */
  router.get('/api/scrapers/upstream', ({ res }) => {
    sendJson(res, 200, {
      repository: 'https://git.gay/streamflix-reborn2/streamflix',
      commit: STREAMFLIX_UPSTREAM_COMMIT,
      counts: {
        vod: STREAMFLIX_PROVIDER_CATALOG.filter((item) => item.state === 'registered-vod').length,
        iptv: STREAMFLIX_PROVIDER_CATALOG.filter((item) => item.state === 'registered-iptv').length,
        unregistered: STREAMFLIX_PROVIDER_CATALOG.filter((item) => item.state === 'unregistered').length,
        native: STREAMFLIX_PROVIDER_CATALOG.filter((item) => item.nativeId).length,
      },
      providers: STREAMFLIX_PROVIDER_CATALOG,
      note: 'Idioma del catálogo, no garantía de audio. IPTV y referencias sin port no son fuentes VOD.',
    });
  });

  router.put('/api/scrapers', async ({ res, body: rawBody }) => {
    const body = (rawBody ?? {}) as {
      enabled?: boolean;
      providers?: string[];
      configs?: ProviderConfig[];
    };

    if (body.configs !== undefined && (!Array.isArray(body.configs) ||
        !body.configs.every(isValidConfig))) {
      sendJson(res, 400, { error: 'Configuración de fuentes no válida' });
      return;
    }
    if (body.providers !== undefined && (!Array.isArray(body.providers) ||
        !body.providers.every((id) => typeof id === 'string' &&
          DEFAULT_PROVIDERS.some((provider) => provider.id === id)))) {
      sendJson(res, 400, { error: 'Sólo puedes seleccionar adaptadores implementados' });
      return;
    }
    const configs = body.configs ?? getData().settings.scrapers?.configs ?? [];

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
      providerId?: string;
      title?: string;
      year?: number;
      id?: string;
      tmdbId?: string;
      type?: 'movie' | 'series' | 'episode' | 'anime' | 'dorama';
      season?: number;
      episode?: number;
      language?: string;
    };

    const title = (body.title ?? '').trim();
    if (!title) {
      sendJson(res, 400, { error: 'Falta title' });
      return;
    }

    if (body.config && !isValidConfig(body.config)) {
      sendJson(res, 400, { error: 'Configuración de fuentes no válida' });
      return;
    }
    if (body.language && !normalizeLanguage(body.language)) {
      sendJson(res, 400, { error: 'Idioma no válido' });
      return;
    }

    let provider: ScrapeProvider;
    if (body.config) {
      provider = createConfigProvider(body.config);
    } else {
      const existing = body.providerId ? scrapers.get(body.providerId) : scrapers.list()[0];
      if (!existing) {
        sendJson(res, 400, { error: 'Proveedor no activo o desconocido' });
        return;
      }
      provider = existing;
    }

    const type = body.type ?? 'movie';
    const id = body.id ?? 'tt0000000';
    const titleId = parseEpisodeId(type, id).titleId;
    const profile = getData().profiles.find((entry) => entry.id === getData().activeProfileId);
    const result = await scrapers.runProvider(
      provider,
      {
        type,
        kind: body.type === 'anime' || body.type === 'dorama' ? body.type : undefined,
        id,
        titleId,
        tmdbId: body.tmdbId ?? (titleId.startsWith('tmdb:') ? titleId.slice(5) : undefined),
        title,
        year: body.year,
        season: body.season,
        episode: body.episode,
        language: normalizeLanguage(body.language) ?? profile?.contentLanguage,
      },
      createScrapeContext({ fetchImpl: options.fetchImpl }),
    );
    sendJson(res, 200, {
      provider: result.provider,
      sources: result.sources,
      error: result.error ?? null,
    });
  });
}
