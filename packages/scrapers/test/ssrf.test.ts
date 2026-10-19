import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertPublicHttpUrl,
  BlockedDestinationError,
  createGuardedFetch,
  isBlockedHostname,
  isPrivateAddress,
  publicHttpUrl,
} from '../src/ssrf.js';
import { createConfigProvider } from '../src/providers/config.js';
import type { ScrapeContext } from '../src/types.js';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const privateLookup = async () => [{ address: '10.0.0.7', family: 4 }];

function response(body: string, init: ResponseInit = {}): Response {
  return new Response(body, init);
}

describe('guardia SSRF: direcciones y hosts', () => {
  it('bloquea loopback, redes privadas, CGNAT, link-local, multicast y reservadas', () => {
    for (const address of [
      '0.0.0.0', '10.0.0.1', '10.255.255.255', '127.0.0.1', '127.10.0.5',
      '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.0.0.1',
      '192.0.2.10', '192.168.1.1', '198.18.0.1', '198.51.100.2', '203.0.113.9',
      '100.64.0.1', '100.127.255.254', '224.0.0.1', '240.0.0.1', '255.255.255.255',
    ]) {
      assert.equal(isPrivateAddress(address), true, address);
    }
    for (const address of ['::', '::1', 'fe80::1', 'fc00::1', 'fd12:3456::1',
      'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1',
      '64:ff9b::a00:1', '2001:db8::1', '2002:c000:204::1']) {
      assert.equal(isPrivateAddress(address), true, address);
    }
    for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) {
      assert.equal(isPrivateAddress(address), false, address);
    }
  });

  it('rechaza hosts locales y esquemas que no son HTTP', () => {
    assert.equal(isBlockedHostname('localhost'), true);
    assert.equal(isBlockedHostname('app.localhost'), true);
    assert.equal(isBlockedHostname('router.local'), true);
    assert.equal(isBlockedHostname('metadata.google.internal'), true);
    assert.equal(publicHttpUrl('http://127.0.0.1/x'), undefined);
    assert.equal(publicHttpUrl('http://[::1]/x'), undefined);
    assert.equal(publicHttpUrl('http://usuario:clave@example.com/x'), undefined);
    assert.equal(publicHttpUrl('file:///etc/passwd'), undefined);
    assert.equal(publicHttpUrl('magnet:?xt=urn:btih:abc'), undefined);
    assert.equal(publicHttpUrl('https://example.com/x'), 'https://example.com/x');
  });

  it('resuelve DNS y bloquea cualquier dirección privada, no sólo la primera', async () => {
    await assert.rejects(
      assertPublicHttpUrl('https://interno.example/x', { lookup: privateLookup }),
      (error: unknown) => error instanceof BlockedDestinationError,
    );
    await assert.rejects(
      assertPublicHttpUrl('https://mixto.example/x', {
        lookup: async () => [
          { address: '93.184.216.34', family: 4 },
          { address: '192.168.0.10', family: 4 },
        ],
      }),
      BlockedDestinationError,
    );
    await assert.rejects(
      assertPublicHttpUrl('https://sin-dns.example/x', {
        lookup: async () => { throw new Error('NXDOMAIN'); },
      }),
      BlockedDestinationError,
    );
    const allowed = await assertPublicHttpUrl('https://ejemplo.example/x', {
      lookup: publicLookup,
    });
    assert.equal(allowed.toString(), 'https://ejemplo.example/x');
  });

  it('permite destinos privados sólo con allowPrivate explícito (LAN de confianza)', async () => {
    const url = await assertPublicHttpUrl('http://192.168.1.20/video.m3u8', {
      allowPrivate: true,
    });
    assert.equal(url.toString(), 'http://192.168.1.20/video.m3u8');
  });
});

