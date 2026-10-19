/**
 * Registro de addons: instalacion, cache y agregacion.
 *
 * Este es el motor central de Vibe Flix. A diferencia de un cliente Stremio
 * normal (que consulta un addon a la vez), aqui se hace *fan-out* a todos los
 * addons instalados en paralelo y se fusionan los resultados:
 *
 *  - catalogos: union de metas de todos los addons que publiquen ese catalogo.
 *  - meta:      se consulta a todos los addons compatibles con el prefijo del id.
 *  - streams:   fan-out a todos los addons de streams y orden por calidad.
 *  - subtitulos: fan-out a todos los addons de subtitulos.
 *
 * Cada addon va aislado: un addon caido o lento no rompe la respuesta, se
 * reporta en `errors` y el resto de addons siguen Seigneurrecolando.
 */

import { HttpClient } from './http.js';
import { SingleFlight, TtlCache } from './cache.js';
import {
  AddonClient,
  matchesIdPrefix,
  resourceDescriptors,
  supportsResource,
  supportsType,
} from './client.js';
import type { AddonSource } from './source.js';
import { BUILTIN_METADATA_ID, BuiltinMetadataAddon, DEFAULT_METADATA_BASE_URL } from './builtin.js';
import { mergeMeta, mergeVideos } from './normalize.js';
import { sortStreamsByQuality, streamDedupeKey } from './streamQuality.js';
import {
  AddonError,
  type AddonCatalogRequest,
  type AddonManifest,
  type CatalogDescriptor,
  type CatalogResponse,
  type MetaDetail,
  type MetaResponse,
  type Stream,
  type StreamResponse,
  type Subtitle,
  type SubtitleResponse,
} from './types.js';

export interface InstalledAddon {
  id: string;
  name: string;
  version: string;
  manifestUrl: string;
  /** true si es el addon de metadata integrada del servidor. */
  builtin?: boolean;
  manifest: AddonManifest;
  /** Catálogos que aporta este addon (ya filtrados por los que declara). */
  catalogs: CatalogDescriptor[];
  supports: {
    catalog: boolean;
    meta: boolean;
    stream: boolean;
    subtitles: boolean;
  };
  installedAt: number;
}

export interface RegistryOptions {
  http?: HttpClient;
  manifestTtlMs?: number;
  resourceTtlMs?: number;
  /** Timeout por addon en el fan-out. */
  fanoutTimeoutMs?: number;
}

export interface AggregatedResult<T> {
  /** Resultado fusionado. */
  value: T;
  /** Addons que respondieron correctamente. */
  sources: string[];
  /** Addons que fallaron, con su motivo. */
  errors: Array<{ addonId: string; message: string }>;
}

export interface CatalogEntry extends CatalogDescriptor {
  /** Addons que publican este catalogo. */
  addonIds: string[];
  /** Posicion manualmente asignada por el usuario (-1 = sin asignar). */
  order?: number;
  /** Oculto por el usuario. */
  hidden?: boolean;
}

export class AddonRegistry {
  private readonly clients = new Map<string, AddonSource>();
  private readonly manifests = new Map<string, AddonManifest>();
  private readonly http: HttpClient;
  private readonly singleFlight = new SingleFlight();
  private readonly resourceCache: TtlCache<unknown>;
  private readonly fanoutTimeoutMs: number;

  constructor(options: RegistryOptions = {}) {
    this.http = options.http ?? new HttpClient();
    this.resourceCache = new TtlCache<unknown>({ ttlMs: options.resourceTtlMs ?? 3 * 60_000 });
    this.fanoutTimeoutMs = options.fanoutTimeoutMs ?? 10_000;
  }

  /** Instala (o reinstala) un addon a partir de su manifest URL. */
  async install(
    manifestUrl: string,
    config?: Record<string, string>,
  ): Promise<InstalledAddon> {
    const client = new AddonClient(
      { manifestUrl, config },
      {
        http: this.http,
        manifestTtlMs: 15 * 60_000,
        resourceTtlMs: 3 * 60_000,
      },
    );
    const manifest = await client.manifest({ force: true });
    this.clients.set(manifest.id, client);
    this.manifests.set(manifest.id, manifest);
    this.resourceCache.clear();
    return this.describe(manifest);
  }

