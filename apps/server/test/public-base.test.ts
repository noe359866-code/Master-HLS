/**
 * Base publica de las URLs del addon.
 *
 * Es la pieza que decide si una TV en la LAN recibe `http://192.168.x.x:8181`
 * o un `http://localhost:8181` inutilizable (apuntaria a la propia TV). Estos
 * tests fijan esa prioridad.
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';

import { publicBase } from '../src/routes/stremio.js';

/** `IncomingMessage` minimo: solo se lee `headers`. */
function requestWithHost(host: string, proto?: string): IncomingMessage {
  return {
    headers: {
      host,
      ...(proto ? { 'x-forwarded-proto': proto } : {}),
    },
  } as unknown as IncomingMessage;
}

const originalPublicUrl = process.env['PUBLIC_URL'];

afterEach(() => {
  if (originalPublicUrl === undefined) delete process.env['PUBLIC_URL'];
  else process.env['PUBLIC_URL'] = originalPublicUrl;
});

describe('publicBase', () => {
  it('usa el Host de la peticion cuando el servidor esta configurado como localhost', () => {
    delete process.env['PUBLIC_URL'];
    const base = publicBase(requestWithHost('192.168.1.50:8181'), () => 'http://localhost:8181');
    assert.equal(base, 'http://192.168.1.50:8181');
  });

  it('mantiene localhost cuando la propia peticion viene de localhost', () => {
    delete process.env['PUBLIC_URL'];
    const base = publicBase(requestWithHost('localhost:8181'), () => 'http://localhost:8181');
    assert.equal(base, 'http://localhost:8181');
  });

  it('respeta una URL publica configurada por el operador', () => {
    delete process.env['PUBLIC_URL'];
    const base = publicBase(requestWithHost('192.168.1.50:8181'), () => 'https://tv.example.com');
    assert.equal(base, 'https://tv.example.com');
  });

  it('PUBLIC_URL manda sobre la configuracion y sobre el Host', () => {
    process.env['PUBLIC_URL'] = 'https://vibe.example.com/';
    const base = publicBase(requestWithHost('192.168.1.50:8181'), () => 'http://localhost:8181');
    assert.equal(base, 'https://vibe.example.com');
  });

  it('usa x-forwarded-proto cuando el servidor esta detras de un proxy', () => {
    delete process.env['PUBLIC_URL'];
    const base = publicBase(requestWithHost('tv.example.com', 'https'), () => 'http://localhost:8181');
    assert.equal(base, 'https://tv.example.com');
  });

  it('cae en localhost cuando no hay Host ni configuracion util', () => {
    delete process.env['PUBLIC_URL'];
    const base = publicBase(undefined, () => 'http://localhost:0');
    assert.match(base, /^http:\/\/localhost:\d+$/);
  });
});
