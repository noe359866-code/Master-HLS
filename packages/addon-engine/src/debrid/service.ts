/**
 * Servicio de debrid: aplica un proveedor (Real-Debrid, AllDebrid, TorBox o
 * Premiumize) sobre los streams aggregating y cachea los enlaces resueltos.
 *
 * El servicio vive en el servidor: el enlace se resuelve una sola vez y lo
 * reaprovechan el cliente web, el shell Android TV y el propio addon Stremio
 * (WuPlay y Nuvio pueden instalarlo tal cual).
 */

import { TtlCache } from '../cache.js';
import { HttpClient } from '../http.js';
import type { Stream } from '../types.js';
import { AllDebridProvider } from './alldebrid.js';
import { PremiumizeProvider } from './premiumize.js';
import { RealDebridProvider } from './realdebrid.js';
import { TorboxProvider } from './torbox.js';
import {
  DEBRID_PROVIDERS,
  linkOf,
  type DebridConfig,
  type DebridProvider,
  type DebridProviderId,
  type DebridResolution,
} from './types.js';

export interface DebridServiceOptions {
  http?: HttpClient;
  /** Tiempo de vida de la cache de enlaces (ms). */
  cacheTtlMs?: number;
  /** Resoluciones simultaneas contra el proveedor. */
  concurrency?: number;
  /** Proveedores overriding (para tests). */
  providers?: DebridProvider[];
}

export interface DebridStatus {
  enabled: boolean;
  provider: DebridProviderId | null;
  name: string | null;
  tag: string | null;
  hosters: string[];
  /** Ultimo error de resolucion (para mostrarlo en la UI). */
  lastError?: string;
}

export class DebridService {
  private provider: DebridProvider | null = null;
  private readonly http: HttpClient;
  private readonly cache: TtlCache<DebridResolution>;
  private readonly concurrency: number;
  private readonly providers: Map<DebridProviderId, DebridProvider>;
  /** Proveedores propios que se usan tal cual (no se clonan). */
  private readonly overrides = new Set<DebridProviderId>();
  private lastError?: string;

  constructor(config?: DebridConfig | null, options: DebridServiceOptions = {}) {
    this.http = options.http ?? new HttpClient();
    this.cache = new TtlCache<DebridResolution>({ ttlMs: options.cacheTtlMs ?? 2 * 3_600_000 });
    this.concurrency = options.concurrency ?? 3;
    this.providers = new Map();
    for (const provider of defaultProviders()) {
      this.providers.set(provider.id, provider);
    }
    // Los proveedores propios se anaden (o sustituyen) a los integrated.
    for (const provider of options.providers ?? []) {
      this.providers.set(provider.id, provider);
      this.overrides.add(provider.id);
    }
    if (config?.provider && config.apiKey) {
      this.setProvider(config.provider, config.apiKey);
    }
  }

  /** Cambia (o quita) el proveedor activo. */
  setProvider(providerId: DebridProviderId | null, apiKey?: string): void {
    this.cache.clear();
    this.lastError = undefined;
    if (!providerId) {
      this.provider = null;
      return;
    }
    const factory = this.providers.get(providerId);
    if (!factory) {
      throw new Error(`Proveedor de debrid desconocido: ${providerId}`);
    }
    // Los proveedores propios se usan tal cual; los integrated se clonan con la API key.
    this.provider = apiKey && !this.overrides.has(providerId)
      ? cloneProvider(factory, apiKey)
      : factory;
  }

  get enabled(): boolean {
    return this.provider !== null;
  }

  get providerId(): DebridProviderId | null {
    return this.provider?.id ?? null;
  }

  status(): DebridStatus {
    return {
      enabled: this.enabled,
      provider: this.providerId,
      name: this.provider?.name ?? null,
      tag: this.provider?.tag ?? null,
      hosters: this.provider?.hosters ?? [],
      lastError: this.lastError,
    };
  }

