/**
 * Cliente del protocolo de addons Stremio para un unico addon instalado.
 *
 * Responsabilidades:
 *  - Leer y cachear el manifest.
 *  - Construir URLs de recurso heredando la query del manifest (api keys).
 *  - Exponer que recursos soporta el addon (`catalog`, `meta`, `stream`,
 *    `subtitles`) y con que prefijos de id y tipos.
 */

import { HttpClient } from './http.js';
import { TtlCache } from './cache.js';
import {
  normalizeCatalogResponse,
  normalizeMetaResponse,
  normalizeStreamResponse,
  normalizeSubtitleResponse,
} from './normalize.js';
import { buildConfigureUrl, buildResourceUrl, normalizeManifestUrl, type ResourceKind } from './url.js';
import {
  AddonError,
  type AddonCatalogRequest,
  type AddonManifest,
  type AddonMetaRequest,
  type AddonStreamRequest,
  type AddonSubtitleRequest,
  type AddonTransport,
  type CatalogResponse,
  type MetaResponse,
  type ResourceDescriptor,
  type StreamResponse,
  type SubtitleResponse,
} from './types.js';

export interface AddonClientOptions {
  http: HttpClient;
  manifestTtlMs?: number;
  resourceTtlMs?: number;
}

export class AddonClient {
  readonly transport: AddonTransport;
  readonly manifestUrl: string;

  private readonly http: HttpClient;
  private readonly manifestCache: TtlCache<AddonManifest>;
  private readonly resourceCache: TtlCache<unknown>;
  private manifestPromise: Promise<AddonManifest> | null = null;

  constructor(transport: AddonTransport, options: AddonClientOptions) {
    this.transport = transport;
    this.manifestUrl = normalizeManifestUrl(transport.manifestUrl);
    this.http = options.http;
    this.manifestCache = new TtlCache<AddonManifest>({ ttlMs: options.manifestTtlMs ?? 15 * 60_000 });
    this.resourceCache = new TtlCache<unknown>({ ttlMs: options.resourceTtlMs ?? 3 * 60_000 });
  }

  get id(): string {
    return `pending:${this.manifestUrl}`;
  }

  get configureUrl(): string {
    return buildConfigureUrl(this.manifestUrl);
  }

  /** Manifest cacheado (sin red). */
  get cachedManifest(): AddonManifest | undefined {
    return this.manifestCache.get(this.manifestUrl);
  }

  async manifest(options: { force?: boolean } = {}): Promise<AddonManifest> {
    if (options.force) {
      this.manifestCache.delete(this.manifestUrl);
      this.manifestPromise = null;
    }
    const cached = this.manifestCache.get(this.manifestUrl);
    if (cached) return cached;

    if (!this.manifestPromise) {
      this.manifestPromise = this.fetchManifest().finally(() => {
        this.manifestPromise = null;
      });
    }
    return this.manifestPromise;
  }

  private async fetchManifest(): Promise<AddonManifest> {
    const raw = await this.http.getJson<unknown>(this.manifestUrl);
    const manifest = validateManifest(raw, this.manifestUrl);
    this.manifestCache.set(this.manifestUrl, manifest);
    return manifest;
  }

  /** URLs de recurso de este addon. */
  resourceUrl(kind: ResourceKind, segments: string[], extra?: Record<string, string>): string {
    return buildResourceUrl(this.manifestUrl, kind, segments, {
      extra,
      config: this.transport.config,
    });
  }

  async catalog(request: AddonCatalogRequest): Promise<CatalogResponse> {
    const key = `catalog:${request.type}:${request.id}:${JSON.stringify(request.extra ?? {})}`;
    const cached = this.resourceCache.get(key) as CatalogResponse | undefined;
    if (cached) return cached;

    const url = this.resourceUrl(
      'catalog',
      [request.type, request.id],
      request.extra,
    );
    const response = normalizeCatalogResponse(
      await this.http.getJson<unknown>(url),
    );
    this.resourceCache.set(key, response);
    return response;
  }

  async meta(request: AddonMetaRequest): Promise<MetaResponse> {
    const key = `meta:${request.type}:${request.id}`;
    const cached = this.resourceCache.get(key) as MetaResponse | undefined;
    if (cached) return cached;

    const url = this.resourceUrl('meta', [request.type, request.id]);
    const response = normalizeMetaResponse(await this.http.getJson<unknown>(url));
    this.resourceCache.set(key, response);
    return response;
  }

