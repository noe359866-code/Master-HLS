/**
 * Metadata integrada (addon embebido).
 *
 * WuPlay ofrece "built-in metadata" para poder usar la app sin instalar
 * addons; NuvioTV tiene el modo "essential" con el mismo objetivo. Aqui se
 * implementa como un addon mas del registro, con la diferencia de que no hace
 * falta instalarlo: su manifest es sintetizado y sus respuestas salen de un
 * proveedor de metadata compatible con Cinemeta.
 *
 * Al ser un `AddonSource` como cualquier otro, el fan-out, la cache y la
 * fusion de respuestas no necesitan ningun caso especial: si el usuario
 * instala otro addon de metadata, ambos se agregan y se puede desactivar el
 * integrado desde los ajustes.
 */

import { HttpClient } from './http.js';
import { TtlCache } from './cache.js';
import {
  normalizeCatalogResponse,
  normalizeMetaResponse,
  normalizeStreamResponse,
  normalizeSubtitleResponse,
} from './normalize.js';
import { buildResourceUrl } from './url.js';
import type { AddonSource } from './source.js';
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
} from './types.js';

export const BUILTIN_METADATA_ID = 'com.masterhls.builtin-metadata';
export const DEFAULT_METADATA_BASE_URL = 'https://v3-cinemeta.strem.io';

export interface BuiltinMetadataOptions {
  /** Base del proveedor de metadata (compatible con Cinemeta). */
  baseUrl?: string;
  http: HttpClient;
  resourceTtlMs?: number;
}

export class BuiltinMetadataAddon implements AddonSource {
  readonly id = BUILTIN_METADATA_ID;
  readonly builtin = true;
  readonly manifestUrl: string;
  readonly manifest: AddonManifest;
  readonly supports = { catalog: true, meta: true, stream: false, subtitles: false };
  readonly catalogs: NonNullable<AddonManifest['catalogs']>;

  private readonly http: HttpClient;
  private readonly cache: TtlCache<unknown>;
  private readonly baseUrl: string;

  constructor(options: BuiltinMetadataOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_METADATA_BASE_URL).replace(/\/$/, '');
    this.http = options.http;
    this.cache = new TtlCache<unknown>({ ttlMs: options.resourceTtlMs ?? 3 * 60_000 });
    this.manifestUrl = `${this.baseUrl}/manifest.json`;

    this.catalogs = [
      {
        type: 'movie',
        id: 'top',
        name: 'Populares',
        extraSupported: ['search', 'skip', 'genre'],
        pageSize: 100,
      },
      {
        type: 'movie',
        id: 'bestRated',
        name: 'Mejor valorados',
        extraSupported: ['search', 'skip', 'genre'],
        pageSize: 100,
      },
      {
        type: 'movie',
        id: 'recent',
        name: 'Estrenos',
        extraSupported: ['search', 'skip', 'genre'],
        pageSize: 100,
      },
      {
        type: 'series',
        id: 'top',
        name: 'Series populares',
        extraSupported: ['search', 'skip', 'genre'],
        pageSize: 100,
      },
      {
        type: 'series',
        id: 'bestRated',
        name: 'Series mejor valoradas',
        extraSupported: ['search', 'skip', 'genre'],
        pageSize: 100,
      },
    ];

    this.manifest = {
      id: this.id,
      name: 'Master-HLS Metadata',
      version: '1.0.0',
      description:
        'Metadata integrada (Cinemeta). Permite usar Master-HLS sin instalar ningun addon.',
      logo: `${this.baseUrl}/logo.png`,
      types: ['movie', 'series'],
      idPrefixes: ['tt', 'kitsu', 'mal', 'tvdb'],
      resources: ['catalog', 'meta'],
      catalogs: this.catalogs,
      behaviorHints: { configurable: false, configurationRequired: false },
      fetchedAt: Date.now(),
    };
  }

  private url(kind: 'catalog' | 'meta' | 'stream' | 'subtitles', segments: string[], extra?: Record<string, string>) {
    return buildResourceUrl(this.manifestUrl, kind, segments, { extra });
  }

  async getManifest(_options: { force?: boolean } = {}): Promise<AddonManifest> {
    return this.manifest;
  }

  async catalog(request: AddonCatalogRequest): Promise<CatalogResponse> {
    const key = `catalog:${request.type}:${request.id}:${JSON.stringify(request.extra ?? {})}`;
    const cached = this.cache.get(key) as CatalogResponse | undefined;
    if (cached) return cached;

    const derived = derivedCatalog(request.type, request.id);
    if (derived) {
      // Catalogo predefinido: se calcula a partir del catalogo base del
      // proveedor (por ejemplo "Mejor valorados" = "top" ordenado por nota).
      const base = normalizeCatalogResponse(
        await this.http.getJson<unknown>(
          this.url('catalog', [request.type, derived.source], request.extra),
        ),
      );
      const metas = derived.sort(base.metas);
      const search = request.extra?.['search'];
      const filtered = search
        ? metas.filter((meta) => (meta.name ?? '').toLowerCase().includes(search.toLowerCase()))
        : metas;
      const response: CatalogResponse = { metas: filtered };
      this.cache.set(key, response);
      return response;
    }

    const response = normalizeCatalogResponse(
      await this.http.getJson<unknown>(this.url('catalog', [request.type, request.id], request.extra)),
    );
    this.cache.set(key, response);
    return response;
  }

  async meta(request: AddonMetaRequest): Promise<MetaResponse> {
    const key = `meta:${request.type}:${request.id}`;
    const cached = this.cache.get(key) as MetaResponse | undefined;
    if (cached) return cached;
    const response = normalizeMetaResponse(
      await this.http.getJson<unknown>(this.url('meta', [request.type, request.id])),
    );
    this.cache.set(key, response);
    return response;
  }

  async streams(_request: AddonStreamRequest): Promise<StreamResponse> {
    // El proveedor de metadata no sirve streams.
    return { streams: [] };
  }

  async subtitles(_request: AddonSubtitleRequest): Promise<SubtitleResponse> {
    return { subtitles: [] };
  }

  invalidateResourceCache(): void {
    this.cache.clear();
  }
}

/**
 * Catalogos predefinidos de la metadata integrada.
 *
 * WuPlay ofrece secciones "Trending"/"Upcoming" listas para usar; aqui se
 * calculan a partir del catalogo base del proveedor para no depender de que
 * exista un id concreto en el origen.
 */
interface DerivedCatalog {
  /** Catalogo base del proveedor. */
  source: string;
  /** Ordena las metas. */
  sort: (metas: CatalogResponse['metas']) => CatalogResponse['metas'];
}

function derivedCatalog(type: string, id: string): DerivedCatalog | null {
  if (type === 'movie' && id === 'bestRated') {
    return { source: 'top', sort: (metas) => [...metas].sort(byRating) };
  }
  if (type === 'movie' && id === 'recent') {
    return { source: 'top', sort: (metas) => [...metas].sort(byReleased) };
  }
  if (type === 'series' && id === 'bestRated') {
    return { source: 'top', sort: (metas) => [...metas].sort(byRating) };
  }
  return null;
}

function byRating(a: { imdbRating?: string }, b: { imdbRating?: string }): number {
  return Number(b.imdbRating ?? 0) - Number(a.imdbRating ?? 0);
}

function byReleased(a: { released?: string }, b: { released?: string }): number {
  return (b.released ?? '').localeCompare(a.released ?? '');
}
