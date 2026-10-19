import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { HttpClient } from '../src/http.js';
import { DebridService } from '../src/debrid/service.js';
import { RealDebridProvider } from '../src/debrid/realdebrid.js';
import { AllDebridProvider } from '../src/debrid/alldebrid.js';
import { TorboxProvider } from '../src/debrid/torbox.js';
import { PremiumizeProvider } from '../src/debrid/premiumize.js';
import { linkOf, type DebridProvider } from '../src/debrid/types.js';
import { tagTitle } from '../src/debrid/service.js';
import type { Stream } from '../src/types.js';

interface Route {
  status?: number;
  body?: unknown;
  /** Texto plano (para respuestas no JSON). */
  text?: string;
}

function fakeFetch(routes: Record<string, Route>, calls?: string[]) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls?.push(`${init?.method ?? 'GET'} ${url}`);
    const route = routes[url];
    if (!route) return new Response('not found', { status: 404 });
    if (route.text !== undefined) {
      return new Response(route.text, { status: route.status ?? 200 });
    }
    return new Response(JSON.stringify(route.body ?? {}), { status: route.status ?? 200 });
  }) as unknown as typeof fetch;
}

const MAGNET = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567';

describe('debrid: extraccion de enlaces', () => {
  it('saca el magnet del infoHash', () => {
    const link = linkOf({ infoHash: 'abc123' });
    assert.equal(link?.kind, 'magnet');
    assert.match(link!.value, /urn:btih:abc123/);
  });

  it('saca el magnet de una url magnet', () => {
    const link = linkOf({ url: MAGNET });
    assert.equal(link?.kind, 'magnet');
    assert.equal(link?.infoHash, '0123456789abcdef0123456789abcdef01234567');
  });

  it('usa el externalUrl como enlace de hoster', () => {
    const link = linkOf({ externalUrl: 'https://rapidgator.net/file/abc' });
    assert.equal(link?.kind, 'url');
    assert.equal(link?.value, 'https://rapidgator.net/file/abc');
  });

  it('ignora streams sin enlace premium', () => {
    assert.equal(linkOf({ url: 'https://cdn.tld/file.mkv' }), null);
  });

  it('etiqueta el titulo con el proveedor sin duplicar la etiqueta', () => {
    assert.equal(tagTitle('Pelicula 1080p', 'RD'), 'Pelicula 1080p [RD]');
    assert.equal(tagTitle('Pelicula 1080p [RD]', 'RD'), 'Pelicula 1080p [RD]');
  });
});

describe('debrid: Real-Debrid', () => {
  it('desbloquea un enlace de hoster', async () => {
    const routes = {
      'https://rd.tld/rest/1.0/unrestrict/links': {
        body: [
          {
            filename: 'Pelicula.1080p.mkv',
            filesize: 2_000_000_000,
            link: 'https://rd.tld/download/1',
            download: 'https://rd.tld/dl/1',
            streamable: 1,
          },
        ],
      },
    };
    const provider = new RealDebridProvider({ apiKey: 'KEY', baseUrl: 'https://rd.tld/rest/1.0' });
    const http = new HttpClient({ fetchImpl: fakeFetch(routes) });
    const resolution = await provider.resolve(
      { externalUrl: 'https://rapidgator.net/file/abc' },
      http,
    );
    assert.equal(resolution.url, 'https://rd.tld/download/1');
    assert.equal(resolution.name, 'Pelicula.1080p.mkv');
    assert.equal(resolution.size, 2_000_000_000);
  });

  it('prepara el magnet y devuelve el enlace del archivo mas grande', async () => {
    const calls: string[] = [];
    const routes = {
      'https://rd.tld/rest/1.0/torrents/addMagnet': { body: { id: 'torrent-1' } },
      'https://rd.tld/rest/1.0/torrents/selectFiles/torrent-1': { body: { files: ['all'] } },
      'https://rd.tld/rest/1.0/torrents/info/torrent-1?apikey=KEY': {
        body: { id: 'torrent-1', status: 'downloaded', progress: 1 },
      },
      'https://rd.tld/rest/1.0/unrestrict/links': {
        body: [
          { filename: 'sample.mkv', filesize: 10, link: 'https://rd.tld/d/sample' },
          { filename: 'pelicula.mkv', filesize: 900, link: 'https://rd.tld/d/pelicula' },
        ],
      },
    };
    const provider = new RealDebridProvider({
      apiKey: 'KEY',
      baseUrl: 'https://rd.tld/rest/1.0',
      pollIntervalMs: 1,
    });
    const http = new HttpClient({ fetchImpl: fakeFetch(routes, calls) });
    const resolution = await provider.resolve({ infoHash: 'abc123' }, http);
    assert.equal(resolution.url, 'https://rd.tld/d/pelicula');
    assert.ok(calls.some((call) => call.includes('addMagnet')));
    assert.ok(calls.some((call) => call.includes('selectFiles')));
  });

  it('verifica las credenciales', async () => {
    const routes = {
      'https://rd.tld/rest/1.0/user?apikey=KEY': { body: { username: 'yo', type: 'premium' } },
    };
    const provider = new RealDebridProvider({ apiKey: 'KEY', baseUrl: 'https://rd.tld/rest/1.0' });
    const result = await provider.verify(new HttpClient({ fetchImpl: fakeFetch(routes) }));
    assert.equal(result.ok, true);
    assert.match(result.message, /yo/);
  });
});

