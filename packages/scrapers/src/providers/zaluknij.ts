/**
 * Zaluknij (pl): buscador -> ficha de película -> `#link-list` -> URL del
 * iframe codificado en base64 o href del servidor -> media directa. Limitado
 * a películas: la enumeración anidada de temporadas del upstream y su
 * WebView de clearance no se han portado al servidor Node.
 * https://git.gay/streamflix-reborn2/streamflix/src/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/ZaluknijProvider.kt
 */
import type { ScrapeContext, ScrapeProvider, ScrapeRequest, ScrapedSource } from '../types.js';
import { htmlText, playableSources, publicHttpUrl, sameTitle, titleYear } from './site-tools.js';

const SITE = 'https://zaluknij.cc';

function attr(tag: string, name: string): string | undefined {
  const raw = new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag)?.[2];
  return raw ? htmlText(raw) : undefined;
}

function movieLink(html: string, title: string, year?: number): string | undefined {
  const searchAt = html.search(/\bid=["']advanced-search["']/i);
  if (searchAt < 0) return undefined;
  const search = html.slice(searchAt, searchAt + 120_000);
  for (const match of search.matchAll(/<a\b[^>]*class=["'][^"']*\bitem\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi)) {
    const anchor = match[0];
    const open = /<a\b[^>]*>/i.exec(anchor)?.[0] ?? '';
    const href = attr(open, 'href');
    const name = /<img\b[^>]*>/i.exec(anchor)?.[0];
    const candidate = name && attr(name, 'alt') || attr(open, 'title') ||
      htmlText(/<[^>]+class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\//i.exec(anchor)?.[1] ?? '');
    if (!href || !candidate || !sameTitle(candidate, title, year)) continue;
    const url = publicHttpUrl(href, SITE);
    if (url && new URL(url).hostname === new URL(SITE).hostname &&
        new URL(url).pathname.startsWith('/film/')) return url;
  }
  return undefined;
}

/** La web guarda JSON `{"src":"..."}` en base64 dentro de `data-iframe`. */
function decodedIframe(encoded: string): string | undefined {
  if (!/^[a-z0-9+/=_-]{8,5000}$/i.test(encoded)) return undefined;
  try {
    const text = Buffer.from(encoded, 'base64').toString('utf8').trim();
    if (text.startsWith('http')) return text;
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null &&
      typeof (value as { src?: unknown }).src === 'string'
      ? (value as { src: string }).src : undefined;
  } catch { return undefined; }
}

function links(html: string): string[] {
  const table = html.search(/\bid=["']link-list["']/i);
  if (table < 0) return [];
  const fragment = html.slice(table, table + 100_000);
  const tbody = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(fragment)?.[1];
  if (!tbody) return [];
  return [...tbody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(0, 10)
    .flatMap((row) => {
      const anchor = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>/i.exec(row[1] ?? '')?.[0];
      if (!anchor) return [];
      const src = decodedIframe(attr(anchor, 'data-iframe') ?? '') ?? attr(anchor, 'href');
      return src ? [src] : [];
    });
}

export const zaluknijProvider: ScrapeProvider = {
  id: 'zaluknij', name: 'Zaluknij', types: ['movie'], languages: ['pl'], region: 'Polaco',
  coverage: 'partial',
  limitations: [
    'Solo películas: no se portaron la enumeración de temporadas/episodios ni el WebView de clearance del upstream.',
    'Puede devolver cero fuentes si el sitio exige superar un antibot fuera del alcance del servidor Node.',
  ],
  async fetchSources(request: ScrapeRequest, context: ScrapeContext): Promise<ScrapedSource[]> {
    const title = request.title?.trim();
    if (request.type !== 'movie' || !title) return [];
    const headers = { 'User-Agent': context.userAgent, Referer: `${SITE}/` };
    try {
      const search = await context.fetchText(`${SITE}/wyszukiwarka?phrase=${encodeURIComponent(title)}`, { headers });
      const url = movieLink(search, title, request.year);
      if (!url) return [];
      const detail = await context.fetchText(url, { headers });
      const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(detail)?.[1];
      if (!heading || !sameTitle(htmlText(heading), title, request.year, titleYear(htmlText(heading)))) return [];
      return (await Promise.all(links(detail).map((raw) =>
        playableSources(raw, url, 'Zaluknij', context)))).flat();
    } catch { return []; }
  },
};
