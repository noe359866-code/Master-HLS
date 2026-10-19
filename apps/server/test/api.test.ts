import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { AddonRegistry, HttpClient } from '@master-hls/addon-engine';
import { createApp, type App } from '../src/app.js';

const MANIFESTS: Record<string, unknown> = {
  'https://meta.tld/manifest.json': {
    id: 'com.test.meta',
    name: 'Meta Addon',
    version: '1.0.0',
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    resources: ['catalog', 'meta'],
    catalogs: [
      { type: 'movie', id: 'top', name: 'Top Movies', extraSupported: ['search', 'skip'] },
    ],
  },
  'https://streams.tld/manifest.json': {
    id: 'com.test.streams',
    name: 'Stream Addon',
    version: '1.0.0',
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    resources: ['stream', 'subtitles'],
    catalogs: [],
  },
};

function createFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const manifest = MANIFESTS[url];
    if (manifest) {
      return new Response(JSON.stringify(manifest), { status: 200 });
    }
    if (url.startsWith('https://meta.tld/catalog/movie/top.json')) {
      return new Response(
        JSON.stringify({ metas: [{ id: 'tt1', name: 'Pelicula Uno', type: 'movie' }] }),
        { status: 200 },
      );
    }
    if (url.startsWith('https://meta.tld/meta/movie/tt1.json')) {
      return new Response(
        JSON.stringify({ meta: { id: 'tt1', name: 'Pelicula Uno', description: 'Desc' } }),
        { status: 200 },
      );
    }
    if (url.startsWith('https://streams.tld/stream/movie/tt1.json')) {
      return new Response(
        JSON.stringify({
          streams: [
            { name: '720p', url: 'https://cdn.tld/720.m3u8' },
            { name: '1080p', url: 'https://cdn.tld/1080.m3u8' },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.startsWith('https://streams.tld/subtitles/movie/tt1.json')) {
      return new Response(
        JSON.stringify({ subtitles: [{ url: 'https://cdn.tld/es.vtt', lang: 'es' }] }),
        { status: 200 },
      );
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('servidor Master-HLS', () => {
  let app: App;
  let server: http.Server;
  let base: string;
  let dataDir: string;

  before(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'master-hls-'));
    const registry = new AddonRegistry({
      http: new HttpClient({ fetchImpl: createFetch(), retries: 0 }),
      fanoutTimeoutMs: 3000,
    });
    app = createApp({ dataDir, registry, publicUrl: 'http://localhost:0' });
    await app.bootstrap();
    await registry.install('https://meta.tld/manifest.json');
    await registry.install('https://streams.tld/manifest.json');

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

  it('sirve el manifest del addon Stremio local', async () => {
    const response = await fetch(`${base}/manifest.json`);
    assert.equal(response.status, 200);
    const manifest = (await response.json()) as { id: string; catalogs: unknown[] };
    assert.equal(manifest.id, 'com.masterhls.app');
    assert.ok(manifest.catalogs.length >= 1);
  });

  it('agrega los catalogos de los addons instalados', async () => {
    const response = await fetch(`${base}/catalog/movie/top.json`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { metas: Array<{ id: string }> };
    assert.equal(body.metas[0]?.id, 'tt1');
  });

  it('devuelve la meta agregada', async () => {
    const response = await fetch(`${base}/meta/movie/tt1.json`);
    const body = (await response.json()) as { meta: { name: string } };
    assert.equal(body.meta.name, 'Pelicula Uno');
  });

  it('devuelve los streams ordenados por calidad', async () => {
    const response = await fetch(`${base}/stream/movie/tt1.json`);
    const body = (await response.json()) as { streams: Array<{ name: string }> };
    assert.equal(body.streams.length, 2);
    assert.match(body.streams[0]?.name ?? '', /1080p/);
  });

  it('devuelve los subtitulos', async () => {
    const response = await fetch(`${base}/subtitles/movie/tt1.json`);
    const body = (await response.json()) as { subtitles: Array<{ lang: string }> };
    assert.equal(body.subtitles[0]?.lang, 'es');
  });

  it('busca en todos los catalogos que soportan search', async () => {
    const response = await fetch(`${base}/api/search?q=pelicula`);
    const body = (await response.json()) as { metas: Array<{ id: string }> };
    assert.equal(body.metas[0]?.id, 'tt1');
  });

  it('gestiona perfiles y watchlists', async () => {
    const create = await fetch(`${base}/api/profiles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Perfil Test' }),
    });
    assert.equal(create.status, 200);
    const created = (await create.json()) as { profile: { id: string; name: string } };
    assert.equal(created.profile.name, 'Perfil Test');

    const list = await fetch(`${base}/api/lists?profileId=${created.profile.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Favoritos' }),
    });
    const listBody = (await list.json()) as { list: { id: string; items: unknown[] } };
    assert.equal(listBody.list.items.length, 0);

    const withItem = await fetch(`${base}/api/lists/${listBody.list.id}/items?profileId=${created.profile.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ item: { id: 'tt1', type: 'movie', name: 'Pelicula Uno', addedAt: 0 } }),
    });
    const withItemBody = (await withItem.json()) as { list: { items: unknown[] } };
    assert.equal(withItemBody.list.items.length, 1);
  });

  it('guarda el historial y el progreso', async () => {
    const profileId = app.store.get().activeProfileId;

    await fetch(`${base}/api/history?profileId=${profileId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'tt1', type: 'movie', name: 'Pelicula Uno' }),
    });
    const history = await (await fetch(`${base}/api/history?profileId=${profileId}`)).json() as {
      history: Array<{ id: string }>;
    };
    assert.equal(history.history[0]?.id, 'tt1');

    await fetch(`${base}/api/progress?profileId=${profileId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'tt1',
        type: 'movie',
        name: 'Pelicula Uno',
        position: 120,
        duration: 3600,
        mediaType: 'movie',
      }),
    });
    const progress = await (await fetch(`${base}/api/progress?profileId=${profileId}`)).json() as {
      progress: Array<{ position: number }>;
    };
    assert.equal(progress.progress[0]?.position, 120);
  });

  it('expone el estado de salud', async () => {
    const response = await fetch(`${base}/api/health`);
    const body = (await response.json()) as { ok: boolean; addons: number };
    assert.equal(body.ok, true);
    assert.equal(body.addons, 2);
  });
});