describe('debrid: AllDebrid', () => {
  it('usa el enlace instantaneo si el torrent esta cacheado', async () => {
    const routes = {
      'https://ad.tld/v4/magnet/instant?agent=vibeflix&apikey=KEY&magnets[]=magnet%3Aabc': {
        body: {
          status: 'success',
          data: {
            magnets: {
              'magnet:abc': {
                instant: true,
                files: {
                  '1': { filename: 'corto.mkv', size: 10, link: 'https://ad.tld/f/1' },
                  '2': { filename: 'largo.mkv', size: 900, link: 'https://ad.tld/f/2' },
                },
              },
            },
          },
        },
      },
    };
    const provider = new AllDebridProvider({ apiKey: 'KEY', baseUrl: 'https://ad.tld/v4' });
    const resolution = await provider.resolve(
      { url: 'magnet:abc' },
      new HttpClient({ fetchImpl: fakeFetch(routes) }),
    );
    assert.equal(resolution.url, 'https://ad.tld/f/2');
    assert.equal(resolution.name, 'largo.mkv');
  });

  it('sube el magnet y espera a que este listo', async () => {
    const routes = {
      'https://ad.tld/v4/magnet/instant?agent=vibeflix&apikey=KEY&magnets[]=magnet%3Aabc': {
        body: { status: 'success', data: { magnets: { 'magnet:abc': { instant: false } } } },
      },
      'https://ad.tld/v4/magnet/upload?agent=vibeflix&apikey=KEY&magnets[]=magnet%3Aabc': {
        body: { status: 'success', data: { magnets: { 'magnet:abc': { id: 77 } } } },
      },
      'https://ad.tld/v4/magnet/status?agent=vibeflix&apikey=KEY&id=77': {
        body: {
          status: 'success',
          data: {
            magnets: {
              '77': {
                status: 'ready',
                files: { '1': { filename: 'peli.mkv', size: 500, link: 'https://ad.tld/f/77' } },
              },
            },
          },
        },
      },
    };
    const provider = new AllDebridProvider({
      apiKey: 'KEY',
      baseUrl: 'https://ad.tld/v4',
      pollIntervalMs: 1,
    });
    const resolution = await provider.resolve(
      { url: 'magnet:abc' },
      new HttpClient({ fetchImpl: fakeFetch(routes) }),
    );
    assert.equal(resolution.url, 'https://ad.tld/f/77');
  });
});

describe('debrid: TorBox', () => {
  it('crea el enlace desde la cache del torrent', async () => {
    const routes = {
      'https://tb.tld/v1/api/torrents/checkcached?format=object&list_files=true&apikey=KEY&hash=abc123': {
        body: {
          success: true,
          data: {
            id: 9,
            cached: true,
            files: [
              { id: 1, name: 'small.mkv', size: 10 },
              { id: 2, name: 'big.mkv', size: 900 },
            ],
          },
        },
      },
      'https://tb.tld/v1/api/torrents/createlink?apikey=KEY&torrent_id=9&file_id=2': {
        body: { success: true, data: { link: 'https://tb.tld/d/9/2', name: 'big.mkv', size: 900 } },
      },
    };
    const provider = new TorboxProvider({ apiKey: 'KEY', baseUrl: 'https://tb.tld/v1/api' });
    const resolution = await provider.resolve(
      { infoHash: 'abc123' },
      new HttpClient({ fetchImpl: fakeFetch(routes) }),
    );
    assert.equal(resolution.url, 'https://tb.tld/d/9/2');
    assert.equal(resolution.name, 'big.mkv');
  });

  it('resuelve enlaces http con la API de transfer', async () => {
    const routes = {
      'https://tb.tld/v1/api/transfer/create': { body: { success: true, data: { id: 5 } } },
      'https://tb.tld/v1/api/transfer/dl/5?apikey=KEY': {
        body: { success: true, data: { link: 'https://tb.tld/t/5', name: 'peli.mkv', size: 42 } },
      },
    };
    const provider = new TorboxProvider({ apiKey: 'KEY', baseUrl: 'https://tb.tld/v1/api' });
    const resolution = await provider.resolve(
      { externalUrl: 'https://rapidgator.net/file/abc' },
      new HttpClient({ fetchImpl: fakeFetch(routes) }),
    );
    assert.equal(resolution.url, 'https://tb.tld/t/5');
  });
});

