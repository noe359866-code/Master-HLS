import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  activeCues,
  cleanCueLine,
  cuesToSrt,
  cuesToVtt,
  detectSubtitleFormat,
  formatTimestamp,
  lowerBound,
  parseCues,
  parseTimestamp,
  shiftCues,
  coverageMs,
} from '../src/cues.js';
import { cleanSdhCues, cleanSdhLine, cleanSdhText, isAnnotationLine, looksLikeSdh, tidyPunctuation } from '../src/sdh.js';
import { decodeSubtitle, detectCharset, hasMojibake, isValidUtf8, repairMojibake } from '../src/encoding.js';

const SRT = `1
00:00:01,000 --> 00:00:03,500
Hola, mundo.

2
00:00:04,000 --> 00:00:06,000
Segunda linea
con salto

3
00:00:07,000 --> 00:00:08,000
<i>Curso</i> [musica]
`;

const VTT = `WEBVTT

intro
00:00:01.000 --> 00:00:03.000 line:90%
Primer dialogo

NOTE esto es un comentario

00:00:04.000 --> 00:00:05.000
Segundo dialogo
`;

const ASS = `[Script Info]
Title: Demo
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname
Style: Default,Arial

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}Hola\\NASI
Comment: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,no se ve
`;

describe('deteccion de formato', () => {
  it('reconoce SRT, WebVTT y ASS', () => {
    assert.equal(detectSubtitleFormat(SRT), 'srt');
    assert.equal(detectSubtitleFormat(VTT), 'vtt');
    assert.equal(detectSubtitleFormat(ASS), 'ass');
    assert.equal(detectSubtitleFormat('texto suelto'), 'unknown');
  });
});

describe('parseCues', () => {
  it('parsea SRT conservando los saltos de linea', () => {
    const cues = parseCues(SRT);
    assert.equal(cues.length, 3);
    assert.equal(cues[0]?.startMs, 1000);
    assert.equal(cues[0]?.endMs, 3500);
    assert.deepEqual(cues[1]?.lines, ['Segunda linea', 'con salto']);
  });

  it('parsea WebVTT con identificadores, ajustes y comentarios', () => {
    const cues = parseCues(VTT);
    assert.equal(cues.length, 2);
    assert.equal(cues[0]?.id, 'intro');
    assert.equal(cues[0]?.settings, 'line:90%');
    assert.equal(cues[1]?.lines[0], 'Segundo dialogo');
  });

  it('parsea ASS/SSA ignorando comentarios y estilos', () => {
    const cues = parseCues(ASS);
    assert.equal(cues.length, 1);
    assert.deepEqual(cues[0]?.lines, ['Hola', 'ASI']);
    assert.equal(cues[0]?.startMs, 1000);
  });

  it('limpia etiquetas HTML y de override', () => {
    assert.equal(cleanCueLine('<i>Hola</i> {\\an8}mundo'), 'Hola mundo');
    assert.equal(cleanCueLine('<c.yellow>Aviso</c>'), 'Aviso');
  });

  it('tolera BOM, CRLF y tiempos con punto', () => {
    const cues = parseCues('\uFEFF1\r\n00:00:01.000 --> 00:00:02.000\r\nTexto\r\n');
    assert.equal(cues.length, 1);
    assert.equal(cues[0]?.lines[0], 'Texto');
  });

  it('descarta bloques sin texto', () => {
    assert.deepEqual(parseCues('1\n00:00:01,000 --> 00:00:02,000\n\n'), []);
  });
});

describe('tiempos', () => {
  it('parsea y formatea marcas de tiempo', () => {
    assert.equal(parseTimestamp('01:02:03,456'), 3_723_456);
    assert.equal(parseTimestamp('02:03.456'), 123_456);
    assert.equal(formatTimestamp(3_723_456), '01:02:03.456');
    assert.equal(formatTimestamp(3_723_456, ','), '01:02:03,456');
    assert.equal(parseTimestamp('basura'), 0);
  });
});

