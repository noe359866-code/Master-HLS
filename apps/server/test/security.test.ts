import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import type { HostLookup } from '@vibeflix/scrapers';

import { createApp, type App } from '../src/app.js';
import { SECRET_PLACEHOLDER } from '../src/http/security.js';
import { publicLookup } from './test-dns.js';

const DEMO_CONFIG = {
  id: 'demo-security',
  name: 'Demo',
  types: ['movie'],
  searchUrl: 'https://site.example/search?q={title}&y={year}',
  itemUrl: 'https://site.example/movie/{id}',
  itemPattern: 'href="\\/movie\\/(\\w+)"',
  streamPatterns: ['src="(https?:\\/\\/[^"]+\\.mp4)"'],
};

const PLAYLIST = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
720/index.m3u8
`;

function fakeFetch(calls: string[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url.startsWith('https://site.example/search')) {
      return new Response('<a href="/movie/abc123">Pelicula</a>', { status: 200 });
    }
    if (url.startsWith('https://site.example/movie/abc123')) {
      return new Response('<video src="https://cdn.example/pelicula-1080p.mp4"></video>', { status: 200 });
    }
    if (url.startsWith('https://cdn.example/stream.m3u8')) {
      return new Response(PLAYLIST, {
        status: 200,
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

async function send(
  base: string,
  pathname: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any; text: string }> {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, json, text };
}

interface TestServer {
  app: App;
  dataDir: string;
  base: string;
  calls: string[];
  close: () => Promise<void>;
}

async function startServer(options: {
  adminToken?: string;
  privateDns?: () => boolean;
} = {}): Promise<TestServer> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibe-flix-security-'));
  const calls: string[] = [];
  const fetchImpl = fakeFetch(calls);
  const dynamicLookup: HostLookup = async (hostname) =>
    options.privateDns?.()
      ? [{ address: '10.0.0.7', family: 4 }]
      : publicLookup(hostname);
  const app = createApp({
    dataDir,
    fetchImpl,
    publicUrl: 'http://localhost:0',
    dnsLookup: dynamicLookup,
    ...(options.adminToken ? { adminToken: options.adminToken } : {}),
  });
  await app.bootstrap();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void app.handle({ req, res, url, params: {}, query: url.searchParams, body: undefined });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  return {
    app,
    dataDir,
    base,
    calls,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await fs.rm(dataDir, { recursive: true, force: true });
    },
  };
}

describe('seguridad: PIN del perfil', () => {
  let server: TestServer;

  before(async () => {
    server = await startServer();
  });

  after(async () => {
    await server.close();
  });

  it('no permite quitar ni cambiar el PIN sin conocer el actual', async () => {
    const created = await send(server.base, '/api/profiles', 'POST', {
      name: 'Protegido', pin: '1234',
    });
    assert.equal(created.status, 200);
    const id = created.json.profile.id as string;
    assert.equal(created.json.profile.pin, SECRET_PLACEHOLDER);

    // El fallo original: PUT con pin:null sin autenticación devolvía 200.
    const remove = await send(server.base, `/api/profiles/${id}`, 'PUT', { pin: null });
    assert.equal(remove.status, 401);
    assert.equal(remove.json.requiresPin, true);

    const change = await send(server.base, `/api/profiles/${id}`, 'PUT', { pin: '5678' });
    assert.equal(change.status, 401);
    assert.equal(change.json.requiresPin, true);

    const wrong = await send(server.base, `/api/profiles/${id}`, 'PUT', {
      pin: null, currentPin: '0000',
    });
    assert.equal(wrong.status, 403);

    // Editar un perfil protegido que no está activo también exige el PIN.
    const rename = await send(server.base, `/api/profiles/${id}`, 'PUT', { name: 'Robado' });
    assert.equal(rename.status, 401);

    const renamed = await send(server.base, `/api/profiles/${id}`, 'PUT', {
      name: 'Renombrado', currentPin: '1234',
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.json.profile.name, 'Renombrado');

    const stored = JSON.parse(
      await fs.readFile(path.join(server.dataDir, 'vibe-flix.json'), 'utf8'),
    ) as { profiles: Array<Record<string, unknown>> };
    const record = stored.profiles.find((profile) => profile.id === id)!;
    assert.ok(typeof record['pin'] === 'string' && (record['pin'] as string).startsWith('scrypt$'));
    assert.equal(record['currentPin'], undefined);

    const removed = await send(server.base, `/api/profiles/${id}`, 'PUT', {
      pin: null, currentPin: '1234',
    });
    assert.equal(removed.status, 200);
    assert.equal(removed.json.profile.pin, undefined);

    // Se vuelve a proteger y se comprueba el flujo de activación y borrado.
    const protectedAgain = await send(server.base, `/api/profiles/${id}`, 'PUT', { pin: '4321' });
    assert.equal(protectedAgain.status, 200);
    assert.equal(protectedAgain.json.profile.pin, SECRET_PLACEHOLDER);

    const noPin = await send(server.base, `/api/profiles/${id}/activate`, 'POST', {});
    assert.equal(noPin.status, 401);
    const badPin = await send(server.base, `/api/profiles/${id}/activate`, 'POST', { pin: '0000' });
    assert.equal(badPin.status, 403);
    const goodPin = await send(server.base, `/api/profiles/${id}/activate`, 'POST', { pin: '4321' });
    assert.equal(goodPin.status, 200);

    // Aunque el perfil esté activo, quitar el PIN sigue exigiendo el actual.
    const activeRemove = await send(server.base, `/api/profiles/${id}`, 'PUT', { pin: '' });
    assert.equal(activeRemove.status, 401);
    const activeRemoveOk = await send(server.base, `/api/profiles/${id}`, 'PUT', {
      pin: '', currentPin: '4321',
    });
    assert.equal(activeRemoveOk.status, 200);
    assert.equal(activeRemoveOk.json.profile.pin, undefined);

    // Proteger de nuevo y borrar: el PIN es obligatorio.
    await send(server.base, `/api/profiles/${id}`, 'PUT', { pin: '9999' });
    const deleteNoPin = await send(server.base, `/api/profiles/${id}`, 'DELETE');
    assert.equal(deleteNoPin.status, 401);
    const deleteWrong = await send(server.base, `/api/profiles/${id}`, 'DELETE', { pin: '1111' });
    assert.equal(deleteWrong.status, 403);
    const deleteOk = await send(server.base, `/api/profiles/${id}`, 'DELETE', undefined, {
      'x-vibe-flix-pin': '9999',
    });
    assert.equal(deleteOk.status, 200);
  });

  it('limita los intentos de PIN por perfil', async () => {
    const created = await send(server.base, '/api/profiles', 'POST', {
      name: 'Con límite', pin: '1111',
    });
    const id = created.json.profile.id as string;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await send(server.base, `/api/profiles/${id}/activate`, 'POST', {
        pin: '0000',
      });
      assert.equal(response.status, 403, `intento ${attempt + 1}`);
    }
    const blocked = await send(server.base, `/api/profiles/${id}/activate`, 'POST', {
      pin: '1111',
    });
    assert.equal(blocked.status, 429);
    assert.ok(blocked.json.retryAfterSeconds > 0);
  });
});

describe('seguridad: SSRF y cobertura de scrapers', () => {
  let server: TestServer;
  let privateDns = false;

  before(async () => {
    server = await startServer({ privateDns: () => privateDns });
  });

  after(async () => {
    await server.close();
  });

  it('rechaza configuraciones que apuntan a la red interna antes de descargar', async () => {
    server.calls.length = 0;
    const response = await send(server.base, '/api/scrapers/test', 'POST', {
      config: { ...DEMO_CONFIG, searchUrl: 'http://127.0.0.1:8181/search?q={title}' },
      title: 'Pelicula',
    });
    assert.equal(response.status, 400);
    assert.equal(server.calls.length, 0);

    const metadata = await send(server.base, '/api/scrapers', 'PUT', {
      enabled: true,
      providers: [],
      configs: [{
        ...DEMO_CONFIG,
        searchUrl: 'http://169.254.169.254/latest/meta-data?q={title}',
      }],
    });
    assert.equal(metadata.status, 400);
    assert.equal(server.calls.length, 0);
  });

  it('resuelve el DNS y bloquea un host que apunta a una IP privada', async () => {
    privateDns = true;
    server.calls.length = 0;
    try {
      const response = await send(server.base, '/api/scrapers/test', 'POST', {
        config: {
          ...DEMO_CONFIG,
          searchUrl: 'https://interno.example/search?q={title}',
        },
        title: 'Pelicula',
      });
      assert.equal(response.status, 400);
      assert.match(response.json.error, /privada|reservada/i);
      assert.equal(server.calls.length, 0);
    } finally {
      privateDns = false;
    }
  });

  it('mantiene el flujo normal para destinos públicos', async () => {
    server.calls.length = 0;
    const response = await send(server.base, '/api/scrapers/test', 'POST', {
      config: DEMO_CONFIG,
      title: 'Pelicula',
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.sources[0].url, 'https://cdn.example/pelicula-1080p.mp4');
    assert.ok(server.calls.some((url) => url.startsWith('https://site.example/search')));
  });

  it('no descarga manifests de addons alojados en la red interna', async () => {
    server.calls.length = 0;
    const blocked = await send(server.base, '/api/addons', 'POST', {
      manifestUrl: 'http://169.254.169.254/latest/meta-data/manifest.json',
    });
    assert.equal(blocked.status, 400);
    assert.match(blocked.json.error, /manifestUrl no permitida/);
    assert.equal(server.calls.length, 0);
  });

  it('protege el proxy HLS contra destinos arbitrarios', async () => {
    server.calls.length = 0;
    const blocked = await send(
      server.base,
      '/hls/proxy?url=http%3A%2F%2F127.0.0.1%3A9%2Fprivado.m3u8',
    );
    assert.equal(blocked.status, 400);
    assert.equal(server.calls.length, 0);

    const allowed = await send(
      server.base,
      `/hls/proxy?url=${encodeURIComponent('https://cdn.example/stream.m3u8')}`,
    );
    assert.equal(allowed.status, 200);
    assert.match(allowed.text, /#EXTM3U/);
    assert.match(allowed.text, /\/hls\/proxy\?url=/);
    assert.deepEqual(server.calls, ['https://cdn.example/stream.m3u8']);
  });

  it('publica la cobertura real: 9 de 51 puertos y Zaluknij parcial', async () => {
    const coverage = await send(server.base, '/api/scrapers/coverage');
    assert.equal(coverage.status, 200);
    assert.equal(coverage.json.upstreamVod, 51);
    assert.equal(coverage.json.ported, 9);
    assert.equal(coverage.json.pending, 42);
    assert.deepEqual(coverage.json.partial, ['zaluknij']);
    assert.equal(coverage.json.liveVerified, 0);
    assert.equal(coverage.json.pendingProviders.length, 42);

    // La lista de cobertura no exige una prueba real para presumir de ella.
    const status = await send(server.base, '/api/scrapers');
    assert.equal(status.status, 200);
    const zaluknij = (status.json.available as Array<any>).find((item) => item.id === 'zaluknij');
    assert.equal(zaluknij.coverage, 'partial');
    assert.ok(zaluknij.limitations.length >= 1);
    assert.ok((status.json.available as Array<any>).every((item) => item.liveVerified === false));
  });

  it('enmascara las claves guardadas y las conserva al reenviar el marcador', async () => {
    const update = await send(server.base, '/api/settings', 'PUT', {
      debrid: { provider: 'realdebrid', apiKey: 'RD-SECRET' },
      opensubtitles: { apiKey: 'OS-SECRET' },
    });
    assert.equal(update.status, 200);
    // La respuesta del PUT tampoco devuelve las claves en claro.
    assert.equal(update.json.settings.debrid.apiKey, SECRET_PLACEHOLDER);
    assert.equal(update.json.settings.opensubtitles.apiKey, SECRET_PLACEHOLDER);

    const read = await send(server.base, '/api/settings');
    assert.equal(read.status, 200);
    assert.equal(read.json.settings.debrid.apiKey, SECRET_PLACEHOLDER);
    assert.equal(read.json.settings.opensubtitles.apiKey, SECRET_PLACEHOLDER);

    const persisted = JSON.parse(
      await fs.readFile(path.join(server.dataDir, 'vibe-flix.json'), 'utf8'),
    ) as { settings: { debrid: { apiKey: string }; opensubtitles: { apiKey: string } } };
    assert.equal(persisted.settings.debrid.apiKey, 'RD-SECRET');
    assert.equal(persisted.settings.opensubtitles.apiKey, 'OS-SECRET');

    const resave = await send(server.base, '/api/settings', 'PUT', {
      debrid: { apiKey: SECRET_PLACEHOLDER },
    });
    assert.equal(resave.status, 200);
    const after = JSON.parse(
      await fs.readFile(path.join(server.dataDir, 'vibe-flix.json'), 'utf8'),
    ) as { settings: { debrid: { apiKey: string } } };
    assert.equal(after.settings.debrid.apiKey, 'RD-SECRET');
  });
});

describe('seguridad: token de dispositivo', () => {
  let server: TestServer;
  let token = '';
  let deviceId = '';

  before(async () => {
    server = await startServer();
  });

  after(async () => {
    await server.close();
  });

  it('protege biblioteca y scrapers, pero deja leer ajustes y addons', async () => {
    const pairing = await send(server.base, '/api/pairing', 'POST', { name: 'TV Android' });
    assert.equal(pairing.status, 200);
    token = pairing.json.token as string;
    deviceId = pairing.json.device.id as string;
    assert.ok(token.length > 10);

    // Lecturas que usa el shell Android: abiertas y sin secretos.
    for (const pathname of ['/api/settings', '/api/addons', '/api/debrid']) {
      const response = await send(server.base, pathname);
      assert.equal(response.status, 200, pathname);
    }
    const seeded = await send(server.base, '/api/settings', 'PUT', {
      debrid: { provider: 'realdebrid', apiKey: 'DEVICE-SECRET' },
    }, { 'x-vibe-flix-token': token });
    assert.equal(seeded.status, 200);
    assert.equal(seeded.json.settings.debrid.apiKey, SECRET_PLACEHOLDER);
    const settings = await send(server.base, '/api/settings');
    assert.equal(settings.json.settings.debrid.apiKey, SECRET_PLACEHOLDER);

    // Scrituras de configuración y biblioteca: exigen el token.
    assert.equal((await send(server.base, '/api/settings', 'PUT', { theme: 'dark' })).status, 401);
    assert.equal((await send(server.base, '/api/scrapers')).status, 401);
    assert.equal((await send(server.base, '/api/lists')).status, 401);

    const authorized = await send(server.base, '/api/lists', 'GET', undefined, {
      'x-vibe-flix-token': token,
    });
    assert.equal(authorized.status, 200);
    const settingsOk = await send(server.base, '/api/settings', 'PUT', { theme: 'dark' }, {
      'x-vibe-flix-token': token,
    });
    assert.equal(settingsOk.status, 200);
  });

  it('permite desvincular el dispositivo con su token', async () => {
    const removed = await send(server.base, `/api/devices/${deviceId}`, 'DELETE', undefined, {
      'x-vibe-flix-token': token,
    });
    assert.equal(removed.status, 200);
  });
});

describe('seguridad: token de administración', () => {
  let server: TestServer;

  before(async () => {
    server = await startServer({ adminToken: 'super-secreto' });
  });

  after(async () => {
    await server.close();
  });

  it('exige el token en rutas de configuración y descargas', async () => {
    const anonymous = await send(server.base, '/api/scrapers');
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.json.adminRequired, true);

    const anonymousTest = await send(server.base, '/api/scrapers/test', 'POST', {
      config: DEMO_CONFIG, title: 'Pelicula',
    });
    assert.equal(anonymousTest.status, 401);

    const wrong = await send(server.base, '/api/scrapers', 'GET', undefined, {
      authorization: 'Bearer otro-token',
    });
    assert.equal(wrong.status, 401);

    const authorized = await send(server.base, '/api/scrapers', 'GET', undefined, {
      authorization: 'Bearer super-secreto',
    });
    assert.equal(authorized.status, 200);

    const test = await send(server.base, '/api/scrapers/test', 'POST', {
      config: DEMO_CONFIG, title: 'Pelicula',
    }, { 'x-vibe-flix-admin-token': 'super-secreto' });
    assert.equal(test.status, 200);
    assert.equal(test.json.sources[0].url, 'https://cdn.example/pelicula-1080p.mp4');

    const settings = await send(server.base, '/api/settings', 'PUT', { theme: 'dark' });
    assert.equal(settings.status, 401);
    const settingsOk = await send(server.base, '/api/settings', 'PUT', { theme: 'dark' }, {
      'x-vibe-flix-admin-token': 'super-secreto',
    });
    assert.equal(settingsOk.status, 200);

    // El GET de ajustes sigue disponible, pero sin claves en claro.
    const read = await send(server.base, '/api/settings');
    assert.equal(read.status, 200);
  });

  it('protege la emisión de tokens de dispositivo', async () => {
    const anonymous = await send(server.base, '/api/pairing', 'POST', { name: 'Intruso' });
    assert.equal(anonymous.status, 401);

    const pairing = await send(server.base, '/api/pairing', 'POST', { name: 'TV' }, {
      'x-vibe-flix-admin-token': 'super-secreto',
    });
    assert.equal(pairing.status, 200);
    assert.ok(pairing.json.token.length > 10);

    // Con dispositivos vinculados, el token de administrador sigue bastando
    // para la configuración (no hay que encadenar dos credenciales).
    const settings = await send(server.base, '/api/settings', 'PUT', { theme: 'amoled' }, {
      'x-vibe-flix-admin-token': 'super-secreto',
    });
    assert.equal(settings.status, 200);

    const session = await send(server.base, '/api/session');
    assert.equal(session.json.adminRequired, true);
  });
});
