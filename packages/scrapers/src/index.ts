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
import { archiveProvider } from './providers/archive.js';
import { ScraperRegistry } from './providers/registry.js';
import type { ProviderConfig, ScrapeContext, ScrapeProvider } from './types.js';

export * from './types.js';
export * from './embed.js';
export * from './normalize.js';
export * from './addon.js';
export { createConfigProvider, fillTemplate } from './providers/config.js';
export { archiveProvider, pickBestFile } from './providers/archive.js';
export { ScraperRegistry, withTimeout } from './providers/registry.js';
export type { ProviderResult, ScraperRegistryOptions } from './providers/registry.js';

/** Proveedores que vienen de serie. */
export const DEFAULT_PROVIDERS: ScrapeProvider[] = [archiveProvider];

/** Configuraciones de ejemplo (formato de un proveedor por configuracion). */
export const DEFAULT_PROVIDER_CONFIGS: ProviderConfig[] = [];

/** Crea el contexto HTTP que usan los proveedores. */
export function createScrapeContext(options: {
  http?: HttpClient;
  fetchImpl?: typeof fetch;
  userAgent?: string;
} = {}): ScrapeContext {
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const http =
    options.http ??
    new HttpClient({
      timeoutMs: 12_000,
      retries: 1,
      userAgent,
      fetchImpl: options.fetchImpl,
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
  };
}

/** Crea un registro con los proveedores por defecto. */
export function createDefaultRegistry(options: { timeoutMs?: number } = {}): ScraperRegistry {
  const registry = new ScraperRegistry(options);
  for (const provider of DEFAULT_PROVIDERS) registry.register(provider);
  return registry;
}
