import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { NativeScrapersAddon, inferContentKind, parseEpisodeId } from '../src/addon.js';
import { normalizeLanguage, languagePriority } from '../src/language.js';
import { ScraperRegistry } from '../src/providers/registry.js';
import type { ScrapeContext, ScrapeProvider } from '../src/types.js';

function context(): ScrapeContext {
  return {
    userAgent: 'test-agent',
    fetchText: async () => '',
    fetchJson: async () => ({}) as never,
  };
}

function provider(id: string, sources: string[], delayMs = 0): ScrapeProvider {
  return {
    id,
    name: id,
    types: ['movie'],
    async fetchSources() {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return sources.map((url) => ({ url, provider: id }));
    },
  };
}

describe('registro de scrapers', () => {
  it('consulta los proveedores en paralelo y une los resultados', async () => {
    const registry = new ScraperRegistry();
    registry.register(provider('a', ['https://a/1.mp4']));
    registry.register(provider('b', ['https://b/1.mp4'], 20));

    const sources = await registry.resolve({ type: 'movie', id: 'tt1' }, context());
    assert.equal(sources.length, 2);
  });

  it('aísla el fallo de un proveedor', async () => {
    const registry = new ScraperRegistry();
    registry.register({
      id: 'roto',
      name: 'roto',
      types: ['movie'],
      async fetchSources() {
        throw new Error('caido');
      },
    });
    registry.register(provider('bueno', ['https://a/1.mp4']));

    const sources = await registry.resolve({ type: 'movie', id: 'tt1' }, context());
    assert.equal(sources.length, 1);
  });

  it('respeta el timeout por proveedor', async () => {
    const registry = new ScraperRegistry({ timeoutMs: 30 });
    registry.register(provider('lento', ['https://a/1.mp4'], 200));

    const result = await registry.runProvider(
      registry.get('lento')!,
      { type: 'movie', id: 'tt1' },
      context(),
    );
    assert.equal(result.sources.length, 0);
    assert.match(result.error ?? '', /timeout/);
  });

  it('filtra por tipo de contenido', async () => {
    const registry = new ScraperRegistry();
    registry.register({
      id: 'series',
      name: 'series',
      types: ['series'],
      async fetchSources() {
        return [{ url: 'https://a/s.mp4', provider: 'series' }];
      },
    });
    const sources = await registry.resolve({ type: 'movie', id: 'tt1' }, context());
    assert.equal(sources.length, 0);
  });

  it('filtra por idioma cuando el proveedor lo declara', async () => {
    const registry = new ScraperRegistry();
    registry.register({
      id: 'es',
      name: 'es',
      types: ['movie'],
      languages: ['es'],
      async fetchSources() {
        return [{ url: 'https://a/es.mp4', provider: 'es' }];
      },
    });
    const english = await registry.resolve(
      { type: 'movie', id: 'tt1', language: 'en' },
      context(),
    );
    const spanish = await registry.resolve(
      { type: 'movie', id: 'tt1', language: 'es' },
      context(),
    );
    assert.equal(english.length, 0);
    assert.equal(spanish.length, 1);
  });

  it('prioriza la variante exacta y cae al idioma genérico si falla', async () => {
    const registry = new ScraperRegistry();
    for (const [id, languages] of [
      ['latino', ['es-419']], ['castellano', ['es-ES']], ['espanol', ['es']], ['ingles', ['en']],
    ] as const) {
      registry.register({
        id, name: id, types: ['movie'], languages: [...languages],
        async fetchSources() {
          return id === 'latino' && unavailable ? [] : [{ url: `https://site.test/${id}.mp4`, provider: id }];
        },
      });
    }
    let unavailable = false;
    const request = { type: 'movie', id: 'tt1', language: 'es-419' };
    // La variante exacta va primero; las alternativas del mismo idioma se
    // conservan como fallback real (una fuente puede morir al abrirse) y los
    // otros idiomas no aparecen. La prioridad ordena, no oculta.
    const exact = await registry.resolve(request, context());
    assert.deepEqual(exact.map((source) => source.provider), ['latino', 'espanol', 'castellano']);
    unavailable = true;
    // Sin la variante exacta, el idioma genérico pasa a liderar la lista.
    const fallback = await registry.resolve(request, context());
    assert.deepEqual(fallback.map((source) => source.provider), ['espanol', 'castellano']);
    assert.equal(languagePriority(registry.get('castellano')!, 'es-419'), 2);
    assert.equal(normalizeLanguage('ES_es'), 'es-ES');
    assert.equal(normalizeLanguage('https://malicioso'), undefined);
  });

  it('prefiere anime/dorama a series genéricas y permite fallback', async () => {
    const registry = new ScraperRegistry();
    let animeAvailable = true;
    for (const kind of ['anime', 'dorama', 'series'] as const) {
      registry.register({
        id: kind, name: kind, types: [kind], languages: ['es'],
        async fetchSources() {
          return kind === 'anime' && !animeAvailable ? [] :
            [{ url: `https://site.test/${kind}.mp4`, provider: kind }];
        },
      });
    }
    const base = { type: 'series', id: 'tt2:1:3', season: 1, episode: 3, language: 'es' };
    assert.equal((await registry.resolve({ ...base, kind: 'anime' }, context()))[0]?.provider, 'anime');
    animeAvailable = false;
    assert.equal((await registry.resolve({ ...base, kind: 'anime' }, context()))[0]?.provider, 'series');
    assert.equal((await registry.resolve({ ...base, kind: 'dorama' }, context()))[0]?.provider, 'dorama');
  });
});

