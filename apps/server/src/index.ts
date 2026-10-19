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
import { fileURLToPath } from 'node:url';

import { createApp } from './app.js';

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

async function serveStatic(
  root: string,
  pathname: string,
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
    const content = await fs.readFile(target);
    // El service worker y el manifest deben revalidarse siempre.
    const noCache = extension === '.html' || relative === 'sw.js' || relative.endsWith('.webmanifest');
    res.writeHead(200, {
      'content-type': MIME_TYPES[extension] ?? 'application/octet-stream',
      'content-length': content.length,
      'cache-control': noCache ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(content);
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
          const served = await serveStatic(app.config.webRoot, url.pathname, res);
          if (!served && !res.writableEnded) {
            const fallback = await serveStatic(app.config.webRoot, '/index.html', res);
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
