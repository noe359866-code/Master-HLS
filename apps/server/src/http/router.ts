/**
 * Router HTTP minimo (sin dependencias): patron `:param` y comodin `*`.
 */

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

/** Responde con JSON. */
export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
  });
  res.end(body);
}

export function sendText(res: ServerResponse, status: number, body: string, contentType = 'text/plain'): void {
  res.writeHead(status, {
    'content-type': `${contentType}; charset=utf-8`,
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
  });
  res.end(body);
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
