/**
 * Scrapers nativos de Vibe Flix.
 *
 * Addon de streams que resuelve las fuentes en el propio servidor, con el
 * patron de extractores y embeds de StreamFlix Reborn pero implementado de
 * forma nativa: sin dependencias externas, con cache, con aislamiento de
 * fallos y con la posibilidad de anadir proveedores por configuracion.
 *
 *   import { ScraperRegistry, archiveProvider } from '@vibeflix/scrapers';
 *
 *   const registry = new ScraperRegistry();
 *   registry.register(archiveProvider);
 *   const sources = await registry.resolve({ type: 'movie', id: 'tt1', title: '...' }, context);
 */

import { HttpClient } from '@vibeflix/addon-engine';

import { DEFAULT_USER_AGENT } from './embed.js';
import { createGuardedFetch, type HostLookup } from './ssrf.js';
import { archiveProvider } from './providers/archive.js';
import { cineHaxProvider } from './providers/cinehax.js';
import { fanpelisProvider } from './providers/fanpelis.js';
import { doramasflixProvider } from './providers/doramasflix.js';
import { tioAnimeProvider } from './providers/tioanime.js';
import { frembedProvider } from './providers/frembed.js';
import { ridomoviesProvider } from './providers/ridomovies.js';
import { mstreamProvider } from './providers/mstream.js';
import { guardaFlixProvider } from './providers/guardaflix.js';
import { zaluknijProvider } from './providers/zaluknij.js';
import { ScraperRegistry } from './providers/registry.js';
import type { ProviderConfig, ScrapeContext, ScrapeProvider } from './types.js';

export * from './types.js';
export * from './language.js';
export * from './embed.js';
export * from './ssrf.js';
export * from './normalize.js';
export * from './addon.js';
export * from './crypto.js';
export * from './provider-urls.js';
export { createConfigProvider, fillTemplate } from './providers/config.js';
export { archiveProvider, pickBestFile } from './providers/archive.js';
export { cineHaxProvider, parseCineHaxPlayers, cineHaxLanguageOrder } from './providers/cinehax.js';
export { fanpelisProvider, fanpelisAudioCompatible } from './providers/fanpelis.js';
export { doramasflixProvider } from './providers/doramasflix.js';
export { tioAnimeProvider } from './providers/tioanime.js';
export { frembedProvider } from './providers/frembed.js';
export { ridomoviesProvider } from './providers/ridomovies.js';
export { mstreamProvider } from './providers/mstream.js';
export { guardaFlixProvider } from './providers/guardaflix.js';
export { zaluknijProvider } from './providers/zaluknij.js';
export {
  STREAMFLIX_UPSTREAM_COMMIT, STREAMFLIX_PROVIDERS_URL, STREAMFLIX_PROVIDER_CATALOG,
} from './providers/upstream-catalog.js';
export type { UpstreamProvider, UpstreamState, UpstreamMedia } from './providers/upstream-catalog.js';
export { ScraperRegistry, withTimeout } from './providers/registry.js';
export type { ProviderResult, ScraperRegistryOptions } from './providers/registry.js';

/** Sólo adaptadores realmente implementados: el inventario upstream NO se registra aquí. */
export const DEFAULT_PROVIDERS: ScrapeProvider[] = [
  cineHaxProvider, fanpelisProvider, doramasflixProvider, tioAnimeProvider,
  frembedProvider, ridomoviesProvider, mstreamProvider, guardaFlixProvider,
  zaluknijProvider, archiveProvider,
];

/** Configuraciones de ejemplo (formato de un proveedor por configuracion). */
export const DEFAULT_PROVIDER_CONFIGS: ProviderConfig[] = [];

/** Crea el contexto HTTP que usan los proveedores. */
export function createScrapeContext(options: {
  http?: HttpClient;
  fetchImpl?: typeof fetch;
  userAgent?: string;
  /** Resolutor DNS inyectable (tests); por defecto el del sistema. */
  lookup?: HostLookup;
  /** Solo para LAN de confianza: permite proveedores en IP privadas. */
  allowPrivateHosts?: boolean;
} = {}): ScrapeContext {
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const http =
    options.http ??
    new HttpClient({
      timeoutMs: 12_000,
      retries: 1,
      userAgent,
      // Todo lo que descargan los scrapers pasa por el guardia SSRF, también
      // cuando el `fetch` está inyectado en pruebas.
      fetchImpl: createGuardedFetch({
        fetchImpl: options.fetchImpl,
        lookup: options.lookup,
        allowPrivate: options.allowPrivateHosts,
      }),
    });

  return {
    userAgent,
    async fetchText(url: string, init?: { headers?: Record<string, string> }) {
      const response = await http.get(url, { headers: init?.headers });
      return response.text();
    },
    async fetchJson<T>(url: string, init?: { headers?: Record<string, string> }) {
      const response = await http.get(url, { headers: init?.headers });
      return (await response.json()) as T;
    },
    async postJson<T>(url: string, body: unknown, init?: { headers?: Record<string, string> }) {
      return http.postJson<T>(url, body, { headers: init?.headers });
    },
  };
}

/** Crea un registro con los proveedores por defecto. */
export function createDefaultRegistry(options: { timeoutMs?: number } = {}): ScraperRegistry {
  const registry = new ScraperRegistry(options);
  for (const provider of DEFAULT_PROVIDERS) registry.register(provider);
  return registry;
}