  async streams(request: AddonStreamRequest): Promise<StreamResponse> {
    const key = `stream:${request.type}:${request.id}`;
    const cached = this.resourceCache.get(key) as StreamResponse | undefined;
    if (cached) return cached;

    const url = this.resourceUrl('stream', [request.type, request.id]);
    const response = normalizeStreamResponse(await this.http.getJson<unknown>(url));
    this.resourceCache.set(key, response);
    return response;
  }

  async subtitles(request: AddonSubtitleRequest): Promise<SubtitleResponse> {
    const key = `subtitles:${request.type}:${request.id}`;
    const cached = this.resourceCache.get(key) as SubtitleResponse | undefined;
    if (cached) return cached;

    const url = this.resourceUrl('subtitles', [request.type, request.id]);
    const response = normalizeSubtitleResponse(await this.http.getJson<unknown>(url));
    this.resourceCache.set(key, response);
    return response;
  }

  invalidateResourceCache(): void {
    this.resourceCache.clear();
  }
}

/** Valida y normaliza un manifest crudo. */
export function validateManifest(raw: unknown, sourceUrl: string): AddonManifest {
  if (typeof raw !== 'object' || raw === null) {
    throw new AddonError('unknown', `Manifest no valido en ${sourceUrl}`);
  }
  const record = raw as Record<string, unknown>;
  if (typeof record['id'] !== 'string' || !record['id']) {
    throw new AddonError('unknown', `Manifest sin "id" en ${sourceUrl}`);
  }
  if (typeof record['name'] !== 'string' || !record['name']) {
    throw new AddonError('unknown', `Manifest sin "name" en ${sourceUrl}`);
  }

  const manifest: AddonManifest = {
    id: record['id'],
    name: record['name'],
    version: typeof record['version'] === 'string' ? record['version'] : '0.0.0',
    fetchedAt: Date.now(),
  };

  for (const key of ['description', 'logo', 'background', 'language'] as const) {
    if (typeof record[key] === 'string') manifest[key] = record[key];
  }
  if (typeof record['configVersion'] === 'number') manifest.configVersion = record['configVersion'];
  if (Array.isArray(record['types'])) {
    manifest.types = record['types'].filter((t): t is string => typeof t === 'string');
  }
  if (Array.isArray(record['idPrefixes'])) {
    manifest.idPrefixes = record['idPrefixes'].filter((p): p is string => typeof p === 'string');
  }
  if (Array.isArray(record['catalogs'])) {
    manifest.catalogs = record['catalogs'].filter(
      (catalog): catalog is AddonManifest['catalogs'] extends (infer T)[] | undefined ? T : never =>
        typeof catalog === 'object' && catalog !== null,
    ) as AddonManifest['catalogs'];
  }
  if (Array.isArray(record['resources'])) {
    manifest.resources = record['resources'] as AddonManifest['resources'];
  }
  if (typeof record['behaviorHints'] === 'object' && record['behaviorHints'] !== null) {
    manifest.behaviorHints = record['behaviorHints'] as AddonManifest['behaviorHints'];
  }
  if (typeof record['stremioAddonsConfig'] === 'object' && record['stremioAddonsConfig'] !== null) {
    manifest.stremioAddonsConfig = record['stremioAddonsConfig'] as AddonManifest['stremioAddonsConfig'];
  }

  return manifest;
}

/** Normaliza `resources` a una lista de descriptores. */
export function resourceDescriptors(manifest: AddonManifest): ResourceDescriptor[] {
  const resources = manifest.resources ?? [];
  const descriptors: ResourceDescriptor[] = [];
  for (const resource of resources) {
    if (typeof resource === 'string') {
      descriptors.push({ name: resource });
    } else if (resource && typeof resource === 'object' && typeof resource.name === 'string') {
      descriptors.push(resource);
    }
  }
  return descriptors;
}

/** ¿El addon expone el recurso indicado? */
export function supportsResource(manifest: AddonManifest, name: string): boolean {
  return resourceDescriptors(manifest).some((descriptor) => descriptor.name === name);
}

/**
 * ¿El addon sirve este id? `idPrefixes` vacio o ausente significa "cualquiera".
 * Se comparan prefijos longest-first para que `tt` no capture `tt123` de otro
 * esquema mas largo.
 */
export function matchesIdPrefix(manifest: AddonManifest, id: string): boolean {
  const prefixes = manifest.idPrefixes;
  if (!prefixes || prefixes.length === 0) return true;
  const sorted = [...prefixes].sort((a, b) => b.length - a.length);
  return sorted.some((prefix) => id.startsWith(prefix));
}

/** ¿El addon sirve este tipo de contenido? */
export function supportsType(manifest: AddonManifest, type: string): boolean {
  const types = manifest.types;
  if (!types || types.length === 0) return true;
  return types.includes(type);
}
