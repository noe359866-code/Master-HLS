import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { playerAction, SHORTCUTS } from '../src/keys.js';
import {
  clampSeek,
  endsAt,
  formatClock,
  formatDelay,
  nextSpeed,
  PLAYBACK_SPEEDS,
  progressPercent,
  seekToPercent,
  speedLabel,
  toAsciiDigits,
} from '../src/time.js';

describe('formatClock', () => {
  it('muestra h:mm:ss y m:ss', () => {
    assert.equal(formatClock(0), '0:00');
    assert.equal(formatClock(65), '1:05');
    assert.equal(formatClock(3725), '1:02:05');
    assert.equal(formatClock(-5), '0:00');
    assert.equal(formatClock(Number.NaN), '0:00');
  });

  it('usa digitos estandar en cualquier idioma (arreglo de WuPlay v0.9.3)', () => {
    assert.equal(toAsciiDigits('٢٠٢٤'), '2024');
    assert.equal(toAsciiDigits('۱۲:۳۰'), '12:30');
    assert.equal(toAsciiDigits('१२'), '12');
    assert.equal(formatClock(3725), '1:02:05');
  });
});

describe('endsAt', () => {
  it('calcula la hora de fin', () => {
    const now = new Date('2026-01-01T21:30:00');
    assert.equal(endsAt(3600, now), '22:30');
    assert.equal(endsAt(1500, now), '21:55');
    assert.equal(endsAt(0, now), '');
  });
});

describe('saltos', () => {
  it('limita el seek a los bordes', () => {
    assert.equal(clampSeek(-10, 100), 0);
    assert.equal(clampSeek(150, 100), 100);
    assert.equal(clampSeek(50, Number.POSITIVE_INFINITY), 50);
  });

  it('salta por porcentaje', () => {
    assert.equal(seekToPercent(50, 1200), 600);
    assert.equal(seekToPercent(0, 1200), 0);
    assert.equal(seekToPercent(200, 1200), 1200);
  });

  it('calcula el porcentaje reproducido', () => {
    assert.equal(progressPercent(60, 120), 50);
    assert.equal(progressPercent(10, 0), 0);
  });
});

describe('velocidad de reproduccion', () => {
  it('sube y baja por la escala', () => {
    assert.equal(nextSpeed(1, 1), 1.25);
    assert.equal(nextSpeed(1, -1), 0.75);
    assert.equal(nextSpeed(PLAYBACK_SPEEDS[PLAYBACK_SPEEDS.length - 1] ?? 3, 1), 3);
    assert.equal(nextSpeed(0.5, -1), 0.5);
    assert.equal(nextSpeed(1.13, 1), 1);
  });

  it('etiqueta la velocidad', () => {
    assert.equal(speedLabel(1), '1x');
    assert.equal(speedLabel(1.25), '1.25x');
    assert.equal(speedLabel(1.5), '1.5x');
    assert.equal(speedLabel(2), '2x');
  });

  it('formatea el desfase de subtitulos', () => {
    assert.equal(formatDelay(0), '0.00 s');
    assert.equal(formatDelay(250), '+0.25 s');
    assert.equal(formatDelay(-1500), '−1.50 s');
  });
});

describe('atajos de teclado', () => {
  it('reproduce y pausa con espacio y K', () => {
    assert.deepEqual(playerAction({ key: ' ' }), { type: 'togglePlay' });
    assert.deepEqual(playerAction({ key: 'k' }), { type: 'togglePlay' });
    assert.deepEqual(playerAction({ key: 'K' }), { type: 'togglePlay' });
  });

  it('busca 10 s con las flechas y 60 s con Shift', () => {
    assert.deepEqual(playerAction({ key: 'ArrowLeft' }), { type: 'seek', deltaSeconds: -10 });
    assert.deepEqual(playerAction({ key: 'ArrowRight', shiftKey: true }), { type: 'seek', deltaSeconds: 60 });
    assert.deepEqual(playerAction({ key: 'j' }), { type: 'seek', deltaSeconds: -10 });
  });

  it('los numeros saltan por porcentaje', () => {
    assert.deepEqual(playerAction({ key: '5' }), { type: 'seekPercent', percent: 50 });
    assert.deepEqual(playerAction({ key: '0' }), { type: 'seekPercent', percent: 100 });
  });

  it('G/H ajustan el desfase de subtitulos (como Stremio)', () => {
    assert.deepEqual(playerAction({ key: 'g' }), { type: 'subtitleDelay', deltaMs: -250 });
    assert.deepEqual(playerAction({ key: 'h' }), { type: 'subtitleDelay', deltaMs: 250 });
    assert.deepEqual(playerAction({ key: '=' }), { type: 'subtitleSize', direction: 1 });
    assert.deepEqual(playerAction({ key: '-' }), { type: 'subtitleSize', direction: -1 });
  });

  it('[ y ] cambian la velocidad; barra invertida la reinicia', () => {
    assert.deepEqual(playerAction({ key: ']' }), { type: 'speed', direction: 1 });
    assert.deepEqual(playerAction({ key: '[' }), { type: 'speed', direction: -1 });
    assert.deepEqual(playerAction({ key: '\\' }), { type: 'speedReset' });
  });

  it('abre los menus con S, A, Q, I, T y E', () => {
    assert.deepEqual(playerAction({ key: 's' }), { type: 'menu', menu: 'subtitles' });
    assert.deepEqual(playerAction({ key: 's', shiftKey: true }), { type: 'toggleSubtitles' });
    assert.deepEqual(playerAction({ key: 'a' }), { type: 'menu', menu: 'audio' });
    assert.deepEqual(playerAction({ key: 'q' }), { type: 'menu', menu: 'quality' });
    assert.deepEqual(playerAction({ key: 'i' }), { type: 'menu', menu: 'info' });
    assert.deepEqual(playerAction({ key: 't' }), { type: 'menu', menu: 'stats' });
    assert.deepEqual(playerAction({ key: 'e' }), { type: 'menu', menu: 'episodes' });
  });

  it('frame-step con coma y punto', () => {
    assert.deepEqual(playerAction({ key: ',' }), { type: 'frameStep', deltaFrames: -1 });
    assert.deepEqual(playerAction({ key: '.' }), { type: 'frameStep', deltaFrames: 1 });
  });

  it('no interfiere con campos ni con modificadores', () => {
    assert.equal(playerAction({ key: 's', inField: true }), undefined);
    assert.equal(playerAction({ key: 'f', ctrlKey: true }), undefined);
    assert.equal(playerAction({ key: 'r', metaKey: true }), undefined);
  });

  it('Esc y Backspace salen; N y B cambian de episodio', () => {
    assert.deepEqual(playerAction({ key: 'Escape' }), { type: 'back' });
    assert.deepEqual(playerAction({ key: 'Backspace' }), { type: 'back' });
    assert.deepEqual(playerAction({ key: 'n' }), { type: 'nextEpisode' });
    assert.deepEqual(playerAction({ key: 'b' }), { type: 'previousEpisode' });
    assert.deepEqual(playerAction({ key: 'x' }), { type: 'skipIntro' });
  });

  it('ignora teclas desconocidas', () => {
    assert.equal(playerAction({ key: 'ç' }), undefined);
    assert.equal(playerAction({ key: 'Shift' }), undefined);
  });

  it('toda la ayuda en pantalla tiene accion conocida', () => {
    for (const entry of SHORTCUTS) {
      assert.ok(entry.labelKey, entry.keys);
      assert.ok(entry.action);
    }
  });
});
