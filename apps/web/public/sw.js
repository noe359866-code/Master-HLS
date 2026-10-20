/*
 * Service worker de Master-HLS.
 *
 * Objetivo: que el cliente web de TV funcione como una app instalable
 * (PWA) sin APK y que siga siendo utilizable con la red intermitente.
 *
 * Estrategias:
 *  - navegaciones: red primero y, si falla, se sirve el shell cacheado.
 *  - assets estaticos (hash en el nombre): cache primero.
 *  - catalogos y metadatos: stale-while-revalidate (se puede ver el catalogo
 *    cacheado mientras se refresca en segundo plano).
 *  - streams, subtitulos, proxy HLS y API: solo red (nunca se cachean).
 */

const VERSION = 'master-hls-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Nunca cachear: API, proxy HLS, streams ni subtitulos.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/hls/') ||
    url.pathname.startsWith('/stream/') ||
    url.pathname.startsWith('/subtitles/')
  ) {
    return;
  }

  // Navegaciones: red primero, cache como recurso.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() =>
          caches
            .match('/index.html')
            .then((cached) => cached ?? caches.match('/'))
            .then((cached) => cached ?? new Response('Sin conexion', { status: 503 })),
        ),
    );
    return;
  }

  // Assets estaticos: cache primero (el nombre lleva hash).
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Catalogos y metadatos: stale-while-revalidate.
  if (url.pathname.startsWith('/catalog/') || url.pathname.startsWith('/meta/')) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached ?? network;
      }),
    );
  }
});
