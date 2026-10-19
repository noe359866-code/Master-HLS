/**
 * Registro de scrapers.
 *
 * Consulta todos los proveedores **en paralelo**, aísla los fallos (un
 * proveedor caido no puede romper el resto), deduplica y ordena por
 * calidad. Es el mismo criterio que usa el fan-out de addons, aplicado al
 * mundo de los scrapers.
 */

import { mergeSources } from '../normalize.js';
import type {
  ProviderConfig,
  ScrapeContext,
  ScrapeProvider,
  ScrapeRequest,
  ScrapedSource,
} from '../types.js';
import { createConfigProvider } from './config.js';

/** Resultado de consultar un proveedor. */
export interface ProviderResult {
  provider: string;
  sources: ScrapedSource[];
  error?: string;
}

export interface ScraperRegistryOptions {
  /** Timeout por proveedor (ms). */
  timeoutMs?: number;
}

export class ScraperRegistry {
  private readonly providers = new Map<string, ScrapeProvider>();
  private readonly timeoutMs: number;

  constructor(options: ScraperRegistryOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  /** Anade (o sustituye) un proveedor. */
  register(provider: ScrapeProvider): void {
    this.providers.set(provider.id, provider);
  }

  /** Anade un proveedor descrito por configuracion. */
  registerConfig(config: ProviderConfig): void {
    this.register(createConfigProvider(config));
  }

  remove(id: string): void {
    this.providers.delete(id);
  }

  /** Quita todos los proveedores. */
  clear(): void {
    this.providers.clear();
  }

  get size(): number {
    return this.providers.size;
  }

  /** Listado de proveedores (para los ajustes). */
  list(): ScrapeProvider[] {
    return [...this.providers.values()];
  }

  get(id: string): ScrapeProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Resuelve las fuentes de un titulo con todos los proveedores.
   *
   * Los proveedores se consultan en paralelo y cada uno tiene su propio
   * timeout: si uno se cuelga, el resto del resultado se entrega igual.
   */
  async resolve(request: ScrapeRequest, context: ScrapeContext): Promise<ScrapedSource[]> {
    const candidates = this.list().filter((provider) => {
      if (!provider.types.includes(request.type as never)) return false;
      if (request.language && provider.languages?.length) {
        return provider.languages.includes(request.language);
      }
      return true;
    });

    const settled = await Promise.all(
      candidates.map((provider) => this.runProvider(provider, request, context)),
    );

    const sources: ScrapedSource[] = [];
    for (const result of settled) sources.push(...result.sources);
    return mergeSources(sources);
  }

  /** Consulta un proveedor con timeout y captura de errores. */
  async runProvider(
    provider: ScrapeProvider,
    request: ScrapeRequest,
    context: ScrapeContext,
  ): Promise<ProviderResult> {
    try {
      const sources = await withTimeout(
        provider.fetchSources(request, context),
        this.timeoutMs,
        `timeout de ${this.timeoutMs} ms`,
      );
      return { provider: provider.name, sources };
    } catch (error) {
      return {
        provider: provider.name,
        sources: [],
        error: (error as Error).message,
      };
    }
  }
}

/** Promesa con limite de tiempo. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
