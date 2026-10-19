import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AddonRegistry } from '../src/registry.js';
import { HttpClient } from '../src/http.js';

/** Servidor de addons falso: responde manifests y recursos en memoria. */
function createFakeFetch(routes: Record<string, unknown>) {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body = routes[url];
    if (body === undefined) {
      return new Response('not found', { status: 404 });
    }
    if (body instanceof Response) return body.clone();
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

const CINEMETA = {
  id: 'com.linvo.cinemeta',
  name: 'Cinemeta',
  version: '1.0.0',
  types: ['movie', 'series'],
  idPrefixes: ['tt', 'kitsu'],
  resources: ['catalog', 'meta'],
  catalogs: [
    { type: 'movie', id: 'top', name: 'Top Movies' },
    { type: 'series', id: 'top', name: 'Top Series' },
  ],
};

const TORRENTIO = {
  id: 'torrentio.stremio',
  name: 'Torrentio',
  version: '4.0.0',
  types: ['movie', 'series'],
  idPrefixes: ['tt', 'kitsu'],
  resources: ['stream', 'subtitles'],
  catalogs: [{ type: 'movie', id: 'torrentio', name: 'Torrentio' }],
};

describe('AddonRegistry', () => {
  it('instala addons y agrega sus catalogos', async () => {
    const fetchImpl = createFakeFetch({
      'https://cinemeta.tld/manifest.json': CINEMETA,
      'https://torrentio.tld/manifest.json': TORRENTIO,
    });
    const registry = new AddonRegistry({ http: new HttpClient({ fetchImpl }) });

    await registry.install('https://cinemeta.tld/manifest.json');
    await registry.install('https://torrentio.tld/manifest.json');

    assert.equal(registry.size, 2);

    const catalogs = registry.catalogs();
    assert.equal(catalogs.length, 3);
    const topMovies = catalogs.find((c) => c.id === 'top' && c.type === 'movie');
    assert.ok(topMovies);
    assert.deepEqual(topMovies.addonIds, ['com.linvo.cinemeta']);
  });

  it('fusiona los catalogos de varios addons y deduplica por id', async () => {
    const fetchImpl = createFakeFetch({
      'https://a.tld/manifest.json': CINEMETA,
      'https://b.tld/manifest.json': {
        ...CINEMETA,
        id: 'com.otro.cinemeta',
        name: 'Cinemeta mirror',
      },
      'https://a.tld/catalog/movie/top.json': {
        metas: [{ id: 'tt1', name: 'Uno', poster: 'p1' }],
      },
      'https://b.tld/catalog/movie/top.json': {
        metas: [
          { id: 'tt1', name: 'Uno', poster: 'p1' },
          { id: 'tt2', name: 'Dos' },
        ],
      },
    });
    const registry = new AddonRegistry({ http: new HttpClient({ fetchImpl }) });
    await registry.install('https://a.tld/manifest.json');
    await registry.install('https://b.tld/manifest.json');

    const result = await registry.catalog({ type: 'movie', id: 'top' });
    assert.equal(result.value.metas.length, 2);
    assert.equal(result.sources.length, 2);
    assert.deepEqual(result.errors, []);
  });

  it('agrega streams de varios addons y los ordena por calidad', async () => {
    const fetchImpl = createFakeFetch({
      'https://a.tld/manifest.json': {
        id: 'addon.a',
        name: 'A',
        version: '1',
        types: ['movie'],
        idPrefixes: ['tt'],
        resources: ['stream'],
      },
      'https://b.tld/manifest.json': {
        id: 'addon.b',
        name: 'B',
        version: '1',
        types: ['movie'],
        idPrefixes: ['tt'],
        resources: ['stream'],
      },
      'https://a.tld/stream/movie/tt1.json': {
        streams: [{ name: 'A 720p', url: 'https://host/a720.m3u8' }],
      },
      'https://b.tld/stream/movie/tt1.json': {
        streams: [{ name: 'B 1080p HEVC', url: 'https://host/b1080.m3u8' }],
      },
    });
    const registry = new AddonRegistry({ http: new HttpClient({ fetchImpl }) });
    await registry.install('https://a.tld/manifest.json');
    await registry.install('https://b.tld/manifest.json');

    const result = await registry.streams({ type: 'movie', id: 'tt1' });
    assert.equal(result.value.streams.length, 2);
    assert.match(result.value.streams[0]?.name ?? '', /1080p/);
  });

  it('aisla los fallos: un addon caido no rompe el fan-out', async () => {
    const fetchImpl = createFakeFetch({
      'https://ok.tld/manifest.json': {
        id: 'addon.ok',
        name: 'OK',
        version: '1',
        types: ['movie'],
        resources: ['stream'],
      },
      'https://ko.tld/manifest.json': {
        id: 'addon.ko',
        name: 'KO',
        version: '1',
        types: ['movie'],
        resources: ['stream'],
      },
      'https://ok.tld/stream/movie/tt1.json': {
        streams: [{ name: 'OK 1080p', url: 'https://host/ok.m3u8' }],
      },
      // ko.tld responde 500 en el recurso
    });
    const registry = new AddonRegistry({ http: new HttpClient({ fetchImpl, retries: 0 }) });
    await registry.install('https://ok.tld/manifest.json');
    await registry.install('https://ko.tld/manifest.json');

    const result = await registry.streams({ type: 'movie', id: 'tt1' });
    assert.equal(result.value.streams.length, 1);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0]?.addonId, 'addon.ko');
  });

  it('respeta idPrefixes: un addon de kitsu no responde a ids de imdb', async () => {
    const fetchImpl = createFakeFetch({
      'https://kitsu.tld/manifest.json': {
        id: 'addon.kitsu',
        name: 'Kitsu',
        version: '1',
        types: ['movie', 'series'],
        idPrefixes: ['kitsu'],
        resources: ['meta'],
      },
    });
    const registry = new AddonRegistry({ http: new HttpClient({ fetchImpl }) });
    await registry.install('https://kitsu.tld/manifest.json');

    const result = await registry.meta({ type: 'movie', id: 'tt999' });
    assert.equal(result.sources.length, 0);
    assert.equal(result.value.meta, null);
  });

  it('conserva la query del manifest al pedir recursos (api key)', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      seen.push(url);
      if (url.startsWith('https://k.tld/manifest.json')) {
        return new Response(JSON.stringify(TORRENTIO), { status: 200 });
      }
      if (url.startsWith('https://k.tld/stream/movie/tt1.json')) {
        return new Response(JSON.stringify({ streams: [] }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const registry = new AddonRegistry({ http: new HttpClient({ fetchImpl }) });
    await registry.install('https://k.tld/manifest.json?apiKey=SECRET');
    await registry.streams({ type: 'movie', id: 'tt1' });

    const streamCall = seen.find((url) => url.includes('/stream/'));
    assert.ok(streamCall?.includes('apiKey=SECRET'), `esperaba api key en ${streamCall}`);
  });

  it('desinstala un addon', async () => {
    const fetchImpl = createFakeFetch({
      'https://a.tld/manifest.json': CINEMETA,
    });
    const registry = new AddonRegistry({ http: new HttpClient({ fetchImpl }) });
    await registry.install('https://a.tld/manifest.json');
    assert.equal(registry.size, 1);
    assert.equal(registry.remove('com.linvo.cinemeta'), true);
    assert.equal(registry.size, 0);
  });
});
