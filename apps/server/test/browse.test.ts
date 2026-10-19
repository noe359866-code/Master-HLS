import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { AddonRegistry, HttpClient } from '@vibeflix/addon-engine';

import { createApp, type App } from '../src/app.js';
import { publicLookup } from './test-dns.js';

const MANIFEST = {
  id: 'com.test.meta',
  name: 'Meta Addon',
  version: '1.0.0',
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  resources: ['catalog', 'meta', 'search'],
  catalogs: [
    {
      type: 'movie',
      id: 'top',
      name: 'Top Movies',
      extraSupported: ['search', 'skip', 'genre'],
      extra: [{ name: 'genre', options: ['Action', 'Comedy', 'Crime', 'Drama', 'Sci-Fi'] }],
    },
    {
      type: 'series',
      id: 'top',
      name: 'Top Series',
      extraSupported: ['search', 'skip', 'genre'],
      extra: [{ name: 'genre', options: ['Action', 'Comedy', 'Crime', 'Drama', 'Sci-Fi'] }],
    },
  ],
};

/** Metadatos del addon de prueba: cubren generos, años y puntuaciones. */
const MOVIES = [
  { id: 'tt1', type: 'movie', name: 'Accion total', poster: 'p1.jpg', releaseInfo: '1985', imdbRating: '7.1', genres: ['Action', 'Adventure'] },
  { id: 'tt2', type: 'movie', name: 'Comediadecorators', poster: 'p2.jpg', releaseInfo: '1994', imdbRating: '8.4', genres: ['Comedy'] },
  { id: 'tt3', type: 'movie', name: 'Crimen en la ciudad', poster: 'p3.jpg', releaseInfo: '2005', imdbRating: '5.2', genres: ['Crime', 'Drama'] },
  { id: 'tt4', type: 'movie', name: 'Aventura espacial', poster: 'p4.jpg', releaseInfo: '2019', imdbRating: '9.1', genres: ['Sci-Fi', 'Action'] },
  { id: 'tt5', type: 'series', name: 'Serie de los 90', poster: 'p5.jpg', releaseInfo: '1998', imdbRating: '6.6', genres: ['Drama'] },
];

