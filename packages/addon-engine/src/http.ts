/**
 * Cliente HTTP para addons: timeouts, reintentos con backoff y headers por
 * defecto identicos a los que usa el cliente de Stremio.
 */

import { AddonError } from './types.js';

export interface HttpClientOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  userAgent?: string;
  headers?: Record<string, string>;
  /** Tamaño maximo de respuesta en bytes (proteccion contra addons abusivos). */
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

export class HttpClient {
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly userAgent: string;
  private readonly headers: Record<string, string>;
  private readonly maxBytes: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.retries = options.retries ?? 1;
    this.retryDelayMs = options.retryDelayMs ?? 350;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.headers = options.headers ?? {};
    this.maxBytes = options.maxBytes ?? 12 * 1024 * 1024;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async getJson<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
    const response = await this.get(url, options);
    const text = await response.text();
    if (!text.trim()) {
      throw new AddonError('unknown', `Respuesta vacia de ${url}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw new AddonError('unknown', `JSON invalido de ${url}: ${(cause as Error).message}`, { cause });
    }
  }

  async get(url: string, options: HttpRequestOptions = {}): Promise<Response> {
    const retries = options.retries ?? this.retries;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const onExternalAbort = () => controller.abort();
      options.signal?.addEventListener('abort', onExternalAbort, { once: true });

      try {
        const response = await this.fetchImpl(url, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent': this.userAgent,
            Accept: 'application/json,text/plain,*/*',
            ...this.headers,
            ...options.headers,
          },
        });

        if (!response.ok) {
          // 4xx no se reintenta (salvo 429), 5xx si.
          const retryable = response.status >= 500 || response.status === 429;
          const error = new AddonError('unknown', `HTTP ${response.status} en ${url}`, {
            status: response.status,
          });
          if (!retryable || attempt === retries) throw error;
          lastError = error;
        } else {
          return response;
        }
      } catch (error) {
        if (error instanceof AddonError && error.status && error.status < 500 && error.status !== 429) {
          throw error;
        }
        lastError = error;
        if (attempt === retries) break;
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', onExternalAbort);
      }

      await delay(this.retryDelayMs * 2 ** attempt);
    }

    throw lastError instanceof Error
      ? lastError
      : new AddonError('unknown', `Fallo de red en ${url}`);
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
