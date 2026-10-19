import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { RecoveryPlanner, describeError, isRetryableNetworkError } from '../src/recovery.js';

describe('RecoveryPlanner: errores de red', () => {
  it('reintenta la carga antes de dar el error por bueno', () => {
    const planner = new RecoveryPlanner();
    const error = { type: 'networkError', details: 'fragLoadError', fatal: true };

    assert.equal(planner.plan(error, { now: 1000 }).action, 'reload');
    assert.equal(planner.plan(error, { now: 3000 }).action, 'reload');
    assert.equal(planner.plan(error, { now: 5000 }).action, 'reload');
    // Agotados los reintentos: se recarga el playlist entero.
    assert.equal(planner.plan(error, { now: 7000 }).action, 'restartPlaylist');
  });

  it('pasa al siguiente stream cuando la red se agota y hay alternativa', () => {
    const planner = new RecoveryPlanner();
    const error = { type: 'networkError', details: 'levelLoadTimeout', fatal: true };
    for (let index = 0; index < 4; index += 1) planner.plan(error, { now: index * 5000 });
    const step = planner.plan(error, { hasAlternateStream: true, now: 30_000 });
    assert.equal(step.action, 'nextStream');
    assert.ok(step.reason.includes('cambiando de fuente'));
  });

  it('se rinde cuando no hay alternativa', () => {
    const planner = new RecoveryPlanner();
    const error = { type: 'networkError', details: 'manifestLoadError', fatal: true };
    for (let index = 0; index < 5; index += 1) planner.plan(error, { now: index * 5000 });
    assert.equal(planner.plan(error, { now: 40_000 }).action, 'giveUp');
  });

  it('los errores incompatibles no se reintentan', () => {
    const planner = new RecoveryPlanner();
    const step = planner.plan({
      type: 'networkError',
      details: 'manifestIncompatibleCodecsError',
      fatal: true,
    }, { hasAlternateStream: true, now: 1000 });
    assert.equal(step.action, 'nextStream');
  });

  it('la espera crece con cada reintento', () => {
    const planner = new RecoveryPlanner();
    const error = { type: 'networkError', details: 'fragLoadError', fatal: true };
    const first = planner.plan(error, { now: 1000 });
    const second = planner.plan(error, { now: 4000 });
    assert.ok(second.delayMs > first.delayMs);
  });
});

describe('RecoveryPlanner: errores de medio', () => {
  it('recupera el buffer y luego cambia el codec de audio', () => {
    const planner = new RecoveryPlanner();
    const error = { type: 'mediaError', details: 'bufferAppendError', fatal: true };
    assert.equal(planner.plan(error, { now: 1000 }).action, 'recoverMedia');
    assert.equal(planner.plan(error, { now: 3000 }).action, 'recoverMedia');
    assert.equal(planner.plan(error, { now: 5000 }).action, 'swapAudioCodec');
    assert.equal(planner.plan(error, { now: 7000 }).action, 'giveUp');
  });

  it('una rafaga del mismo fallo escala en vez de repetir la recuperacion', () => {
    const planner = new RecoveryPlanner();
    const error = { type: 'mediaError', details: 'bufferStalledError', fatal: true };
    assert.equal(planner.plan(error, { now: 1000 }).action, 'recoverMedia');
    // Segundo error 50 ms despues: es el mismo fallo propagado, asi que no se
    // repite `recoverMedia` (no serviria de nada) y se prueba otra salida.
    assert.equal(planner.plan(error, { now: 1050 }).action, 'swapAudioCodec');
  });

  it('los errores de mux cambian de fuente directamente', () => {
    const planner = new RecoveryPlanner();
    const step = planner.plan(
      { type: 'muxError', details: 'remuxException', fatal: true },
      { hasAlternateStream: true, now: 1000 },
    );
    assert.equal(step.action, 'nextStream');
  });
});

describe('RecoveryPlanner: varios', () => {
  it('ignora los errores no fatales', () => {
    const planner = new RecoveryPlanner();
    assert.equal(planner.plan({ type: 'networkError', details: 'fragLoadError', fatal: false }).action, 'ignore');
  });

  it('reset() devuelve los contadores a cero', () => {
    const planner = new RecoveryPlanner();
    planner.plan({ type: 'networkError', details: 'fragLoadError', fatal: true }, { now: 1000 });
    assert.equal(planner.attempts, 1);
    planner.reset();
    assert.equal(planner.attempts, 0);
  });

  it('describe el error en lenguaje humano', () => {
    assert.match(describeError({ type: 'networkError', details: 'fragLoadTimeout', fatal: true }), /descarga/i);
    assert.match(describeError({ type: 'otherError', details: 'cosaRara', fatal: true }), /cosaRara/);
  });

  it('marca los detalles reintentables', () => {
    assert.equal(isRetryableNetworkError('keyLoadError'), true);
    assert.equal(isRetryableNetworkError('manifestIncompatibleCodecsError'), false);
  });
});
