import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { AddonRegistry, HttpClient } from '@vibeflix/addon-engine';
import { NATIVE_SCRAPERS_ID } from '@vibeflix/scrapers';
import { createApp, type App } from '../src/app.js';
import { DEFAULT_PROFILE, emptyData } from '../src/model.js';
import { verifyProfilePin } from '../src/library/profile-pin.js';

const META_MANIFEST = {
  id: 'metadata', name: 'Metadata', version: '1',
  types: ['movie', 'series'], idPrefixes: ['tt'], resources: ['meta'], catalogs: [],
};
const STREAM_MANIFEST = {
  id: 'other-streams', name: 'Otro proveedor', version: '1',
  types: ['movie', 'series'], idPrefixes: ['tt'], resources: ['stream'], catalogs: [],
};

function fakeFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const metadata: Record<string, unknown> = {
      'https://meta.test/meta/movie/tt1234567.json': {
        meta: { id: 'tt1234567', name: 'La película', type: 'movie' },
      },
      'https://meta.test/meta/series/tt2345678.json': {
        meta: { id: 'tt2345678', name: 'Mi anime', type: 'series', genres: ['Anime'], country: 'Japan' },
      },
      'https://meta.test/meta/series/tt3456789.json': {
        meta: { id: 'tt3456789', name: 'Mi dorama', type: 'series', genres: ['Drama'], country: 'South Korea' },
      },
    };
    if (url === 'https://meta.test/manifest.json') return new Response(JSON.stringify(META_MANIFEST));
    if (url === 'https://other.test/manifest.json') return new Response(JSON.stringify(STREAM_MANIFEST));
    if (metadata[url]) return new Response(JSON.stringify(metadata[url]));
    if (url.startsWith('https://other.test/stream/')) return new Response(JSON.stringify({ streams: [
      {
        name: 'Proveedor secreto 4K', title: 'Servidor secreto 4K',
        description: 'Original por Proveedor secreto', url: 'https://cdn.test/external-4k.mp4',
        behaviorHints: {
          filename: 'Proveedor-secreto.mkv', bingeGroup: 'Proveedor secreto',
          proxyHeaders: { request: { Referer: 'https://other.test/' } },
        },
      },
    ] }));
    if (url.startsWith('https://media.test/')) {
      const [category, language, titleId, season, episode] =
        url.replace('https://media.test/', '').split('/');
      const src = category === 'movie'
        ? `https://cdn.test/${language}/movie-720.mp4`
        : `https://cdn.test/${language}/${titleId}-${season}-${episode}.mp4`;
      return new Response(`<video src="${src}"></video>`);
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

async function send(base: string, pathName: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}${pathName}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: (await response.json()) as Record<string, any> };
}

describe('migración de perfiles antiguos', () => {
  it('persiste el perfil inicial y convierte PIN antiguos sin perder acceso', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibeflix-migration-'));
    try {
      const file = path.join(dataDir, 'vibe-flix.json');
      const old = emptyData();
      old.profiles = [{ ...DEFAULT_PROFILE, id: 'legacy', name: 'Antiguo', pin: '4321', createdAt: 1 }];
      old.activeProfileId = 'legacy';
      await fs.writeFile(file, JSON.stringify(old));
      const app = createApp({ dataDir, fetchImpl: fakeFetch() });
      await app.bootstrap();
      const migrated = JSON.parse(await fs.readFile(file, 'utf8'));
      assert.ok(verifyProfilePin(migrated.profiles[0].pin, '4321'));
      assert.notEqual(migrated.profiles[0].pin, '4321');
      assert.equal((await fs.stat(file)).mode & 0o777, 0o600);

      const freshDir = path.join(dataDir, 'new');
      const fresh = createApp({ dataDir: freshDir, fetchImpl: fakeFetch() });
      await fresh.bootstrap();
      const persisted = JSON.parse(await fs.readFile(path.join(freshDir, 'vibe-flix.json'), 'utf8'));
      assert.equal(persisted.profiles[0].id, 'default');
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });
});

