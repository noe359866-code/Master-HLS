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
        name: 'Películas destacadas',
        extraSupported: ['search', 'skip', 'genre'],
        pageSize: 100,
      },
      {
        type: 'series',
        id: 'top',
        name: 'Series destacadas',
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
