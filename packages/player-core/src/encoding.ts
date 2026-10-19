/**
 * Deteccion de codificacion de ficheros de subtitulos.
 *
 * Los addons y OpenSubtitles sirven ficheros en cualquier codificacion:
 * UTF-8 con o sin BOM, UTF-16, windows-1252 (latin), windows-1256 (arabe),
 * windows-1251 (cirilico)... Cuando se asume UTF-8, el arabe o el cirilico se
 * ven como basura (el fallo que WuPlay corrigio en v0.9.0: «Some Arabic
 * subtitles display gibberish»). NuvioTV tiene su propio `SubtitleCharsetDetector`.
 *
 * Estrategia (barata y sin dependencias):
 *  1. BOM → decision inmediata.
 *  2. UTF-8 estricto: si decodifica sin errores, es UTF-8 (el 95 % de casos).
 *  3. Si falla, se puntuan los candidatos por el idioma declarado y por la
 *     forma de los bytes altos, y se decodifica con el ganador.
 */

/** Codificaciones candidatas y su etiqueta para `TextDecoder`. */
export interface CharsetCandidate {
  /** Etiqueta aceptada por `TextDecoder` (WHATWG encoding). */
  label: string;
  /** Nombre legible para la interfaz. */
  name: string;
  /** Idiomas para los que es la codificacion habitual. */
  languages: string[];
  /** Rangos de bytes altos tipicos de esta codificacion. */
  highBytes: Array<[number, number]>;
}

export const CHARSET_CANDIDATES: CharsetCandidate[] = [
  {
    label: 'windows-1252',
    name: 'Latin-1 (windows-1252)',
    languages: ['es', 'en', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi', 'ca', 'eu', 'gl'],
    highBytes: [[0xc0, 0xff]],
  },
  {
    label: 'windows-1256',
    name: 'Arabe (windows-1256)',
    languages: ['ar', 'fa', 'ur', 'ps', 'ku'],
    highBytes: [[0xc0, 0xff], [0x80, 0xbf]],
  },
  {
    label: 'windows-1251',
    name: 'Cirilico (windows-1251)',
    languages: ['ru', 'bg', 'sr', 'uk', 'mk', 'be'],
    highBytes: [[0xc0, 0xff]],
  },
  {
    label: 'windows-1253',
    name: 'Griego (windows-1253)',
    languages: ['el'],
    highBytes: [[0xc0, 0xff]],
  },
  {
    label: 'windows-1255',
    name: 'Hebreo (windows-1255)',
    languages: ['he', 'iw'],
    highBytes: [[0xc0, 0xff]],
  },
  {
    label: 'iso-8859-7',
    name: 'ISO 8859-7',
    languages: ['el'],
    highBytes: [[0xc0, 0xff]],
  },
  {
    label: 'windows-874',
    name: 'Tailandes (windows-874)',
    languages: ['th'],
    highBytes: [[0xa0, 0xff]],
  },
  {
    label: 'windows-1250',
    name: 'Europa central (windows-1250)',
    languages: ['pl', 'cs', 'sk', 'sl', 'hr', 'hu', 'ro'],
    highBytes: [[0xc0, 0xff]],
  },
  {
    label: 'windows-1254',
    name: 'Turco (windows-1254)',
    languages: ['tr', 'az'],
    highBytes: [[0xc0, 0xff]],
  },
  {
    label: 'windows-1258',
    name: 'Vietnamita (windows-1258)',
    languages: ['vi'],
    highBytes: [[0xc0, 0xff]],
  },
];

export interface DecodeResult {
  text: string;
  /** Codificacion usada. */
  encoding: string;
  /** true si se tuvo que adivinar (no era UTF-8 valido). */
  guessed: boolean;
}

/** Normaliza un idioma a su subetiqueta primaria (`es-ES` → `es`). */
function primaryLanguage(language?: string): string {
  return (language ?? '').toLowerCase().replace('_', '-').split('-')[0] ?? '';
}

/** Cuenta bytes altos y los clasifica por rangos. */
function histogram(bytes: Uint8Array): { high: number; ranges: Map<number, number>; total: number } {
  const ranges = new Map<number, number>();
  let high = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index] ?? 0;
    if (byte < 0x80) continue;
    high += 1;
    const bucket = Math.floor(byte / 16);
    ranges.set(bucket, (ranges.get(bucket) ?? 0) + 1);
  }
  return { high, ranges, total: bytes.length };
}

/** Detecta y quita el BOM si existe. */
export function stripBom(bytes: Uint8Array): { bytes: Uint8Array; encoding?: string } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { bytes: bytes.subarray(3), encoding: 'utf-8' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { bytes: bytes.subarray(2), encoding: 'utf-16le' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { bytes: bytes.subarray(2), encoding: 'utf-16be' };
  }
  return { bytes };
}

/** true si los bytes son UTF-8 valido (sin usar `TextDecoder` fatal, mas rapido). */
export function isValidUtf8(bytes: Uint8Array): boolean {
  let index = 0;
  while (index < bytes.length) {
    const byte = bytes[index] ?? 0;
    if (byte < 0x80) {
      index += 1;
      continue;
    }
    let extra = 0;
    let lower = 0x80;
    let upper = 0xbf;
    if ((byte & 0xe0) === 0xc0) extra = 1;
    else if ((byte & 0xf0) === 0xe0) extra = 2;
    else if ((byte & 0xf8) === 0xf0) { extra = 3; upper = 0x8f; }
    else return false;

    if (byte === 0xc0 || byte === 0xc1 || byte > 0xf4) return false;
    if (index + extra >= bytes.length) return false;

    for (let step = 1; step <= extra; step += 1) {
      const next = bytes[index + step] ?? 0;
      const lo = step === 1 ? lower : 0x80;
      const hi = step === 1 ? upper : 0xbf;
      if (next < lo || next > hi) return false;
    }
    // Overlong encodings.
    if (extra === 1 && byte < 0xc2) return false;
    index += extra + 1;
    lower = 0x80;
    upper = 0xbf;
  }
  return true;
}

