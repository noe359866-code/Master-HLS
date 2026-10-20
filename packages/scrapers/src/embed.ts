/**
 * Resolutor de "embeds".
 *
 * Many providers do not serve the video directly: they serve a page with an
 * embedded player, and the real link is hidden inside a JavaScript blob. This
 * module is the reusable core of that trick (the same one StreamFlix Reborn
 * uses with its `scrapers/embeds/*`): given the HTML of an embed, it returns
 * the direct links.
 *
 * The extractors are tried in order of reliability:
 *
 *  1. Explicit player objects (`"hls": "..."`, `"file": "..."`, `sources:[...]`).
 *  2. The classic Dean Edwards packer (`eval(function(p,a,c,k,e,d){...})`), which
 *     is decoded (not executed) and scanned again.
 *  3. Generic markup: `<video src>`, `<source src>` and `m3u8`/`mp4` literals.
 *
 * Everything here is pure and testable: the network is only used by
 * `resolveEmbed`.
 */

/** A direct link found inside an embed. */
export interface EmbedCandidate {
  url: string;
  quality?: string;
}

/** User-Agent used by default when a site rejects unknown clients. */
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/** Quality detected from the text of a link (1080p, 720p, 480p…). */
export function detectQuality(text: string): string | undefined {
  // El separador puede ser cualquier cosa (guion, guion bajo, punto…), asi
  // que se busca la etiqueta sin depender de los limites de palabra.
  const match =
    /(?:^|[^a-z0-9])(4k|2160p|1440p|1080p|720p|480p|360p|240p|hd|sd)(?![0-9])/i.exec(text);
  return match ? match[1]!.toLowerCase() : undefined;
}

