/**
 * **Clean SDH**: limpieza de subtitulos para personas sordas.
 *
 * Los ficheros SDH/HI incluyen informacion que no es dialogo: anotaciones de
 * sonido («[musica tensa]»), identificadores de hablante («JUAN:»,
 * «[NARRADOR]») y marcas musicales («♪»). En una TV se leen peor y, cuando el
 * titulo esta doblado, duplican lo que ya se oye.
 *
 * WuPlay lo ofrece como ajuste del reproductor y tuvo que corregir un fallo
 * concreto (v0.9.2): al quitar el nombre del hablante quedaba puntuacion
 * huerfana, sobre todo en arabe. Aqui se limpia por capas y se repasa la
 * puntuacion sobrante al final. La misma logica la usa el servidor al convertir
 * subtitulos a WebVTT y el cliente al renderizar sus propias cues.
 */

import type { Cue } from './cues.js';

export interface SdhOptions {
  /** Quitar los identificadores de hablante («JUAN:», «- MARIA:», «[NARRADOR]»). */
  stripSpeakers?: boolean;
  /** Quitar las anotaciones de sonido/musica («[musica]», «(risas)»). */
  stripAnnotations?: boolean;
  /** Conservar la letra de las canciones (sin los simbolos musicales). */
  keepLyrics?: boolean;
  /** Limpiar la puntuacion huerfana que deja el borrado. */
  tidyPunctuation?: boolean;
}

/** Anotaciones que no son dialogo, en los idiomas mas habituales. */
const ANNOTATION_WORDS = [
  'music', 'music playing', 'theme music', 'soundtrack', 'song', 'inaudible',
  'indistinct', 'muffled', 'silence', 'sighs', 'sighing', 'laughs', 'laughing',
  'chuckles', 'giggles', 'applause', 'cheering', 'crowd', 'door closes',
  'door opens', 'doorbell', 'gunshot', 'gunshots', 'gunfire', 'explosion',
  'thunder', 'rain', 'wind', 'engine', 'tires', 'footsteps', 'beeping',
  'phone ringing', 'ringing', 'alarm', 'sirens', 'birds', 'dogs barking',
  'barking', 'crying', 'sobbing', 'gasps', 'groans', 'whispers', 'whispering',
  'coughing', 'sneezing', 'clears throat', 'narrator', 'announcer',
  'subtitles by', 'captioned by', 'captioning', 'subtitles',
  'musica', 'música', 'cancion', 'canción', 'silencio', 'suspiros', 'risas',
  'aplausos', 'gritos', 'llora', 'llorando', 'tos', 'estornuda', 'ladridos',
  'truenos', 'lluvia', 'viento', 'motor', 'sirena', 'alarma', 'puerta',
  'disparos', 'explosion', 'explosión', 'narrador', 'locutor', 'murmullos',
  'pasos', 'timbre', 'telefono', 'teléfono', 'jadeando', 'jadeo', 'respira',
  'respirando', 'golpes', 'portazo', 'cristales', 'vidrios', 'motocicleta',
  'coche', 'helicoptero', 'avion', 'avión', 'agua', 'olas', 'fuego', 'llamas',
  'tecleo', 'teclado', 'subtitulos', 'subtítulos', 'traduccion', 'traducción',
  'sonido', 'ruido', 'zumbido', 'pitido', 'cristal', 'sollozos', 'carcajadas',
];

/** Simbolos musicales y marcas de cancion. */
const MUSIC_SYMBOLS = /[♪♫♬🎵🎶]/;