  /** Reinstala todos los addons (auto-update, como en WuPlay). */
  async refreshAll(): Promise<InstalledAddon[]> {
    const results: InstalledAddon[] = [];
    for (const client of this.clients.values()) {
      if (client.builtin) continue;
      try {
        const manifest = await client.getManifest({ force: true });
        this.manifests.set(manifest.id, manifest);
        results.push(this.describe(manifest));
      } catch {
        // Se conserva la version cacheada si el addon no responde.
        const cached = client.cachedManifest;
        if (cached) results.push(this.describe(cached));
      }
    }
    this.resourceCache.clear();
    return results;
  }

  remove(addonId: string): boolean {
    const removed = this.clients.delete(addonId);
    this.manifests.delete(addonId);
    this.resourceCache.clear();
    return removed;
  }

  get(addonId: string): InstalledAddon | undefined {
    const manifest = this.manifests.get(addonId);
    return manifest ? this.describe(manifest) : undefined;
  }

  list(): InstalledAddon[] {
    return [...this.manifests.values()].map((manifest) => this.describe(manifest));
  }

  get size(): number {
    return this.clients.size;
  }

  /**
   * Activa el addon de metadata integrada.
   *
   * Permite usar la app sin instalar nada (el "built-in metadata" de WuPlay y
   * el modo "essential" de NuvioTV). Se registra como un addon mas, asi que
   * el fan-out, la cache y la fusion funcionan sin casos especiales y puede
   * convivir con los addons de metadata que instale el usuario.
   */
  enableBuiltinMetadata(baseUrl: string = DEFAULT_METADATA_BASE_URL): void {
    this.disableBuiltinMetadata();
    const addon = new BuiltinMetadataAddon({ baseUrl, http: this.http });
    this.clients.set(addon.id, addon);
    this.manifests.set(addon.id, addon.manifest);
    this.resourceCache.clear();
  }

  /**
   * Registra una fuente integrada en el servidor (por ejemplo los scrapers
   * nativos). Se comporta como un addon mas: participa en el fan-out, en la
   * cache y en la fusion de respuestas.
   */
  registerSource(source: AddonSource & { manifest: AddonManifest }): void {
    this.clients.set(source.id, source);
    this.manifests.set(source.id, source.manifest);
    this.resourceCache.clear();
  }

  /** Quita una fuente integrada. */
  unregisterSource(id: string): void {
    this.clients.delete(id);
    this.manifests.delete(id);
    this.resourceCache.clear();
  }

  /** ¿Esta registrada la fuente indicada? */
  hasSource(id: string): boolean {
    return this.clients.has(id);
  }

  disableBuiltinMetadata(): void {
    this.clients.delete(BUILTIN_METADATA_ID);
    this.manifests.delete(BUILTIN_METADATA_ID);
    this.resourceCache.clear();
  }

  get hasBuiltinMetadata(): boolean {
    return this.clients.has(BUILTIN_METADATA_ID);
  }

