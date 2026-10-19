/**
 * Router HTTP minimo (sin dependencias): patron `:param` y comodin `*`.
 */

import crypto from 'node:crypto';
import zlib from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export type RouteHandler = (ctx: RouteContext) => void | Promise<void>;

interface Route {
  method: string;
  segments: string[];
  handler: RouteHandler;
}

export class Router {
  private readonly routes: Route[] = [];

  add(method: string, pattern: string, handler: RouteHandler): this {
    this.routes.push({
      method: method.toUpperCase(),
      segments: pattern.split('/').filter(Boolean),
      handler,
    });
    return this;
  }

  get(pattern: string, handler: RouteHandler): this {
    return this.add('GET', pattern, handler);
  }

  post(pattern: string, handler: RouteHandler): this {
    return this.add('POST', pattern, handler);
  }

  put(pattern: string, handler: RouteHandler): this {
    return this.add('PUT', pattern, handler);
  }

  delete(pattern: string, handler: RouteHandler): this {
    return this.add('DELETE', pattern, handler);
  }

  match(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } | undefined {
    const parts = pathname.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;
      const params = matchSegments(route.segments, parts);
      if (params) return { handler: route.handler, params };
    }
    return undefined;
  }
}

function matchSegments(
  pattern: string[],
  parts: string[],
): Record<string, string> | undefined {
  const params: Record<string, string> = {};
  for (let index = 0; index < pattern.length; index += 1) {
    const expected = pattern[index]!;
    if (expected === '*') {
      params['*'] = parts.slice(index).join('/');
      return params;
    }
    const actual = parts[index];
    if (actual === undefined) return undefined;
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) return undefined;
  }
  if (parts.length !== pattern.length) return undefined;
  return params;
}

/**
 * Politica de cacheo HTTP.
 *
 * El SDK de Stremio traduce `maxAge`/`staleRevalidate`/`staleError` de la
 * respuesta del addon a `Cache-Control: max-age, stale-while-revalidate,
 * stale-if-error`. Vibe Flix hace lo mismo al reexponer el recurso, de modo que
 * Stremio, WuPlay, Nuvio y la propia web cachean durante el tiempo que pida el
 * addon de origen (y no mas).
 */
export interface CachePolicy {
  /** Segundos de validez. */
  maxAge?: number;
  /** Segundos sirviendo datos caducados mientras se revalida. */
  staleWhileRevalidate?: number;
  /** Segundos sirviendo datos caducados si el origen falla. */
  staleIfError?: number;
  /** Recurso inmutable (assets con hash en el nombre). */
  immutable?: boolean;
  /** No almacenar en ninguna cache. */
  noStore?: boolean;
  /** Obliga a revalidar con el origen (`no-cache`). */
  revalidate?: boolean;
}

/** Cabecera `Cache-Control` a partir de una politica. */
export function cacheControlHeader(policy: CachePolicy): string {
  if (policy.noStore) return 'no-store';
  if (policy.revalidate) return 'no-cache';
  const parts: string[] = [];
  parts.push(`max-age=${Math.max(0, Math.round(policy.maxAge ?? 0))}`);
  if (policy.staleWhileRevalidate) parts.push(`stale-while-revalidate=${Math.round(policy.staleWhileRevalidate)}`);
  if (policy.staleIfError) parts.push(`stale-if-error=${Math.round(policy.staleIfError)}`);
  if (policy.immutable) parts.push('immutable');
  return parts.join(', ');
}

/** Politicas por defecto del addon (segundos), usadas cuando el addon no pide nada. */
export const DEFAULT_CACHE_POLICIES = {
  catalog: { maxAge: 900, staleWhileRevalidate: 86_400, staleIfError: 604_800 } satisfies CachePolicy,
  meta: { maxAge: 86_400, staleWhileRevalidate: 604_800, staleIfError: 2_592_000 } satisfies CachePolicy,
  stream: { maxAge: 60, staleWhileRevalidate: 600, staleIfError: 3600 } satisfies CachePolicy,
  subtitles: { maxAge: 21_600, staleWhileRevalidate: 86_400 } satisfies CachePolicy,
  search: { maxAge: 300, staleWhileRevalidate: 3600 } satisfies CachePolicy,
  api: { maxAge: 30, staleWhileRevalidate: 300 } satisfies CachePolicy,
} as const;

/**
 * Fusiona la directiva que pide el addon con la politica por defecto: gana la
 * mas conservadora (el minimo de cada campo), que es lo que espera Stremio.
 */
export function resolveCachePolicy(
  fallback: CachePolicy,
  directive?: { maxAge?: number; staleRevalidate?: number; staleError?: number },
): CachePolicy {
  if (!directive) return fallback;
  const min = (a?: number, b?: number): number | undefined => {
    if (a === undefined) return b;
    if (b === undefined) return a;
    return Math.min(a, b);
  };
  return {
    ...fallback,
    maxAge: min(fallback.maxAge, directive.maxAge) ?? fallback.maxAge,
    staleWhileRevalidate: min(fallback.staleWhileRevalidate, directive.staleRevalidate),
    staleIfError: min(fallback.staleIfError, directive.staleError),
  };
}