  /** Comprueba las credenciales contra el proveedor. */
  async verify(): Promise<{ ok: boolean; message: string }> {
    if (!this.provider) {
      return { ok: false, message: 'No hay proveedor de debrid configurado' };
    }
    if (!this.provider.verify) {
      return { ok: true, message: `${this.provider.name} configurado` };
    }
    try {
      return await this.provider.verify(this.http);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      return { ok: false, message };
    }
  }

  /** Resuelve un stream. Devuelve `null` si no es candidato o si falla. */
  async resolveStream(stream: Stream): Promise<Stream | null> {
    if (!this.provider) return null;
    const link = linkOf(stream);
    if (!link) return null;
    // Un stream ya directo (http) y sin hoster premium no se toca.
    if (!link.infoHash && link.kind === 'url' && !stream.externalUrl) return null;

    const key = `${this.provider.id}:${link.value}`;
    const cached = this.cache.get(key);
    if (cached) {
      return applyResolution(stream, cached, this.provider.tag);
    }

    try {
      const resolution = await this.provider.resolve(stream, this.http);
      this.cache.set(key, resolution);
      this.lastError = undefined;
      return applyResolution(stream, resolution, this.provider.tag);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return null;
    }
  }

  /**
   * Resuelve todos los streams candidatos conservando el orden.
   * Los que fallan se mantienen tal cual (el usuario puede probar el original).
   */
  async resolveStreams(streams: Stream[]): Promise<Stream[]> {
    if (!this.provider || streams.length === 0) return streams;

    const results = new Array<Stream | null>(streams.length).fill(null);
    const candidates: number[] = [];
    streams.forEach((stream, index) => {
      const link = linkOf(stream);
      if (!link) return;
      if (!link.infoHash && link.kind === 'url' && !stream.externalUrl) return;
      candidates.push(index);
    });

    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < candidates.length) {
        const index = candidates[cursor]!;
        cursor += 1;
        results[index] = await this.resolveStream(streams[index]!);
      }
    };
    const workers = Array.from({ length: Math.min(this.concurrency, candidates.length) }, () => worker());
    await Promise.all(workers);

    return streams.map((stream, index) => results[index] ?? stream);
  }

  invalidate(): void {
    this.cache.clear();
  }
}

/** Aplica la resolucion al stream, etiquetingo el titulo como es costumbre. */
function applyResolution(stream: Stream, resolution: DebridResolution, tag: string): Stream {
  const title = stream.title ?? stream.name ?? resolution.name ?? 'Stream';
  const next: Stream = {
    ...stream,
    url: resolution.url,
    title: tagTitle(title, tag),
    name: resolution.name ?? stream.name,
    behaviorHints: {
      ...(stream.behaviorHints ?? {}),
      filename: resolution.name ?? stream.behaviorHints?.filename,
      videoSize: resolution.size ?? stream.behaviorHints?.videoSize,
    },
  };
  delete next.externalUrl;
  return next;
}

/** Añade la etiqueta del proveedor al titulo (p. ej. `... [RD]`). */
export function tagTitle(title: string, tag: string): string {
  const clean = title.replace(/\s*\[(RD|AL|TB|PM)\]\s*$/i, '');
  return `${clean} [${tag}]`;
}

function defaultProviders(): DebridProvider[] {
  return [
    new RealDebridProvider({ apiKey: '' }),
    new AllDebridProvider({ apiKey: '' }),
    new TorboxProvider({ apiKey: '' }),
    new PremiumizeProvider({ apiKey: '' }),
  ];
}

/** Crea una copia del proveedor con la API key concreta. */
function cloneProvider(provider: DebridProvider, apiKey: string): DebridProvider {
  switch (provider.id) {
    case 'realdebrid':
      return new RealDebridProvider({ apiKey });
    case 'alldebrid':
      return new AllDebridProvider({ apiKey });
    case 'torbox':
      return new TorboxProvider({ apiKey });
    case 'premiumize':
      return new PremiumizeProvider({ apiKey });
    default:
      return provider;
  }
}

export { DEBRID_PROVIDERS, linkOf };
export type { DebridConfig, DebridProvider, DebridProviderId, DebridResolution };
