import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { NativeScrapersAddon } from '../src/addon.js';
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
});

describe('addon nativo de streams', () => {
  it('expone un manifest de addon valido', async () => {
    const addon = new NativeScrapersAddon({
      registry: new ScraperRegistry(),
      context: context(),
    });
    const manifest = await addon.getManifest();
    assert.equal(manifest.id, 'com.vibeflix.native-scrapers');
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
