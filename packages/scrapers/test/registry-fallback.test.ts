import assert from 'node:assert/strict';
import test from 'node:test';
import { ScraperRegistry } from '../src/providers/registry.js';
import type { ScrapeContext, ScrapeProvider, ScrapeRequest } from '../src/types.js';

const context: ScrapeContext = {
  userAgent: 'test',
  fetchText: async () => '',
  fetchJson: async <T>() => ({} as T),
};

function provider(id: string, languages: string[] | undefined, url: string): ScrapeProvider {
  return {
    id,
    name: id,
    types: ['movie'],
    languages,
    async fetchSources(_request: ScrapeRequest) {
      return [{ url, provider: id, quality: '1080p' }];
    },
  };
}

test('retains lower-priority sources as playback fallbacks', async () => {
  const registry = new ScraperRegistry();
  registry.register(provider('spanish', ['es'], 'https://preferred.example/movie.m3u8'));
  registry.register(provider('generic', undefined, 'https://fallback.example/movie.m3u8'));

  const sources = await registry.resolve(
    { type: 'movie', id: 'tt1234567', title: 'Example', language: 'es' },
    context,
  );

  assert.deepEqual(
    sources.map((source) => source.url),
    [
      'https://preferred.example/movie.m3u8',
      'https://fallback.example/movie.m3u8',
    ],
  );
});

test('does not lose fallbacks when the preferred provider returns no sources', async () => {
  const registry = new ScraperRegistry();
  registry.register({
    ...provider('spanish', ['es'], 'https://unused.example/movie.m3u8'),
    async fetchSources() { return []; },
  });
  registry.register(provider('generic', undefined, 'https://fallback.example/movie.m3u8'));

  const sources = await registry.resolve(
    { type: 'movie', id: 'tt1234567', title: 'Example', language: 'es' },
    context,
  );

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.url, 'https://fallback.example/movie.m3u8');
});
