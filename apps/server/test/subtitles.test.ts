import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { AddonRegistry, HttpClient } from '@vibeflix/addon-engine';

import { createApp, type App } from '../src/app.js';
import { OpenSubtitlesService, type OpenSubtitleEntry } from '../src/services/opensubtitles.js';

const VTT = `WEBVTT

00:00:04.000 --> 00:00:06.000
VIBE FLIX

00:00:52.000 --> 00:00:55.000
Donde estabas?

00:01:10.000 --> 00:01:13.000
Vamos a ello.
`;

const SRT = `1
00:00:05,000 --> 00:00:07,000
EPISODE 1

2
00:01:20,000 --> 00:01:23,000
Hola a todos.
`;

/** Subtitulos que devuelve OpenSubtitles en los tests. */
const OS_ENTRIES: OpenSubtitleEntry[] = [
  {
    fileId: 4242,
    fileName: 'vibe-flix.es.srt',
    language: 'es',
    languageName: 'Espanol',
    downloadCount: 120,
    hearingImpaired: false,
    title: 'Vibe Flix',
    release: '1080p',
  },
];

describe('subtitulos nativos y omitir intro', () => {
  let app: App;
  let server: http.Server;
  let base: string;
  let dataDir: string;
  /** URLs pedidas a OpenSubtitles (para comprobar la query). */
  const osRequests: string[] = [];

  const addonFetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === 'https://meta.tld/manifest.json') {
      return new Response(
        JSON.stringify({
          id: 'com.test.meta',
          name: 'Meta Addon',
          version: '1.0.0',
          types: ['movie', 'series'],
          idPrefixes: ['tt'],
          resources: ['catalog', 'meta', 'subtitles'],
          catalogs: [{ type: 'movie', id: 'top', name: 'Top Movies' }],
        }),
        { status: 200 },
      );
    }
    if (url.startsWith('https://meta.tld/subtitles/movie/tt1.json')) {
      return new Response(
        JSON.stringify({ subtitles: [{ url: 'https://cdn.tld/es.vtt', lang: 'es' }] }),
        { status: 200 },
      );
    }
    if (url === 'https://meta.tld/subtitles/series/tt1%3A2%3A3.json') {
      return new Response(
        JSON.stringify({ subtitles: [{ url: 'https://cdn.tld/es.vtt', lang: 'es' }] }),
        { status: 200 },
      );
    }
    if (url === 'https://cdn.tld/es.vtt') {
      return new Response(VTT, { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;

  before(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibe-flix-subs-'));
    const registry = new AddonRegistry({
      http: new HttpClient({ fetchImpl: addonFetch, retries: 0 }),
      fanoutTimeoutMs: 3000,
    });
    app = createApp({
      dataDir,
      registry,
      publicUrl: 'http://localhost:0',
      fetchImpl: addonFetch,
      createOpenSubtitles: (apiKey: string) =>
        new OpenSubtitlesService({
          apiKey,
          baseUrl: 'https://os.test/api/v1',
          fetchImpl: (async (input: string | URL | Request) => {
            const url =
              typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            if (url.startsWith('https://os.test/api/v1/subtitles')) {
              osRequests.push(url);
              return new Response(
                JSON.stringify({
                  data: [
                    {
                      id: '1',
                      type: 'subtitle',
                      attributes: {
                        movie_name: 'Vibe Flix',
                        download_count: 120,
                        hearing_impaired: false,
                        language: { code: 'es', name: 'Espanol' },
                        files: [{ id: 4242, file_name: 'vibe-flix.es.srt' }],
                      },
                    },
                  ],
                }),
                { status: 200 },
              );
            }
            if (url.startsWith('https://os.test/api/v1/download/4242')) {
              return new Response(SRT, { status: 200 });
            }
            return new Response('not found', { status: 404 });
          }) as unknown as typeof fetch,
        }),
    });
    await app.bootstrap();
    await registry.install('https://meta.tld/manifest.json');

    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      void app.handle({ req, res, url, params: {}, query: url.searchParams, body: undefined });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    base = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('OpenSubtitles queda desactivado sin API key', async () => {
    const response = await fetch(`${base}/api/opensubtitles?imdbId=tt1`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { enabled: boolean; subtitles: unknown[] };
    assert.equal(body.enabled, false);
    assert.deepEqual(body.subtitles, []);
  });

  it('busca subtitulos en OpenSubtitles con la API key configurada', async () => {
    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ opensubtitles: { apiKey: 'TEST-KEY' } }),
    });

    const response = await fetch(`${base}/api/opensubtitles?imdbId=tt1`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      enabled: boolean;
      subtitles: Array<{ fileId: number; language: string }>;
    };
    assert.equal(body.enabled, true);
    assert.equal(body.subtitles.length, 1);
    assert.equal(body.subtitles[0]?.fileId, 4242);
    assert.equal(body.subtitles[0]?.language, 'es');
  });

  it('consulta OpenSubtitles con el id numerico de IMDb', async () => {
    osRequests.length = 0;
    await fetch(`${base}/api/opensubtitles?imdbId=tt1234567&season=2&episode=5`);
    assert.equal(osRequests.length, 1);
    const url = new URL(osRequests[0]!);
    assert.equal(url.searchParams.get('imdb_id'), '1234567');
    assert.equal(url.searchParams.get('season_number'), '2');
    assert.equal(url.searchParams.get('episode_number'), '5');
  });

  it('fusiona los ajustes anidados (no los sustituye)', async () => {
    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skipIntro: { enabled: false } }),
    });
    const response = await fetch(`${base}/api/settings`);
    const body = (await response.json()) as {
      settings: {
        skipIntro: { enabled: boolean; offsetSeconds: number };
        opensubtitles: { apiKey: string };
      };
    };
    // `enabled` cambia, pero `offsetSeconds` conserva su valor.
    assert.equal(body.settings.skipIntro.enabled, false);
    assert.equal(body.settings.skipIntro.offsetSeconds, 90);
    // La API key de OpenSubtitles sigue ahí.
    assert.equal(body.settings.opensubtitles.apiKey, 'TEST-KEY');

    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skipIntro: { enabled: true } }),
    });
  });

  it('descarga un subtitulo y lo sirve como WebVTT', async () => {
    const response = await fetch(`${base}/api/opensubtitles/download?fileId=4242`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { path: string; cues: number };
    assert.equal(body.path, '/api/opensubtitles/file/os-4242.vtt');
    assert.ok(body.cues > 0);

    const file = await fetch(`${base}${body.path}`);
    assert.equal(file.status, 200);
    const vtt = await file.text();
    assert.match(vtt, /^WEBVTT/);
    assert.match(vtt, /00:01:20.000 --> 00:01:23.000/);
  });

  it('detecta la intro a partir de los subtitulos del addon', async () => {
    const response = await fetch(`${base}/api/skip-intro?type=movie&id=tt1`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      segment: { endMs: number; kind: string; source: string };
      source: string;
    };
    // El primer dialogo real empieza en 52 s: la intro acaba 1,5 s antes.
    assert.equal(body.segment.endMs, 50_500);
    assert.equal(body.segment.kind, 'intro');
    assert.equal(body.source, 'subtitles');
  });

  it('pide los subtitulos del episodio con el id completo', async () => {
    const response = await fetch(`${base}/api/skip-intro?type=series&id=tt1&season=2&episode=3`);
    const body = (await response.json()) as { source: string; cues: number };
    assert.equal(body.cues, 3);
    assert.equal(body.source, 'subtitles');
  });

  it('marca la funcion como desactivada si el usuario la apaga', async () => {
    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skipIntro: { enabled: false } }),
    });
    const response = await fetch(`${base}/api/skip-intro?type=movie&id=tt1`);
    const body = (await response.json()) as { enabled: boolean };
    assert.equal(body.enabled, false);

    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skipIntro: { enabled: true } }),
    });
    const again = await fetch(`${base}/api/skip-intro?type=movie&id=tt1`);
    const restored = (await again.json()) as { enabled: boolean };
    assert.equal(restored.enabled, true);
  });

  it('usa el offset por defecto cuando no hay subtitulos', async () => {
    const response = await fetch(`${base}/api/skip-intro?type=movie&id=tt-desconocido`);
    const body = (await response.json()) as {
      segment: { endMs: number; source: string };
    };
    assert.equal(body.segment.source, 'fallback');
    assert.equal(body.segment.endMs, 90_000);
  });

  it('respeta el offset configurado en los ajustes', async () => {
    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skipIntro: { enabled: true, offsetSeconds: 45 } }),
    });
    const response = await fetch(`${base}/api/skip-intro?type=movie&id=tt-desconocido`);
    const body = (await response.json()) as { segment: { endMs: number } };
    assert.equal(body.segment.endMs, 45_000);

    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skipIntro: { enabled: true, offsetSeconds: 90 } }),
    });
  });
});
