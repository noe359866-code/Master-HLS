/**
 * Cache TTL en memoria con limite de entradas (LRU) para las respuestas de
 * addons: catálogos, metas y streams. Evita golpear los addons en cada scroll
 * de la interfaz y aísla addons caídos.
 */

export interface CacheEntry<T> {
  value: T;
  /** Momento en que se guardo el valor. */
  storedAt: number;
  expiresAt: number;
  /** Hasta cuando se puede seguir sirviendo el valor caducado (SWR). */
  staleUntil: number;
  lastAccess: number;
}

export interface TtlCacheOptions {
  ttlMs?: number;
  /**
   * Ventana extra durante la que un valor caducado se puede seguir sirviendo
   * mientras se refresca en segundo plano (stale-while-revalidate). `0` lo
   * desactiva y la cache se comporta como antes.
   */
  staleTtlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

/** Resultado de mirar una clave sin importar si esta fresca. */
export interface CachePeek<T> {
  value: T;
  /** true si aun esta dentro del TTL. */
  fresh: boolean;
  /** Milisegundos desde que se guardo. */
  ageMs: number;
}

export class TtlCache<T = unknown> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly staleTtlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: TtlCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 5 * 60_000;
    this.staleTtlMs = options.staleTtlMs ?? 0;
    this.maxEntries = options.maxEntries ?? 500;
    this.now = options.now ?? Date.now;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      // Dentro de la ventana SWR el valor se conserva para `peek()`.
      if (entry.staleUntil > this.now()) return undefined;
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
    const ttl = ttlMs ?? this.ttlMs;
    this.entries.delete(key);
    this.entries.set(key, {
      value,
      storedAt: now,
      expiresAt: now + ttl,
      staleUntil: now + ttl + this.staleTtlMs,
      lastAccess: now,
    });
    this.evict();
  }

  /**
   * Devuelve el valor aunque este caducado (dentro de la ventana SWR).
   * Es lo que permite responder al instante y refrescar en segundo plano.
   */
  peek(key: string): CachePeek<T> | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    const now = this.now();
    if (entry.staleUntil <= now) {
      this.entries.delete(key);
      return undefined;
    }
    entry.lastAccess = now;
    return { value: entry.value, fresh: entry.expiresAt > now, ageMs: now - entry.storedAt };
  }

  /**
   * Alarga la ventana SWR de una clave (cuando el refresco en segundo plano
   * falla: mejor seguir sirviendo el dato viejo que perderlo).
   */
  extend(key: string, ttlMs?: number): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.staleUntil = this.now() + (ttlMs ?? this.ttlMs);
    this.entries.delete(key);
    this.entries.set(key, entry);
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
