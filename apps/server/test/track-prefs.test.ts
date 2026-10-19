import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRACK_PREFS_CAP,
  saveTrackPreference,
  sanitizeTrackPreferencePatch,
  upsertTrackPreference,
  type TrackPreference,
} from '../src/library/track-prefs.js';
import { emptyData, normalizeData } from '../src/model.js';

describe('sanitizeTrackPreferencePatch', () => {
  it('acepta campos con tipo correcto', () => {
    const patch = sanitizeTrackPreferencePatch({
      audioLanguage: 'es',
      subtitleKey: 'native:0',
      subtitleLanguage: 'es-419',
      delayMs: -250,
      speed: 1.5,
    });
    assert.deepEqual(patch, {
      audioLanguage: 'es',
      subtitleKey: 'native:0',
      subtitleLanguage: 'es-419',
      delayMs: -250,
      speed: 1.5,
    });
  });

  it('permite subtitleKey null («sin subtítulos») y limpia cadenas', () => {
    assert.deepEqual(sanitizeTrackPreferencePatch({ subtitleKey: null }), { subtitleKey: null });
    assert.deepEqual(sanitizeTrackPreferencePatch({ audioLanguage: null }), { audioLanguage: '' });
  });

  it('descarta tipos inválidos y limita rangos', () => {
    const patch = sanitizeTrackPreferencePatch({
      audioLanguage: 42,
      subtitleKey: ['x'],
      delayMs: 999_999,
      speed: 100,
      updatedAt: 1,
    });
    assert.deepEqual(patch, { delayMs: 15_000, speed: 4 });
    assert.deepEqual(sanitizeTrackPreferencePatch({ delayMs: Number.NaN }), {});
  });
});

describe('upsertTrackPreference', () => {
  it('fusiona el parche y fechas la entrada', () => {
    const entry = upsertTrackPreference(
      { delayMs: 500, speed: 1.25, updatedAt: 1 },
      { delayMs: -250 },
      99,
    );
    assert.deepEqual(entry, { delayMs: -250, speed: 1.25, updatedAt: 99 });
  });

  it('devuelve null cuando no queda nada que recordar', () => {
    assert.equal(upsertTrackPreference(undefined, {}, 1), null);
    assert.equal(upsertTrackPreference(undefined, { delayMs: 0, speed: 1, audioLanguage: '' }, 1), null);
  });

  it('conserva subtitleKey null como decisión explícita', () => {
    const entry = upsertTrackPreference(undefined, { subtitleKey: null }, 1);
    assert.equal(entry?.subtitleKey, null);
    // Y no se considera «vacío»: el usuario eligió apagarlos.
    assert.notEqual(entry, null);
  });
});

describe('saveTrackPreference', () => {
  type Store = Record<string, Record<string, TrackPreference>>;

  it('guarda por perfil y vídeo', () => {
    const store: Store = {};
    saveTrackPreference(store, 'p1', 'tt1:1:1', { delayMs: 250 }, 10);
    saveTrackPreference(store, 'p2', 'tt1:1:1', { speed: 1.5 }, 20);
    assert.equal(store['p1']?.['tt1:1:1']?.delayMs, 250);
    assert.equal(store['p2']?.['tt1:1:1']?.speed, 1.5);
  });

  it('poda las entradas más antiguas al pasar del tope', () => {
    const store: Store = { p1: {} };
    for (let index = 0; index <= TRACK_PREFS_CAP; index += 1) {
      saveTrackPreference(store, 'p1', `v${index}`, { delayMs: index + 1 }, index + 1);
    }
    assert.equal(Object.keys(store['p1']!).length, TRACK_PREFS_CAP);
    // La más antigua (v0) se podó; la más reciente sigue.
    assert.equal(store['p1']!['v0'], undefined);
    assert.ok(store['p1']![`v${TRACK_PREFS_CAP}`]);
  });

  it('una preferencia vacía elimina la entrada', () => {
    const store: Store = {};
    saveTrackPreference(store, 'p1', 'tt1', { delayMs: 250 }, 1);
    const result = saveTrackPreference(store, 'p1', 'tt1', { delayMs: 0 }, 2);
    assert.equal(result, null);
    assert.equal(store['p1']?.['tt1'], undefined);
  });
});

describe('normalizeData', () => {
  it('trae trackPrefs vacío en datos antiguos', () => {
    const data = normalizeData({
      ...emptyData(),
      settings: { language: 'es' } as never,
    });
    assert.deepEqual(data.trackPrefs, {});
  });
});
