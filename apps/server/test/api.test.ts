import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { AddonRegistry, HttpClient } from '@vibeflix/addon-engine';
import { createApp, type App } from '../src/app.js';
import { publicLookup } from './test-dns.js';

const MANIFESTS: Record<string, unknown> = {
  'https://meta.tld/manifest.json': {
    id: 'com.test.meta',
    name: 'Meta Addon',
    version: '1.0.0',
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    resources: ['catalog', 'meta'],
    catalogs: [
      { type: 'movie', id: 'top', name: 'Top Movies', extraSupported: ['search', 'skip'] },
    ],
  },
  'https://streams.tld/manifest.json': {
    id: 'com.test.streams',
    name: 'Stream Addon',
    version: '1.0.0',
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    resources: ['stream', 'subtitles'],
    catalogs: [],
  },
};

function createFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const manifest = MANIFESTS[url];
    if (manifest) {
      return new Response(JSON.stringify(manifest), { status: 200 });
    }
    if (url.startsWith('https://meta.tld/catalog/movie/top')) {
      return new Response(
        JSON.stringify({
          metas: [
            { id: 'tt1', name: 'Pelicula Uno', type: 'movie', genres: ['Accion'] },
            { id: 'tt2', name: 'Pelicula Dos', type: 'movie', genres: ['Accion'] },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.startsWith('https://meta.tld/meta/movie/tt1.json')) {
      return new Response(
        JSON.stringify({
          meta: {
            id: 'tt1',
            name: 'Pelicula Uno',
            description: 'Desc',
            cast: ['Actor Famoso'],
            director: ['Directora Famosa'],
            genres: ['Accion'],
          },
        }),
        { status: 200 },
      );
    }
    if (url.startsWith('https://streams.tld/stream/movie/tt1.json')) {
      return new Response(
        JSON.stringify({
          streams: [
            { name: '720p', url: 'https://cdn.tld/720.m3u8' },
            { name: '1080p', url: 'https://cdn.tld/1080.m3u8' },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.startsWith('https://streams.tld/subtitles/movie/tt1.json')) {
      return new Response(
        JSON.stringify({ subtitles: [{ url: 'https://cdn.tld/es.vtt', lang: 'es' }] }),
        { status: 200 },
      );
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('servidor Vibe Flix', () => {
  let app: App;
  let server: http.Server;
  let base: string;
  let dataDir: string;

  before(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibe-flix-'));
    const registry = new AddonRegistry({
      http: new HttpClient({ fetchImpl: createFetch(), retries: 0 }),
      fanoutTimeoutMs: 3000,
    });
    app = createApp({ dataDir, registry, publicUrl: 'http://localhost:0', dnsLookup: publicLookup });
    await app.bootstrap();
    await registry.install('https://meta.tld/manifest.json');
    await registry.install('https://streams.tld/manifest.json');

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

  it('sirve el manifest del addon Stremio local', async () => {
    const response = await fetch(`${base}/manifest.json`);
    assert.equal(response.status, 200);
    const manifest = (await response.json()) as { id: string; catalogs: unknown[] };
    assert.equal(manifest.id, 'com.vibeflix.app');
    assert.ok(manifest.catalogs.length >= 1);
  });

  it('agrega los catalogos de los addons instalados', async () => {
    const response = await fetch(`${base}/catalog/movie/top.json`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { metas: Array<{ id: string }> };
    assert.equal(body.metas[0]?.id, 'tt1');
  });

  it('devuelve la meta agregada', async () => {
    const response = await fetch(`${base}/meta/movie/tt1.json`);
    const body = (await response.json()) as { meta: { name: string } };
    assert.equal(body.meta.name, 'Pelicula Uno');
  });

  it('devuelve los streams ordenados por calidad', async () => {
    const response = await fetch(`${base}/stream/movie/tt1.json`);
    const body = (await response.json()) as { streams: Array<{
      name: string; title: string; url: string; description?: string;
      behaviorHints?: { filename?: string };
    }> };
    assert.equal(body.streams.length, 2);
    assert.equal(body.streams[0]?.url, 'https://cdn.tld/1080.m3u8'); // calidad interna intacta
    // `description` es el campo actual del protocolo (`title` esta deprecado):
    // viaja la misma etiqueta publica, sin informacion del proveedor.
    assert.ok(body.streams.every((stream) => stream.name === 'Pelicula Uno' &&
      stream.title === 'Pelicula Uno' && stream.description === 'Pelicula Uno'));
    assert.ok(body.streams.every((stream) => !stream.behaviorHints?.filename));
  });

  it('devuelve los subtitulos', async () => {
    const response = await fetch(`${base}/subtitles/movie/tt1.json`);
    const body = (await response.json()) as { subtitles: Array<{ lang: string }> };
    assert.equal(body.subtitles[0]?.lang, 'es');
  });

  it('busca en todos los catalogos que soportan search', async () => {
    const response = await fetch(`${base}/api/search?q=pelicula`);
    const body = (await response.json()) as { metas: Array<{ id: string }> };
    assert.equal(body.metas[0]?.id, 'tt1');
  });

  it('gestiona perfiles y watchlists', async () => {
    const create = await fetch(`${base}/api/profiles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Perfil Test' }),
    });
    assert.equal(create.status, 200);
    const created = (await create.json()) as { profile: { id: string; name: string } };
    assert.equal(created.profile.name, 'Perfil Test');

    const list = await fetch(`${base}/api/lists?profileId=${created.profile.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Favoritos' }),
    });
    const listBody = (await list.json()) as { list: { id: string; items: unknown[] } };
    assert.equal(listBody.list.items.length, 0);

    const withItem = await fetch(`${base}/api/lists/${listBody.list.id}/items?profileId=${created.profile.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ item: { id: 'tt1', type: 'movie', name: 'Pelicula Uno', addedAt: 0 } }),
    });
    const withItemBody = (await withItem.json()) as { list: { items: unknown[] } };
    assert.equal(withItemBody.list.items.length, 1);
  });

  it('guarda el historial y el progreso', async () => {
    const profileId = app.store.get().activeProfileId;

    await fetch(`${base}/api/history?profileId=${profileId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'tt1', type: 'movie', name: 'Pelicula Uno' }),
    });
    const history = await (await fetch(`${base}/api/history?profileId=${profileId}`)).json() as {
      history: Array<{ id: string }>;
    };
    assert.equal(history.history[0]?.id, 'tt1');

    await fetch(`${base}/api/progress?profileId=${profileId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'tt1',
        type: 'movie',
        name: 'Pelicula Uno',
        position: 120,
        duration: 3600,
        mediaType: 'movie',
      }),
    });
    const progress = await (await fetch(`${base}/api/progress?profileId=${profileId}`)).json() as {
      progress: Array<{ position: number }>;
    };
    assert.equal(progress.progress[0]?.position, 120);
  });

  it('devuelve la filmografia de una persona', async () => {
    const response = await fetch(`${base}/api/person?name=Actor%20Famoso`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { name: string; titles: Array<{ id: string }> };
    assert.equal(body.name, 'Actor Famoso');
    assert.equal(body.titles[0]?.id, 'tt1');
  });

  it('devuelve titulos similares', async () => {
    const response = await fetch(`${base}/api/similar?id=tt1&type=movie`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { titles: Array<{ id: string }> };
    assert.ok(Array.isArray(body.titles));
  });

  it('exige el PIN para activar un perfil protegido', async () => {
    const created = await fetch(`${base}/api/profiles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Protegido', pin: '1234' }),
    });
    const { profile } = (await created.json()) as { profile: { id: string; pin?: string } };
    assert.equal(profile.pin, '••••');
    const listed = (await (await fetch(`${base}/api/profiles`)).json()) as {
      profiles: Array<{ id: string; pin?: string }>;
    };
    assert.equal(listed.profiles.find((item) => item.id === profile.id)?.pin, '••••');
    const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'vibe-flix.json'), 'utf8')) as {
      profiles: Array<{ id: string; pin?: string }>;
    };
    const stored = saved.profiles.find((item) => item.id === profile.id)?.pin ?? '';
    assert.ok(stored.startsWith('scrypt$') && !stored.includes('1234'));
    const edited = await fetch(`${base}/api/profiles/${profile.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Actualizado', pin: profile.pin, currentPin: '1234' }),
    });
    assert.equal((await edited.json() as { profile: { pin: string } }).profile.pin, '••••');

    const sinPin = await fetch(`${base}/api/profiles/${profile.id}/activate`, { method: 'POST' });
    assert.equal(sinPin.status, 401);

    const pinMalo = await fetch(`${base}/api/profiles/${profile.id}/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '0000' }),
    });
    assert.equal(pinMalo.status, 403);

    const pinOk = await fetch(`${base}/api/profiles/${profile.id}/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '1234' }),
    });
    assert.equal(pinOk.status, 200);
  });

  it('puede desactivar la metadata integrada', async () => {
    // El addon nativo de scrapers tambien es un addon del registro: se
    // desactiva para comprobar solo el efecto de la metadata integrada.
    await fetch(`${base}/api/scrapers`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false, providers: [], configs: [] }),
    });

    const update = await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ builtInMetadata: false }),
    });
    assert.equal(update.status, 200);

    const health = (await (await fetch(`${base}/api/health`)).json()) as { addons: number };
    assert.equal(health.addons, 2);

    // Se vuelve a activar para no arrastrar el cambio a otros tests.
    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ builtInMetadata: true }),
    });
    await fetch(`${base}/api/scrapers`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true, providers: [], configs: [] }),
    });
  });

  it('guarda las valoraciones del perfil', async () => {
    const response = await fetch(`${base}/api/ratings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'tt1',
        type: 'movie',
        name: 'Pelicula Uno',
        rating: 'like',
        genres: ['Accion'],
      }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ratings: Array<{ id: string; rating: string }> };
    assert.equal(body.ratings[0]?.id, 'tt1');
    assert.equal(body.ratings[0]?.rating, 'like');

    const listed = (await (await fetch(`${base}/api/ratings`)).json()) as {
      ratings: Array<{ id: string }>;
    };
    assert.equal(listed.ratings.length, 1);
  });

  it('recomienda titulos segun las valoraciones', async () => {
    const response = await fetch(`${base}/api/recommended`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { titles: Array<{ id: string }> };
    // tt1 esta valued, asi que no se recomienda; tt2 comparte genero.
    assert.deepEqual(
      body.titles.map((title) => title.id),
      ['tt2'],
    );
  });

  it('quita la valoracion cuando se envia vacia', async () => {
    await fetch(`${base}/api/ratings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'tt1', type: 'movie', name: 'Pelicula Uno', rating: 'like' }),
    });
    const response = await fetch(`${base}/api/ratings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'tt1', type: 'movie', name: 'Pelicula Uno', rating: '' }),
    });
    const body = (await response.json()) as { ratings: unknown[] };
    assert.equal(body.ratings.length, 0);
  });

  it('vincula dispositivos con un codigo y protege la biblioteca', async () => {
    // 1) El primer dispositivo pide un codigo de vinculacion.
    const pairing = await fetch(`${base}/api/pairing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'TV del salon' }),
    });
    assert.equal(pairing.status, 200);
    const created = (await pairing.json()) as { code: string; token: string };
    assert.match(created.code, /^[A-Z0-9]{6}$/);
    assert.ok(created.token.length > 10);

    // 2) A partir de ahi la biblioteca exige token.
    const sinToken = await fetch(`${base}/api/lists`);
    assert.equal(sinToken.status, 401);

    const conToken = await fetch(`${base}/api/lists`, {
      headers: { 'x-vibe-flix-token': created.token },
    });
    assert.equal(conToken.status, 200);

    // 3) Otro dispositivo canjea el codigo.
    const claim = await fetch(`${base}/api/pairing/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: created.code, name: 'Movil' }),
    });
    assert.equal(claim.status, 200);
    const claimed = (await claim.json()) as { token: string };
    const list = await fetch(`${base}/api/lists`, {
      headers: { 'x-vibe-flix-token': claimed.token },
    });
    assert.equal(list.status, 200);

    const devices = (await (await fetch(`${base}/api/devices`)).json()) as {
      devices: Array<{ name: string }>;
    };
    assert.equal(devices.devices.length, 2);

    // 4) Un codigo caducado o inexistente no sirve.
    const invalido = await fetch(`${base}/api/pairing/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'ZZZZZZ', name: 'Invitado' }),
    });
    assert.equal(invalido.status, 404);

    // 5) Se desvinculan para no arrastrar el estado a otros tests.
    const listed = (await (await fetch(`${base}/api/devices`)).json()) as {
      devices: Array<{ id: string; name: string }>;
    };
    const movil = listed.devices.find((entry) => entry.name === 'Movil');
    const tv = listed.devices.find((entry) => entry.name === 'TV del salon');
    if (movil) {
      await fetch(`${base}/api/devices/${movil.id}`, {
        method: 'DELETE',
        headers: { 'x-vibe-flix-token': claimed.token },
      });
    }
    if (tv) {
      await fetch(`${base}/api/devices/${tv.id}`, {
        method: 'DELETE',
        headers: { 'x-vibe-flix-token': created.token },
      });
    }
    const abierto = await fetch(`${base}/api/lists`);
    assert.equal(abierto.status, 200);
  });

  it('expone el estado de salud', async () => {
    const response = await fetch(`${base}/api/health`);
    const body = (await response.json()) as { ok: boolean; addons: number };
    assert.equal(body.ok, true);
    // 2 addons instalados + el de metadata integrada + el nativo de scrapers.
    assert.equal(body.addons, 4);
  });

  it('configura el proveedor de debrid desde los ajustes', async () => {
    const update = await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ debrid: { provider: 'realdebrid', apiKey: 'TEST-KEY' } }),
    });
    assert.equal(update.status, 200);
    const settings = (await update.json()) as { settings: { debrid: { provider: string } } };
    assert.equal(settings.settings.debrid.provider, 'realdebrid');

    const status = (await (await fetch(`${base}/api/debrid`)).json()) as {
      debrid: { enabled: boolean; provider: string | null; tag: string | null };
    };
    assert.equal(status.debrid.enabled, true);
    assert.equal(status.debrid.provider, 'realdebrid');
    assert.equal(status.debrid.tag, 'RD');

    // Se desactiva para no arrastrar el cambio a otros tests.
    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ debrid: { provider: '', apiKey: '' } }),
    });
    const off = (await (await fetch(`${base}/api/debrid`)).json()) as {
      debrid: { enabled: boolean };
    };
    assert.equal(off.debrid.enabled, false);
  });

  it('informa al verificar las credenciales de debrid', async () => {
    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ debrid: { provider: 'realdebrid', apiKey: 'TEST-KEY' } }),
    });
    const response = await fetch(`${base}/api/debrid/test`, { method: 'POST' });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; message: string };
    assert.equal(typeof body.ok, 'boolean');
    assert.ok(body.message.length > 0);

    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ debrid: { provider: '', apiKey: '' } }),
    });
  });
});