describe('busqueda de la cue activa', () => {
  const cues = parseCues(SRT);

  it('devuelve la cue en su ventana', () => {
    assert.equal(activeCues(cues, 2000).length, 1);
    assert.equal(activeCues(cues, 2000)[0]?.lines[0], 'Hola, mundo.');
  });

  it('devuelve vacio fuera de las ventanas', () => {
    assert.deepEqual(activeCues(cues, 3800), []);
    assert.deepEqual(activeCues([], 1000), []);
  });

  it('tolera pequenas desviaciones de reloj', () => {
    assert.equal(activeCues(cues, 3600).length, 1);
  });

  it('lowerBound encuentra el punto de insercion', () => {
    assert.equal(lowerBound(cues, 0), 0);
    assert.equal(lowerBound(cues, 5000), 2);
  });

  it('coverageMs suma la duracion con dialogo', () => {
    assert.ok(coverageMs(cues) > 5000);
  });
});

describe('desfase y conversion', () => {
  it('desplaza las cues (negativo = adelantar)', () => {
    const cues = parseCues(SRT);
    const shifted = shiftCues(cues, -500);
    assert.equal(shifted[0]?.startMs, 500);
    assert.equal(shiftCues(cues, 0), cues);
  });

  it('no deja tiempos negativos al adelantar mucho', () => {
    const shifted = shiftCues(parseCues(SRT), -10_000);
    assert.equal(shifted[0]?.startMs, 0);
    assert.ok((shifted[0]?.endMs ?? 0) > 0);
  });

  it('convierte a WebVTT y a SRT de forma estable', () => {
    const cues = parseCues(SRT);
    const vtt = cuesToVtt(cues);
    assert.match(vtt, /^WEBVTT/);
    assert.match(vtt, /00:00:01\.000 --> 00:00:03\.500/);
    const roundTrip = parseCues(vtt);
    assert.equal(roundTrip.length, cues.length);
    assert.match(cuesToSrt(cues), /^1\n00:00:01,000 --> 00:00:03,500/);
  });
});

describe('Clean SDH', () => {
  it('quita el nombre del hablante y conserva el dialogo', () => {
    assert.equal(cleanSdhLine('JUAN: Hola, que tal'), 'Hola, que tal');
    assert.equal(cleanSdhLine('- MARIA (susurrando): Ven aqui'), 'Ven aqui');
    assert.equal(cleanSdhLine('[NARRADOR] Habia una vez'), 'Habia una vez');
  });

  it('no borra dialogo legitimo con dos puntos', () => {
    assert.equal(cleanSdhLine('Recuerda: manana salimos temprano'), 'Recuerda: manana salimos temprano');
    assert.equal(cleanSdhLine('Son las 10:30 de la noche'), 'Son las 10:30 de la noche');
  });

  it('quita las anotaciones de sonido', () => {
    assert.equal(cleanSdhLine('[musica tensa]'), '');
    assert.equal(cleanSdhLine('(risas)'), '');
    assert.equal(cleanSdhLine('[DISPAROS]'), '');
    assert.equal(isAnnotationLine('[inaudible]'), true);
    assert.equal(isAnnotationLine('Te lo dije'), false);
  });

  it('conserva la letra de las canciones sin los simbolos', () => {
    assert.equal(cleanSdhLine('♪ Que llueva, que llueva ♪'), 'Que llueva, que llueva');
    assert.equal(cleanSdhLine('♪ ♪'), '');
    assert.equal(cleanSdhLine('♪', { keepLyrics: false }), '');
  });

  it('limpia la puntuacion huerfana (el fallo de WuPlay con el arabe)', () => {
    assert.equal(tidyPunctuation(': Hola'), 'Hola');
    assert.equal(tidyPunctuation('- : '), '');
    assert.equal(tidyPunctuation('( ) listo  ,'), 'listo');
    // ¿ y ¡ son signos de apertura: conservan el espacio que los precede.
    assert.equal(tidyPunctuation('Bien, ¿y tú?'), 'Bien, ¿y tú?');
    assert.equal(tidyPunctuation('¡ Qué bien !'), '¡Qué bien!');
    assert.equal(cleanSdhLine('JUAN:'), '');
  });

  it('quita anotaciones intercaladas', () => {
    assert.equal(cleanSdhLine('Te lo dije [risas], venga ya'), 'Te lo dije, venga ya');
    assert.equal(cleanSdhLine('Vamos (jadeando) a por ello'), 'Vamos a por ello');
    assert.equal(cleanSdhLine('[NARRADOR] Habia una vez'), 'Habia una vez');
    assert.equal(cleanSdhLine('Curso [musica]'), 'Curso');
    assert.equal(cleanSdhLine('musica tensa'), 'musica tensa');
  });

  it('limpia cues enteras conservando el dialogo', () => {
    const cues = parseCues(SRT);
    const cleaned = cleanSdhCues(cues);
    assert.equal(cleaned.length, cues.length);
    assert.deepEqual(cleaned[2]?.lines, ['Curso']);
  });

  it('descarta las cues que se quedan vacias', () => {
    const cues = parseCues(
      '1\n00:00:01,000 --> 00:00:02,000\n[musica]\n\n2\n00:00:03,000 --> 00:00:04,000\nHola\n',
    );
    const cleaned = cleanSdhCues(cues);
    assert.equal(cleaned.length, 1);
    assert.deepEqual(cleaned[0]?.lines, ['Hola']);
  });

  it('detecta si un fichero es SDH', () => {
    const sdh = parseCues(
      '1\n00:00:01,000 --> 00:00:02,000\nJUAN: Hola\n\n2\n00:00:03,000 --> 00:00:04,000\n[musica]\n\n3\n00:00:05,000 --> 00:00:06,000\nMARIA: Adios\n',
    );
    assert.equal(looksLikeSdh(sdh), true);
    assert.equal(looksLikeSdh(parseCues(SRT)), false);
    // Fichero corto: dos marcas de tres cues ya delatan un SDH.
    const short = parseCues(
      '1\n00:00:01,000 --> 00:00:02,000\n[musica]\n\n2\n00:00:03,000 --> 00:00:04,000\nJUAN: Hola\n\n3\n00:00:05,000 --> 00:00:06,000\nAdios\n',
    );
    assert.equal(looksLikeSdh(short), true);
    assert.equal(looksLikeSdh([]), false);
  });

  it('cleanSdhText trabaja sobre texto plano', () => {
    assert.equal(cleanSdhText('JUAN: Hola\n[musica]\nAdios'), 'Hola\nAdios');
  });
});

