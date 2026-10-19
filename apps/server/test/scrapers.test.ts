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
  resources: ['catalog', 'meta'],
  catalogs: [{ type: 'movie', id: 'top', name: 'Top Movies', extraSupported: ['search'] }],
};

/**
 * `fetch` de prueba: sirve el addon de metadata y las paginas del proveedor
 * configurado, de modo que el flujo completo (buscar -> item -> stream) se
 * puede comprobar sin red.
 */
let exposeCineHax = false;

function createFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url === 'https://meta.tld/manifest.json') {
      return new Response(JSON.stringify(MANIFEST), { status: 200 });
    }
    if (url.startsWith('https://meta.tld/catalog/movie/top')) {
      return new Response(
        JSON.stringify({ metas: [{ id: 'tt1', name: 'Pelicula Uno', type: 'movie' }] }),
        { status: 200 },
      );
    }
    if (url.startsWith('https://meta.tld/meta/movie/tt1.json')) {
      return new Response(
        JSON.stringify({
          meta: { id: 'tt1', name: 'Pelicula Uno', type: 'movie', releaseInfo: '1999' },
        }),
        { status: 200 },
      );
    }
    if (exposeCineHax && (url === 'https://cinehax.com' || url === 'https://cinehax.com/')) {
      return new Response('<script>var config={"nonce":"test-nonce"}</script>', { status: 200 });
    }
    if (exposeCineHax && url.startsWith('https://cinehax.com/wp-admin/admin-ajax.php')) {
      return new Response(JSON.stringify({ success: true, data: [
        { id: 501, title: 'Pelicula Uno', media_type: 'movie' },
      ] }), { status: 200 });
    }
    if (exposeCineHax && url === 'https://unlimplay.com/f/embed/movie/501') {
      return new Response('<script>finalizePlayer({"latino":{"remux":"https://remux.unlimplay.com/501.mp4"},"subtitulado":{"remux":"https://remux.unlimplay.com/en.mp4"}})</script>', { status: 200 });
    }
    if (url.startsWith('https://site.example/search')) {
      return new Response('<a href="/movie/abc123">Pelicula Uno</a>', { status: 200 });
    }
    if (url.startsWith('https://site.example/movie/abc123')) {
      return new Response(
        '<video src="https://cdn.example.com/pelicula-1080p.mp4"></video>',
        { status: 200 },
      );
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

const DEMO_CONFIG = {
  id: 'demo',
  name: 'Demo',
  types: ['movie'],
  searchUrl: 'https://site.example/search?q={title}&y={year}',
  itemUrl: 'https://site.example/movie/{id}',
  itemPattern: 'href="\\/movie\\/(\\w+)"',
  streamPatterns: ['src="(https?:\\/\\/[^"]+\\.mp4)"'],
};

describe('scrapers nativos', () => {
  let app: App;
  let server: http.Server;
  let base: string;
  let dataDir: string;

  before(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibe-flix-scrapers-'));
    const fetchImpl = createFetch();
    const registry = new AddonRegistry({
      http: new HttpClient({ fetchImpl, retries: 0 }),
      fanoutTimeoutMs: 3000,
    });
    app = createApp({ dataDir, registry, fetchImpl, publicUrl: 'http://localhost:0', dnsLookup: publicLookup });
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

  it('expone el estado de los scrapers', async () => {
    const response = await fetch(`${base}/api/scrapers`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      enabled: boolean;
      providers: Array<{ id: string }>;
      available: Array<{ id: string; liveVerified?: boolean }>;
    };
    assert.equal(typeof body.enabled, 'boolean');
    assert.ok(body.available.some((provider) => provider.id === 'internet-archive'));
    assert.ok(body.available.some((provider) => provider.id === 'cinehax'));
    for (const id of ['ridomovies', 'mstream', 'guardaflix', 'zaluknij']) {
      assert.ok(body.available.some((provider) => provider.id === id));
    }
    assert.ok(body.available.every((provider) => provider.liveVerified === false));
    assert.ok(!body.available.some((provider) => provider.id === 'vavoo'));
    const inventory = await fetch(`${base}/api/scrapers/upstream`);
    assert.equal(inventory.status, 200);
    const catalog = (await inventory.json()) as {
      counts: { vod: number; iptv: number; unregistered: number; native: number };
      providers: Array<{ file: string; nativeId?: string; state: string }>;
    };
    assert.deepEqual(catalog.counts, { vod: 51, iptv: 15, unregistered: 10, native: 9 });
    assert.equal(catalog.providers.length, 76);
    assert.equal(catalog.providers.find((provider) => provider.file === 'VavooProvider.kt')?.nativeId, undefined);
    assert.equal(catalog.providers.find((provider) => provider.file === 'RidomoviesProvider.kt')?.nativeId, 'ridomovies');
    assert.equal(catalog.providers.find((provider) => provider.file === 'MStreamProvider.kt')?.nativeId, 'mstream');
    assert.equal(catalog.providers.find((provider) => provider.file === 'GuardaFlixProvider.kt')?.nativeId, 'guardaflix');
    assert.equal(catalog.providers.find((provider) => provider.file === 'ZaluknijProvider.kt')?.nativeId, 'zaluknij');
  });

  it('no confunde el inventario upstream con adaptadores seleccionables', async () => {
    const response = await fetch(`${base}/api/scrapers`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true, providers: ['vavoo'], configs: [] }),
    });
    assert.equal(response.status, 400);
    const override = await fetch(`${base}/api/scrapers`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true, configs: [{ ...DEMO_CONFIG, id: 'cinehax' }] }),
    });
    assert.equal(override.status, 400);
  });

  it('configura un proveedor y lo añade a los streams del addon', async () => {
    const response = await fetch(`${base}/api/scrapers`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true, providers: [], configs: [DEMO_CONFIG] }),
    });
    assert.equal(response.status, 200);

    // El addon nativo queda registrado y participa en el fan-out de streams.
    const streams = await fetch(`${base}/stream/movie/tt1.json`);
    assert.equal(streams.status, 200);
    const body = (await streams.json()) as { streams: Array<{ url?: string; name?: string }> };
    const scraped = body.streams.find((stream) => stream.url?.includes('cdn.example.com'));
    assert.ok(scraped, 'el stream raspeado deberia estar en la respuesta');
    assert.equal(scraped!.name, 'Pelicula Uno');
    assert.equal((scraped as { description?: string }).description, undefined);
  });

  it('invalida la cache cuando cambian los proveedores', async () => {
    // Se pide el stream (cacheado) y luego se cambia el proveedor: el
    // resultado tiene que volver a resolverse.
    const before = await fetch(`${base}/stream/movie/tt1.json`);
    const beforeBody = (await before.json()) as { streams: Array<{ url?: string }> };
    assert.ok(beforeBody.streams.some((stream) => stream.url?.includes('cdn.example.com')));

    await fetch(`${base}/api/scrapers`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true, providers: [], configs: [] }),
    });

    const after = await fetch(`${base}/stream/movie/tt1.json`);
    const afterBody = (await after.json()) as { streams: Array<{ url?: string }> };
    assert.equal(afterBody.streams.length, 0);
  });

  it('prueba un proveedor con un titulo', async () => {
    const response = await fetch(`${base}/api/scrapers/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ config: DEMO_CONFIG, title: 'Pelicula Uno', year: 1999 }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { sources: Array<{ url: string }> };
    assert.equal(body.sources.length, 1);
    assert.equal(body.sources[0]!.url, 'https://cdn.example.com/pelicula-1080p.mp4');
  });

  it('selecciona el adaptador nativo con el idioma del perfil sin mostrar el proveedor en el stream', async () => {
    exposeCineHax = true;
    await fetch(`${base}/api/scrapers`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true, providers: ['cinehax'], configs: [] }),
    });
    const update = await fetch(`${base}/api/profiles/default`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentLanguage: 'es-NI' }),
    });
    assert.equal(update.status, 200);
    const response = await fetch(`${base}/stream/movie/tt1.json`);
    const body = (await response.json()) as { streams: Array<{ url?: string; name?: string; description?: string }> };
    assert.equal(response.status, 200);
    const stream = body.streams.find((item) => item.url?.includes('remux.unlimplay.com'));
    assert.ok(stream, 'el adaptador nativo debe resolver la fuente del sitio simulado');
    assert.equal(stream.name, 'Pelicula Uno');
    assert.equal(stream.description, undefined);
    assert.ok(!body.streams.some((item) => item.url?.endsWith('/en.mp4')));

    const debug = await fetch(`${base}/api/scrapers/test`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'cinehax', type: 'movie', title: 'Pelicula Uno', id: 'tmdb:501' }),
    });
    const result = (await debug.json()) as { sources: Array<{ url: string }> };
    assert.equal(result.sources[0]?.url, 'https://remux.unlimplay.com/501.mp4');
  });

  it('desactivar los scrapers los quita del registro de addons', async () => {
    await fetch(`${base}/api/scrapers`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false, providers: [], configs: [DEMO_CONFIG] }),
    });
    const response = await fetch(`${base}/api/scrapers`);
    const body = (await response.json()) as { enabled: boolean };
    assert.equal(body.enabled, false);
  });
});