const ANNOTATION_PATTERN = new RegExp(
  `\\b(${ANNOTATION_WORDS.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i',
);

/** Una linea envuelta por completo en corchetes/parentesis/asteriscos/llaves. */
const WRAPPED = /^\s*(?:\[([^\]]*)\]|\(([^)]*)\)|\*([^*]*)\*|\{([^}]*)\})\s*$/;

/** Etiqueta de hablante entre corchetes o parentesis al principio de la linea. */
const LEADING_LABEL = /^\s*(?:\[([^\]]{1,48})\]|\(([^)]{1,48})\))\s*[:：]?\s*(.*)$/;

/**
 * Identificador de hablante con dos puntos al principio de la linea.
 * Solo se aplica cuando el nombre parece un nombre (corto) y va en mayusculas
 * o precedido de guion, para no borrar dialogo legitimo con dos puntos
 * («Recuerda: manana salimos», «Son las 10:30»).
 */
const SPEAKER = /^\s*(?<mark>[-–—•]\s*)?(?<name>[^\n:]{1,48}?)\s*(?<paren>\([^)]*\)|\[[^\]]*\])?\s*[:：]\s*(?<rest>.*)$/;

/** Limpia la puntuacion huerfana que queda al borrar hablantes o anotaciones. */
export function tidyPunctuation(text: string): string {
  return text
    .replace(/^[\s:：,;.、،\-–—•_]+/u, '')
    .replace(/[\s,;:、،.]+$/u, '')
    .replace(/\(\s*\)|\[\s*\]|\*\s*\*|\{\s*\}/g, ' ')
    // Los signos de apertura (¿ ¡) llevan espacio delante: solo se pega al
    // texto la puntuacion de cierre.
    .replace(/\s+([,.;:!?…])/g, '$1')
    .replace(/([¿¡])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Quita los simbolos musicales conservando la letra. */
function stripMusicSymbols(line: string): string {
  return line.replace(/[♪♫♬🎵🎶]/g, '').trim();
}

/** Quita corchetes, parentesis y llaves dejando solo las palabras. */
function withoutBrackets(line: string): string {
  return line.replace(/[\[\](){}*]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** true si el texto es un nombre de hablante (mayusculas o con marca). */
function looksLikeSpeakerName(name: string, marked: boolean): boolean {
  const clean = name.replace(/^[-–—•\s[\]()]+|[\]\()\s]+$/g, '').trim();
  if (!clean || clean.length > 48) return false;
  if (clean.split(/\s+/).length > 5) return false;
  const letters = clean.replace(/[^\p{L}]/gu, '');
  if (!letters) return marked;
  // Todo en mayusculas: «JUAN», «MAN #2», «DR. HOUSE», «NARRADOR».
  if (letters === letters.toUpperCase() && letters !== letters.toLowerCase()) return true;
  // Con guion o corchete delante se acepta tambien «Maria:».
  if (marked) return true;
  return false;
}

/** true si una palabra suelta es una anotacion de sonido. */
function isAnnotationWord(word: string): boolean {
  return ANNOTATION_PATTERN.test(word.replace(/[,.;:!?]/g, ''));
}

/**
 * true si la linea es una anotacion (no dialogo).
 *
 * Se considera anotacion cuando esta envuelta por completo en corchetes o
 * parentesis y describe un sonido, cuando solo hay simbolos musicales, o
 * cuando practicamente todo el texto son palabras de anotacion. Un dialogo con
 * una anotacion intercalada («Te lo dije [risas]») **no** es una anotacion: se
 * limpia la anotacion y se conserva el dialogo.
 */
export function isAnnotationLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;

  const wrapped = WRAPPED.exec(trimmed);
  if (wrapped) {
    const inner = (wrapped[1] ?? wrapped[2] ?? wrapped[3] ?? wrapped[4] ?? '').trim();
    if (!inner) return true;
    if (ANNOTATION_PATTERN.test(inner)) return true;
    if (inner.length <= 32 && inner === inner.toUpperCase() && inner !== inner.toLowerCase()) return true;
    return false;
  }

  const lyrics = stripMusicSymbols(trimmed);
  if (MUSIC_SYMBOLS.test(trimmed) && lyrics.replace(/[\s,.!?]/g, '').length <= 2) return true;

  const core = withoutBrackets(lyrics);
  if (!core) return true;

  const words = core.split(/\s+/).filter(Boolean);
  if (words.length <= 4 && words.every((word) => isAnnotationWord(word))) return true;

  const match = ANNOTATION_PATTERN.exec(core);
  if (match && words.length <= 4 && match[0].length / core.length >= 0.6) return true;

  return false;
}

/** Limpia una linea de dialogo segun las opciones. */
export function cleanSdhLine(line: string, options: SdhOptions = {}): string {
  const {
    stripSpeakers = true,
    stripAnnotations = true,
    keepLyrics = true,
    tidyPunctuation: tidy = true,
  } = options;

  let text = line.trim();
  if (!text) return '';

  // 1. Lineas que son solo una anotacion.
  if (stripAnnotations && isAnnotationLine(text)) {
    const lyrics = stripMusicSymbols(text);
    if (keepLyrics && MUSIC_SYMBOLS.test(text) && lyrics.replace(/[\s,.!?]/g, '').length > 2) {
      text = lyrics;
    } else {
      return '';
    }
  } else if (MUSIC_SYMBOLS.test(text)) {
    // 2. Dialogo cantado: se quitan los simbolos y se queda la letra.
    text = keepLyrics ? stripMusicSymbols(text) : '';
  }

  if (!text) return '';

  // 3. Etiqueta de hablante entre corchetes/parentesis al principio.
  if (stripSpeakers) {
    const label = LEADING_LABEL.exec(text);
    const inner = (label?.[1] ?? label?.[2] ?? '').trim();
    const rest = (label?.[3] ?? '').trim();
    if (label && rest && inner && (ANNOTATION_PATTERN.test(inner) || looksLikeSpeakerName(inner, true))) {
      text = rest;
    }
  }

  // 4. «NOMBRE: dialogo».
  if (stripSpeakers && text) {
    const match = SPEAKER.exec(text);
    const name = match?.groups?.['name'] ?? '';
    const rest = (match?.groups?.['rest'] ?? '').trim();
    const marked = Boolean(match?.groups?.['mark']);
    if (match && name && looksLikeSpeakerName(name, marked)) {
      text = rest;
    }
  }

  // 5. Anotaciones intercaladas entre dialogos.
  if (stripAnnotations && text) {
    text = text.replace(/(\[|\()[^\]\)]{0,48}(\]|\))/g, (candidate) =>
      ANNOTATION_PATTERN.test(candidate) || WRAPPED.test(candidate) ? ' ' : candidate,
    );
  }

  return tidy ? tidyPunctuation(text) : text.trim();
}

/** Limpia el texto completo (varias lineas) y devuelve solo las que aportan. */
export function cleanSdhText(text: string, options: SdhOptions = {}): string {
  return text
    .split(/\r?\n/)
    .map((line) => cleanSdhLine(line, options))
    .filter(Boolean)
    .join('\n');
}

/** Limpia una lista de cues, descartando las que se quedan vacias. */
export function cleanSdhCues(cues: Cue[], options: SdhOptions = {}): Cue[] {
  const result: Cue[] = [];
  for (const cue of cues) {
    const lines = cue.lines
      .map((line) => cleanSdhLine(line, options))
      .filter(Boolean);
    if (lines.length) result.push({ ...cue, lines });
  }
  return result;
}

/**
 * true si el fichero parece SDH (tiene anotaciones o hablantes).
 * Sirve para ofrecer el ajuste solo cuando aporta algo y para marcar la pista
 * como «SDH» en el selector de subtitulos.
 */
export function looksLikeSdh(cues: Cue[]): boolean {
  const sample = cues.slice(0, 400);
  if (!sample.length) return false;
  let hits = 0;
  let lines = 0;
  for (const cue of sample) {
    for (const line of cue.lines) {
      lines += 1;
      if (isAnnotationLine(line)) {
        hits += 1;
      } else {
        const match = SPEAKER.exec(line);
        if (match && looksLikeSpeakerName(match.groups?.['name'] ?? '', Boolean(match.groups?.['mark']))) hits += 1;
      }
      if (hits >= 3) return true;
    }
  }
  // Ficheros cortos (un capitulo de anime con dos anotaciones) no llegan al
  // umbral absoluto: si las marcas son una proporcion alta del dialogo, es SDH.
  return hits > 0 && hits / lines >= 0.15;
}