describe('guardia SSRF: fetch y redirecciones', () => {
  it('no llama al fetch subyacente para un destino privado', async () => {
    const calls: string[] = [];
    const guarded = createGuardedFetch({
      lookup: publicLookup,
      fetchImpl: (async (input: string | URL | Request) => {
        calls.push(String(input));
        return response('ok');
      }) as unknown as typeof fetch,
    });
    await assert.rejects(guarded('http://127.0.0.1:8080/admin'), BlockedDestinationError);
    await assert.rejects(guarded('http://169.254.169.254/latest/meta-data'), BlockedDestinationError);
    assert.deepEqual(calls, []);
  });

  it('sigue una redirección pública y devuelve la respuesta final', async () => {
    const calls: string[] = [];
    const guarded = createGuardedFetch({
      lookup: publicLookup,
      fetchImpl: (async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        if (url === 'https://origen.example/a') {
          return response('', { status: 302, headers: { location: '/b' } });
        }
        return response('final');
      }) as unknown as typeof fetch,
    });
    const result = await guarded('https://origen.example/a');
    assert.equal(result.status, 200);
    assert.equal(await result.text(), 'final');
    assert.deepEqual(calls, ['https://origen.example/a', 'https://origen.example/b']);
  });

  it('bloquea una redirección hacia la red interna antes de pedirla', async () => {
    const calls: string[] = [];
    const guarded = createGuardedFetch({
      lookup: publicLookup,
      fetchImpl: (async (input: string | URL | Request) => {
        calls.push(String(input));
        return response('', {
          status: 301,
          headers: { location: 'http://10.0.0.5/panel' },
        });
      }) as unknown as typeof fetch,
    });
    await assert.rejects(guarded('https://origen.example/a'), BlockedDestinationError);
    assert.deepEqual(calls, ['https://origen.example/a']);
  });

  it('corta las cadenas de redirecciones demasiado largas', async () => {
    const guarded = createGuardedFetch({
      lookup: publicLookup,
      maxRedirects: 1,
      fetchImpl: (async () => response('', {
        status: 302,
        headers: { location: 'https://origen.example/otra' },
      })) as unknown as typeof fetch,
    });
    await assert.rejects(guarded('https://origen.example/a'), /redirecciones/i);
  });
});

describe('guardia SSRF: fuentes configuradas', () => {
  it('descarta enlaces de vídeo que apuntan a la red interna', async () => {
    const provider = createConfigProvider({
      id: 'inseguro',
      name: 'Inseguro',
      types: ['movie'],
      searchUrl: 'https://sitio.example/buscar?q={title}',
      itemUrl: 'https://sitio.example/ficha/{id}',
      itemPattern: 'href="/ficha/(\\w+)"',
      streamPatterns: ['src="(https?:\\/\\/[^"]+)"'],
    });
    const context: ScrapeContext = {
      userAgent: 'test',
      fetchText: async (url) => {
        if (url.includes('/buscar')) return '<a href="/ficha/abc">Pelicula</a>';
        return '<video src="http://127.0.0.1:9000/pelicula.mp4"></video>';
      },
      fetchJson: async <T>() => ({} as T),
    };
    const sources = await provider.fetchSources(
      { type: 'movie', id: 'tt1', title: 'Pelicula' },
      context,
    );
    assert.deepEqual(sources, []);
  });

  it('conserva los magnets: no se descargan en el servidor', async () => {
    const provider = createConfigProvider({
      id: 'magnet', name: 'Magnet', types: ['movie'],
      searchUrl: 'https://sitio.example/buscar?q={title}',
      itemUrl: 'https://sitio.example/ficha/{id}',
      itemPattern: 'href="/ficha/(\\w+)"',
      streamPatterns: ['href="(magnet:\\?xt=[^"]+)"'],
    });
    const context: ScrapeContext = {
      userAgent: 'test',
      fetchText: async (url) => url.includes('/buscar')
        ? '<a href="/ficha/abc">Pelicula</a>'
        : '<a href="magnet:?xt=urn:btih:abc123">Torrent</a>',
      fetchJson: async <T>() => ({} as T),
    };
    const sources = await provider.fetchSources(
      { type: 'movie', id: 'tt1', title: 'Pelicula' },
      context,
    );
    assert.equal(sources.length, 1);
    assert.match(sources[0]!.url, /^magnet:\?xt=urn:btih:abc123$/);
  });
});
