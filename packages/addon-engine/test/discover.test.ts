import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AddonRegistry } from '../src/registry.js';
import { HttpClient } from '../src/http.js';
import { BUILTIN_METADATA_ID, BuiltinMetadataAddon } from '../src/builtin.js';
import {
  findPersonFilmography,
  findSimilarTitles,
  personAppearsIn,
  searchTermForTitle,
} from '../src/discover.js';

function fakeFetch(routes: Record<string, unknown>) {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body = routes[url];
    if (body === undefined) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

const META_ROUTES = {
  'https://meta.tld/catalog/movie/top/search=Harrison%20Ford.json': {
    metas: [
      { id: 'tt1', name: 'Indiana Jones', type: 'movie', cast: ['Harrison Ford'], genres: ['Action'] },
      { id: 'tt2', name: 'Blade Runner', type: 'movie', cast: ['Harrison Ford', 'Rutger Hauer'], genres: ['Sci-Fi'] },
      { id: 'tt3', name: 'Otra', type: 'movie', cast: ['Otro actor'], genres: ['Drama'] },
    ],
  },
  'https://meta.tld/catalog/movie/top/search=Star%20Wars.json': {
    metas: [
      { id: 'tt1', name: 'Indiana Jones', type: 'movie', cast: ['Harrison Ford'], genres: ['Action'] },
      { id: 'tt4', name: 'Star Wars', type: 'movie', genres: ['Action', 'Sci-Fi'] },
      { id: 'tt5', name: 'Rogue One', type: 'movie', genres: ['Action', 'Sci-Fi'] },
    ],
  },
};

describe('metadata integrada (builtin)', () => {
  it('sintetiza un manifest con catalogos de peliculas y series', () => {
    const addon = new BuiltinMetadataAddon({
      baseUrl: 'https://v3-cinemeta.strem.io',
      http: new HttpClient({ fetchImpl: fakeFetch({}) }),
    });
    assert.equal(addon.id, BUILTIN_METADATA_ID);
    assert.equal(addon.builtin, true);
    assert.equal(addon.manifest.catalogs?.length, 2);
    assert.equal(addon.manifest.catalogs?.[0]?.id, 'top');
  });

  it('el registro puede activarlo y desactivarlo', () => {
    const registry = new AddonRegistry({ http: new HttpClient({ fetchImpl: fakeFetch({}) }) });
    assert.equal(registry.hasBuiltinMetadata, false);
    registry.enableBuiltinMetadata();
    assert.equal(registry.hasBuiltinMetadata, true);
    assert.equal(registry.catalogs().length, 2);
    registry.disableBuiltinMetadata();
    assert.equal(registry.hasBuiltinMetadata, false);
    assert.equal(registry.catalogs().length, 0);
  });

  it('no aparece como addon instalable en la lista (es integrado)', () => {
    const registry = new AddonRegistry({ http: new HttpClient({ fetchImpl: fakeFetch({}) }) });
    registry.enableBuiltinMetadata();
    const builtin = registry.list().find((entry) => entry.id === BUILTIN_METADATA_ID);
    assert.equal(builtin?.builtin, true);
  });
});

describe('busqueda global', () => {
  it('consulta los catalogos con soporte de search y fusiona resultados', async () => {
    const fetchImpl = fakeFetch({
      'https://meta.tld/manifest.json': {
        id: 'com.test.meta',
        name: 'Meta',
        version: '1',
        types: ['movie'],
        resources: ['catalog'],
        catalogs: [
          { type: 'movie', id: 'top', name: 'Top', extraSupported: ['search'] },
          { type: 'movie', id: 'sin-busqueda', name: 'Sin busqueda' },
        ],
      },
      ...META_ROUTES,
    });
    const registry = new AddonRegistry({ http: new HttpClient({ fetchImpl }) });
    await registry.install('https://meta.tld/manifest.json');

    const result = await registry.search('Harrison Ford');
    assert.equal(result.value.metas.length, 3);
    assert.deepEqual(result.errors, []);
  });
});

describe('ficha de persona', () => {
  it('detecta si una persona aparece en el reparto', () => {
    const meta = { id: 'tt1', cast: ['Harrison Ford', 'Karen Allen'] } as never;
    assert.equal(personAppearsIn(meta, 'Harrison Ford'), true);
    assert.equal(personAppearsIn(meta, 'harrison ford'), true);
    assert.equal(personAppearsIn(meta, 'Harrison  Ford'), true);
    assert.equal(personAppearsIn(meta, 'Actor Ausente'), false);
  });

  it('devuelve la filmografia filtrando por aparicion', async () => {
    const fetchImpl = fakeFetch({
      'https://meta.tld/manifest.json': {
        id: 'com.test.meta',
        name: 'Meta',
        version: '1',
        types: ['movie'],
        resources: ['catalog'],
        catalogs: [{ type: 'movie', id: 'top', name: 'Top', extraSupported: ['search'] }],
      },
      ...META_ROUTES,
    });
    const registry = new AddonRegistry({ http: new HttpClient({ fetchImpl }) });
    await registry.install('https://meta.tld/manifest.json');

    const filmography = await findPersonFilmography(registry, 'Harrison Ford');
    assert.equal(filmography.titles.length, 2);
    assert.deepEqual(
      filmography.titles.map((title) => title.id).sort(),
      ['tt1', 'tt2'],
    );
  });
});

describe('titulos similares', () => {
  it('prioriza los que comparten generos', async () => {
    const fetchImpl = fakeFetch({
      'https://meta.tld/manifest.json': {
        id: 'com.test.meta',
        name: 'Meta',
        version: '1',
        types: ['movie'],
        resources: ['catalog'],
        catalogs: [{ type: 'movie', id: 'top', name: 'Top', extraSupported: ['search'] }],
      },
      ...META_ROUTES,
    });
    const registry = new AddonRegistry({ http: new HttpClient({ fetchImpl }) });
    await registry.install('https://meta.tld/manifest.json');

    const similar = await findSimilarTitles(registry, {
      id: 'tt4',
      name: 'Star Wars',
      type: 'movie',
      genres: ['Action', 'Sci-Fi'],
    });
    assert.equal(similar[0]?.id, 'tt5');
    assert.ok(!similar.some((title) => title.id === 'tt4'));
  });

  it('limpia el titulo para buscar', () => {
    assert.equal(searchTermForTitle('The Matrix (1999)'), 'Matrix');
    assert.equal(searchTermForTitle('El Señor de los Anillos'), 'Señor de los Anillos');
  });
});
