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
import type { ContentKind, ScrapeContext, ScrapeProvider, ScrapeRequest } from './types.js';
import type { ScraperRegistry } from './providers/registry.js';

export const NATIVE_SCRAPERS_ID = 'com.vibeflix.native-scrapers';

/** Metadatos minimos que necesita el scraper para buscar un titulo. */
export interface ScrapedTitle {
  title?: string;
  year?: number;
  imdbId?: string;
  tmdbId?: string;
  /** Datos para distinguir anime/dorama del resto de series. */
  genres?: string[];
  country?: string;
  season?: number;
  episode?: number;
}

export interface NativeScrapersOptions {
  registry: ScraperRegistry;
  context: ScrapeContext;
  /** Resuelve los metadatos del titulo (id -> titulo, año, ids). */
  resolveTitle?: (type: string, id: string) => Promise<ScrapedTitle | undefined>;
  /** Idioma del perfil activo; se lee en cada petición (no al arrancar). */
  language?: string | (() => string | undefined);
  /** Version del addon (la del servidor). */
  version?: string;
  /** TTL de la cache de streams (ms). */
  cacheTtlMs?: number;
}

interface CacheEntry {
  expires: number;
  value: StreamResponse;
}

/** IDs de Stremio: tt123:temporada:episodio (también tmdb:123:1:2). */
export function parseEpisodeId(type: string, id: string): {
  titleId: string;
  season?: number;
  episode?: number;
} {
  if (type === 'movie') return { titleId: id };
  const match = /^(.*):(\d+):(\d+)$/.exec(id);
  if (!match || !match[1]) return { titleId: id };
  return { titleId: match[1], season: Number(match[2]), episode: Number(match[3]) };
}

/** Las categorías de StreamFlix son más precisas que `movie`/`series` de Stremio. */
export function inferContentKind(type: string, title: ScrapedTitle): ContentKind {
  if (type === 'anime' || type === 'dorama') return type;
  const genres = (title.genres ?? []).join(' ').toLowerCase();
  const country = (title.country ?? '').toLowerCase();
  if (/\banime\b/.test(genres) || (/\banimation\b|animaci[oó]n/.test(genres) && /japan|jap[oó]n|\bjp\b/.test(country))) {
    return 'anime';
  }
  if (/\bdorama\b|\bk-drama\b|korean drama/.test(genres) ||
      (type !== 'movie' && /\bdrama\b/.test(genres) && /korea|corea|\bkr\b/.test(country))) {
    return 'dorama';
  }
  return type === 'movie' ? 'movie' : 'series';
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
  private readonly language?: NativeScrapersOptions['language'];
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
      name: 'Vibe Flix',
      description: 'Fuentes nativas de Vibe Flix.',
      types: ['movie', 'series', 'episode', 'anime', 'dorama'],
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
    const language = typeof this.language === 'function' ? this.language() : this.language;
    // El mismo título puede dar fuentes distintas para dos perfiles: nunca
    // devolver la respuesta cacheada del idioma anterior.
    const key = `${request.type}:${request.id}:${language ?? ''}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;

    const episodeId = parseEpisodeId(request.type, request.id);
    const metaType = request.type === 'episode' ? 'series' : request.type;
    const title = (await this.resolveTitle?.(metaType, episodeId.titleId)) ?? {};
    const scrapeRequest: ScrapeRequest = {
      type: request.type,
      id: request.id,
      titleId: episodeId.titleId,
      kind: inferContentKind(request.type, title),
      imdbId: title.imdbId ?? (/^tt\d+$/i.test(episodeId.titleId) ? episodeId.titleId : undefined),
      tmdbId: title.tmdbId ?? (/^tmdb:\d+$/i.test(episodeId.titleId) ? episodeId.titleId.slice(5) : undefined),
      title: title.title,
      year: title.year,
      season: episodeId.season ?? title.season,
      episode: episodeId.episode ?? title.episode,
      language,
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
