/**
 * Cumplimiento del protocolo Stremio y cabeceras HTTP del addon local.
 *
 * Comprueba lo que el SDK documenta y que los clientes (Stremio, WuPlay,
 * NuvioTV) usan de verdad: forma de `resources`, `extra` de catalogo con
 * opciones, `Cache-Control` con las directivas del addon, CORS en todas las
 * rutas, ETag/304, compresion, `meta.links`, `behaviorHints.defaultVideoId`,
 * `bingeGroup` y la configuracion del addon en la propia URL.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';

import { AddonRegistry, HttpClient } from '@vibeflix/addon-engine';
import { createApp, type App } from '../src/app.js';
import { publicLookup } from './test-dns.js';
import {
  catalogExtraOf,
  enrichMeta,
  metaLinksOf,
  normalizeRuntime,
  resourceDescriptorsOf,
} from '../src/routes/stremio.js';
import { emptyData } from '../src/model.js';

const ADDON_MANIFEST = {
  id: 'demo-addon',
  name: 'Demo',
  version: '1.0.0',
  types: ['movie', 'series', 'channel'],
  idPrefixes: ['tt'],
  resources: ['catalog', 'meta', 'stream', 'subtitles'],
  catalogs: [
    { type: 'movie', id: 'demo-top', name: 'Demo Top', extraSupported: ['genre', 'skip'], extraRequired: ['genre'] },
  ],
};

/** Genera metas suficientes para superar el umbral de compresion (1 KB). */
function demoMetas(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `tt${1000 + index}`,
    type: 'movie',
    name: `Pelicula de prueba numero ${index} con un titulo razonablemente largo`,
    poster: `https://cdn.test/posters/${index}.jpg`,
    description: 'Sinopsis de ejemplo para ocupar bytes en la respuesta del catalogo.',
    genres: ['Action', 'Drama'],
    releaseInfo: String(2000 + (index % 25)),
    imdbRating: (5 + (index % 40) / 10).toFixed(1),
  }));
}

function fakeFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === 'https://demo.test/manifest.json') {
      return new Response(JSON.stringify(ADDON_MANIFEST));
    }
    if (url.startsWith('https://demo.test/catalog/')) {
      // El addon pide su propio cacheo: el agregador debe respetarlo (minimo).
      return new Response(JSON.stringify({
        metas: demoMetas(30),
        maxAge: 60,
        staleRevalidate: 120,
      }));
    }
    if (url.startsWith('https://demo.test/meta/')) {
      return new Response(JSON.stringify({
        meta: {
          id: 'tt1000',
          type: 'movie',
          name: 'Pelicula de prueba',
          runtime: '2h 15min',
          cast: ['Ana Torres, Luis Vega'],
          director: 'Marta Ruiz',
          genres: ['Drama'],
        },
      }));
    }
    if (url.startsWith('https://demo.test/stream/')) {
      return new Response(JSON.stringify({
        streams: [
          {
            name: 'Servidor Rapido 4K',
            title: 'Release 4K HDR',
            description: 'Servidor Rapido - 4K',
            url: 'https://cdn.test/movie-2160.mp4',
            behaviorHints: {
              filename: 'Servidor-Rapido-4K.mkv',
              bingeGroup: 'Servidor Rapido',
              proxyHeaders: { request: { Referer: 'https://demo.test/' } },
            },
          },
          {
            name: 'Servidor Lento',
            title: 'Release 720p',
            url: 'https://cdn.test/movie-720.mp4',
          },
        ],
      }));
    }
    if (url.startsWith('https://demo.test/subtitles/')) {
      return new Response(JSON.stringify({ subtitles: [{ id: 's1', url: 'https://cdn.test/s1.vtt', lang: 'es' }] }));
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('protocolo Stremio del addon local', () => {
  let app: App;
  let server: http.Server;
  let base: string;
  let dataDir: string;

  before(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibeflix-protocol-'));
    const registry = new AddonRegistry({
      http: new HttpClient({ fetchImpl: fakeFetch(), retries: 0 }),
      fanoutTimeoutMs: 3000,
    });
    app = createApp({ dataDir, registry, publicUrl: 'http://vibe.test:8181', dnsLookup: publicLookup });
    await app.bootstrap();
    await registry.install('https://demo.test/manifest.json');

    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      void app.handle({ req, res, url, params: {}, query: url.searchParams, body: undefined });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('publica un manifest con el formato completo del SDK', async () => {
    const response = await fetch(`${base}/manifest.json`);
    assert.equal(response.status, 200);
    // CORS obligatorio en todas las rutas, incluido el manifest.
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.match(response.headers.get('cache-control') ?? '', /max-age=3600/);

    const manifest = (await response.json()) as Record<string, any>;
    assert.equal(manifest['id'], 'com.vibeflix.app');
    // `resources` en forma de objeto: dice que tipos sirve cada recurso.
    const resources = manifest['resources'] as Array<{ name: string; types: string[]; idPrefixes: string[] }>;
    assert.deepEqual(resources.map((resource) => resource.name), ['catalog', 'meta', 'stream', 'subtitles']);
    assert.ok(resources.every((resource) => Array.isArray(resource.types) && resource.types.length > 0));
    assert.ok(resources.every((resource) => Array.isArray(resource.idPrefixes)));
    // Los tipos agregan los del addon de origen y los de los scrapers nativos.
    const types = new Set(manifest['types'] as string[]);
    for (const expected of ['movie', 'series', 'channel']) assert.ok(types.has(expected), `falta ${expected}`);

    // `extra` del catalogo normalizado, con opciones para el selector de generos.
    const catalogs = manifest['catalogs'] as Array<{ id: string; extra: Array<Record<string, unknown>> }>;
    const demo = catalogs.find((catalog) => catalog.id === 'demo-top');
    assert.ok(demo, 'el catalogo del addon instalado se reexpone');
    const genre = demo.extra.find((entry) => entry['name'] === 'genre');
    assert.equal(genre?.['isRequired'], true, 'respeta extraRequired del addon');
    assert.ok(Array.isArray(genre?.['options']) && (genre?.['options'] as string[]).includes('Drama'));

    const hints = manifest['behaviorHints'] as Record<string, unknown>;
    assert.equal(hints['configurable'], true);
    assert.equal(hints['p2p'], true);
    assert.equal(hints['configurationRequired'], false);
    assert.ok(Array.isArray(manifest['config']) && (manifest['config'] as unknown[]).length >= 4);
    assert.equal(typeof manifest['language'], 'string');
    // Las URLs absolutas usan la base publica, no localhost.
    assert.equal(manifest['logo'], 'http://vibe.test:8181/logo.png');
  });

  it('sirve la pagina /configure del SDK', async () => {
    const response = await fetch(`${base}/configure`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    const html = await response.text();
    assert.match(html, /data-key="maxHeight"/);
    assert.match(html, /data-key="cleanSdh"/);
    assert.match(html, /stremio:\/\//);
    // El JavaScript que recibe el navegador no puede llevar regex rotos.
    assert.ok(!html.includes('https?://'), 'el regex del enlace stremio:// esta bien escapado');
  });

  it('acepta la configuracion del addon en la ruta, como el SDK', async () => {
    const config = encodeURIComponent(JSON.stringify({ language: 'en', maxHeight: 720 }));
    const response = await fetch(`${base}/${config}/manifest.json`);
    assert.equal(response.status, 200);
    const manifest = (await response.json()) as Record<string, any>;
    assert.equal(manifest['language'], 'en');
    assert.match(String(manifest['name']), /EN · 720p/);
  });

  it('respeta el Cache-Control que pide el addon y comprime la respuesta', async () => {
    const response = await fetch(`${base}/catalog/movie/demo-top.json`, {
      headers: { 'accept-encoding': 'gzip, deflate, br' },
    });
    assert.equal(response.status, 200);
    // El addon pide maxAge=60 y staleRevalidate=120: gana el minimo.
    const cacheControl = response.headers.get('cache-control') ?? '';
    assert.match(cacheControl, /max-age=60\b/);
    assert.match(cacheControl, /stale-while-revalidate=120\b/);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.ok(response.headers.get('etag'));

    const body = (await response.json()) as { metas: unknown[] };
    assert.equal(body.metas.length, 30);
  });

  it('responde 304 cuando el cliente ya tiene la version', async () => {
    const first = await fetch(`${base}/catalog/movie/demo-top.json`, {
      headers: { 'accept-encoding': 'identity' },
    });
    const etag = first.headers.get('etag');
    assert.ok(etag);
    await first.arrayBuffer();

    const second = await fetch(`${base}/catalog/movie/demo-top.json`, {
      headers: { 'if-none-match': etag ?? '' },
    });
    assert.equal(second.status, 304);
    assert.equal(await second.text(), '');
  });

  it('comprime el JSON cuando el cliente lo acepta', async () => {
    const response = await fetch(`${base}/catalog/movie/demo-top.json`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    assert.equal(response.headers.get('content-encoding'), 'gzip');
    assert.equal(response.headers.get('vary'), 'accept-encoding');
    // Undici descomprime solo: el cuerpo tiene que llegar intacto.
    const body = (await response.json()) as { metas: Array<{ id: string }> };
    assert.equal(body.metas[0]?.id, 'tt1000');

    // Undici manda `accept-encoding` automatico: se pide identity a proposito.
    const plain = await fetch(`${base}/catalog/movie/demo-top.json`, {
      headers: { 'accept-encoding': 'identity' },
    });
    assert.equal(plain.headers.get('content-encoding'), null);
    await plain.arrayBuffer();
  });

  it('devuelve gzip valido que se puede descomprimir', async () => {
    const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const request = http.get(`${base}/catalog/movie/demo-top.json`, {
        headers: { 'accept-encoding': 'gzip' },
      }, resolve);
      request.on('error', reject);
    });
    assert.equal(response.headers['content-encoding'], 'gzip');
    const chunks: Buffer[] = [];
    for await (const chunk of response) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);
    assert.equal(raw.length, Number(response.headers['content-length']), 'content-length del cuerpo comprimido');
    const text = zlib.gunzipSync(raw).toString('utf8');
    const parsed = JSON.parse(text) as { metas: unknown[] };
    assert.equal(parsed.metas.length, 30);
    assert.ok(raw.length < text.length, 'comprimir tiene que salir a cuenta');
  });

  it('enriquece la ficha con posterShape, runtime y links', async () => {
    const response = await fetch(`${base}/meta/movie/tt1000.json`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /max-age=/);
    const body = (await response.json()) as { meta: Record<string, any> };
    assert.equal(body.meta['posterShape'], 'poster');
    assert.equal(body.meta['runtime'], '2h 15min');
    const links = body.meta['links'] as Array<{ name: string; category: string; url: string }>;
    assert.ok(links.some((link) => link.category === 'actor' && link.name === 'Ana Torres'));
    assert.ok(links.some((link) => link.category === 'director' && link.name === 'Marta Ruiz'));
    assert.ok(links.every((link) => link.url.startsWith('stremio://') || link.url.startsWith('https://')));
    assert.ok(links.some((link) => link.category === 'share' && link.url === 'stremio:///detail/movie/tt1000'));
  });

  it('marca notWebReady, deriva bingeGroup y no filtra el proveedor', async () => {
    const response = await fetch(`${base}/stream/movie/tt1000.json`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /max-age=60\b/);
    const body = (await response.json()) as { streams: Array<Record<string, any>> };
    assert.equal(body.streams.length, 2);

    const [first] = body.streams;
    const hints = first?.['behaviorHints'] as Record<string, unknown>;
    // El SDK obliga a `notWebReady` cuando el stream necesita cabeceras.
    assert.equal(hints?.['notWebReady'], true);
    assert.deepEqual(hints?.['proxyHeaders'], { request: { Referer: 'https://demo.test/' } });
    // `bingeGroup` derivado: agrupa por calidad sin revelar el servidor.
    assert.equal(hints?.['bingeGroup'], 'vibeflix-4k');
    assert.equal(hints?.['filename'], undefined, 'el nombre de fichero del proveedor no se reexpone');
    // La etiqueta publica viaja en `title` y en `description`.
    assert.equal(first?.['title'], 'Pelicula de prueba');
    assert.equal(first?.['description'], 'Pelicula de prueba');
    assert.ok(!/servidor|release/i.test(`${first?.['name']} ${first?.['title']} ${first?.['description']}`));

    const groups = body.streams.map((stream) => (stream['behaviorHints'] as Record<string, unknown>)?.['bingeGroup']);
    assert.deepEqual(groups, ['vibeflix-4k', 'vibeflix-720p']);
  });

  it('aplica el techo de calidad de la configuracion a los streams', async () => {
    const config = encodeURIComponent(JSON.stringify({ maxHeight: 1080 }));
    const response = await fetch(`${base}/${config}/stream/movie/tt1000.json`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { streams: Array<{ url: string }> };
    assert.deepEqual(body.streams.map((stream) => stream.url), ['https://cdn.test/movie-720.mp4']);

    const unlimited = await fetch(`${base}/stream/movie/tt1000.json`);
    const all = (await unlimited.json()) as { streams: Array<{ url: string }> };
    assert.equal(all.streams.length, 2);
  });

  it('sirve los subtitulos del addon agregado con cacheo', async () => {
    const response = await fetch(`${base}/subtitles/movie/tt1000.json`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /max-age=/);
    const body = (await response.json()) as { subtitles: Array<{ lang: string }> };
    assert.equal(body.subtitles[0]?.lang, 'es');
  });
});

describe('utilidades del protocolo', () => {
  it('normaliza el extra de catalogo al formato actual', () => {
    const extra = catalogExtraOf({
      type: 'movie',
      id: 'x',
      name: 'X',
      extraSupported: ['genre', 'skip'],
      extraRequired: ['genre'],
    });
    assert.deepEqual(extra?.map((entry) => entry.name), ['genre', 'skip']);
    assert.equal(extra?.[0]?.isRequired, true);
    assert.equal(extra?.[1]?.isRequired, false);
    assert.ok((extra?.[0]?.options ?? []).length > 5);
    assert.equal(extra?.[1]?.optionsLimit, 5);
  });

  it('mantiene el extra que ya viene en formato de objeto', () => {
    const extra = catalogExtraOf({
      type: 'movie', id: 'x', name: 'X',
      extra: [{ name: 'search', isRequired: true }],
    });
    assert.deepEqual(extra, [{ name: 'search', isRequired: true }]);
  });

  it('describe los recursos con tipos e idPrefixes', () => {
    const resources = resourceDescriptorsOf(['movie', 'series'], ['tt']);
    assert.deepEqual(resources.map((resource) => resource.name), ['catalog', 'meta', 'stream', 'subtitles']);
    assert.deepEqual(resources[0]?.types, ['movie', 'series']);
    assert.deepEqual(resources[0]?.idPrefixes, ['tt']);
  });

  it('normaliza los formatos de runtime que mandan los addons', () => {
    assert.equal(normalizeRuntime('120'), '120 min');
    assert.equal(normalizeRuntime(120), '120 min');
    assert.equal(normalizeRuntime('120 min'), '120 min');
    assert.equal(normalizeRuntime('2h'), '2h');
    assert.equal(normalizeRuntime('2h 15min'), '2h 15min');
    assert.equal(normalizeRuntime('45m'), '45 min');
    assert.equal(normalizeRuntime('En emision'), 'En emision');
    assert.equal(normalizeRuntime(undefined), undefined);
    assert.equal(normalizeRuntime(''), undefined);
  });

  it('construye links de persona y de IMDb', () => {
    const links = metaLinksOf(
      { id: 'tt1000', cast: ['Ana Torres', 'Luis Vega'], director: 'Marta Ruiz', writer: 'Juan Sol' },
      'movie',
      'tt1000',
    );
    assert.deepEqual(links.map((link) => link.category), ['actor', 'actor', 'director', 'writer', 'imdb', 'share']);
    assert.equal(links[0]?.url, 'stremio:///search?search=Ana%20Torres');
    assert.equal(links[4]?.url, 'https://www.imdb.com/title/tt1000/');
  });

  it('no pisa los links que ya trae la ficha', () => {
    const existing = [{ name: 'Ana', category: 'actor', url: 'stremio:///search?search=Ana' }];
    assert.deepEqual(metaLinksOf({ id: 'kitsu:1', links: existing }, 'series', 'kitsu:1'), existing);
  });

  it('anade defaultVideoId y posterShape segun el progreso del perfil', () => {
    const data = emptyData();
    data.progress[data.activeProfileId] = [{
      id: 'tt2000', type: 'series', name: 'Serie', position: 100, duration: 1000,
      updatedAt: 1, mediaType: 'episode', season: 2, episode: 4,
    }];
    const enriched = enrichMeta({ id: 'tt2000', type: 'series', name: 'Serie' }, 'series', 'tt2000', data);
    assert.equal(enriched?.posterShape, 'poster');
    assert.deepEqual(enriched?.behaviorHints, { defaultVideoId: 'tt2000:2:4' });

    const untouched = enrichMeta({ id: 'tt9', type: 'movie', name: 'Peli' }, 'movie', 'tt9', data);
    assert.equal(untouched?.behaviorHints, undefined);
    assert.equal(enrichMeta(null, 'movie', 'tt9', data), null);
  });
});