  /**
   * Busqueda global: consulta en paralelo todos los catalogos que soportan el
   * extra `search` y fusiona los resultados (WuPlay: buscar y guardar
   * directamente en una watchlist).
   */
  async search(
    query: string,
    options: { type?: string; limit?: number } = {},
  ): Promise<AggregatedResult<CatalogResponse>> {
    const term = query.trim();
    const key = `search:${options.type ?? '*'}:${term}`;
    const cached = this.resourceCache.get(key) as AggregatedResult<CatalogResponse> | undefined;
    if (cached) return cached;

    const result = await this.singleFlight.run(key, async () => {
      const tasks: Array<{ addonId: string; type: string; id: string }> = [];
      for (const manifest of this.manifests.values()) {
        if (!supportsResource(manifest, 'catalog')) continue;
        for (const catalog of manifest.catalogs ?? []) {
          if (options.type && catalog.type !== options.type) continue;
          if (!catalog.extraSupported?.includes('search')) continue;
          if (!supportsType(manifest, catalog.type)) continue;
          tasks.push({ addonId: manifest.id, type: catalog.type, id: catalog.id });
        }
      }

      const settled = await Promise.allSettled(
        tasks.map(async (task) => {
          const value = await withTimeout(
            this.clientFor(task.addonId).catalog({
              type: task.type,
              id: task.id,
              extra: { search: term },
            }),
            this.fanoutTimeoutMs,
            `Timeout de ${this.fanoutTimeoutMs}ms`,
          );
          return { addonId: task.addonId, value };
        }),
      );

      const sources: string[] = [];
      const errors: Array<{ addonId: string; message: string }> = [];
      const byId = new Map<string, CatalogResponse['metas'][number]>();

      settled.forEach((outcome, index) => {
        const addonId = tasks[index]!.addonId;
        if (outcome.status === 'fulfilled') {
          if (!sources.includes(addonId)) sources.push(addonId);
          for (const meta of outcome.value.value.metas) {
            const existing = byId.get(meta.id);
            byId.set(meta.id, existing ? { ...meta, ...existing } : meta);
          }
        } else {
          const reason = outcome.reason;
          errors.push({
            addonId,
            message: reason instanceof Error ? reason.message : String(reason),
          });
        }
      });

      const metas = [...byId.values()];
      return {
        value: { metas: options.limit ? metas.slice(0, options.limit) : metas },
        sources,
        errors,
      };
    });

    this.resourceCache.set(key, result);
    return result;
  }

  /** Catalogo unificado de todos los addons instalados. */
  catalogs(): CatalogEntry[] {
    const entries = new Map<string, CatalogEntry>();

    for (const manifest of this.manifests.values()) {
      for (const catalog of manifest.catalogs ?? []) {
        if (!catalog?.id || !catalog?.type) continue;
        const key = `${catalog.type}:${catalog.id}`;
        const existing = entries.get(key);
        if (existing) {
          if (!existing.addonIds.includes(manifest.id)) existing.addonIds.push(manifest.id);
        } else {
          entries.set(key, {
            ...catalog,
            name: catalog.name || catalog.id,
            addonIds: [manifest.id],
          });
        }
      }
    }
    return [...entries.values()];
  }

  /**
   * Catalogo agregado: fan-out a los addons que publiquen `type/id`.
   */
  async catalog(request: AddonCatalogRequest): Promise<AggregatedResult<CatalogResponse>> {
    const key = `catalog:${request.type}:${request.id}:${JSON.stringify(request.extra ?? {})}`;
    const cached = this.resourceCache.get(key) as AggregatedResult<CatalogResponse> | undefined;
    if (cached) return cached;

    const result = await this.singleFlight.run(key, async () => {
      const sources = this.manifestsForCatalog(request.type, request.id);
      const responses = await this.fanout(
        sources,
        (addonId) => this.clientFor(addonId).catalog(request),
      );

      const byId = new Map<string, CatalogResponse['metas'][number]>();
      for (const { value } of responses.ok) {
        for (const meta of value.metas) {
          const existing = byId.get(meta.id);
          byId.set(meta.id, existing ? { ...meta, ...existing } : meta);
        }
      }
      return {
        value: { metas: [...byId.values()] },
        sources: responses.ok.map((entry) => entry.addonId),
        errors: responses.errors,
      };
    });

    this.resourceCache.set(key, result);
    return result;
  }

  /** Meta agregada: fan-out a los addons de metadatos compatibles con el id. */
  async meta(request: { type: string; id: string }): Promise<AggregatedResult<MetaResponse>> {
    const key = `meta:${request.type}:${request.id}`;
    const cached = this.resourceCache.get(key) as AggregatedResult<MetaResponse> | undefined;
    if (cached) return cached;

    const result = await this.singleFlight.run(key, async () => {
      const sources = this.manifestsForMeta(request.type, request.id);
      const responses = await this.fanout(
        sources,
        (addonId) => this.clientFor(addonId).meta(request),
      );

      let merged: MetaDetail | null = null;
      for (const { value } of responses.ok) {
        merged = mergeMeta(merged, value.meta);
      }
      return {
        value: { meta: merged },
        sources: responses.ok.map((entry) => entry.addonId),
        errors: responses.errors,
      };
    });

    this.resourceCache.set(key, result);
    return result;
  }