export interface SendOptions {
  /** Peticion original: se usa para negociar compresion y `304 Not Modified`. */
  req?: IncomingMessage;
  /** Politica de cacheo. */
  cache?: CachePolicy;
  /** Desactiva la compresion para esta respuesta. */
  compress?: boolean;
  /** Cabeceras adicionales. */
  headers?: Record<string, string>;
}

/** Tamano minimo para que comprimir compense (bytes). */
const COMPRESS_MIN_BYTES = 1024;

/** Tipos de contenido que merece la pena comprimir. */
const COMPRESSIBLE = /(json|text\/|javascript|xml|svg|vtt|mpegurl|manifest)/;

/** ETag debil a partir del contenido. */
export function etagFor(body: Buffer | string): string {
  const digest = crypto.createHash('sha1').update(body).digest('base64url').slice(0, 27);
  return `W/"${digest}"`;
}

/** ETag debil barato para ficheros estaticos (tamano + mtime). */
export function fileEtag(size: number, mtimeMs: number): string {
  return `W/"${size.toString(36)}-${Math.round(mtimeMs).toString(36)}"`;
}

/** true si el cliente ya tiene esta version (`If-None-Match`). */
export function isFresh(req: IncomingMessage | undefined, etag: string): boolean {
  const header = req?.headers['if-none-match'];
  if (!header) return false;
  const candidates = (Array.isArray(header) ? header.join(',') : header).split(',');
  return candidates.some((candidate) => candidate.trim() === etag || candidate.trim() === '*');
}

/** Comprime el cuerpo si el cliente lo acepta y sale a cuenta. */
function compressBody(body: Buffer, contentType: string, req?: IncomingMessage): { body: Buffer; encoding?: string } {
  if (body.length < COMPRESS_MIN_BYTES) return { body };
  if (!COMPRESSIBLE.test(contentType)) return { body };
  const accepted = String(req?.headers['accept-encoding'] ?? '');
  if (!accepted) return { body };

  try {
    if (/\bbr\b/.test(accepted)) {
      const compressed = zlib.brotliCompressSync(body, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length },
      });
      if (compressed.length < body.length) return { body: compressed, encoding: 'br' };
    }
    if (/\bgzip\b/.test(accepted)) {
      const compressed = zlib.gzipSync(body, { level: 6 });
      if (compressed.length < body.length) return { body: compressed, encoding: 'gzip' };
    }
    if (/\bdeflate\b/.test(accepted)) {
      const compressed = zlib.deflateSync(body, { level: 6 });
      if (compressed.length < body.length) return { body: compressed, encoding: 'deflate' };
    }
  } catch {
    // Si falla la compresion se envia el cuerpo sin comprimir.
  }
  return { body };
}

/** Envio comun: cabeceras, ETag/304, compresion y CORS. */
function sendBody(
  res: ServerResponse,
  status: number,
  body: Buffer,
  contentType: string,
  options: SendOptions = {},
): void {
  const headers: Record<string, string | number> = {
    'content-type': contentType,
    'access-control-allow-origin': '*',
    ...(options.headers ?? {}),
  };
  if (options.cache) headers['cache-control'] = cacheControlHeader(options.cache);

  const etag = etagFor(body);
  headers['etag'] = etag;
  if (isFresh(options.req, etag)) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  const final = options.compress === false ? { body } : compressBody(body, contentType, options.req);
  if (final.encoding) {
    headers['content-encoding'] = final.encoding;
    headers['vary'] = 'accept-encoding';
  }
  headers['content-length'] = final.body.length;
  res.writeHead(status, headers);
  res.end(final.body);
}

/** Responde con JSON (comprimido y con ETag si se pasa la peticion). */
export function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
  options: SendOptions = {},
): void {
  sendBody(res, status, Buffer.from(JSON.stringify(payload)), 'application/json; charset=utf-8', options);
}

/** Responde con texto (WebVTT, playlists, HTML...). */
export function sendText(
  res: ServerResponse,
  status: number,
  body: string,
  contentType = 'text/plain',
  options: SendOptions = {},
): void {
  sendBody(res, status, Buffer.from(body), `${contentType}; charset=utf-8`, options);
}

/** Responde con bytes (segmentos HLS, imagenes...). */
export function sendBinary(
  res: ServerResponse,
  status: number,
  body: Buffer,
  contentType: string,
  options: SendOptions = {},
): void {
  sendBody(res, status, body, contentType, options);
}

/** Lee el cuerpo de la peticion como JSON (tolerante). */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > 4 * 1024 * 1024) throw new Error('Cuerpo demasiado grande');
    chunks.push(buffer);
  }
  if (!chunks.length) return undefined;
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
