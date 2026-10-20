/**
 * GuardaFlix / GuardaPlay (it): búsqueda WordPress -> película -> opciones
 * de player -> wrapper `.Video` -> sólo fuentes multimedia resolubles.
 * El upstream declara SOLO películas; no se inventan capítulos de series.
 * https://git.gay/streamflix-reborn2/streamflix/src/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/GuardaFlixProvider.kt
 */
import type { ScrapeContext, ScrapeProvider, ScrapeRequest, ScrapedSource } from '../types.js';
import { htmlText, playableSources, publicHttpUrl, sameTitle, titleYear } from './site-tools.js';

const SITE = 'https://guardaplay.store';

function attribute(tag: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const raw = new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag)?.[2];
  return raw ? htmlText(raw) : undefined;
}

function matches(html: string, title: string, year?: number): string | undefined {
  for (const li of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = li[1] ?? '';
    const heading = /<[^>]+class=["'][^"']*\bentry-title\b[^"']*["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/i.exec(text)?.[1];
    const anchor = [...text.matchAll(/<a\b[^>]*>/gi)].map((match) => match[0])
      .find((tag) => /\bclass=["'][^"']*\blnk-blk\b/i.test(tag));
    if (!heading || !anchor || !sameTitle(htmlText(heading), title, year)) continue;
    const link = publicHttpUrl(attribute(anchor, 'href') ?? '', SITE);
    if (link && new URL(link).hostname === new URL(SITE).hostname) return link;
  }
  return undefined;
}

function iframeUrl(html: string, attributeName: string): string | undefined {
  for (const iframe of html.matchAll(/<iframe\b[^>]*>/gi)) {
    const value = attribute(iframe[0], attributeName);
    if (value) return value;
  }
  return undefined;
}

export const guardaFlixProvider: ScrapeProvider = {
  id: 'guardaflix', name: 'GuardaFlix', types: ['movie'], languages: ['it'], region: 'Italiano',
  async fetchSources(request: ScrapeRequest, context: ScrapeContext): Promise<ScrapedSource[]> {
    const title = request.title?.trim();
    if (request.type !== 'movie' || !title) return [];
    const headers = { 'User-Agent': context.userAgent, Referer: `${SITE}/` };
    try {
      const search = await context.fetchText(`${SITE}/?s=${encodeURIComponent(title)}`, { headers });
      const movieUrl = matches(search, title, request.year);
      if (!movieUrl) return [];
      const html = await context.fetchText(movieUrl, { headers });
      const heading = /<h1\b[^>]*class=["'][^"']*\bentry-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
      if (!heading || !sameTitle(htmlText(heading), title, request.year, titleYear(htmlText(heading)))) return [];
      // El selector upstream es `#aa-options div[id^=options-]`; sólo se
      // recorren esas opciones, nunca el trailer u otros iframes de la ficha.
      const optionsAt = html.search(/\bid=["']aa-options["']/i);
      if (optionsAt < 0) return [];
      const options = html.slice(optionsAt, optionsAt + 100_000);
      const wrappers = [...options.matchAll(/<div\b[^>]*\bid=["']options-[^"']+["'][^>]*>([\s\S]*?)<\/div>/gi)]
        .slice(0, 8)
        .map((match) => iframeUrl(match[1] ?? '', 'data-src') ?? iframeUrl(match[1] ?? '', 'src'));
      return (await Promise.all(wrappers.map(async (raw) => {
        const url = publicHttpUrl(raw ?? '', movieUrl);
        if (!url) return [];
        try {
          const wrapper = await context.fetchText(url, { headers: { ...headers, Referer: movieUrl } });
          const container = /<[^>]*class=["'][^"']*\bVideo\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(wrapper)?.[1];
          const embed = container && iframeUrl(container, 'src');
          return embed ? playableSources(embed, url, 'GuardaFlix', context) : [];
        } catch { return []; }
      }))).flat();
    } catch { return []; }
  },
};
