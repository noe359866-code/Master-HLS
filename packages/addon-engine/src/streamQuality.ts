/**
 * Heuristica de calidad para ordenar streams.
 *
 * No existe un campo estandar en el protocolo Stremio: la calidad va en el
 * nombre del stream ("Torrentio 4K Dolby Vision"), asi que se extrae de ahi.
 * El objetivo es que el mejor stream quede primero sin depender del addon.
 */

export interface StreamQuality {
  /** Altura vertical en píxeles (2160, 1080, ...). 0 si no se detecta. */
  height: number;
  /** Codec detectado: h264, hevc, av1, vp9... */
  codec?: string;
  /** HDR/DV: true si el stream anuncia HDR o Dolby Vision. */
  hdr: boolean;
  /** Dolby Vision. */
  dolbyVision: boolean;
  /** Audio multicanal (5.1, 7.1, Atmos...). */
  atmos: boolean;
  /** El stream es una copia en cache (debrid). */
  cached: boolean;
  /** Puntuacion final, mayor es mejor. */
  score: number;
}

const RESOLUTION_PATTERNS: Array<[RegExp, number]> = [
  [/\b(2160p|4k|uhd)\b/i, 2160],
  [/\b1440p\b/i, 1440],
  [/\b(1080p|1080i|fullhd|fhd)\b/i, 1080],
  [/\b720p\b/i, 720],
  [/\b(576p|540p)\b/i, 540],
  [/\b(480p|sd)\b/i, 480],
  [/\b360p\b/i, 360],
];

const CODEC_PATTERNS: Array<[RegExp, string]> = [
  [/\b(hevc|h\.?265|x265)\b/i, 'hevc'],
  [/\b(av1)\b/i, 'av1'],
  [/\b(vp9)\b/i, 'vp9'],
  [/\b(h\.?264|avc|x264)\b/i, 'h264'],
];

export function parseStreamQuality(name: string): StreamQuality {
  const text = name ?? '';
  let height = 0;
  for (const [pattern, value] of RESOLUTION_PATTERNS) {
    if (pattern.test(text)) {
      height = value;
      break;
    }
  }

  let codec: string | undefined;
  for (const [pattern, value] of CODEC_PATTERNS) {
    if (pattern.test(text)) {
      codec = value;
      break;
    }
  }

  const dolbyVision = /\b(dolby\s?vision|dv\b|dovi)\b/i.test(text);
  const hdr = dolbyVision || /\b(hdr|hlg|hdr10\+|hdr10)\b/i.test(text);
  const atmos = /\b(atmos|5\.1|7\.1|eac3|ddp?5\.1)\b/i.test(text);
  const cached = /\b(cached|cache|debrid|rd|pm|premiumize|tb|torbox)\b/i.test(text);

  // HEVC/AV1 pesan mas a igual resolucion: mejor compresion a igual bitrate.
  const codecBonus = codec === 'av1' ? 120 : codec === 'hevc' ? 80 : codec === 'vp9' ? 40 : 0;
  const score =
    height * 10 +
    codecBonus +
    (dolbyVision ? 60 : 0) +
    (hdr ? 30 : 0) +
    (atmos ? 20 : 0) +
    (cached ? 50 : 0);

  return { height, codec, hdr, dolbyVision, atmos, cached, score };
}

/** Ordena streams de mejor a peor calidad (estable entre empates). */
export function sortStreamsByQuality<T extends { name?: string; title?: string }>(streams: T[]): T[] {
  return streams
    .map((stream, index) => ({
      stream,
      index,
      quality: parseStreamQuality(stream.name ?? stream.title ?? ''),
    }))
    .sort((a, b) => b.quality.score - a.quality.score || a.index - b.index)
    .map((entry) => entry.stream);
}

/** Clave de deduplicacion de streams: misma URL (+headers relevantes) = mismo stream. */
export function streamDedupeKey(stream: {
  url?: string;
  externalUrl?: string;
  ytId?: string;
  infoHash?: string;
  fileIdx?: number;
  name?: string;
  title?: string;
}): string {
  if (stream.url) return `url:${stream.url}`;
  if (stream.externalUrl) return `ext:${stream.externalUrl}`;
  if (stream.ytId) return `yt:${stream.ytId}`;
  // Torrents: el mismo hash con distinto archivo son streams distintos.
  if (stream.infoHash) return `hash:${stream.infoHash}:${stream.fileIdx ?? ''}`;
  return `name:${stream.name ?? stream.title ?? ''}`;
}