describe('debrid: Premiumize', () => {
  it('resuelve el enlace directo y elige el archivo mayor', async () => {
    const routes = {
      'https://pm.tld/api/transfer/direct?apikey=KEY&src=https%3A%2F%2F1fichier.com%2Fx': {
        body: {
          status: 'success',
          content: [
            { filename: 'small.mkv', size: 10, link: 'https://pm.tld/s' },
            { filename: 'big.mkv', size: 900, link: 'https://pm.tld/b' },
          ],
        },
      },
    };
    const provider = new PremiumizeProvider({ apiKey: 'KEY', baseUrl: 'https://pm.tld/api' });
    const resolution = await provider.resolve(
      { externalUrl: 'https://1fichier.com/x' },
      new HttpClient({ fetchImpl: fakeFetch(routes) }),
    );
    assert.equal(resolution.url, 'https://pm.tld/b');
  });
});

describe('debrid: servicio', () => {
  const fakeProvider: DebridProvider = {
    id: 'realdebrid',
    name: 'Fake',
    tag: 'RD',
    hosters: [],
    supports: () => true,
    resolve: async (stream) => ({
      url: `https://cdn.tld/${String(stream.infoHash ?? 'x')}`,
      name: 'resuelto',
      size: 100,
    }),
  };

  it('resuelve los streams candidatos y deja intactos los demas', async () => {
    const service = new DebridService(
      { provider: 'realdebrid', apiKey: 'KEY' },
      { providers: [fakeProvider] },
    );
    const streams: Stream[] = [
      { infoHash: 'abc', title: 'Torrent' },
      { url: 'https://cdn.tld/direct.mkv', title: 'Directo' },
    ];
    const result = await service.resolveStreams(streams);
    assert.equal(result[0]?.url, 'https://cdn.tld/abc');
    assert.match(result[0]!.title!, /\[RD\]$/);
    assert.equal(result[1]?.url, 'https://cdn.tld/direct.mkv');
  });

  it('cachea la resolucion y no vuelve a llamar al proveedor', async () => {
    let calls = 0;
    const counting: DebridProvider = {
      ...fakeProvider,
      resolve: async (stream) => {
        calls += 1;
        return { url: `https://cdn.tld/${String(stream.infoHash)}` };
      },
    };
    const service = new DebridService(
      { provider: 'realdebrid', apiKey: 'KEY' },
      { providers: [counting] },
    );
    await service.resolveStreams([{ infoHash: 'abc' }]);
    await service.resolveStreams([{ infoHash: 'abc' }]);
    assert.equal(calls, 1);
  });

  it('mantiene el stream original si la resolucion falla', async () => {
    const failing: DebridProvider = {
      ...fakeProvider,
      resolve: async () => {
        throw new Error('sin creditos');
      },
    };
    const service = new DebridService(
      { provider: 'realdebrid', apiKey: 'KEY' },
      { providers: [failing] },
    );
    const result = await service.resolveStreams([{ infoHash: 'abc', url: 'magnet:x' }]);
    assert.equal(result[0]?.url, 'magnet:x');
    assert.match(service.status().lastError ?? '', /sin creditos/);
  });

  it('no hace nada si no hay proveedor configurado', async () => {
    const service = new DebridService(null);
    assert.equal(service.enabled, false);
    const streams: Stream[] = [{ infoHash: 'abc' }];
    assert.deepEqual(await service.resolveStreams(streams), streams);
  });

  it('informa del estado y verifica las credenciales', async () => {
    const service = new DebridService(
      { provider: 'realdebrid', apiKey: 'KEY' },
      { providers: [fakeProvider] },
    );
    const status = service.status();
    assert.equal(status.enabled, true);
    assert.equal(status.provider, 'realdebrid');
    assert.equal(status.tag, 'RD');
    const check = await service.verify();
    assert.equal(check.ok, true);
  });

  it('informa del error cuando la verificacion falla', async () => {
    const failing: DebridProvider = {
      ...fakeProvider,
      verify: async () => {
        throw new Error('api key invalida');
      },
    };
    const service = new DebridService(
      { provider: 'realdebrid', apiKey: 'KEY' },
      { providers: [failing] },
    );
    const check = await service.verify();
    assert.equal(check.ok, false);
    assert.match(check.message, /api key invalida/);
  });
});