/** Puntuacion de un candidato segun el histograma de bytes altos. */
function scoreCandidate(candidate: CharsetCandidate, stats: ReturnType<typeof histogram>, wanted: string): number {
  const buckets = new Set<number>();
  for (const [from, to] of candidate.highBytes) {
    for (let byte = from; byte <= to; byte += 16) buckets.add(Math.floor(byte / 16));
    buckets.add(Math.floor(to / 16));
  }
  let hits = 0;
  for (const bucket of buckets) hits += stats.ranges.get(bucket) ?? 0;
  const languageBonus = candidate.languages.includes(wanted) ? 100 : 0;
  // El histograma solo desempata: la pista de idioma manda cuando existe.
  return languageBonus + hits / Math.max(buckets.size, 1);
}

/**
 * Decide la codificacion mas probable.
 *
 * @param bytes    contenido del fichero
 * @param language idioma declarado por el addon o el usuario (mejora mucho el
 *                 acierto en arabe, cirilico, griego o hebreo)
 */
export function detectCharset(bytes: Uint8Array, language?: string): string {
  const { bytes: clean, encoding } = stripBom(bytes);
  if (encoding) return encoding;
  if (isValidUtf8(clean)) return 'utf-8';

  const stats = histogram(clean);
  const wanted = primaryLanguage(language);

  let best: CharsetCandidate | undefined;
  let bestScore = -Infinity;
  for (const candidate of CHARSET_CANDIDATES) {
    const score = scoreCandidate(candidate, stats, wanted);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best?.label ?? 'windows-1252';
}

/**
 * Decodifica un fichero de subtitulos a texto.
 *
 * `TextDecoder` con etiquetas legacy esta disponible en Node (ICU completo) y
 * en los navegadores; si alguna no existe se degrada a latin1 sin romper.
 */
export function decodeSubtitle(bytes: Uint8Array, language?: string): DecodeResult {
  const { bytes: clean, encoding } = stripBom(bytes);
  const guessedFrom = encoding ?? (isValidUtf8(clean) ? 'utf-8' : detectCharset(clean, language));
  const tried: string[] = [guessedFrom, 'utf-8', 'windows-1252'];

  for (const label of tried) {
    try {
      const decoder = new TextDecoder(label, { fatal: label === guessedFrom });
      const text = decoder.decode(clean);
      return { text: text.replace(/^\uFEFF/, ''), encoding: label, guessed: label !== 'utf-8' };
    } catch {
      // Se prueba el siguiente candidato.
    }
  }

  return {
    text: new TextDecoder('utf-8').decode(clean),
    encoding: 'utf-8',
    guessed: true,
  };
}

/**
 * Convierte el mojibake habitual (latin1 leido como UTF-8) a su forma correcta.
 *
 * Se usan escapes para que la tabla no dependa de la codificacion del fichero.
 */
export function repairMojibake(text: string): string {
  const pairs: Array<[string, string]> = [
    ['\u00c3\u00a1', '\u00e1'], // á
    ['\u00c3\u00a9', '\u00e9'], // é
    ['\u00c3\u00ad', '\u00ed'], // í
    ['\u00c3\u00b3', '\u00f3'], // ó
    ['\u00c3\u00ba', '\u00fa'], // ú
    ['\u00c3\u00b1', '\u00f1'], // ñ
    ['\u00c3\u00bc', '\u00fc'], // ü
    ['\u00c3\u20ac', '\u00c1'], // Á
    ['\u00c3\u2030', '\u00c9'], // É
    ['\u00c3\u201d', '\u00d3'], // Ó
    ['\u00c3\u201a', '\u00da'], // Ú
    ['\u00c3\u2018', '\u00d1'], // Ñ
    ['\u00c2\u00bf', '\u00bf'], // ¿
    ['\u00c2\u00a1', '\u00a1'], // ¡
    ['\u00e2\u20ac\u2122', '\u2019'], // ’
    ['\u00e2\u20ac\u0153', '\u201c'], // “
    ['\u00e2\u20ac\u009d', '\u201d'], // ”
    ['\u00e2\u20ac\u201c', '\u2013'], // –
    ['\u00e2\u20ac\u201d', '\u2014'], // —
    ['\u00e2\u20ac\u00a6', '\u2026'], // …
    ['\u00c3\u201e\u00c2', ''],
    ['\u00c3\u2013', '\u00d3'],
    ['\u00c2\u00a0', ' '],
  ];
  let result = text;
  for (const [from, to] of pairs) {
    const pattern = from.replace(/\\u([0-9a-f]{4})/gi, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
    result = result.split(pattern).join(to);
  }
  return result;
}

/** true si el texto tiene pinta de estar mal decodificado. */
export function hasMojibake(text: string): boolean {
  return /[\u00c3\u00c2][\u0080-\u00ff]/.test(text) || /\u00e2\u20ac/.test(text);
}
