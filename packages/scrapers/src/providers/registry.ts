/**
 * Registro de scrapers.
 *
 * Consulta todos los proveedores **en paralelo**, aísla los fallos (un
 * proveedor caido no puede romper el resto), deduplica y ordena por
 * calidad. Es el mismo criterio que usa el fan-out de addons, aplicado al
 * mundo de los scrapers.
 */

import { languagePriority } from '../language.js';
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
    // Todos se prueban en paralelo (como en StreamFlix), pero solo se entregan
    // fuentes del mejor nivel disponible: idioma/región preferidos y categoría
    // específica antes que un proveedor genérico de series/películas.
    const candidates = this.list()
      .map((provider) => ({
        provider,
        language: languagePriority(provider, request.language),
        kind: contentPriority(provider, request),
      }))
      .filter((candidate) => candidate.language >= 0 && candidate.kind > 0);

    const settled = await Promise.all(
      candidates.map(({ provider }) => this.runProvider(provider, request, context)),
    );

    // No descartes las fuentes de menor prioridad cuando una fuente preferida
    // responde: puede fallar al abrirse, expirar su token o no ser compatible
    // con el dispositivo. Stremio necesita alternativas reales para fallback.
    // La preferencia de idioma/categoría se usa para ordenar, no para ocultar.
    const ranked: Array<{ source: ScrapedSource; rank: number; order: number }> = [];
    settled.forEach((result, index) => {
      if (!result.sources.length) return;
      const candidate = candidates[index]!;
      const rank = candidate.language * 10 + candidate.kind;
      for (const source of result.sources) {
        ranked.push({ source, rank, order: index });
      }
    });

    // mergeSources deduplica URLs y ordena por calidad. Aplicamos después la
    // prioridad de perfil como criterio principal y mantenemos calidad dentro
    // de cada nivel. Así las alternativas siguen presentes tras las preferidas.
    const merged = mergeSources(ranked.map(({ source }) => source));
    const priority = new Map<string, { rank: number; order: number }>();
    for (const entry of ranked) {
      const current = priority.get(entry.source.url);
      if (!current || entry.rank > current.rank) {
        priority.set(entry.source.url, { rank: entry.rank, order: entry.order });
      }
    }
    return merged.sort((a, b) => {
      const pa = priority.get(a.url) ?? { rank: 0, order: 0 };
      const pb = priority.get(b.url) ?? { rank: 0, order: 0 };
      return pb.rank - pa.rank || pa.order - pb.order;
    });
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

/** Anime/dorama pueden caer en una fuente genérica si no hay una especializada. */
function contentPriority(provider: ScrapeProvider, request: ScrapeRequest): number {
  const kind = request.kind ?? (request.type === 'episode' ? 'series' : request.type);
  if (provider.types.includes(kind as ScrapeProvider['types'][number])) return 3;
  if (request.season !== undefined && provider.types.includes('episode')) return 2;
  if (kind === 'anime' || kind === 'dorama') {
    const base = request.type === 'movie' ? 'movie' : 'series';
    if (provider.types.includes(base)) return 1;
  }
  return 0;
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
