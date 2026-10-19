/**
 * Lectura y escritura de subtitulos.
 *
 * Se soportan los dos formatos que usan los addons y OpenSubtitles:
 *  - **SRT** (`1\n00:00:01,000 --> 00:00:03,000\nTexto`)
 *  - **WebVTT** (`WEBVTT` + `00:00:01.000 --> 00:00:03.000`)
 *
 * Todo es logica pura: se puede testear en la JVM/Node sin red.
 */

/** Un subtitulo con sus marcas de tiempo. */
export interface SubtitleCue {
  /** Inicio en milisegundos. */
  startMs: number;
  /** Fin en milisegundos. */
  endMs: number;
  /** Texto (sin saltos de linea). */
  text: string;
}

/** Formatos de subtitulo soportados. */
export type SubtitleFormat = 'srt' | 'vtt';

/** Convierte `HH:MM:SS,mmm` o `MM:SS.mmm` a milisegundos. */
export function parseTimestamp(value: string): number {
  const clean = value.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.some((part) => part === '' || Number.isNaN(Number(part)))) return 0;
  const numbers = parts.map((part) => Number(part));
  const seconds = numbers.pop() ?? 0;
  const minutes = numbers.pop() ?? 0;
  const hours = numbers.pop() ?? 0;
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

/** Formatea milisegundos como `HH:MM:SS.mmm` (WebVTT). */
export function formatTimestamp(millis: number): string {
  const safe = Math.max(0, Math.round(millis));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const ms = safe % 1000;
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(ms, 3)}`;
}

/** Detecta el formato de un texto de subtitulos. */
export function detectFormat(text: string): SubtitleFormat {
  return /^\s*WEBVTT/i.test(text) ? 'vtt' : 'srt';
}

/**
 * Parsea un texto de subtitulos (SRT o WebVTT).
 *
 * Es tolerante: ignora las cabeceras (`WEBVTT`, `NOTE`, `STYLE`), las
 * numeraciones de SRT y las etiquetas HTML dentro del texto.
 */
export function parseSubtitles(text: string, format?: SubtitleFormat): SubtitleCue[] {
  if (!text.trim()) return [];
  const kind = format ?? detectFormat(text);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const cues: SubtitleCue[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    // Cabeceras y bloques que no contienen tiempos.
    if (!trimmed || /^(WEBVTT|NOTE|STYLE|REGION)\b/i.test(trimmed)) {
      index += 1;
      continue;
    }
    // Numeracion de SRT: se salta si la linea siguiente es un tiempo.
    if (/^\d+$/.test(trimmed) && /\d{2}:\d{2}:\d{2}[.,]\d{1,3}\s*-->/.test(lines[index + 1] ?? '')) {
      index += 1;
      continue;
    }

    const arrow = trimmed.indexOf('-->');
    if (arrow === -1) {
      index += 1;
      continue;
    }

    const start = parseTimestamp(trimmed.slice(0, arrow));
    const endPart = trimmed.slice(arrow + 3).trim().split(/\s+/)[0] ?? '';
    const end = parseTimestamp(endPart);

    index += 1;
    const textLines: string[] = [];
    while (index < lines.length) {
      const current = (lines[index] ?? '').trim();
      if (current === '' || /^\d+$/.test(current) || current.includes('-->')) break;
      textLines.push(current);
      index += 1;
    }

    const content = textLines
      .map((value) => value.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    if (content) {
      cues.push({ startMs: start, endMs: end, text: content });
    }
  }

  return kind === 'vtt' ? cues : cues.sort((a, b) => a.startMs - b.startMs);
}

/** Convierte una lista de subtitulos a WebVTT (lo que consumen los navegadores y ExoPlayer). */
export function toWebVtt(cues: SubtitleCue[]): string {
  const blocks = cues.map(
    (cue) =>
      `${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}\n${cue.text}`,
  );
  return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
}

/** Convierte una lista de subtitulos a SRT. */
export function toSrt(cues: SubtitleCue[]): string {
  const blocks = cues.map((cue, index) => {
    const stamp = (millis: number) => {
      const safe = Math.max(0, Math.round(millis));
      const hours = Math.floor(safe / 3_600_000);
      const minutes = Math.floor((safe % 3_600_000) / 60_000);
      const seconds = Math.floor((safe % 60_000) / 1000);
      const ms = safe % 1000;
      const pad = (value: number, size = 2) => String(value).padStart(size, '0');
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(ms, 3)}`;
    };
    return `${index + 1}\n${stamp(cue.startMs)} --> ${stamp(cue.endMs)}\n${cue.text}\n`;
  });
  return `${blocks.join('\n')}`;
}
