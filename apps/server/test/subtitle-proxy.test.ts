/**
 * Proxy de subtitulos: formatos, codificaciones, Clean SDH, desfase y cache.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { AddonRegistry, HttpClient } from '@vibeflix/addon-engine';
import { createApp, type App } from '../src/app.js';
import { publicLookup } from './test-dns.js';
import { normalizeSubtitleLanguage, transformSubtitle } from '../src/library/subtitle-proxy.js';

const SRT_UTF8 = `1
00:00:01,000 --> 00:00:04,000
Hola, ¿cómo estás?

2
00:00:05,000 --> 00:00:08,500
<i>Muy bien</i>, gracias.
`;

const SRT_SDH = `1
00:00:01,000 --> 00:00:04,000
[Música]

2
00:00:05,000 --> 00:00:07,000
JUAN: Hola, María

3
00:00:08,000 --> 00:00:10,000
- ¿Cómo estás?
- Bien, ¿y tú?
`;

const ASS = String.raw`[Script Info]
ScriptType: v4.00+
PlayResX: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize
Style: Default,Arial,48

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\an8}Arriba {\i}cursiva{\i}
Dialogue: 0,0:00:05.00,0:00:08.00,Default,,0,0,0,,Segunda línea\NDos renglones
`;

/** SRT en windows-1252 (lo tipico en ficheros viejos descargados de un foro). */
const SRT_LATIN1 = Buffer.from(
  `1
00:00:01,000 --> 00:00:04,000
El cañón de Ávila está aquí.
`,
  'latin1',
);

/** Texto UTF-8 leido como latin1 y vuelto a guardar en UTF-8 (mojibake). */
const SRT_MOJIBAKE = Buffer.from(
  Buffer.from('1\n00:00:01,000 --> 00:00:04,000\nCafé con leche, ¡qué bueno!\n', 'utf8').toString('latin1'),
  'utf8',
);

function fakeFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === 'https://subs.test/utf8.srt') return new Response(SRT_UTF8);
    if (url === 'https://subs.test/sdh.srt') return new Response(SRT_SDH);
    if (url === 'https://subs.test/dialogo.ass') return new Response(ASS);
    if (url === 'https://subs.test/latin1.srt') return new Response(new Uint8Array(SRT_LATIN1));
    if (url === 'https://subs.test/mojibake.srt') return new Response(new Uint8Array(SRT_MOJIBAKE));
    if (url === 'https://subs.test/vacio.srt') return new Response('WEBVTT\n\n');
    if (url === 'https://subs.test/fallo.srt') return new Response('nope', { status: 500 });
    if (url === 'https://demo.test/manifest.json') {
      return new Response(JSON.stringify({
        id: 'demo', name: 'Demo', version: '1', types: ['movie'], idPrefixes: ['tt'],
        resources: ['meta'], catalogs: [],
      }));
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('transformacion de subtitulos', () => {
  it('convierte SRT a WebVTT y limpia las etiquetas', () => {
    const result = transformSubtitle({ bytes: new Uint8Array(Buffer.from(SRT_UTF8)) });
    assert.equal(result.sourceFormat, 'srt');
    assert.equal(result.encoding, 'utf-8');
    assert.equal(result.cues.length, 2);
    assert.deepEqual(result.cues[1]?.lines, ['Muy bien, gracias.']);
    assert.match(result.vtt, /^WEBVTT\n\n/);
    assert.match(result.vtt, /00:00:01\.000 --> 00:00:04\.000/);
  });

  it('detecta windows-1252 y no devuelve basura con los acentos', () => {
    const result = transformSubtitle({ bytes: new Uint8Array(SRT_LATIN1), language: 'es' });
    assert.equal(result.guessedEncoding, true);
    assert.match(result.encoding, /1252|latin/i);
    assert.equal(result.cues[0]?.lines[0], 'El cañón de Ávila está aquí.');
  });

  it('repara el mojibake (UTF-8 leido como latin1)', () => {
    const result = transformSubtitle({ bytes: new Uint8Array(SRT_MOJIBAKE), language: 'es' });
    assert.equal(result.repaired, true);
    assert.equal(result.cues[0]?.lines[0], 'Café con leche, ¡qué bueno!');
  });

  it('convierte ASS/SSA a cues con sus dos renglones', () => {
    const result = transformSubtitle({ bytes: new Uint8Array(Buffer.from(ASS)) });
    assert.equal(result.sourceFormat, 'ass');
    assert.equal(result.cues.length, 2);
    assert.deepEqual(result.cues[0]?.lines, ['Arriba cursiva']);
    assert.deepEqual(result.cues[1]?.lines, ['Segunda línea', 'Dos renglones']);
    assert.equal(result.cues[0]?.startMs, 1000);
  });

  it('aplica Clean SDH y descarta las cues que se quedan vacias', () => {
    const dirty = transformSubtitle({ bytes: new Uint8Array(Buffer.from(SRT_SDH)) });
    assert.equal(dirty.sdh, true, 'detecta que el fichero es SDH');
    assert.equal(dirty.cues.length, 3);
    assert.deepEqual(dirty.cues[1]?.lines, ['JUAN: Hola, María']);

    const clean = transformSubtitle({ bytes: new Uint8Array(Buffer.from(SRT_SDH)), cleanSdh: true });
    // La cue que solo tenia musica desaparece; el hablante se quita del dialogo.
    assert.equal(clean.cues.length, 2);
    assert.deepEqual(clean.cues[0]?.lines, ['Hola, María']);
    assert.deepEqual(clean.cues[1]?.lines, ['¿Cómo estás?', 'Bien, ¿y tú?']);
  });

  it('desplaza las cues sin dejar tiempos negativos', () => {
    const back = transformSubtitle({ bytes: new Uint8Array(Buffer.from(SRT_UTF8)), offsetMs: -2000 });
    assert.equal(back.cues[0]?.startMs, 0);
    assert.equal(back.cues[1]?.startMs, 3000);

    const forward = transformSubtitle({ bytes: new Uint8Array(Buffer.from(SRT_UTF8)), offsetMs: 1500 });
    assert.equal(forward.cues[0]?.startMs, 2500);
  });

  it('normaliza el idioma declarado', () => {
    assert.equal(normalizeSubtitleLanguage('es-ES'), 'es');
    assert.equal(normalizeSubtitleLanguage('pt_BR'), 'pt');
    assert.equal(normalizeSubtitleLanguage(undefined), '');
  });
});

describe('ruta /api/subtitles/proxy', () => {
  let app: App;
  let server: http.Server;
  let base: string;
  let dataDir: string;

  before(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibeflix-subs-'));
    const registry = new AddonRegistry({
      http: new HttpClient({ fetchImpl: fakeFetch(), retries: 0 }),
      fanoutTimeoutMs: 3000,
    });
    app = createApp({
      dataDir,
      registry,
      fetchImpl: fakeFetch(),
      publicUrl: 'http://localhost:0',
      dnsLookup: publicLookup,
    });
    await app.bootstrap();
    await registry.install('https://demo.test/manifest.json');

    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      void app.handle({ req, res, url, params: {}, query: url.searchParams, body: undefined });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('devuelve WebVTT listo para un <track> nativo', async () => {
    const response = await fetch(`${base}/api/subtitles/proxy?url=${encodeURIComponent('https://subs.test/utf8.srt')}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/vtt/);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.match(response.headers.get('cache-control') ?? '', /max-age=\d+/);
    const body = await response.text();
    assert.match(body, /^WEBVTT/);
    assert.match(body, /Hola, ¿cómo estás\?/);
  });

  it('devuelve las cues en JSON para el renderizador propio', async () => {
    const url = `${base}/api/subtitles/proxy?url=${encodeURIComponent('https://subs.test/sdh.srt')}&lang=es&format=json`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    const body = (await response.json()) as Record<string, any>;
    assert.equal(body['count'], 3);
    assert.equal(body['sdh'], true);
    assert.equal(body['sourceFormat'], 'srt');
    assert.deepEqual(body['cues'][0]['lines'], ['[Música]']);
    assert.deepEqual(body['cues'][1]['lines'], ['JUAN: Hola, María']);
  });

  it('aplica Clean SDH y el desfase pedidos en la URL', async () => {
    const url = `${base}/api/subtitles/proxy?url=${encodeURIComponent('https://subs.test/sdh.srt')}&clean=1&offset=1000&format=json`;
    const body = (await (await fetch(url)).json()) as Record<string, any>;
    assert.equal(body['count'], 2, 'la cue de solo musica desaparece');
    assert.deepEqual(body['cues'][0]['lines'], ['Hola, María']);
    assert.deepEqual(body['cues'][1]['lines'], ['¿Cómo estás?', 'Bien, ¿y tú?']);
    assert.equal(body['cues'][0]['startMs'], 6000);
    assert.equal(body['offsetMs'], 1000);
  });

  it('convierte ASS y arregla la codificacion detectada', async () => {
    const ass = (await (await fetch(
      `${base}/api/subtitles/proxy?url=${encodeURIComponent('https://subs.test/dialogo.ass')}&format=json`,
    )).json()) as Record<string, any>;
    assert.equal(ass['sourceFormat'], 'ass');
    assert.deepEqual(ass['cues'][1]['lines'], ['Segunda línea', 'Dos renglones']);

    const latin = await fetch(
      `${base}/api/subtitles/proxy?url=${encodeURIComponent('https://subs.test/latin1.srt')}&lang=es`,
    );
    assert.match(latin.headers.get('x-vibeflix-encoding') ?? '', /1252|latin/i);
    assert.match(await latin.text(), /cañón de Ávila/);

    const mojibake = await fetch(
      `${base}/api/subtitles/proxy?url=${encodeURIComponent('https://subs.test/mojibake.srt')}&lang=es`,
    );
    assert.match(await mojibake.text(), /Café con leche/);
  });

  it('cachea en disco y sirve la segunda peticion sin red', async () => {
    const target = encodeURIComponent('https://subs.test/utf8.srt');
    const first = await fetch(`${base}/api/subtitles/proxy?url=${target}&format=json`);
    assert.equal(first.headers.get('x-vibeflix-cache'), 'miss');
    await first.arrayBuffer();

    const second = await fetch(`${base}/api/subtitles/proxy?url=${target}&format=json`);
    assert.equal(second.headers.get('x-vibeflix-cache'), 'hit');
    const body = (await second.json()) as { count: number };
    assert.equal(body.count, 2);

    const cached = await fs.readdir(path.join(dataDir, 'subtitles'));
    assert.ok(cached.some((name) => name.startsWith('proxy-')), 'el fichero queda en la cache');
  });

  it('responde 304 si el cliente ya tiene el subtitulo', async () => {
    const target = encodeURIComponent('https://subs.test/utf8.srt');
    const first = await fetch(`${base}/api/subtitles/proxy?url=${target}`);
    const etag = first.headers.get('etag');
    assert.ok(etag);
    await first.text();

    const second = await fetch(`${base}/api/subtitles/proxy?url=${target}`, {
      headers: { 'if-none-match': etag ?? '' },
    });
    assert.equal(second.status, 304);
  });

  it('informa de los errores sin romper el reproductor', async () => {
    const missing = await fetch(`${base}/api/subtitles/proxy`);
    assert.equal(missing.status, 400);

    const upstream = await fetch(
      `${base}/api/subtitles/proxy?url=${encodeURIComponent('https://subs.test/fallo.srt')}`,
    );
    assert.equal(upstream.status, 502);
    assert.match(((await upstream.json()) as { error: string })['error'], /500/);

    const empty = await fetch(
      `${base}/api/subtitles/proxy?url=${encodeURIComponent('https://subs.test/vacio.srt')}`,
    );
    assert.equal(empty.status, 422);
  });

  it('no descarga de hosts privados (guardia SSRF)', async () => {
    const response = await fetch(
      `${base}/api/subtitles/proxy?url=${encodeURIComponent('http://10.0.0.5/sub.srt')}`,
    );
    assert.equal(response.status, 502);
  });
});
