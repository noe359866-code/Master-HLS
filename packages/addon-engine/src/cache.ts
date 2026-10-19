/**
 * Cache TTL en memoria con limite de entradas (LRU) para las respuestas de
 * addons: catálogos, metas y streams. Evita golpear los addons en cada scroll
 * de la interfaz y aísla addons caídos.
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccess: number;
}

export interface TtlCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

export class TtlCache<T = unknown> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: TtlCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 5 * 60_000;
    this.maxEntries = options.maxEntries ?? 500;
    this.now = options.now ?? Date.now;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    entry.lastAccess = this.now();
    // Refresh de orden LRU.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    const now = this.now();
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + (ttlMs ?? this.ttlMs), lastAccess: now });
    this.evict();
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private evict(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}

/**
 * Cache "single-flight": si varias peticiones simultaneas piden la misma clave,
 * solo se ejecuta una vez y todas comparten el resultado.
 */
export class SingleFlight {
  private readonly inflight = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = fn().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }
}
