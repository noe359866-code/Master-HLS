import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createConfigProvider, fillTemplate } from '../src/providers/config.js';
import { archiveProvider, pickBestFile } from '../src/providers/archive.js';
import { mergeSources, titleMatches, toStremioStream } from '../src/normalize.js';
import type { ScrapeContext } from '../src/types.js';

function context(overrides: Partial<ScrapeContext> = {}): ScrapeContext {
  return {
    userAgent: 'test-agent',
    fetchText: async () => '',
    fetchJson: async () => ({}) as never,
    ...overrides,
  };
}

describe('proveedor por configuracion', () => {
  it('sustituye las plantillas de la URL', () => {
    const url = fillTemplate(
      'https://site.example/search?q={title}&y={year}&s={season}&e={episode}',
      { type: 'movie', id: 'tt1', title: 'Peli', year: 1999, season: 2, episode: 5 },
    );
    assert.equal(
      url,
      'https://site.example/search?q=Peli&y=1999&s=2&e=5',
    );
  });

  it('busca el item y extrae el stream', async () => {
    const provider = createConfigProvider({
      id: 'demo',
      name: 'Demo',
      types: ['movie'],
      searchUrl: 'https://site.example/search?q={title}',
      itemUrl: 'https://site.example/movie/{id}',
      itemPattern: 'href="\\/movie\\/(\\w+)"',
      streamPatterns: ['src="(https?:\\/\\/[^"]+\\.mp4)"'],
    });

    const ctx = context({
      fetchText: async (url) => {
        if (url.includes('/search')) return '<a href="/movie/abc123">Peli</a>';
        return '<video src="https://cdn.example.com/movie.mp4"></video>';
      },
    });

    const sources = await provider.fetchSources(
      { type: 'movie', id: 'tt1', title: 'Peli' },
      ctx,
    );
    assert.equal(sources.length, 1);
    assert.equal(sources[0]!.url, 'https://cdn.example.com/movie.mp4');
    assert.equal(sources[0]!.provider, 'Demo');
  });

  it('no confunde los episodios: busca ficha y URL de temporada/episodio', async () => {
    const urls: string[] = [];
    const provider = createConfigProvider({
      id: 'series', name: 'Series', types: ['anime', 'dorama'], languages: ['es-419'],
      searchUrl: 'https://site.example/buscar?q={title}',
      itemPattern: 'href="/serie/(\\w+)"[^>]*>([^<]+)',
      itemUrl: 'https://site.example/serie/{id}',
      episodeUrl: 'https://site.example/serie/{id}/{season}/{episode}',
      streamPatterns: ['src="(https?://[^" ]+\.mp4)"'],
    });
    const ctx = context({
      fetchText: async (url) => {
        urls.push(url);
        if (url.includes('/buscar')) {
          return '<a href="/serie/otra">Serie diferente</a><a href="/serie/elegida">Dorama elegido</a>';
        }
        if (url.endsWith('/2/4')) return '<video src="https://cdn.example/2-4.mp4">';
        if (url.endsWith('/serie/elegida')) return '<video src="https://cdn.example/episodio-equivocado.mp4">';
        return '';
      },
    });
    const sources = await provider.fetchSources({
      type: 'series', kind: 'dorama', id: 'tt99:2:4', titleId: 'tt99', title: 'Dorama elegido',
      season: 2, episode: 4,
    }, ctx);
    assert.deepEqual(urls, [
      'https://site.example/buscar?q=Dorama%20elegido',
      'https://site.example/serie/elegida/2/4',
    ]);
    assert.equal(sources[0]?.url, 'https://cdn.example/2-4.mp4');
    assert.equal(sources[0]?.headers?.Referer, 'https://site.example/serie/elegida/2/4');
  });

  it('admite una página de episodio enlazada desde la ficha', async () => {
    const provider = createConfigProvider({
      id: 'episodios', name: 'Episodios', types: ['series'],
      searchUrl: 'https://site.example/buscar?q={title}',
      itemUrl: 'https://site.example/serie/{id}',
      itemPattern: 'href="/serie/(\\w+)"[^>]*>([^<]+)',
      episodePattern: 'href="([^"]*/{season}/{episode})"',
      streamPatterns: ['src="(https?://[^" ]+\\.mp4)"'],
    });
    const urls: string[] = [];
    const ctx = context({ fetchText: async (url) => {
      urls.push(url);
      if (url.includes('/buscar')) return '<a href="/serie/legit">Serie legit</a>';
      if (url.endsWith('/serie/legit')) return '<a href="/capitulo/2/4">Ep 4</a>';
      if (url.endsWith('/capitulo/2/4')) return '<video src="https://cdn.example/4.mp4">';
      return '';
    } });
    const sources = await provider.fetchSources({
      type: 'series', id: 'tt1:2:4', title: 'Serie legit', season: 2, episode: 4,
    }, ctx);
    assert.equal(sources[0]?.url, 'https://cdn.example/4.mp4');
    assert.deepEqual(urls, [
      'https://site.example/buscar?q=Serie%20legit',
      'https://site.example/serie/legit',
      'https://site.example/capitulo/2/4',
    ]);
  });

  it('no presenta la ficha de una serie como un episodio diferente', async () => {
    const provider = createConfigProvider({
      id: 'old', name: 'Old', types: ['series'],
      searchUrl: 'https://site.example/buscar?q={title}',
      itemUrl: 'https://site.example/serie/{id}',
      itemPattern: 'href="/serie/(\\w+)"',
      streamPatterns: ['src="(https?://[^" ]+\.mp4)"'],
    });
    let called = false;
    const sources = await provider.fetchSources(
      { type: 'series', id: 'tt99:2:4', title: 'Dorama', season: 2, episode: 4 },
      context({ fetchText: async () => { called = true; return ''; } }),
    );
    assert.deepEqual(sources, []);
    assert.equal(called, false);
  });

  it('puede resolver directamente un ID externo sin pantalla de búsqueda', async () => {
    const provider = createConfigProvider({
      id: 'directo', name: 'Directo', types: ['movie'],
      itemUrl: 'https://site.example/video/{tmdbId}',
      streamPatterns: ['src="(https?://[^" ]+\.mp4)"'],
    });
    const sources = await provider.fetchSources(
      { type: 'movie', id: 'tmdb:123', tmdbId: '123', title: 'Mi peli' },
      context({ fetchText: async () => '<video src="https://cdn.example/m.mp4">' }),
    );
    assert.equal(sources[0]?.url, 'https://cdn.example/m.mp4');
  });

  it('devuelve una lista vacia si la busqueda falla', async () => {
    const provider = createConfigProvider({
      id: 'demo',
      name: 'Demo',
      types: ['movie'],
      searchUrl: 'https://site.example/search?q={title}',
    });
    const sources = await provider.fetchSources(
      { type: 'movie', id: 'tt1', title: 'Peli' },
      context({
        fetchText: async () => {
          throw new Error('sin red');
        },
      }),
    );
    assert.deepEqual(sources, []);
  });
});

