/**
 * Normalizacion de subtitulos de cualquier origen a lo que el reproductor necesita.
 *
 * Los addons y OpenSubtitles sirven ficheros en SRT, ASS/SSA o WebVTT, en
 * cualquier codificacion (UTF-8, latin1, windows-1252, windows-1256 para
 * arabe...). Un `<track src="...">` nativo solo entiende WebVTT **y** UTF-8, y
 * ademas depende de que el origen permita CORS: por eso la web y el APK piden
 * los subtitulos a través de este proxy, que devuelve WebVTT listo para usar o
 * las cues en JSON para el renderizador propio (el unico que permite desfase,
 * Clean SDH y estilos en vivo).
 *
 * El trabajo pesado lo hace `@vibeflix/player-core`, que comparten el servidor
 * y el cliente: así las reglas de detección de juego de caracteres, Clean SDH y
 * conversión de formatos son exactamente las mismas en los dos lados.
 */

import {
  cleanSdhCues,
  cuesToVtt,
  decodeSubtitle,
  detectSubtitleFormat,
  hasMojibake,
  looksLikeSdh,
  parseAssCues,
  parseCues,
  repairMojibake,
  shiftCues,
  type Cue,
  type SubtitleFormat,
} from '@vibeflix/player-core';

export interface SubtitleTransformOptions {
  /** Bytes del fichero tal y como los sirvio el origen. */
  bytes: Uint8Array;
  /** Idioma declarado (ayuda a elegir el juego de caracteres). */
  language?: string;
  /** Aplicar Clean SDH (quitar hablantes y anotaciones). */
  cleanSdh?: boolean;
  /** Desfase en milisegundos (positivo = retrasar). */
  offsetMs?: number;
}

export interface SubtitleTransformResult {
  /** Cues normalizadas, ordenadas por tiempo. */
  cues: Cue[];
  /** WebVTT equivalente. */
  vtt: string;
  /** Codificacion detectada. */
  encoding: string;
  /** true si la codificacion se tuvo que adivinar. */
  guessedEncoding: boolean;
  /** Formato del fichero de origen. */
  sourceFormat: SubtitleFormat;
  /** true si el fichero parecia SDH (antes de limpiarlo). */
  sdh: boolean;
  /** true si se reparo texto mal decodificado (mojibake). */
  repaired: boolean;
}

/**
 * Convierte unos bytes de subtitulos en cues + WebVTT.
 *
 * Orden de las operaciones: decodificar (con deteccion de juego de caracteres)
 * → reparar mojibake si aun queda → parsear segun el formato → Clean SDH →
 * desfase. El desfase va al final para que el usuario pueda ajustarlo sin
 * perder la limpieza aplicada.
 */
export function transformSubtitle(options: SubtitleTransformOptions): SubtitleTransformResult {
  const decoded = decodeSubtitle(options.bytes, options.language);
  let text = decoded.text;
  const repaired = hasMojibake(text);
  if (repaired) text = repairMojibake(text);

  const sourceFormat = detectSubtitleFormat(text);
  const cues = sourceFormat === 'ass' || sourceFormat === 'ssa' ? parseAssCues(text) : parseCues(text);
  const sdh = looksLikeSdh(cues);

  const cleaned = options.cleanSdh ? cleanSdhCues(cues) : cues;
  const shifted = options.offsetMs ? shiftCues(cleaned, options.offsetMs) : cleaned;
  const sorted = [...shifted].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  return {
    cues: sorted,
    vtt: cuesToVtt(sorted),
    encoding: decoded.encoding,
    guessedEncoding: decoded.guessed,
    sourceFormat,
    sdh,
    repaired,
  };
}

/** Idioma declarado en la pista, normalizado a subetiqueta primaria. */
export function normalizeSubtitleLanguage(language?: string): string {
  return (language ?? '').toLowerCase().replace('_', '-').split('-')[0] ?? '';
}
