import { detectQuality, normalizeUrl, resolveEmbed } from '../embed.js';
import { normalizeTitle } from '../normalize.js';
import type { ScrapeContext, ScrapedSource } from '../types.js';

/** Año explícito al final de la ficha; no confundir títulos como «2001» con su estreno. */
export function titleYear(value: string): number | undefined {
  const year = /\(((?:19|20)\d{2})\)\s*$/.exec(value)?.[1];
  return year ? Number(year) : undefined;
}

/** Comparación conservadora para no reproducir un homónimo o una secuela. */
export function sameTitle(candidate: string, title: string, year?: number, candidateYear?: number): boolean {
  if (year && candidateYear && year !== candidateYear) return false;
  const clean = (value: string) => normalizeTitle(value.replace(/\s*\((?:19|20)\d{2}\)\s*$/, ''))
    .replace(/^(?:a|an|the|el|la|los|las|le|les|un|une|il|lo|der|die|das) /, '');
  const a = clean(candidate);
  return !!a && a === clean(title);
}

/** Bloquea destinos privados literales; el aislamiento de red/DNS del servidor sigue siendo necesario. */
export function publicHttpUrl(value: string, base?: string): string | undefined {
  const normalized = normalizeUrl(value, base);
  if (!normalized) return undefined;
  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
        host.endsWith('.internal') || host === '::' || host === '::1' ||
        (host.includes(':') && (host.startsWith('::ffff:') || host.startsWith('fe80:') ||
          host.startsWith('fc') || host.startsWith('fd'))) ||
        host.startsWith('0.') || host.startsWith('127.') ||
        host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.') ||
        /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) ||
        /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
        /^\d+\.\d+\.\d+\.\d+$/.test(host) &&
        host.split('.').some((part) => Number(part) > 255)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Jamás se presenta una URL de iframe/ficha como si fuese vídeo. */
export function isDirectMedia(url: string): boolean {
  try {
    return /\.(?:mp4|m3u8|mpd|webm)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Resuelve una URL de vídeo o una página de embed con el extractor existente. */
export async function playableSources(
  rawUrl: string,
  referer: string,
  provider: string,
  context: ScrapeContext,
  quality?: string,
): Promise<ScrapedSource[]> {
  const url = publicHttpUrl(rawUrl, referer);
  if (!url) return [];
  if (isDirectMedia(url)) {
    return [{ url, provider, quality: quality ?? detectQuality(url),
      headers: { Referer: referer, 'User-Agent': context.userAgent } }];
  }
  const candidates = await resolveEmbed(url, {
    fetchText: context.fetchText,
    headers: { Referer: referer, 'User-Agent': context.userAgent },
  });
  return candidates.slice(0, 8).flatMap((candidate) => {
    const direct = publicHttpUrl(candidate.url);
    return direct && isDirectMedia(direct)
      ? [{ url: direct, provider, quality: quality ?? candidate.quality,
        headers: { Referer: url, 'User-Agent': context.userAgent } }]
      : [];
  });
}

/** Decodificación de entidades HTML habituales en títulos de los catálogos. */
export function htmlText(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&#(x[\da-f]+|\d+);|&(?:amp|quot|apos|lt|gt|nbsp);/gi, (match, num: string | undefined) => {
    if (num) {
      const code = num[0]?.toLowerCase() === 'x' ? Number.parseInt(num.slice(1), 16) : Number(num);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' } as Record<string, string>)[match.toLowerCase()] ?? match;
  }).replace(/\s+/g, ' ').trim();
}

/** Extrae un array JS en JSON sin ejecutar scripts del sitio. */
export function jsonArrayAfter(source: string, marker: string): unknown[] {
  const start = source.indexOf('[', source.indexOf(marker));
  if (!source.includes(marker) || start < 0) return [];
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = start; i < source.length && i < start + 80_000; i += 1) {
    const char = source[i]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '[') depth += 1;
    else if (char === ']' && --depth === 0) {
      try {
        const result: unknown = JSON.parse(source.slice(start, i + 1));
        return Array.isArray(result) ? result : [];
      } catch { return []; }
    }
  }
  return [];
}

/** Extrae un objeto de estado JS serializado como JSON, sin ejecutar código. */
export function jsonObjectAfter(source: string, marker: string): Record<string, unknown> | undefined {
  const markerAt = source.indexOf(marker);
  const start = markerAt >= 0 ? source.indexOf('{', markerAt + marker.length) : -1;
  if (start < 0) return undefined;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = start; i < source.length && i < start + 400_000; i += 1) {
    const char = source[i]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) {
      try {
        const value: unknown = JSON.parse(source.slice(start, i + 1));
        return value !== null && typeof value === 'object' && !Array.isArray(value)
          ? value as Record<string, unknown> : undefined;
      } catch { return undefined; }
    }
  }
  return undefined;
}