describe('generos, decadas, historial y personalizacion', () => {
  let app: App;
  let server: http.Server;
  let base: string;
  let dataDir: string;

  const addonFetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === 'https://meta.tld/manifest.json') {
      return new Response(JSON.stringify(MANIFEST), { status: 200 });
    }
    if (url.includes('/catalog/movie/top')) {
      // Los extras viajan en la ruta: `.../top/genre=Action.json`.
      const genre = /genre=([^&/]+)/.exec(url)?.[1]?.replace(/\.json$/, '');
      const term = /search=([^&/]+)/.exec(url)?.[1]?.replace(/\.json$/, '');
      let metas = MOVIES;
      if (genre) {
        metas = metas.filter((meta) => meta.genres?.includes(decodeURIComponent(genre)));
      }
      if (term) {
        const needle = decodeURIComponent(term);
        metas = metas.filter((meta) => meta.name?.includes(needle));
      }
      return new Response(JSON.stringify({ metas }), { status: 200 });
    }
    if (url.includes('/catalog/series/top')) {
      const term = /search=([^&/]+)/.exec(url)?.[1]?.replace(/\.json$/, '');
      let metas = MOVIES.filter((meta) => meta.type === 'series');
      if (term) {
        metas = metas.filter((meta) => meta.name?.includes(decodeURIComponent(term)));
      }
      return new Response(JSON.stringify({ metas }), { status: 200 });
    }
    if (url.includes('/search')) {
      const term = decodeURIComponent(/q=([^&]*)/.exec(url)?.[1] ?? '');
      return new Response(
        JSON.stringify({ metas: MOVIES.filter((meta) => meta.name?.includes(term)) }),
        { status: 200 },
      );
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;

  before(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibe-flix-browse-'));
    const registry = new AddonRegistry({
      http: new HttpClient({ fetchImpl: addonFetch, retries: 0 }),
      fanoutTimeoutMs: 3000,
    });
    app = createApp({ dataDir, registry, publicUrl: 'http://localhost:0', fetchImpl: addonFetch, dnsLookup: publicLookup });
    await app.bootstrap();
    await registry.install('https://meta.tld/manifest.json');

    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      void app.handle({ req, res, url, params: {}, query: url.searchParams, body: undefined });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    base = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('devuelve la lista de generos y decadas', async () => {
    const response = await fetch(`${base}/api/genres`);
    const body = (await response.json()) as {
      genres: Array<{ id: string; name: string; catalog: string }>;
      decades: Array<{ id: string; from: number; to: number }>;
    };
    assert.ok(body.genres.length >= 15);
    const accion = body.genres.find((genre) => genre.id === 'action');
    assert.equal(accion?.name, 'Acción');
    assert.equal(accion?.catalog, 'Action');
    assert.ok(body.decades.length >= 8);
    assert.equal(body.decades.find((decade) => decade.id === '1980s')?.from, 1980);
  });

  it('navega por genero usando el extra del catalogo', async () => {
    const response = await fetch(`${base}/api/browse?type=movie&genre=Action`);
    const body = (await response.json()) as { metas: Array<{ id: string }>; source: string };
    assert.equal(body.source, 'genre');
    assert.equal(body.metas.length, 2);
    assert.deepEqual(
      body.metas.map((meta) => meta.id).sort(),
      ['tt1', 'tt4'],
    );
  });

  it('navega por decada filtrando por el ano de estreno', async () => {
    const response = await fetch(`${base}/api/browse?decade=1990s`);
    const body = (await response.json()) as {
      metas: Array<{ id: string; releaseInfo?: string }>;
      source: string;
    };
    assert.equal(body.source, 'decade');
    const ids = body.metas.map((meta) => meta.id).sort();
    assert.deepEqual(ids, ['tt2', 'tt5']);
  });

  it('aplica los filtros de contenido a la busqueda', async () => {
    // Se oculta el genero de comedia.
    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filters: { excludeGenres: ['Comedy'] } }),
    });
    const response = await fetch(`${base}/api/search?q=Comedia`);
    const body = (await response.json()) as { metas: Array<{ id: string }> };
    assert.equal(body.metas.length, 0);

    // Y con la puntuacion minima.
    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filters: { minRating: 8 } }),
    });
    const rated = await fetch(`${base}/api/search?q=A`);
    const ratedBody = (await rated.json()) as { metas: Array<{ id: string; imdbRating?: string }> };
    assert.ok(ratedBody.metas.length > 0);
    for (const meta of ratedBody.metas) {
      assert.ok(Number(meta.imdbRating ?? 0) >= 8);
    }

    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filters: { minRating: 0, excludeGenres: [] } }),
    });
  });

  it('guarda y limpia el historial de busquedas', async () => {
    await fetch(`${base}/api/search-history`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ term: 'matrix' }),
    });
    await fetch(`${base}/api/search-history`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ term: 'alien' }),
    });
    const response = await fetch(`${base}/api/search-history`);
    const body = (await response.json()) as { history: Array<{ term: string }> };
    assert.equal(body.history.length, 2);
    // El mas reciente primero.
    assert.equal(body.history[0]?.term, 'alien');

    const cleared = await fetch(`${base}/api/search-history`, { method: 'DELETE' });
    const clearedBody = (await cleared.json()) as { history: unknown[] };
    assert.equal(clearedBody.history.length, 0);
  });

  it('fusiona los filtros de contenido al guardar los ajustes', async () => {
    // Un PATCH parcial no puede borrar el resto de filtros.
    const response = await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filters: { excludeKeywords: ['remake'] } }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { settings: { filters: Record<string, unknown> } };
    assert.deepEqual(body.settings.filters.excludeKeywords, ['remake']);
    assert.deepEqual(body.settings.filters.excludeGenres, []);
    assert.equal(body.settings.filters.minRating, 0);
  });

  it('guarda los resultados de una busqueda en una lista', async () => {
    const created = await fetch(`${base}/api/lists`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Resultados' }),
    });
    const list = (await created.json()) as { list: { id: string } };
    const saved = await fetch(`${base}/api/lists/${list.list.id}/items/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: [
          { id: 'tt1', type: 'movie', name: 'Accion total' },
          { id: 'tt2', type: 'movie', name: 'Comediadecorators' },
        ],
      }),
    });
    assert.equal(saved.status, 200);
    const body = (await saved.json()) as { list: { items: unknown[] } };
    assert.equal(body.list.items.length, 2);
  });

  it('personaliza el menu de navegacion', async () => {
    const response = await fetch(`${base}/api/sidebar`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: [
          { id: 'home', hidden: false, order: 0 },
          { id: 'genres', hidden: false, order: 1 },
          { id: 'addons', hidden: true, order: 2 },
        ],
      }),
    });
    const body = (await response.json()) as { items: Array<{ id: string; hidden: boolean }> };
    assert.equal(body.items.length, 3);
    assert.equal(body.items.find((item) => item.id === 'addons')?.hidden, true);

    const settings = await fetch(`${base}/api/settings`);
    const settingsBody = (await settings.json()) as {
      settings: { sidebar: Array<{ id: string }> };
    };
    assert.equal(settingsBody.settings.sidebar.length, 3);
  });
});
