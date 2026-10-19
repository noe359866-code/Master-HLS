/**
 * Deteccion de intros (y "previously on") a partir de los subtitulos.
 *
 * Idea: la intro de una pelicula o de un episodio casi siempre termina justo
 * antes de la primera frase de dialogo real. Los subtitulos son la unica
 * senal que el reproductor tiene de forma nativa (no hace falta Analyze API
 * ni ningun servicio externo), asi que se analizan:
 *
 *  1. Se ignoran los cues que son *carteles* (ringtones de capitulo, titulo
 *     del episodio, musicas) porque no son dialogo.
 *  2. El primer cue de dialogo real marca el final de la intro.
 *  3. Si aparece un cue de "previously on" / "anteriormente", se detecta el
 *     recap, que tambien se puede saltar.
 *
 * Cuando no hay subtitulos se usa un valor por defecto (configurable) que el
 * usuario puede ajustar desde Ajustes.
 */

import type { SubtitleCue } from './subtitles.js';

/** Segmento saltable detectado. */
export interface SkipSegment {
  /** Inicio del segmento (ms). */
  startMs: number;
  /** Fin del segmento (ms): es a donde se salta. */
  endMs: number;
  /** Tipo de segmento. */
  kind: 'intro' | 'recap';
  /** Confianza de la deteccion (0..1). */
  confidence: number;
  /** Origen de la deteccion. */
  source: 'subtitles' | 'fallback';
}

/** Opciones de la deteccion. */
export interface DetectOptions {
  /** Duracion minima de la intro para darla por valida (ms). */
  minIntroMs?: number;
  /** Duracion maxima a la que se busca la intro (ms). */
  maxIntroMs?: number;
  /** Anticipo respecto al primer dialogo (ms): evita comerse la primera frase. */
  leadMs?: number;
  /** Offset por defecto cuando no hay subtitulos (ms). */
  fallbackMs?: number;
}

/** Valores por defecto. */
export const DEFAULT_DETECT_OPTIONS: Required<DetectOptions> = {
  minIntroMs: 20_000,
  maxIntroMs: 360_000,
  leadMs: 1_500,
  fallbackMs: 90_000,
};

/** Palabras que identifican un recap ("previously on..."). */
const RECAP_PATTERN =
  /\b(previously|anteriormente|previously on|on the previous episode| recap|repaso|en el (cap[ií]tulo|episodio) anterior)\b/i;

/** Longitud minima (caracteres) para que un cue se considere una frase. */
const DIALOGUE_MIN_LENGTH = 12;

/** Separacion maxima (ms) entre dos cues para considerarlos parte de un dialogo. */
const DIALOGUE_MAX_GAP_MS = 45_000;

/** Patrones de carteles de capitulo / titulo. */
const TITLE_CARD_PATTERN =
  /^\s*(episode|ep\.?|cap[ií]tulo|chapter|part|parte|season|temporada|series|serie|film|pel[ií]cula)\b[\s\d:.-]*$/i;

/** Un cue es un cartel si es corto y no parece dialogo. */
export function isTitleCard(text: string): boolean {
  const clean = text.trim();
  if (!clean) return true;
  if (TITLE_CARD_PATTERN.test(clean)) return true;
  // Texto en mayusculas sin puntuacion: tipicamente un titulo en pantalla.
  const letters = clean.replace(/[^\p{L}]/gu, '');
  if (letters.length >= 4 && letters === letters.toUpperCase() && !/[.!?]/.test(clean)) {
    return true;
  }
  // Solo numeros o simbolos (p.ej. "1", "///", "***").
  if (!/\p{L}/u.test(clean)) return true;
  return false;
}

/**
 * Un cue tiene "forma de frase": es largo o termina en puntuacion.
 *
 * Es la senal principal de dialogo: los creditos, el titulo de la serie o la
 * letra de una cancion suelen ser cortos y sin puntuacion.
 */
export function isSentenceShaped(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;
  if (clean.length >= DIALOGUE_MIN_LENGTH) return true;
  return /[.!?…]$/.test(clean);
}

/**
 * Un cue parece dialogo real.
 *
 * Se combinan dos senales:
 *  1. Forma de frase (longitud o puntuacion final).
 *  2. Continuacion: un cue corto que sigue a otro de dialogo forma parte de
 *     la misma frase ("Voy" / "a hacerlo").
 *
 * Un cue suelto y corto (un titulo o un cartel) NO se considera dialogo: es
 * preferible saltarse la intro un poco mas tarde que cortarla antes de
 * tiempo.
 */