describe('perfiles y selección automática de fuentes', () => {
  let app: App;
  let server: http.Server;
  let base: string;
  let dataDir: string;

  before(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibeflix-language-'));
    const fetchImpl = fakeFetch();
    const registry = new AddonRegistry({
      http: new HttpClient({ fetchImpl, retries: 0 }), fanoutTimeoutMs: 1500,
    });
    app = createApp({ dataDir, registry, fetchImpl, publicUrl: 'http://localhost:0' });
    app.store.mutate((data) => { data.settings.builtInMetadata = false; });
    await app.bootstrap();
    await registry.install('https://meta.test/manifest.json');
    await registry.install('https://other.test/manifest.json');
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

  it('mantiene el nombre del addon igual a la app', async () => {
    const manifest = await send(base, '/manifest.json');
    assert.equal(manifest.body['name'], 'Vibe Flix');
    assert.equal(app.registry.get(NATIVE_SCRAPERS_ID)?.name, 'Vibe Flix');
  });

  it('guarda nombre e idioma y valida entradas incorrectas', async () => {
    const missing = await send(base, '/api/profiles');
    assert.equal(missing.body['profiles'][0].contentLanguage, undefined);
    const invalid = await send(base, '/api/profiles/default', 'PUT', { contentLanguage: 'bad url' });
    assert.equal(invalid.response.status, 400);
    const updated = await send(base, '/api/profiles/default', 'PUT', {
      name: 'Ana', contentLanguage: 'es-419',
    });
    assert.equal(updated.body['profile'].contentLanguage, 'es-419');
    assert.equal(updated.body['profile'].audioLanguage, 'es');
    assert.equal(updated.body['profile'].name, 'Ana');
    const persisted = JSON.parse(await fs.readFile(path.join(dataDir, 'vibe-flix.json'), 'utf8'));
    assert.equal(persisted.profiles[0].contentLanguage, 'es-419');
  });

  it('filtra por el idioma del perfil, prioriza el nativo y no muestra proveedores', async () => {
    const configs = [
      ...(['es-419', 'en'] as const).map((language) => ({
        id: `movie-${language}`, name: `Secreto ${language}`, types: ['movie'], languages: [language],
        itemUrl: `https://media.test/movie/${language}/{imdbId}`,
        streamPatterns: ['src="(https?://[^" ]+\\.mp4)"'],
      })),
      ...(['anime', 'dorama'] as const).map((kind) => ({
        id: kind, name: `Secreto ${kind}`, types: [kind], languages: ['es-419'],
        episodeUrl: `https://media.test/${kind}/es-419/{imdbId}/{season}/{episode}`,
        streamPatterns: ['src="(https?://[^" ]+\\.mp4)"'],
      })),
    ];
    const saved = await send(base, '/api/scrapers', 'PUT', { enabled: true, providers: [], configs });
    assert.equal(saved.response.status, 200);
    const es = await send(base, '/stream/movie/tt1234567.json');
    assert.equal(es.body['streams'][0].url, 'https://cdn.test/es-419/movie-720.mp4');
    assert.equal(es.body['streams'][0].name, 'La película');
    assert.deepEqual(es.body['streams'].map((stream: any) => stream.title), ['La película', 'La película']);
    assert.ok(es.body['streams'].every((stream: any) => !stream.description &&
      !stream.behaviorHints?.filename && !stream.behaviorHints?.bingeGroup));
    assert.equal(es.body['streams'][1].behaviorHints.proxyHeaders.request.Referer, 'https://other.test/');

    const created = await send(base, '/api/profiles', 'POST', {
      name: 'Ben', contentLanguage: 'en',
    });
    assert.equal(created.body['profile'].contentLanguage, 'en');
    await send(base, `/api/profiles/${created.body['profile'].id}/activate`, 'POST', {});
    const en = await send(base, '/stream/movie/tt1234567.json');
    assert.equal(en.body['streams'][0].url, 'https://cdn.test/en/movie-720.mp4');
    await send(base, '/api/profiles/default/activate', 'POST', {});
    const back = await send(base, '/stream/movie/tt1234567.json');
    assert.equal(back.body['streams'][0].url, 'https://cdn.test/es-419/movie-720.mp4');
  });

  it('separa anime y dorama con IDs de episodio reales y sin nombres de servidores', async () => {
    for (const [id, title, category] of [
      ['tt2345678', 'Mi anime', 'anime'], ['tt3456789', 'Mi dorama', 'dorama'],
    ]) {
      const reply = await send(base, `/stream/series/${id}:2:4.json`);
      assert.equal(reply.body['streams'][0]?.url, `https://cdn.test/es-419/${id}-2-4.mp4`);
      assert.equal(reply.body['streams'][0]?.name, `${title} · T2 E4`);
      assert.equal(reply.body['streams'][0]?.title, `${title} · T2 E4`);
      assert.equal(reply.body['streams'][0]?.description, undefined);
      assert.ok(app.scrapers.get(category), 'la categoría del proveedor existe');
    }
  });
});
