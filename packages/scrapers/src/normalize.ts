/**
 * Normalizacion de los scrapers: comparacion de titulos, deteccion de
 * calidad y conversion al formato de stream del protocolo Stremio.
 */

import type { ScrapedSource } from './types.js';

/** Normaliza un titulo para comparar: sin acentos, sin puntuacion, en minusculas. */
export function normalizeTitle(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Extrae el año de un texto ("(1999)", "1999", "Movie 1999"). */
export function extractYear(text: string): number | undefined {
  const match = /(19\d{2}|20\d{2})/.exec(text);
  return match ? Number(match[1]) : undefined;
}

/**
 * Indica si dos titulos son el mismo.
 *
 * Se compara la forma normalizada y se acepta una diferencia de un token
 * (por ejemplo "The Matrix" vs "Matrix"), que es como funcionan los titulos
 * en los sitios de peliculas.
 */
export function titleMatches(left: string, right: string): boolean {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const tokensA = a.split(' ').filter(Boolean);
  const tokensB = b.split(' ').filter(Boolean);
  if (!tokensA.length || !tokensB.length) return false;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const shared = [...setA].filter((token) => setB.has(token)).length;
  const smaller = Math.min(setA.size, setB.size);
  // Comparten casi todos los tokens y solo se diferencian en el articulo.
  return shared >= smaller - 1 && shared >= Math.max(1, smaller - 1);
}

/** Orden de calidad: de mejor a peor. */
const QUALITY_RANK: Record<string, number> = {
  '4k': 8,
  '2160p': 8,
  '1440p': 7,
  '1080p': 6,
  '720p': 5,
  '480p': 4,
  '360p': 3,
  '240p': 2,
  hd: 5,
  sd: 2,
};

/** Devuelve la puntuacion de una calidad (0 si no se conoce). */
export function qualityRank(quality: string | undefined): number {
  if (!quality) return 0;
  return QUALITY_RANK[quality.toLowerCase()] ?? 0;
}

/** Formato del stream del protocolo Stremio. */
export interface StremioStream {
  name?: string;
  title?: string;
  description?: string;
  url?: string;
  infoHash?: string;
  fileIdx?: number;
  sources?: string[];
  subtitles?: Array<{ id?: string; url: string; lang: string }>;
  behaviorHints?: {
    notWebReady?: boolean;
    proxyHeaders?: { request?: Record<string, string> };
    bingeGroup?: string;
    videoSize?: number;
    filename?: string;
  };
  [key: string]: unknown;
}

/** Convierte una fuente raspeada en un stream del protocolo Stremio. */
export function toStremioStream(source: ScrapedSource): StremioStream {
  const quality = source.quality ? ` · ${source.quality}` : '';
  const label = source.label ?? `${source.provider}${quality}`;
  const stream: StremioStream = {
    name: label,
    title: label,
    description: `Origen nativo · ${source.provider}${quality}`,
    url: source.url,
  };

  if (source.infoHash) {
    stream.infoHash = source.infoHash;
    delete stream.url;
  }
  if (source.size) {
    stream.behaviorHints = { ...(stream.behaviorHints ?? {}), videoSize: source.size };
  }
  if (source.headers) {
    stream.behaviorHints = {
      ...(stream.behaviorHints ?? {}),
      proxyHeaders: { request: source.headers },
    };
  }
  if (source.subtitles?.length) {
    stream.subtitles = source.subtitles.map((subtitle) => ({
      url: subtitle.url,
      lang: subtitle.language,
      id: subtitle.label ? `${subtitle.language}:${subtitle.label}` : subtitle.language,
    }));
  }
  return stream;
}

/**
 * Deduplica y ordena las fuentes.
 *
 * Se eliminan las URLs repetidas (mismo enlace de dos proveedores) y se
 * ordenan por calidad, dejando al final las que no declaran calidad.
 */
export function mergeSources(sources: ScrapedSource[]): ScrapedSource[] {
  const byUrl = new Map<string, ScrapedSource>();
  for (const source of sources) {
    if (!source.url) continue;
    const existing = byUrl.get(source.url);
    if (!existing) {
      byUrl.set(source.url, source);
      continue;
    }
    // Mismo enlace: se conserva el que aporta mas informacion.
    byUrl.set(source.url, {
      ...existing,
      quality: existing.quality ?? source.quality,
      size: existing.size ?? source.size,
      headers: existing.headers ?? source.headers,
      subtitles: existing.subtitles?.length ? existing.subtitles : source.subtitles,
    });
  }
  return [...byUrl.values()].sort((a, b) => {
    const rank = qualityRank(b.quality) - qualityRank(a.quality);
    if (rank !== 0) return rank;
    return (b.size ?? 0) - (a.size ?? 0);
  });
}
