/**
 * Arranque del servidor Vibe Flix.
 *
 * Sirve:
 *  - el addon Stremio local (`/manifest.json`, `/catalog/...`, `/meta/...`,
 *    `/stream/...`, `/subtitles/...`),
 *  - la API de la app (`/api/...`),
 *  - el proxy HLS (`/hls/...`),
 *  - el cliente web de TV (todo lo demas, con fallback a index.html).
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { createApp } from './app.js';
import { cacheControlHeader, fileEtag, isFresh } from './http/router.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/** Entradas comprimidas en memoria (los assets con hash no cambian nunca). */
const compressedAssets = new Map<string, { encoding: string; body: Buffer }>();
const MAX_COMPRESSED_ASSETS = 40;

/** Extensiones que se comprimen y se pueden cachear un ano (llevan hash). */
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.map', '.webmanifest', '.vtt', '.txt']);

/** true si el nombre lleva hash de contenido (`index-BLuHL71A.css`). */
function isHashedAsset(relative: string): boolean {
  return /(^|\/)(assets|icons)\//.test(relative) && /-[A-Za-z0-9_]{6,}\.(js|css|map)$/.test(relative);
}

/**
 * Sirve un fichero estatico con ETag, `304 Not Modified`, compresion y
 * `Cache-Control` adecuado.
 *
 * En una TV el coste de red y de parseo domina sobre el de CPU: servir el JS ya
 * comprimido en brotli (y recordarlo en memoria) recorta el arranque de la app
 * de forma notable frente a enviar 800 KB sin comprimir.
 */
async function serveStatic(
  root: string,
  pathname: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(root, relative);
  // Proteccion contra path traversal.
  if (!target.startsWith(path.resolve(root))) return false;

  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) return false;
    const extension = path.extname(target).toLowerCase();
    const contentType = MIME_TYPES[extension] ?? 'application/octet-stream';
    const etag = fileEtag(stat.size, stat.mtimeMs);

    const headers: Record<string, string | number> = {
      'content-type': contentType,
      etag,
      'last-modified': stat.mtime.toUTCString(),
      'access-control-allow-origin': '*',
    };

    // El service worker y el HTML deben revalidarse siempre; los assets con
    // hash en el nombre son inmutables y se pueden cachear un ano.
    if (isHashedAsset(relative)) {
      headers['cache-control'] = cacheControlHeader({ maxAge: 31_536_000, immutable: true });
    } else if (extension === '.html' || relative === 'sw.js' || relative.endsWith('.webmanifest')) {
      headers['cache-control'] = 'no-cache';
    } else {
      headers['cache-control'] = cacheControlHeader({ maxAge: 3600, staleWhileRevalidate: 86_400 });
    }

    if (isFresh(req, etag)) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }

    // Assets inmutables ya comprimidos: se sirven desde memoria.
    const cached = compressedAssets.get(`${relative}:${etag}`);
    if (cached) {
      headers['content-encoding'] = cached.encoding;
      headers['vary'] = 'accept-encoding';
      headers['content-length'] = cached.body.length;
      res.writeHead(200, headers);
      res.end(cached.body);
      return true;
    }

    const content = await fs.readFile(target);
    let body = content;
    let encoding: string | undefined;
    if (TEXT_EXTENSIONS.has(extension) && content.length >= 1024) {
      const accept = String(req.headers['accept-encoding'] ?? '');
      try {
        if (/\bbr\b/.test(accept)) {
          const compressed = zlib.brotliCompressSync(content, {
            params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 },
          });
          if (compressed.length < content.length) {
            body = compressed;
            encoding = 'br';
          }
        } else if (/\bgzip\b/.test(accept)) {
          const compressed = zlib.gzipSync(content, { level: 6 });
          if (compressed.length < content.length) {
            body = compressed;
            encoding = 'gzip';
          }
        }
      } catch {
        body = content;
        encoding = undefined;
      }
      if (encoding) {
        // Los assets con hash nunca cambian: se deja la version comprimida en
        // memoria para no volver a pagar la CPU en cada peticion.
        if (isHashedAsset(relative)) {
          if (compressedAssets.size >= MAX_COMPRESSED_ASSETS) {
            const oldest = compressedAssets.keys().next();
            if (!oldest.done) compressedAssets.delete(oldest.value);
          }
          compressedAssets.set(`${relative}:${etag}`, { encoding, body });
        }
        headers['content-encoding'] = encoding;
        headers['vary'] = 'accept-encoding';
      }
    }

    headers['content-length'] = body.length;
    res.writeHead(200, headers);
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

/** Rutas que nunca deben servirse como SPA. */
function isApiPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/hls/') ||
    pathname === '/manifest.json' ||
    pathname.startsWith('/catalog/') ||
    pathname.startsWith('/meta/') ||
    pathname.startsWith('/stream/') ||
    pathname.startsWith('/subtitles/')
  );
}

function fallbackHtml(publicUrl: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Vibe Flix</title></head>
           <body style="font-family:system-ui;background:#0b0e14;color:#e6e9ef;padding:3rem">
           <h1>Vibe Flix</h1>
           <p>El servidor esta en marcha. El cliente web aun no esta compilado.</p>
           <p>Ejecuta <code>npm run build:web</code> y recarga, o usa la API en <code>/api/health</code>.</p>
           <p>Addon Stremio: <code>${publicUrl}/manifest.json</code></p>
           </body></html>`;
}

async function main(): Promise<void> {
  const app = createApp();
  await app.bootstrap();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    res.setHeader('access-control-allow-origin', '*');
    res.setHeader(
      'access-control-allow-headers',
      'content-type, x-vibe-flix-token, x-vibe-flix-admin-token, x-vibe-flix-pin',
    );
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    void (async () => {
      try {
        // Si no hay ruta de API/addon/proxy, se sirve el cliente web (SPA).
        const matched = app.router.match(req.method ?? 'GET', url.pathname);
        if (!matched && !isApiPath(url.pathname)) {
          const served = await serveStatic(app.config.webRoot, url.pathname, req, res);
          if (!served && !res.writableEnded) {
            const fallback = await serveStatic(app.config.webRoot, '/index.html', req, res);
            if (!fallback) {
              res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
              res.end(fallbackHtml(app.config.publicUrl));
            }
          }
          return;
        }

        await app.handle({
          req,
          res,
          url,
          params: {},
          query: url.searchParams,
          body: undefined,
        });
      } catch (error) {
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: (error as Error).message }));
        } else {
          res.end();
        }
      }
    })();
  });

  // Keep-alive: los clientes de TV abren decenas de peticiones seguidas
  // (posters, catalogos, segmentos HLS) y renegotiar TCP+TLS cada vez es lo que
  // mas ralentiza el arranque.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.requestTimeout = 0;

  server.listen(app.config.port, app.config.host, () => {
    console.log(`[vibe-flix] servidor en http://${app.config.host}:${app.config.port}`);
    console.log(`[vibe-flix] addon Stremio: ${app.config.publicUrl}/manifest.json`);
    console.log(`[vibe-flix] addons cargados: ${app.registry.size}`);
  });
}

main().catch((error) => {
  console.error('[vibe-flix] fallo al arrancar:', error);
  process.exit(1);
});
