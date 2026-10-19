import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SingleFlight, TtlCache } from '../src/cache.js';
import { mergeCacheDirectives, parseCacheDirective } from '../src/normalize.js';

describe('TtlCache', () => {
  it('devuelve el valor dentro del TTL y nada despues', () => {
    let now = 0;
    const cache = new TtlCache<string>({ ttlMs: 1000, now: () => now });
    cache.set('a', 'uno');
    assert.equal(cache.get('a'), 'uno');
    now = 1500;
    assert.equal(cache.get('a'), undefined);
  });

  it('sin ventana SWR el valor caducado desaparece', () => {
    let now = 0;
    const cache = new TtlCache<string>({ ttlMs: 1000, now: () => now });
    cache.set('a', 'uno');
    now = 1500;
    assert.equal(cache.peek('a'), undefined);
  });

  it('con SWR el valor caducado sigue disponible para peek()', () => {
    let now = 0;
    const cache = new TtlCache<string>({ ttlMs: 1000, staleTtlMs: 5000, now: () => now });
    cache.set('a', 'uno');

    now = 1500;
    assert.equal(cache.get('a'), undefined, 'ya no esta fresco');
    const stale = cache.peek('a');
    assert.equal(stale?.value, 'uno');
    assert.equal(stale?.fresh, false);
    assert.equal(stale?.ageMs, 1500);

    // Sigue siendo util hasta que se agota la ventana SWR.
    now = 6500;
    assert.equal(cache.peek('a'), undefined);
  });

  it('extend() alarga la ventana cuando el refresco falla', () => {
    let now = 0;
    const cache = new TtlCache<string>({ ttlMs: 1000, staleTtlMs: 1000, now: () => now });
    cache.set('a', 'uno');
    now = 1500;
    assert.ok(cache.peek('a'));
    cache.extend('a', 10_000);
    now = 5000;
    assert.equal(cache.peek('a')?.value, 'uno');
  });

  it('set() sustituye el valor y reinicia la edad', () => {
    let now = 0;
    const cache = new TtlCache<string>({ ttlMs: 1000, staleTtlMs: 1000, now: () => now });
    cache.set('a', 'uno');
    now = 1500;
    cache.set('a', 'dos');
    assert.equal(cache.get('a'), 'dos');
    assert.equal(cache.peek('a')?.fresh, true);
    assert.equal(cache.peek('a')?.ageMs, 0);
  });

  it('respeta el limite de entradas (LRU)', () => {
    const cache = new TtlCache<number>({ maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    assert.equal(cache.size, 2);
    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('a'), 1);
  });
});

describe('SingleFlight', () => {
  it('comparte una sola ejecucion entre llamadas simultaneas', async () => {
    const flight = new SingleFlight();
    let calls = 0;
    const task = () => {
      calls += 1;
      return new Promise<number>((resolve) => setTimeout(() => resolve(42), 10));
    };
    const [a, b, c] = await Promise.all([flight.run('k', task), flight.run('k', task), flight.run('k', task)]);
    assert.deepEqual([a, b, c], [42, 42, 42]);
    assert.equal(calls, 1);
  });

  it('libera la clave tras el fallo', async () => {
    const flight = new SingleFlight();
    await assert.rejects(flight.run('k', async () => {
      throw new Error('boom');
    }));
    const value = await flight.run('k', async () => 'ok');
    assert.equal(value, 'ok');
  });
});

describe('directivas de cache del SDK de Stremio', () => {
  it('lee maxAge, staleRevalidate y staleError', () => {
    assert.deepEqual(
      parseCacheDirective({ metas: [], maxAge: 3600, staleRevalidate: 86_400, staleError: 604_800 }),
      { maxAge: 3600, staleRevalidate: 86_400, staleError: 604_800 },
    );
  });

  it('devuelve undefined cuando el addon no pide nada', () => {
    assert.equal(parseCacheDirective({ metas: [] }), undefined);
    assert.equal(parseCacheDirective(undefined), undefined);
  });

  it('ignora valores absurdos (negativos o de mas de un ano)', () => {
    assert.equal(parseCacheDirective({ maxAge: -5 }), undefined);
    assert.equal(parseCacheDirective({ maxAge: 40_000_000 }), undefined);
    assert.deepEqual(parseCacheDirective({ maxAge: '3600' }), undefined);
  });

  it('fusiona varias directivas quedandose con la mas conservadora', () => {
    assert.deepEqual(
      mergeCacheDirectives([
        { maxAge: 3600, staleError: 100 },
        { maxAge: 60, staleRevalidate: 10 },
        undefined,
      ]),
      { maxAge: 60, staleRevalidate: 10, staleError: 100 },
    );
    assert.equal(mergeCacheDirectives([undefined, undefined]), undefined);
  });
});