describe('proveedor de Internet Archive', () => {
  it('elige el archivo de video mas grande', () => {
    const file = pickBestFile([
      { name: 'cover.jpg', format: 'JPEG', size: '1000' },
      { name: 'movie-360p.mp4', format: 'h.264', size: '100' },
      { name: 'movie-720p.mp4', format: 'h.264', size: '900' },
    ]);
    assert.equal(file?.name, 'movie-720p.mp4');
  });

  it('busca en Internet Archive y devuelve el MP4', async () => {
    const ctx = context({
      fetchJson: async (url: string) => {
        if (url.includes('advancedsearch')) {
          return {
            response: { docs: [{ identifier: 'el_viaje_1999', title: 'El viaje', year: 1999 }] },
          };
        }
        return {
          files: [
            { name: 'el_viaje.mp4', format: 'h.264', size: '5000' },
            { name: 'el_viaje_720p.mp4', format: 'h.264', size: '9000' },
          ],
          metadata: { title: 'El viaje', year: '1999' },
        };
      },
    });

    const sources = await archiveProvider.fetchSources(
      { type: 'movie', id: 'tt1', title: 'El viaje', year: 1999 },
      ctx,
    );
    assert.equal(sources.length, 1);
    assert.equal(
      sources[0]!.url,
      'https://archive.org/download/el_viaje_1999/el_viaje_720p.mp4',
    );
    assert.equal(sources[0]!.quality, '720p');
  });

  it('descarta los titulos que no coinciden', async () => {
    const ctx = context({
      fetchJson: async () => ({
        response: { docs: [{ identifier: 'otra', title: 'Pelicula totalmente distinta' }] },
      }),
    });
    const sources = await archiveProvider.fetchSources(
      { type: 'movie', id: 'tt1', title: 'El viaje' },
      ctx,
    );
    assert.deepEqual(sources, []);
  });
});

describe('normalizacion', () => {
  it('compara titulos ignorando acentos y articulos', () => {
    assert.equal(titleMatches('El viaje', 'el viaje'), true);
    assert.equal(titleMatches('Amélie', 'amelie'), true);
    assert.equal(titleMatches('The Matrix', 'Matrix'), true);
    assert.equal(titleMatches('Matrix', 'El viaje'), false);
  });

  it('deduplica y ordena por calidad', () => {
    const merged = mergeSources([
      { url: 'https://a/1.mp4', provider: 'A', quality: '360p' },
      { url: 'https://a/1.mp4', provider: 'B', quality: '1080p' },
      { url: 'https://a/2.mp4', provider: 'A', quality: '720p' },
    ]);
    assert.equal(merged.length, 2);
    assert.equal(merged[0]!.quality, '720p');
  });

  it('convierte una fuente en stream de Stremio', () => {
    const stream = toStremioStream({
      url: 'https://cdn.example/movie.m3u8',
      provider: 'Demo',
      quality: '1080p',
      headers: { Referer: 'https://site.example/' },
      subtitles: [{ language: 'es', url: 'https://cdn.example/es.vtt' }],
    });
    assert.equal(stream.name, 'Demo · 1080p');
    assert.equal(stream.url, 'https://cdn.example/movie.m3u8');
    assert.equal(stream.behaviorHints?.proxyHeaders?.request?.['Referer'], 'https://site.example/');
    assert.equal(stream.subtitles?.[0]?.lang, 'es');
  });
});
