/**
 * Addon nativo de streams.
 *
 * Se registra en el registro de addons como cualquier otro (el mismo
 * `AddonSource` que usa la metadata integrada), de modo que el fan-out, la
 * cache y la fusion de respuestas no necesitan ningun caso especial: las
 * fuentes raspeadas se mezclan con las de los addons instalados y el cliente
 * las ve igual.
 *
 * La diferencia es de donde sale la informacion: en vez de preguntar a un
 * addon remoto, el servidor resuelve el titulo por su cuenta.
 */

import type {
  AddonCatalogRequest,
  AddonManifest,
  AddonMetaRequest,
  AddonStreamRequest,
  AddonSubtitleRequest,
  CatalogResponse,
  MetaResponse,
  StreamResponse,
  SubtitleResponse,
} from '@vibeflix/addon-engine';

import { toStremioStream } from './normalize.js';
import type { ScrapeContext, ScrapeProvider, ScrapeRequest } from './types.js';
import type { ScraperRegistry } from './providers/registry.js';

export const NATIVE_SCRAPERS_ID = 'com.vibeflix.native-scrapers';

/** Metadatos minimos que necesita el scraper para buscar un titulo. */
export interface ScrapedTitle {
  title?: string;
  year?: number;
  imdbId?: string;
  tmdbId?: string;
  season?: number;
  episode?: number;
}

export interface NativeScrapersOptions {
  registry: ScraperRegistry;
  context: ScrapeContext;
  /** Resuelve los metadatos del titulo (id -> titulo, año, ids). */
  resolveTitle?: (type: string, id: string) => Promise<ScrapedTitle | undefined>;
  /** Idioma preferido (para filtrar proveedores). */
  language?: string;
  /** Version del addon (la del servidor). */
  version?: string;
  /** TTL de la cache de streams (ms). */
  cacheTtlMs?: number;
}

interface CacheEntry {
  expires: number;
  value: StreamResponse;
}

export class NativeScrapersAddon {
  readonly id = NATIVE_SCRAPERS_ID;
  readonly builtin = true;
  readonly manifestUrl = 'builtin://vibeflix/scrapers';
  readonly manifest: AddonManifest;
  readonly supports = { catalog: false, meta: false, stream: true, subtitles: true };

  private readonly registry: ScraperRegistry;
  private readonly context: ScrapeContext;
  private readonly resolveTitle?: NativeScrapersOptions['resolveTitle'];
  private readonly language?: string;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs: number;

  constructor(options: NativeScrapersOptions) {
    this.registry = options.registry;
    this.context = options.context;
    this.resolveTitle = options.resolveTitle;
    this.language = options.language;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60_000;

    this.manifest = {
      id: NATIVE_SCRAPERS_ID,
      version: options.version ?? '1.0.0',
      name: 'Vibe Flix Scrapers (nativo)',
      description:
        'Fuentes resueltas en el propio servidor por scrapers nativos (sin addon externo).',
      types: ['movie', 'series', 'episode'],
      resources: ['stream', 'subtitles'],
      catalogs: [],
    };
  }

  /** Los proveedores disponibles (para los ajustes). */
  providers(): ScrapeProvider[] {
    return this.registry.list();
  }

  async getManifest(): Promise<AddonManifest> {
    return this.manifest;
  }

  async catalog(_request: AddonCatalogRequest): Promise<CatalogResponse> {
    return { metas: [] };
  }

  async meta(_request: AddonMetaRequest): Promise<MetaResponse> {
    return { meta: null };
  }

  async subtitles(_request: AddonSubtitleRequest): Promise<SubtitleResponse> {
    return { subtitles: [] };
  }

  /**
   * Resuelve las fuentes de un titulo.
   *
   * El protocolo Stremio solo da el id (`tt0111161`), asi que primero se
   * resuelven los metadatos (titulo y año) y luego se consulta a los
   * proveedores.
   */
  async streams(request: AddonStreamRequest): Promise<StreamResponse> {
    const key = `${request.type}:${request.id}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;

    const title = (await this.resolveTitle?.(request.type, request.id)) ?? {};
    const scrapeRequest: ScrapeRequest = {
      type: request.type,
      id: request.id,
      imdbId: title.imdbId ?? (request.id.startsWith('tt') ? request.id : undefined),
      tmdbId: title.tmdbId,
      title: title.title,
      year: title.year,
      season: title.season,
      episode: title.episode,
      language: this.language,
    };

    const sources = await this.registry.resolve(scrapeRequest, this.context);
    const value: StreamResponse = {
      streams: sources.map((source) => toStremioStream(source)),
    };

    this.cache.set(key, { expires: Date.now() + this.cacheTtlMs, value });
    // Cache pequena: solo las ultimas busquedas.
    if (this.cache.size > 200) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].expires - b[1].expires)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    return value;
  }

  invalidateResourceCache(): void {
    this.cache.clear();
  }
}
