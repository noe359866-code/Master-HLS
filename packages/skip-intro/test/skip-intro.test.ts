import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectFormat,
  detectSkipSegment,
  fallbackSkipSegment,
  formatTimestamp,
  isRecap,
  isSentenceShaped,
  isTitleCard,
  parseSubtitles,
  parseTimestamp,
  resolveSkipSegment,
  shouldShowSkip,
  toSrt,
  toWebVtt,
} from '../src/index.js';

const SRT = `1
00:00:01,000 --> 00:00:03,500
Vibe Flix

2
00:00:52,000 --> 00:00:55,000
Donde estabas?

3
00:01:30,000 --> 00:01:33,000
Vamos a ello.
`;

const VTT = `WEBVTT

00:00:02.000 --> 00:00:04.000
Primera linea

00:00:52.000 --> 00:00:55.000
Segunda linea
`;

describe('parseTimestamp', () => {
  it('convierte SRT y WebVTT a milisegundos', () => {
    assert.equal(parseTimestamp('00:00:01,000'), 1000);
    assert.equal(parseTimestamp('00:00:01.500'), 1500);
    assert.equal(parseTimestamp('01:02:03,004'), 3_723_004);
    assert.equal(parseTimestamp('02:03'), 123_000);
  });

  it('devuelve 0 con valores invalidos', () => {
    assert.equal(parseTimestamp('hola'), 0);
    assert.equal(parseTimestamp(''), 0);
  });

  it('formatea a WebVTT', () => {
    assert.equal(formatTimestamp(3_723_004), '01:02:03.004');
    assert.equal(formatTimestamp(1500), '00:00:01.500');
  });
});

describe('parseSubtitles', () => {
  it('detecta el formato', () => {
    assert.equal(detectFormat(SRT), 'srt');
    assert.equal(detectFormat(VTT), 'vtt');
  });

  it('parsea SRT con su numeracion', () => {
    const cues = parseSubtitles(SRT);
    assert.equal(cues.length, 3);
    assert.equal(cues[0]?.startMs, 1000);
    assert.equal(cues[0]?.endMs, 3500);
    assert.equal(cues[0]?.text, 'Vibe Flix');
    assert.equal(cues[1]?.text, 'Donde estabas?');
  });

  it('parsea WebVTT', () => {
    const cues = parseSubtitles(VTT);
    assert.equal(cues.length, 2);
    assert.equal(cues[0]?.startMs, 2000);
    assert.equal(cues[1]?.startMs, 52_000);
  });

  it('ignora cabeceras, notas y etiquetas HTML', () => {
    const cues = parseSubtitles(`WEBVTT

NOTE esto es una nota

00:00:05.000 --> 00:00:07.000
<i>Hola</i> mundo
`);
    assert.equal(cues.length, 1);
    assert.equal(cues[0]?.text, 'Hola mundo');
  });

  it('devuelve lista vacia para texto vacio', () => {
    assert.deepEqual(parseSubtitles(''), []);
    assert.deepEqual(parseSubtitles('   '), []);
  });

  it('convierte a WebVTT y a SRT', () => {
    const cues = parseSubtitles(SRT);
    const vtt = toWebVtt(cues);
    assert.match(vtt, /^WEBVTT/);
    assert.match(vtt, /00:00:01\.000 --> 00:00:03\.500/);
    const srt = toSrt(cues);
    assert.match(srt, /1\n00:00:01,000 --> 00:00:03,500/);
    // ida y vuelta estable
    assert.deepEqual(parseSubtitles(srt), cues);
  });
});

describe('isTitleCard', () => {
  it('detecta carteles de capitulo y titulos en mayusculas', () => {
    assert.equal(isTitleCard('EPISODE 1'), true);
    assert.equal(isTitleCard('Capítulo 12'), true);
    assert.equal(isTitleCard('VIBE FLIX'), true);
    assert.equal(isTitleCard('***'), true);
  });

  it('no confunde dialogo con un cartel', () => {
    assert.equal(isTitleCard('Donde estabas?'), false);
    assert.equal(isTitleCard('No se te ocurra.'), false);
  });
});

describe('isSentenceShaped', () => {
  it('distingue frases de carteles', () => {
    assert.equal(isSentenceShaped('Donde estabas?'), true);
    assert.equal(isSentenceShaped('Vamos a ello.'), true);
    assert.equal(isSentenceShaped('Vibe Flix'), false);
    assert.equal(isSentenceShaped('Presentado'), false);
  });
});

describe('isRecap', () => {
  it('detecta el recap en español e inglés', () => {
    assert.equal(isRecap('Anteriormente en Vibe Flix...'), true);
    assert.equal(isRecap('Previously on Vibe Flix'), true);
    assert.equal(isRecap('En el capítulo anterior...'), true);
    assert.equal(isRecap('Hola a todos'), false);
  });
});