describe('addon nativo de streams', () => {
  it('expone un manifest de addon valido', async () => {
    const addon = new NativeScrapersAddon({
      registry: new ScraperRegistry(),
      context: context(),
    });
    const manifest = await addon.getManifest();
    assert.equal(manifest.id, 'com.vibeflix.native-scrapers');
    assert.equal(manifest.name, 'Vibe Flix');
    assert.ok(manifest.resources?.includes('stream'));
    assert.deepEqual(manifest.catalogs, []);
  });

  it('resuelve el titulo antes de consultar a los proveedores', async () => {
    const registry = new ScraperRegistry();
    let received: { title?: string; year?: number } = {};
    registry.register({
      id: 'demo',
      name: 'Demo',
      types: ['movie'],
      async fetchSources(request) {
        received = { title: request.title, year: request.year };
        return [{ url: 'https://a/1.mp4', provider: 'Demo' }];
      },
    });

    const addon = new NativeScrapersAddon({
      registry,
      context: context(),
      resolveTitle: async () => ({ title: 'El viaje', year: 1999, imdbId: 'tt1' }),
    });

    const response = await addon.streams({ type: 'movie', id: 'tt1' });
    assert.equal(response.streams.length, 1);
    assert.equal(response.streams[0]!.url, 'https://a/1.mp4');
    assert.deepEqual(received, { title: 'El viaje', year: 1999 });
  });

  it('interpreta episodios y categorías usando la ficha del título', async () => {
    assert.deepEqual(parseEpisodeId('series', 'tt77:0:3'), { titleId: 'tt77', season: 0, episode: 3 });
    assert.deepEqual(parseEpisodeId('dorama', 'tmdb:999:2:10'), {
      titleId: 'tmdb:999', season: 2, episode: 10,
    });
    assert.equal(inferContentKind('series', { genres: ['Animation'], country: 'Japan' }), 'anime');
    assert.equal(inferContentKind('series', { genres: ['Drama'], country: 'South Korea' }), 'dorama');
    assert.equal(inferContentKind('series', { genres: ['Animation'], country: 'US' }), 'series');

    const registry = new ScraperRegistry();
    let received: unknown;
    registry.register({
      id: 'anime', name: 'Anime', types: ['anime'], languages: ['ja'],
      async fetchSources(request) {
        received = request;
        return [{ url: 'https://a/episode.mp4', provider: 'anime' }];
      },
    });
    const addon = new NativeScrapersAddon({
      registry, context: context(), language: 'ja',
      resolveTitle: async (type, id) => {
        assert.deepEqual([type, id], ['series', 'tt77']);
        return { title: 'Serie animada', genres: ['Anime'] };
      },
    });
    await addon.streams({ type: 'series', id: 'tt77:0:3' });
    assert.deepEqual(received, {
      type: 'series', id: 'tt77:0:3', titleId: 'tt77', kind: 'anime',
      imdbId: 'tt77', tmdbId: undefined, title: 'Serie animada', year: undefined,
      season: 0, episode: 3, language: 'ja',
    });
  });

  it('mantiene cachés separados para dos idiomas del mismo título', async () => {
    const registry = new ScraperRegistry();
    let language = 'es';
    let calls = 0;
    for (const id of ['es', 'en']) {
      registry.register({
        id, name: id, types: ['movie'], languages: [id],
        async fetchSources() {
          calls += 1;
          return [{ url: `https://a/${id}.mp4`, provider: id }];
        },
      });
    }
    const addon = new NativeScrapersAddon({ registry, context: context(), language: () => language });
    assert.equal((await addon.streams({ type: 'movie', id: 'tt1' })).streams[0]?.url, 'https://a/es.mp4');
    language = 'en';
    assert.equal((await addon.streams({ type: 'movie', id: 'tt1' })).streams[0]?.url, 'https://a/en.mp4');
    language = 'es';
    await addon.streams({ type: 'movie', id: 'tt1' });
    assert.equal(calls, 2);
  });

  it('cachea el resultado de un titulo', async () => {
    const registry = new ScraperRegistry();
    let calls = 0;
    registry.register({
      id: 'demo',
      name: 'Demo',
      types: ['movie'],
      async fetchSources() {
        calls += 1;
        return [{ url: 'https://a/1.mp4', provider: 'Demo' }];
      },
    });

    const addon = new NativeScrapersAddon({ registry, context: context() });
    await addon.streams({ type: 'movie', id: 'tt1' });
    await addon.streams({ type: 'movie', id: 'tt1' });
    assert.equal(calls, 1);
  });
});