  /** Streams agregados: fan-out a todos los addons de streams, ordenados por calidad. */
  async streams(request: {
    type: string;
    id: string;
    cacheScope?: string;
    /** Prioriza fuentes nativas del idioma del perfil; los otros addons son fallback. */
    preferredAddonIds?: string[];
  }): Promise<AggregatedResult<StreamResponse>> {
    const key = `streams:${request.type}:${request.id}:${request.cacheScope ?? ''}:${(request.preferredAddonIds ?? []).join(',')}`;
    const cached = this.resourceCache.get(key) as AggregatedResult<StreamResponse> | undefined;
    if (cached) return cached;

    const result = await this.singleFlight.run(key, async () => {
      const sources = this.manifestsForStream(request.type, request.id);
      const responses = await this.fanout(
        sources,
        (addonId) => this.clientFor(addonId).streams(request),
      );

      const byKey = new Map<string, { stream: Stream; preferred: boolean }>();
      for (const { addonId, value } of responses.ok) {
        const preferred = request.preferredAddonIds?.includes(addonId) ?? false;
        for (const stream of value.streams) {
          const dedupeKey = streamDedupeKey(stream);
          const existing = byKey.get(dedupeKey);
          if (!existing) {
            byKey.set(dedupeKey, { stream, preferred });
            continue;
          }
          // Se conserva la información más completa y la prioridad nativa si
          // el mismo enlace llega también de otro addon.
          byKey.set(dedupeKey, {
            stream: mergeStream(existing.stream, stream),
            preferred: existing.preferred || preferred,
          });
        }
      }

      const entries = [...byKey.values()];
      const streams = [
        ...sortStreamsByQuality(entries.filter((entry) => entry.preferred).map((entry) => entry.stream)),
        ...sortStreamsByQuality(entries.filter((entry) => !entry.preferred).map((entry) => entry.stream)),
      ];
      return {
        value: { streams },
        sources: responses.ok.map((entry) => entry.addonId),
        errors: responses.errors,
      };
    });

    this.resourceCache.set(key, result);
    return result;
  }

  /** Subtitulos agregados. */
  async subtitles(request: { type: string; id: string }): Promise<AggregatedResult<SubtitleResponse>> {
    const key = `subtitles:${request.type}:${request.id}`;
    const cached = this.resourceCache.get(key) as AggregatedResult<SubtitleResponse> | undefined;
    if (cached) return cached;

    const result = await this.singleFlight.run(key, async () => {
      const sources = this.manifestsForSubtitles(request.type, request.id);
      const responses = await this.fanout(
        sources,
        (addonId) => this.clientFor(addonId).subtitles(request),
      );

      const byKey = new Map<string, Subtitle>();
      for (const { value } of responses.ok) {
        for (const subtitle of value.subtitles) {
          const key = subtitle.id ?? `${subtitle.lang}:${subtitle.url}`;
          if (!byKey.has(key)) byKey.set(key, subtitle);
        }
      }
      return {
        value: { subtitles: [...byKey.values()] },
        sources: responses.ok.map((entry) => entry.addonId),
        errors: responses.errors,
      };
    });

    this.resourceCache.set(key, result);
    return result;
  }

  /** Vacia las caches de recursos (tras instalar/quitar addons o refrescar). */
  invalidate(): void {
    this.resourceCache.clear();
    for (const client of this.clients.values()) client.invalidateResourceCache();
  }

  private clientFor(addonId: string): AddonSource {
    const client = this.clients.get(addonId);
    if (!client) throw new AddonError(addonId, 'Addon no instalado');
    return client;
  }

  private manifestsForCatalog(type: string, id: string): string[] {
    return [...this.manifests.values()]
      .filter((manifest) => {
        if (!supportsResource(manifest, 'catalog')) return false;
        if (!supportsType(manifest, type)) return false;
        return (manifest.catalogs ?? []).some(
          (catalog) => catalog.type === type && catalog.id === id,
        );
      })
      .map((manifest) => manifest.id);
  }