/** Normalizes a link found inside a page (protocol-relative, escaped, etc.). */
export function normalizeUrl(candidate: string, baseUrl?: string): string | undefined {
  let url = candidate.trim().replace(/\\\//g, '/').replace(/&amp;/g, '&');
  if (!url) return undefined;
  if (url.startsWith('//')) url = `https:${url}`;
  if (url.startsWith('/') && baseUrl) {
    try {
      url = new URL(url, baseUrl).toString();
    } catch {
      return undefined;
    }
  }
  if (!/^(https?:|magnet:)/i.test(url)) return undefined;
  return url;
}

/**
 * Explicit extractors, in order of reliability.
 *
 * Each entry is a regular expression with a single capture group that
 * contains the direct link.
 */
const EXPLICIT_PATTERNS: RegExp[] = [
  // {"sources":[{"file":"...","label":"1080p"}]} (before the single "file")
  /["']sources?["']\s*:\s*\[([^\]]+)\]/i,
  // {"hls": "https://...m3u8"} (typical voe-style player)
  /["']hls["']\s*:\s*["']([^"']+)["']/i,
  // {"file": "https://...mp4"}
  /["']file["']\s*:\s*["']([^"']+)["']/i,
  // {"url":"..."} inside a player object
  /["']url["']\s*:\s*["'](https?:[^"']+)["']/i,
  // <source src="...">
  /<source[^>]+src=["']([^"']+)["']/i,
  // <video ... src="...">
  /<video[^>]+src=["']([^"']+)["']/i,
  // $.get('/pass_md5...') (typical dood-style player)
  /\$\.get\(\s*["']([^"']+)["']/,
  // m3u8 literal
  /(https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*)/i,
  // mp4 literal
  /(https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*)/i,
];

/** Extracts all the direct links of an embed page. */
export function extractStreams(html: string, baseUrl?: string): EmbedCandidate[] {
  if (!html) return [];
  const found: EmbedCandidate[] = [];
  const seen = new Set<string>();

  const push = (raw: string | undefined, context?: string) => {
    const url = normalizeUrl(raw ?? '', baseUrl);
    if (!url) return;
    if (seen.has(url)) return;
    seen.add(url);
    found.push({ url, quality: detectQuality(`${context ?? ''} ${url}`) });
  };

  for (const pattern of EXPLICIT_PATTERNS) {
    const match = pattern.exec(html);
    if (!match) continue;
    const value = match[1] ?? '';
    if (pattern.source.includes('sources?') && value.includes('{')) {
      // A `sources` array: one link per entry, with its label.
      for (const entry of value.split(/},?\s*{/)) {
        const link = /["'](?:file|src|url)["']\s*:\s*["']([^"']+)["']/i.exec(entry);
        const label = /["']label["']\s*:\s*["']([^"']+)["']/i.exec(entry);
        push(link?.[1], label?.[1]);
      }
      continue;
    }
    push(value);
  }

  if (!found.length) {
    // Last resort: unpack the JavaScript and look again.
    const unpacked = unpackPacker(html);
    if (unpacked && unpacked !== html) {
      for (const candidate of extractStreams(unpacked, baseUrl)) {
        if (!seen.has(candidate.url)) {
          seen.add(candidate.url);
          found.push(candidate);
        }
      }
    }
  }

  return found;
}

/**
 * Decodes the classic "packed" JavaScript (Dean Edwards' packer).
 *
 * It is **decoded, never executed**: the payload is a string with the words
 * replaced by their index in base N, and the symbol table maps that index to
 * the real word. This is the same technique the reference scrapers use to
 * reveal the link hidden in the player.
 *
 * The packed call looks like:
 *
 *   eval(function(p,a,c,k,e,d){...}('PAYLOAD',62,3,'a|b|c'.split('|')))
 *
 * and the payload may end with a lookup table of strings
 * (`var _0=["...","..."];`) whose entries are substituted by their index.
 */
export function unpackPacker(source: string): string | undefined {
  const match =
    /}\(\s*'([\s\S]*?)'\s*,\s*(\d+|\[\])\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)(?:\s*,\s*(\d+)\s*,\s*([\s\S]*?)\))?\)/.exec(
      source,
    );
  if (!match) return undefined;

  const payload = match[1] ?? '';
  const radix = match[2] === '[]' ? 62 : Number(match[2] ?? 62);
  const count = Number(match[3] ?? 0);
  const symbols = (match[4] ?? '').split('|');
  if (!count || symbols.length !== count) return undefined;

  // The payload is a JavaScript string literal: unescape it.
  let unpacked = payload.replace(/\\\\/g, '\\').replace(/\\'/g, "'");

  // Every word is an index in base N that points to the symbol table.
  unpacked = unpacked.replace(/\b\w+\b/g, (word) => {
    const index = unbase(word, radix);
    if (index === undefined) return word;
    return symbols[index] || word;
  });

  // Lookup table of strings: `var _0=["a","b"];` -> the values are inlined.
  const table = /var\s+(_\w+)\s*=\s*\["([\s\S]*?)"\];/.exec(unpacked);
  if (!table) return unpacked;
  const variable = table[1] ?? '_0';
  const values = (table[2] ?? '').split('","');
  let inlined = unpacked.slice(table[0].length);
  for (let index = 0; index < values.length; index += 1) {
    inlined = inlined.split(`${variable}[${index}]`).join(`"${values[index]}"`);
  }
  return inlined;
}

/** Alphabet used by the packer for the base 62 encoding. */
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Converts a word written in base N into its numeric value.
 *
 * The last character is the least significant digit, as in the original
 * packer.
 */
export function unbase(word: string, radix: number): number | undefined {
  if (!word) return undefined;
  if (radix >= 2 && radix <= 36) {
    const value = Number.parseInt(word, radix);
    return Number.isNaN(value) ? undefined : value;
  }
  const alphabet = BASE62.slice(0, radix);
  let total = 0;
  const reversed = word.split('').reverse();
  for (let index = 0; index < reversed.length; index += 1) {
    const digit = alphabet.indexOf(reversed[index]!);
    if (digit === -1) return undefined;
    total += radix ** index * digit;
  }
  return total;
}

/**
 * Subtitles extracted from an embed (e.g., Chillx encrypted payload carries them).
 */
export interface EmbedSubtitle {
  file: string;
  label: string;
  kind?: string;
}

export interface EmbedResult {
  streams: EmbedCandidate[];
  subtitles: EmbedSubtitle[];
}

/**
 * Extracts subtitles from a decrypted Chillx-style JSON blob.
 */
export function extractSubtitlesFromJson(json: string): EmbedSubtitle[] {
  const out: EmbedSubtitle[] = [];
  const pat = /\{"file":"([^"]+)","label":"([^"]+)","kind":"captions","default":\w+\}/g;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(json))) {
    if (m[1] && m[2]) out.push({ file: m[1], label: m[2], kind: 'captions' });
  }
  return out;
}

/**
 * Resolves an embed URL: downloads the page and extracts the direct links.
 */
export async function resolveEmbed(
  url: string,
  options: {
    fetchText: (url: string, init?: { headers?: Record<string, string> }) => Promise<string>;
    headers?: Record<string, string>;
  },
): Promise<EmbedCandidate[]> {
  const headers = {
    'User-Agent': DEFAULT_USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    ...options.headers,
  };
  try {
    const html = await options.fetchText(url, { headers });
    return extractStreams(html, url);
  } catch {
    return [];
  }
}