export function looksLikeDialogue(text: string, hasFollowUp: boolean): boolean {
  const clean = text.trim();
  if (!clean) return false;
  if (isTitleCard(clean)) return false;
  if (isRecap(clean)) return false;
  if (isSentenceShaped(clean)) return true;
  // Un cue corto y aislado es un titulo o una linea de cancion.
  return hasFollowUp;
}

/** Un cue es un recap si lo dice el texto. */
export function isRecap(text: string): boolean {
  return RECAP_PATTERN.test(text);
}

/**
 * Detecta el segmento saltable a partir de los subtitulos.
 *
 * Devuelve `null` cuando no hay senales suficientes (por ejemplo, cuando el
 * primer dialogo aparece antes de `minIntroMs`: en ese caso la pelicula
 * empieza directamente y no hay intro que saltar).
 */
export function detectSkipSegment(
  cues: SubtitleCue[],
  options: DetectOptions = {},
): SkipSegment | null {
  const config = { ...DEFAULT_DETECT_OPTIONS, ...options };
  const ordered = [...cues].sort((a, b) => a.startMs - b.startMs);
  if (!ordered.length) return null;

  const limited = ordered.filter((cue) => cue.startMs <= config.maxIntroMs);
  if (!limited.length) return null;

  // 1) Recap: "previously on..." dentro de los primeros minutos.
  const recap = limited.find(
    (cue) => cue.startMs <= 180_000 && isRecap(cue.text) && !isTitleCard(cue.text),
  );
  if (recap) {
    const endMs = Math.max(
      config.minIntroMs,
      Math.min(recap.endMs + config.leadMs, config.maxIntroMs),
    );
    if (endMs > recap.startMs) {
      return {
        startMs: 0,
        endMs,
        kind: 'recap',
        confidence: 0.75,
        source: 'subtitles',
      };
    }
  }

  // 2) Primer dialogo real: ahi termina la intro.
  //
  // Un cue cuenta como dialogo si tiene forma de frase o si continua el
  // dialogo anterior (un cue corto pegado al anterior).
  let firstDialogue: SubtitleCue | undefined;
  let previousWasDialogue = false;
  for (let index = 0; index < limited.length; index += 1) {
    const cue = limited[index]!;
    const previous = limited[index - 1];
    const continuesDialogue = Boolean(
      previousWasDialogue &&
        previous &&
        cue.startMs - previous.endMs <= DIALOGUE_MAX_GAP_MS,
    );
    if (looksLikeDialogue(cue.text, continuesDialogue)) {
      firstDialogue = cue;
      break;
    }
    previousWasDialogue = looksLikeDialogue(cue.text, false);
  }
  if (!firstDialogue) return null;

  const endMs = firstDialogue.startMs - config.leadMs;
  if (endMs < config.minIntroMs) {
    // El dialogo empieza enseguida: no hay intro (o es muy corta).
    return null;
  }

  // Confianza: mas cerca del final, mas probable es que sea la intro.
  const ratio = Math.min(1, endMs / Math.max(1, config.maxIntroMs));
  const confidence = Math.max(0.4, Math.min(0.95, 0.5 + ratio * 0.45));

  return {
    startMs: 0,
    endMs,
    kind: 'intro',
    confidence,
    source: 'subtitles',
  };
}

/**
 * Segmento por defecto cuando no hay subtitulos (o no se ha detectado nada).
 *
 * Es el clasico "saltar intro" de los reproductores: se salta el primer
 * bloque de tiempo, que es donde suelen estar los creditos o la intro.
 */
export function fallbackSkipSegment(
  durationMs: number,
  options: DetectOptions = {},
): SkipSegment {
  const config = { ...DEFAULT_DETECT_OPTIONS, ...options };
  const byDuration =
    durationMs > 0 ? Math.min(config.fallbackMs, Math.round(durationMs * 0.08)) : config.fallbackMs;
  const endMs = Math.max(5_000, byDuration);
  return {
    startMs: 0,
    endMs,
    kind: 'intro',
    confidence: 0.3,
    source: 'fallback',
  };
}

/**
 * Elige el mejor segmento disponible: el detectado por subtitulos si existe,
 * y si no, el valor por defecto.
 */
export function resolveSkipSegment(
  cues: SubtitleCue[],
  durationMs = 0,
  options: DetectOptions = {},
): SkipSegment {
  return detectSkipSegment(cues, options) ?? fallbackSkipSegment(durationMs, options);
}

/** Indica si el boton de "saltar intro" debe verse en la posicion dada. */
export function shouldShowSkip(segment: SkipSegment | null, positionMs: number): boolean {
  if (!segment) return false;
  if (positionMs < segment.startMs) return false;
  // Se oculta cuando ya se ha pasado el punto de salto.
  return positionMs < segment.endMs - 1_000;
}
