/**
 * Ridomovies (en): API de búsqueda -> ficha de película o URL exacta del
 * episodio -> iframes de `data-embed` -> vídeo directo. Nunca se entrega la
 * página del player como si fuese un stream. Sin port de extractores JS que
 * no estén implementados en el resolutor nativo.
 * https://git.gay/streamflix-reborn2/streamflix/src/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/RidomoviesProvider.kt
 */
import type { ScrapeContext, ScrapeProvider, ScrapeRequest, ScrapedSource } from '../types.js';
import { htmlText, playableSources, sameTitle, titleYear } from './site-tools.js';

const SITE = 'https://ridomovies.su';

interface SearchItem {
  slug?: string;
  slug_en?: string;
  title?: string;
  type?: string;
  release_date?: string;
}

/** HTML de atributo con `<iframe ...>` escapado por el sitio. */
function decodeEmbed(value: string): string {
  return value.replace(/&(?:lt|gt|quot|apos|amp);/gi, (entity) =>
    ({ '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&' } as Record<string, string>)[entity.toLowerCase()] ?? entity);
}

function playerEmbeds(html: string): string[] {
  const found: string[] = [];
  for (const tag of html.matchAll(/<[^>]+(?:id=["']player-cover["']|class=["'][^"']*server-dropdown-item[^"']*["'])[^>]*>/gi)) {
    const raw = tag[0];
    const attr = /\bdata-(?:server-)?embed\s*=\s*(["'])([\s\S]*?)\1/i.exec(raw)?.[2];
    if (!attr) continue;
    const iframe = /<iframe\b[^>]*\bsrc=["']([^"']+)["']/i.exec(decodeEmbed(attr))?.[1];
    if (iframe) found.push(iframe);
  }
  return [...new Set(found)].slice(0, 8);
}

export const ridomoviesProvider: ScrapeProvider = {
  id: 'ridomovies', name: 'Ridomovies', types: ['movie', 'series'], languages: ['en'], region: 'Inglés',
  async fetchSources(request: ScrapeRequest, context: ScrapeContext): Promise<ScrapedSource[]> {
    const movie = request.type === 'movie';
    const title = request.title?.trim();
    if (!title || !movie && (!Number.isInteger(request.season) || request.season! < 0 ||
                             !Number.isInteger(request.episode) || request.episode! < 1)) return [];
    const headers = { 'User-Agent': context.userAgent, Referer: `${SITE}/`, Platform: 'android' };
    try {
      const url = `${SITE}/api/search?q=${encodeURIComponent(title)}&page=1&lang=en&limit=20`;
      const search = await context.fetchJson<{ status?: boolean; data?: SearchItem[] }>(url, { headers });
      const item = search.status ? search.data?.find((entry) => {
        const year = entry.release_date ? Number(entry.release_date.slice(0, 4)) : undefined;
        return entry.type === (movie ? 'movie' : 'tv') && entry.title &&
          sameTitle(entry.title, title, request.year, year);
      }) : undefined;
      const slug = item?.slug ?? item?.slug_en;
      if (!slug || !/^[a-z0-9-]+$/i.test(slug)) return [];
      const pageUrl = movie ? `${SITE}/movie/${slug}` :
        `${SITE}/tv/${slug}/season-${request.season}/episode-${request.episode}`;
      const html = await context.fetchText(pageUrl, { headers });
      if (movie) {
        const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
        if (!heading || !sameTitle(htmlText(heading), title, request.year, titleYear(htmlText(heading)))) return [];
      } else {
        const episodePath = `/tv/${slug}/season-${request.season}/episode-${request.episode}`;
        // La página de error/redirect puede tener el player de otro episodio:
        // exige el enlace del episodio solicitado dentro del listado real.
        if (!html.includes(episodePath) || !html.includes('episodes-grid')) return [];
      }
      const embeds = playerEmbeds(html);
      return (await Promise.all(embeds.map((embed) =>
        playableSources(embed, pageUrl, 'Ridomovies', context),
      ))).flat();
    } catch { return []; }
  },
};