  private manifestsForMeta(type: string, id: string): string[] {
    return [...this.manifests.values()]
      .filter((manifest) => {
        if (!supportsResource(manifest, 'meta')) return false;
        if (!supportsType(manifest, type)) return false;
        if (!matchesIdPrefix(manifest, id)) return false;
        return resourceDescriptors(manifest).some(
          (descriptor) =>
            descriptor.name === 'meta' &&
            (!descriptor.types?.length || descriptor.types.includes(type)),
        );
      })
      .map((manifest) => manifest.id);
  }

  private manifestsForStream(type: string, id: string): string[] {
    return [...this.manifests.values()]
      .filter((manifest) => {
        if (!supportsResource(manifest, 'stream')) return false;
        if (!supportsType(manifest, type)) return false;
        if (!matchesIdPrefix(manifest, id)) return false;
        return resourceDescriptors(manifest).some(
          (descriptor) =>
            descriptor.name === 'stream' &&
            (!descriptor.types?.length || descriptor.types.includes(type)),
        );
      })
      .map((manifest) => manifest.id);
  }

  private manifestsForSubtitles(type: string, id: string): string[] {
    return [...this.manifests.values()]
      .filter((manifest) => {
        if (!supportsResource(manifest, 'subtitles')) return false;
        if (!supportsType(manifest, type)) return false;
        if (!matchesIdPrefix(manifest, id)) return false;
        return resourceDescriptors(manifest).some(
          (descriptor) =>
            descriptor.name === 'subtitles' &&
            (!descriptor.types?.length || descriptor.types.includes(type)),
        );
      })
      .map((manifest) => manifest.id);
  }

  /** Ejecuta en paralelo y aísla los fallos de cada addon. */
  private async fanout<T>(
    addonIds: string[],
    task: (addonId: string) => Promise<T>,
  ): Promise<{ ok: Array<{ addonId: string; value: T }>; errors: Array<{ addonId: string; message: string }> }> {
    const settled = await Promise.allSettled(
      addonIds.map(async (addonId) => {
        const value = await withTimeout(
          task(addonId),
          this.fanoutTimeoutMs,
          `Timeout de ${this.fanoutTimeoutMs}ms`,
        );
        return { addonId, value };
      }),
    );

    const ok: Array<{ addonId: string; value: T }> = [];
    const errors: Array<{ addonId: string; message: string }> = [];

    settled.forEach((result, index) => {
      const addonId = addonIds[index]!;
      if (result.status === 'fulfilled') {
        ok.push(result.value);
      } else {
        const reason = result.reason;
        errors.push({
          addonId,
          message: reason instanceof Error ? reason.message : String(reason),
        });
      }
    });

    return { ok, errors };
  }

  private describe(manifest: AddonManifest): InstalledAddon {
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      manifestUrl: this.clients.get(manifest.id)?.manifestUrl ?? '',
      builtin: this.clients.get(manifest.id)?.builtin ?? false,
      manifest,
      catalogs: manifest.catalogs ?? [],
      supports: {
        catalog: supportsResource(manifest, 'catalog'),
        meta: supportsResource(manifest, 'meta'),
        stream: supportsResource(manifest, 'stream'),
        subtitles: supportsResource(manifest, 'subtitles'),
      },
      installedAt: manifest.fetchedAt ?? Date.now(),
    };
  }
}

/** Fusiona dos streams equivalentes quedandose con la info mas completa. */
function mergeStream(primary: Stream, secondary: Stream): Stream {
  const merged: Stream = { ...secondary, ...primary };
  if (!primary.title && secondary.title) merged.title = secondary.title;
  if (!primary.description && secondary.description) merged.description = secondary.description;
  if (!primary.behaviorHints && secondary.behaviorHints) merged.behaviorHints = secondary.behaviorHints;
  if (!primary.subtitles?.length && secondary.subtitles?.length) merged.subtitles = secondary.subtitles;
  if (!primary.sources?.length && secondary.sources?.length) merged.sources = secondary.sources;
  return merged;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AddonError('timeout', message)), ms);
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

export { mergeVideos };