describe('detectSkipSegment', () => {
  it('detecta la intro a partir del primer dialogo', () => {
    const cues = parseSubtitles(SRT);
    const segment = detectSkipSegment(cues);
    assert.ok(segment);
    assert.equal(segment?.kind, 'intro');
    assert.equal(segment?.source, 'subtitles');
    // El primer dialogo real empieza en 52 s: la intro acaba 1,5 s antes.
    assert.equal(segment?.endMs, 50_500);
    assert.equal(segment?.startMs, 0);
    assert.ok((segment?.confidence ?? 0) > 0.5);
  });

  it('ignora los carteles de capitulo como dialogo', () => {
    const cues = parseSubtitles(`1
00:00:05,000 --> 00:00:07,000
EPISODE 1

2
00:01:10,000 --> 00:01:12,000
Hola, que tal?
`);
    const segment = detectSkipSegment(cues);
    assert.equal(segment?.endMs, 68_500);
  });

  it('detecta el recap cuando el episodio empieza con "anteriormente"', () => {
    const cues = parseSubtitles(`1
00:00:10,000 --> 00:00:25,000
Anteriormente en Vibe Flix...

2
00:01:00,000 --> 00:01:02,000
Y ahora si.
`);
    const segment = detectSkipSegment(cues);
    assert.equal(segment?.kind, 'recap');
    assert.equal(segment?.endMs, 26_500);
  });

  it('no detecta intro si el dialogo empieza enseguida', () => {
    const cues = parseSubtitles(`1
00:00:01,000 --> 00:00:03,000
Empezamos ya.
`);
    assert.equal(detectSkipSegment(cues), null);
  });

  it('devuelve null sin subtitulos', () => {
    assert.equal(detectSkipSegment([]), null);
  });

  it('no confunde los creditos con dialogo', () => {
    // Cartel de titulo y creditos cortos: el dialogo empieza mas tarde.
    const cues = parseSubtitles(`1
00:00:01,000 --> 00:00:08,000
Vibe Flix

2
00:01:35,000 --> 00:01:41,000
Esta es una demostracion del reproductor nativo.

3
00:02:10,000 --> 00:02:16,000
El boton de saltar intro aparece aqui.
`);
    const segment = detectSkipSegment(cues);
    assert.equal(segment?.source, 'subtitles');
    assert.equal(segment?.endMs, 93_500);
  });

  it('un cue corto que continua el dialogo cuenta como dialogo', () => {
    const cues = parseSubtitles(`1
00:00:30,000 --> 00:00:33,000
Voy a hacerlo ahora mismo.

2
00:00:34,000 --> 00:00:36,000
Ahora.

3
00:00:37,000 --> 00:00:39,000
Ya.
`);
    // El primer dialogo (con forma de frase) marca el final de la intro.
    assert.equal(detectSkipSegment(cues)?.endMs, 28_500);
  });

  it('respeta las opciones (intro minima y maxima)', () => {
    const cues = parseSubtitles(SRT);
    // Con intro minima de 60 s, la deteccion se descarta.
    assert.equal(detectSkipSegment(cues, { minIntroMs: 60_000 }), null);
    // Con intro maxima de 10 s, tampoco hay nada que saltar.
    assert.equal(detectSkipSegment(cues, { maxIntroMs: 10_000 }), null);
  });
});

describe('fallbackSkipSegment', () => {
  it('usa el offset por defecto', () => {
    const segment = fallbackSkipSegment(0);
    assert.equal(segment.endMs, 90_000);
    assert.equal(segment.source, 'fallback');
    assert.equal(segment.kind, 'intro');
  });

  it('limita el offset a un porcentaje de la duracion', () => {
    const segment = fallbackSkipSegment(300_000);
    assert.equal(segment.endMs, 24_000);
  });

  it('permite configurar el offset', () => {
    const segment = fallbackSkipSegment(0, { fallbackMs: 45_000 });
    assert.equal(segment.endMs, 45_000);
  });
});

describe('resolveSkipSegment', () => {
  it('prefiere la deteccion por subtitulos', () => {
    const cues = parseSubtitles(SRT);
    const segment = resolveSkipSegment(cues, 3_600_000);
    assert.equal(segment.source, 'subtitles');
    assert.equal(segment.endMs, 50_500);
  });

  it('cae en el valor por defecto sin subtitulos', () => {
    const segment = resolveSkipSegment([], 3_600_000);
    assert.equal(segment.source, 'fallback');
  });
});

describe('shouldShowSkip', () => {
  const segment = { startMs: 0, endMs: 50_500, kind: 'intro' as const, confidence: 0.8, source: 'subtitles' as const };

  it('muestra el boton dentro de la intro', () => {
    assert.equal(shouldShowSkip(segment, 0), true);
    assert.equal(shouldShowSkip(segment, 30_000), true);
  });

  it('lo oculta al pasar el punto de salto', () => {
    assert.equal(shouldShowSkip(segment, 50_000), false);
    assert.equal(shouldShowSkip(segment, 120_000), false);
  });

  it('no muestra nada sin segmento', () => {
    assert.equal(shouldShowSkip(null, 0), false);
  });
});
