/**
 * Subtitulos en el reproductor: modelo de cues, parsing y renderizado.
 *
 * Por que el reproductor parsea los subtitulos en vez de usar `<track>`:
 *  - `<track>` solo acepta WebVTT y exige CORS del servidor que los sirve; la
 *    mayoria de addons sirven SRT desde CDNs sin cabeceras CORS.
 *  - No permite aplicar un **desfase** (Stremio usa G/H para eso) ni estilos
 *    propios (tamano, color, opacidad, fondo) de forma consistente.
 *  - No permite limpiar el SDH ("[musica]", "JUAN: ...") en el cliente.
 *
 * Aqui vive la logica pura: parsear, buscar la cue activa (busqueda binaria,
 * hay ficheros con miles), desplazar en el tiempo y serializar de nuevo.
 */

/** Una linea de dialogo con sus marcas de tiempo. */
export interface Cue {
  /** Identificador del bloque (WebVTT/SRT), si existe. */
  id?: string;
  startMs: number;
  endMs: number;
  /** Lineas de texto ya limpias (sin etiquetas ni cabeceras). */
  lines: string[];
  /** Posicion/alineamiento declarado (`line:90% position:50%`). */
  settings?: string;
}

/** Formatos de fichero de subtitulos reconocidos. */
export type SubtitleFormat = 'vtt' | 'srt' | 'ass' | 'ssa' | 'unknown';

/** Milisegundos de tolerancia al buscar la cue activa. */
const ACTIVE_TOLERANCE_MS = 120;

/** Detecta el formato por el contenido (no por la extension). */
export function detectSubtitleFormat(text: string): SubtitleFormat {
  const head = text.slice(0, 512).replace(/^\uFEFF/, '');
  if (/^\s*WEBVTT/i.test(head)) return 'vtt';
  if (/\[Script Info\]/i.test(head) || /^\s*Dialogue:/im.test(head)) {
    return /\[V4\+ Styles\]/i.test(head) ? 'ass' : 'ssa';
  }
  if (/^\s*\d+\s*\r?\n\s*\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}\s*-->/m.test(head)) return 'srt';
  if (/\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}\s*-->/m.test(head)) return 'srt';
  return 'unknown';
}

/** Convierte `HH:MM:SS,mmm`, `MM:SS.mmm` o `H:MM:SS.cc` a milisegundos. */
export function parseTimestamp(value: string): number {
  const clean = value.trim().replace(',', '.');
  const parts = clean.split(':');
  if (!parts.length) return 0;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((entry) => Number.isNaN(entry))) return 0;
  const seconds = numbers.pop() ?? 0;
  const minutes = numbers.pop() ?? 0;
  const hours = numbers.pop() ?? 0;
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

/** Formatea milisegundos como `HH:MM:SS.mmm`. */
export function formatTimestamp(millis: number, separator = '.'): string {
  const safe = Math.max(0, Math.round(millis));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const ms = safe % 1000;
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${pad(ms, 3)}`;
}

/** Quita etiquetas (`<i>`, `{\\an8}`, `<c.yellow>`) y normaliza espacios. */
export function cleanCueLine(line: string): string {
  return line
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/<\/?(?:b|i|u|font|c|v|lang|ruby|rt)[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();
}

/**
 * Parsea WebVTT o SRT conservando los saltos de linea.
 *
 * Es deliberadamente tolerante: cabeceras `NOTE`/`STYLE`/`REGION`, numeracion
 * SRT ausente, tiempos con coma o punto, marcas de posicion y BOM.
 */
export function parseCues(text: string): Cue[] {
  const format = detectSubtitleFormat(text);
  if (format === 'ass' || format === 'ssa') return parseAssCues(text);
  if (format === 'unknown' && !text.includes('-->')) return [];

  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const cues: Cue[] = [];
  let index = 0;
  let pendingId: string | undefined;

  while (index < lines.length) {
    const raw = lines[index] ?? '';
    const line = raw.trim();

    if (!line || /^(WEBVTT|NOTE|STYLE|REGION|Kind:|Language:)\b/i.test(line)) {
      index += 1;
      continue;
    }

    // Identificador del bloque: la linea anterior al tiempo (no numerica SRT).
    if (!line.includes('-->') && (lines[index + 1] ?? '').includes('-->')) {
      if (!/^\d+$/.test(line)) pendingId = line;
      index += 1;
      continue;
    }
    if (/^\d+$/.test(line) && (lines[index + 1] ?? '').includes('-->')) {
      index += 1;
      continue;
    }

    const arrow = line.indexOf('-->');
    if (arrow === -1) {
      index += 1;
      continue;
    }

    const startMs = parseTimestamp(line.slice(0, arrow));
    const rest = line.slice(arrow + 3).trim();
    const [endPart, ...settingsParts] = rest.split(/\s+/);
    const endMs = parseTimestamp(endPart ?? '');
    const settings = settingsParts.join(' ').trim();

    index += 1;
    const textLines: string[] = [];
    while (index < lines.length) {
      const current = (lines[index] ?? '').trim();
      if (!current || current.includes('-->')) break;
      textLines.push(current);
      index += 1;
    }

    const cleaned = textLines.map((entry) => cleanCueLine(entry)).filter(Boolean);
    if (!cleaned.length) continue;
    cues.push({
      ...(pendingId ? { id: pendingId } : {}),
      startMs,
      endMs: Math.max(endMs, startMs + 1),
      lines: cleaned,
      ...(settings ? { settings } : {}),
    });
    pendingId = undefined;
  }

  return cues.sort((a, b) => a.startMs - b.startMs);
}

/** Convierte las cues a WebVTT (lo que entienden los navegadores y ExoPlayer). */
export function cuesToVtt(cues: Cue[]): string {
  const blocks = cues.map((cue) => {
    const head = `${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}${
      cue.settings ? ` ${cue.settings}` : ''
    }`;
    return `${cue.id ? `${cue.id}\n` : ''}${head}\n${cue.lines.join('\n')}`;
  });
  return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
}

/** Convierte las cues a SRT (util para exportar o para clientes antiguos). */
export function cuesToSrt(cues: Cue[]): string {
  return `${cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatTimestamp(cue.startMs, ',')} --> ${formatTimestamp(cue.endMs, ',')}\n${cue.lines.join('\n')}\n`,
    )
    .join('\n')}`;
}

