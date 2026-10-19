import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeMeta,
  mergeVideos,
  normalizeCatalogResponse,
  normalizeMetaResponse,
  normalizeStreamResponse,
  normalizeSubtitleResponse,
  toStringArray,
} from '../src/normalize.js';

describe('toStringArray', () => {
  it('acepta string', () => {
    assert.deepEqual(toStringArray('Keanu Reeves'), ['Keanu Reeves']);
  });

  it('acepta array de strings', () => {
    assert.deepEqual(toStringArray(['A', 'B']), ['A', 'B']);
  });

  it('acepta array de objetos con name/character', () => {
    assert.deepEqual(toStringArray([{ name: 'A', character: 'B' }]), ['A (B)']);
  });

  it('devuelve undefined para null', () => {
    assert.equal(toStringArray(null), undefined);
  });
});

describe('normalizeMetaResponse', () => {
  it('normaliza cast/director heterogeneos', () => {
    const { meta } = normalizeMetaResponse({
      meta: {
        id: 'tt1',
        name: 'Pelicula',
        cast: 'Actor Uno',
        director: ['Dir A', 'Dir B'],
        writer: 'Writer A',
      },
    });
    assert.ok(meta);
    assert.deepEqual(meta.cast, ['Actor Uno']);
    assert.deepEqual(meta.director, ['Dir A', 'Dir B']);
    assert.deepEqual(meta.writer, ['Writer A']);
  });

  it('devuelve meta null si no hay contenido', () => {
    const { meta } = normalizeMetaResponse({ meta: null });
    assert.equal(meta, null);
  });

  it('descarta metas sin id', () => {
    const { meta } = normalizeMetaResponse({ meta: { name: 'Sin id' } });
    assert.equal(meta, null);
  });
});

describe('normalizeStreamResponse', () => {
  it('descarta streams sin url utilizable', () => {
    const { streams } = normalizeStreamResponse({
      streams: [{ name: 'Sin url' }, { name: 'Ok', url: 'https://host/x.m3u8' }],
    });
    assert.equal(streams.length, 1);
    assert.equal(streams[0]?.url, 'https://host/x.m3u8');
  });

  it('acepta externalUrl y ytId como url valida', () => {
    const { streams } = normalizeStreamResponse({
      streams: [{ name: 'ext', externalUrl: 'https://host/x' }, { name: 'yt', ytId: 'abc' }],
    });
    assert.equal(streams.length, 2);
  });

  it('acepta torrents (infoHash), que resuelve el debrid', () => {
    const { streams } = normalizeStreamResponse({
      streams: [{ name: 'torrent', infoHash: 'a1b2c3', fileIdx: 2 }],
    });
    assert.equal(streams.length, 1);
    assert.equal(streams[0]?.infoHash, 'a1b2c3');
    assert.equal(streams[0]?.fileIdx, 2);
  });
});

describe('normalizeCatalogResponse', () => {
  it('filtra entradas invalidas', () => {
    const { metas } = normalizeCatalogResponse({ metas: [{ id: 'tt1' }, null, { name: 'x' }] });
    assert.equal(metas.length, 1);
  });
});

describe('normalizeSubtitleResponse', () => {
  it('normaliza lang ausente a "und"', () => {
    const { subtitles } = normalizeSubtitleResponse({
      subtitles: [{ url: 'https://host/s.vtt' }],
    });
    assert.equal(subtitles[0]?.lang, 'und');
  });
});

describe('mergeMeta', () => {
  it('combina generos, cast y conserva la portada que ya existe', () => {
    const merged = mergeMeta(
      {
        id: 'tt1',
        name: 'A',
        poster: 'https://img/a.jpg',
        genres: ['Action'],
        cast: ['Uno'],
      },
      {
        id: 'tt1',
        name: 'A',
        poster: 'https://img/b.jpg',
        genres: ['Drama'],
        cast: ['Dos'],
      },
    );
    assert.ok(merged);
    assert.equal(merged.poster, 'https://img/a.jpg');
    assert.deepEqual(merged.genres?.sort(), ['Action', 'Drama']);
    assert.deepEqual(merged.cast, ['Uno', 'Dos']);
  });

  it('rellena campos vacios con los del segundo addon', () => {
    const merged = mergeMeta({ id: 'tt1', name: 'A' }, {
      id: 'tt1',
      name: 'A',
      description: 'Desc',
      imdbRating: '8.1',
    });
    assert.equal(merged?.description, 'Desc');
    assert.equal(merged?.imdbRating, '8.1');
  });
});

describe('mergeVideos', () => {
  it('fusiona episodios por id sin duplicar', () => {
    const merged = mergeVideos(
      [{ id: 'tt1:1:1', title: 'E1', season: 1, episode: 1 }],
      [{ id: 'tt1:1:1', overview: 'Resumen' }, { id: 'tt1:1:2', title: 'E2' }],
    );
    assert.equal(merged.length, 2);
    const first = merged.find((v) => v.id === 'tt1:1:1');
    assert.equal(first?.title, 'E1');
    assert.equal(first?.overview, 'Resumen');
  });
});