describe('codificacion de subtitulos', () => {
  const encoder = new TextEncoder();

  it('detecta UTF-8 valido y con BOM', () => {
    assert.equal(isValidUtf8(encoder.encode('Hola, ¿qué tal?')), true);
    assert.equal(isValidUtf8(new Uint8Array([0xc3, 0x28])), false);
    assert.equal(detectCharset(new Uint8Array([0xef, 0xbb, 0xbf, 0x68])), 'utf-8');
    assert.equal(detectCharset(new Uint8Array([0xff, 0xfe, 0x68, 0x00])), 'utf-16le');
  });

  it('elige windows-1256 para arabe no UTF-8', () => {
    // Bytes arabes en windows-1256 (no forman UTF-8 valido).
    const arabic = new Uint8Array([0xc7, 0xe1, 0xd3, 0xe1, 0xc7, 0xe3, 0x20, 0xda, 0xe1, 0xed, 0xdf, 0xe3]);
    assert.equal(isValidUtf8(arabic), false);
    assert.equal(detectCharset(arabic, 'ar'), 'windows-1256');
  });

  it('elige windows-1251 para cirilico no UTF-8', () => {
    const cyrillic = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x20, 0xec, 0xe8, 0xf0]);
    assert.equal(detectCharset(cyrillic, 'ru'), 'windows-1251');
  });

  it('decodifica latin1 acentuado sin pista de idioma', () => {
    const bytes = new Uint8Array([0x48, 0x6f, 0x6c, 0x61, 0x20, 0xe1, 0xe9, 0xed]);
    const result = decodeSubtitle(bytes, 'es');
    assert.equal(result.encoding, 'windows-1252');
    assert.equal(result.guessed, true);
    assert.match(result.text, /Hola/);
  });

  it('decodifica UTF-8 normal sin marcarlo como adivinado', () => {
    const result = decodeSubtitle(encoder.encode('Hola, ¿qué tal?'));
    assert.equal(result.encoding, 'utf-8');
    assert.equal(result.guessed, false);
  });

  it('repara mojibake', () => {
    assert.equal(hasMojibake('Ã©l llegÃ³'), true);
    assert.equal(repairMojibake('Ã©l llegÃ³'), 'él llegó');
    assert.equal(hasMojibake('él llegó'), false);
  });
});