/** Desplaza todas las cues (desfase de subtitulos, negativo = adelantar). */
export function shiftCues(cues: Cue[], offsetMs: number): Cue[] {
  if (!offsetMs) return cues;
  return cues.map((cue) => ({
    ...cue,
    startMs: Math.max(0, cue.startMs + offsetMs),
    endMs: Math.max(1, cue.endMs + offsetMs),
  }));
}

/**
 * Indice de la primera cue cuyo inicio es mayor o igual que `timeMs`.
 * Busqueda binaria: con 5 000 cues la busqueda lineal se nota en TV.
 */
export function lowerBound(cues: Cue[], timeMs: number): number {
  let low = 0;
  let high = cues.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((cues[middle]?.startMs ?? 0) < timeMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Cues visibles en un instante (normalmente 0, 1 o 2 por dialogos solapados). */
export function activeCues(cues: Cue[], timeMs: number, toleranceMs = ACTIVE_TOLERANCE_MS): Cue[] {
  if (!cues.length || !Number.isFinite(timeMs)) return [];
  const from = lowerBound(cues, timeMs - toleranceMs);
  const result: Cue[] = [];
  // Se retrocede un poco: una cue puede haber empezado antes del punto actual.
  for (let index = Math.max(0, from - 1); index < cues.length; index += 1) {
    const cue = cues[index];
    if (!cue) continue;
    if (cue.startMs > timeMs + toleranceMs) break;
    if (cue.startMs <= timeMs + toleranceMs && cue.endMs >= timeMs - toleranceMs) result.push(cue);
  }
  return result;
}

/** Texto plano de una cue (para busquedas y para el panel de depuracion). */
export function cueText(cue: Cue): string {
  return cue.lines.join(' ');
}

/** Duracion total cubierta por subtitulos (util para detectar pistas vacias). */
export function coverageMs(cues: Cue[]): number {
  return cues.reduce((total, cue) => total + Math.max(0, cue.endMs - cue.startMs), 0);
}

// ------------------------------------------------------------------ SSA / ASS

/**
 * Parsea SSA/ASS a cues.
 *
 * Los addons de anime sirven ASS con frecuencia. Se conservan solo los
 * dialogos (`Dialogue:`), se descartan los comentarios y los estilos, y se
 * limpian las etiquetas de override (`{\an8}`, `{\pos(...)}`, `{\c&H..&}`).
 */
export function parseAssCues(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!/^Dialogue:/i.test(line)) continue;
    const body = line.slice('Dialogue:'.length);
    const fields = body.split(',');
    if (fields.length < 10) continue;
    const startMs = parseTimestamp((fields[1] ?? '').trim());
    const endMs = parseTimestamp((fields[2] ?? '').trim());
    const content = fields.slice(9).join(',');
    const lines = content
      .split(/\\N|\\n/)
      .map((entry) => cleanCueLine(entry))
      .filter(Boolean);
    if (!lines.length) continue;
    cues.push({ startMs, endMs: Math.max(endMs, startMs + 1), lines });
  }
  return cues.sort((a, b) => a.startMs - b.startMs);
}
