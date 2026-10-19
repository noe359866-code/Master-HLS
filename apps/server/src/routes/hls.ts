/**
 * Proxy y analisis HLS.
 *
 * `/hls/proxy` resuelve dos problemas habituales al reproducir streams de
 * addons:
 *  1. Muchos CDN exigen cabeceras (Referer, User-Agent, Cookie). El proxy las
 *     reproduce en cada peticion.
 *  2. Los segmentos, claves AES e init segments heredan esas cabeceras solo si
 *     el playlist se reescribe, por eso aqui se reescriben las URIs para que
 *     vuelvan a pasar por el proxy.
 *
 * `/hls/master` expone el master playlist ya parseado (variantes y pistas) y
 * la mejor variante segun las capacidades del dispositivo: es el nucleo
 * "HLS master" de la app.
 */

import {
  isMasterPlaylist,
  parsePlaylist,
  rewritePlaylist,
  selectBest,
  listVariants,
  type DeviceCapabilities,
  type SelectionPreferences,
} from '@vibeflix/hls-master';
import type { Router } from '../http/router.js';
import { sendJson, sendText } from '../http/router.js';

export interface HlsRouteOptions {
  /** Cabeceras por defecto que se anaden a las peticiones salientes. */
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
}

function decodeHeaders(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') headers[key] = value;
    }
    return headers;
  } catch {
    return {};
  }
}

function encodeHeaders(headers: Record<string, string>): string {
  return Buffer.from(JSON.stringify(headers), 'utf8').toString('base64url');
}

export function registerHlsRoutes(router: Router, options: HlsRouteOptions = {}): void {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const defaultHeaders = options.defaultHeaders ?? {};

  const fetchRemote = async (url: string, headers: Record<string, string>) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
          ...defaultHeaders,
          ...headers,
        },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  router.get('/hls/proxy', async ({ res, query }) => {
    const target = query.get('url');
    if (!target) {
      sendJson(res, 400, { error: 'Falta url' });
      return;
    }
    const headers = decodeHeaders(query.get('h'));
    const encodedHeaders = encodeHeaders(headers);

    try {
      const response = await fetchRemote(target, headers);
      if (!response.ok) {
        sendText(res, response.status, `Error ${response.status} al obtener el recurso`);
        return;
      }

      const contentType = response.headers.get('content-type') ?? '';
      const isPlaylist =
        contentType.includes('mpegurl') ||
        contentType.includes('x-mpegurl') ||
        target.toLowerCase().includes('.m3u8');

      if (!isPlaylist) {
        // Segmento (o cualquier recurso binario): se reenvia tal cual.
        const buffer = Buffer.from(await response.arrayBuffer());
        res.writeHead(200, {
          'content-type': contentType || 'application/octet-stream',
          'content-length': buffer.length,
          'access-control-allow-origin': '*',
          'cache-control': 'public, max-age=60',
        });
        res.end(buffer);
        return;
      }

      const text = await response.text();
      const rewritten = rewritePlaylist(text, target, (absolute) => {
        const proxied = new URL('/hls/proxy', publicBase());
        proxied.searchParams.set('url', absolute);
        if (encodedHeaders) proxied.searchParams.set('h', encodedHeaders);
        return proxied.toString();
      });
      res.writeHead(200, {
        'content-type': 'application/vnd.apple.mpegurl',
        'access-control-allow-origin': '*',
        'cache-control': 'no-cache',
      });
      res.end(rewritten);
    } catch (error) {
      sendText(res, 502, `Fallo del proxy: ${(error as Error).message}`);
    }
  });

  router.get('/hls/master', async ({ res, query }) => {
    const target = query.get('url');
    if (!target) {
      sendJson(res, 400, { error: 'Falta url' });
      return;
    }
    const headers = decodeHeaders(query.get('h'));
    const capabilities = parseCapabilities(query);
    const preferences = parsePreferences(query);

    try {
      const response = await fetchRemote(target, headers);
      if (!response.ok) {
        sendJson(res, response.status, { error: `HTTP ${response.status}` });
        return;
      }
      const text = await response.text();
      const master = parsePlaylist(text, target);

      if (!master.isMaster) {
        sendJson(res, 200, {
          isMaster: false,
          variants: [],
          renditions: [],
          selected: null,
          url: target,
        });
        return;
      }

      const selection = selectBest(master, { capabilities, preferences });
      sendJson(res, 200, {
        isMaster: true,
        variants: listVariants(master, capabilities),
        renditions: master.renditions,
        selected: selection
          ? {
              variant: selection.variant,
              audio: selection.audio,
              subtitles: selection.subtitles,
              reason: selection.reason,
            }
          : null,
        url: target,
      });
    } catch (error) {
      sendJson(res, 502, { error: (error as Error).message });
    }
  });

  /** Devuelve la URL de la mejor variante para fijarla en el reproductor. */
  router.get('/hls/select', async ({ res, query }) => {
    const target = query.get('url');
    if (!target) {
      sendJson(res, 400, { error: 'Falta url' });
      return;
    }
    const capabilities = parseCapabilities(query);
    const headers = decodeHeaders(query.get('h'));

    try {
      const response = await fetchRemote(target, headers);
      const text = await response.text();
      const master = parsePlaylist(text, target);
      if (!isMasterPlaylist(text)) {
        sendJson(res, 200, { url: target, variant: null });
        return;
      }
      const selection = selectBest(master, { capabilities });
      sendJson(res, 200, {
        url: selection?.variant.uri ?? target,
        variant: selection?.variant ?? null,
        reason: selection?.reason,
      });
    } catch (error) {
      sendJson(res, 502, { error: (error as Error).message });
    }
  });
}

function parseCapabilities(query: URLSearchParams): DeviceCapabilities {
  const maxHeight = query.get('maxHeight');
  const maxFrameRate = query.get('maxFrameRate');
  const codecs = query.get('codecs');
  return {
    maxHeight: maxHeight ? Number(maxHeight) : undefined,
    maxFrameRate: maxFrameRate ? Number(maxFrameRate) : undefined,
    supportsHdr: query.get('hdr') === '1' ? true : query.get('hdr') === '0' ? false : undefined,
    supportsDolbyVision: query.get('dv') === '1' ? true : query.get('dv') === '0' ? false : undefined,
    preferredCodecs: codecs ? codecs.split(',') : undefined,
  };
}

function parsePreferences(query: URLSearchParams): SelectionPreferences {
  return {
    audioLanguage: query.get('audioLang') ?? undefined,
    subtitleLanguage: query.get('subtitleLang') ?? undefined,
    preferSubtitles: query.get('subtitles') === '1',
  };
}

function publicBase(): string {
  return process.env['PUBLIC_URL'] ?? `http://localhost:${process.env['PORT'] ?? 8181}`;
}
