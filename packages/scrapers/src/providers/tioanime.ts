/**
 * TioAnime: directorio -> ficha de anime -> lista de episodios -> var videos.
 * Sólo devuelve un episodio que realmente aparece en la ficha (temporada 1).
 * https://git.gay/streamflix-reborn2/streamflix/src/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/TioAnimeProvider.kt
 */
import type { ScrapeContext, ScrapeProvider, ScrapeRequest, ScrapedSource } from '../types.js';
import { htmlText, jsonArrayAfter, playableSources, sameTitle } from './site-tools.js';

const SITE = 'https://tioanime.com';

function directoryMatches(html: string, title: string, movie: boolean): string | undefined {
  for (const match of html.matchAll(/<article\b[^>]*class=["'][^"']*\banime\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi)) {
    const article = match[1] ?? '';
    const path = /\bhref=["'](?:https?:\/\/tioanime\.com)?\/?anime\/([a-z0-9-]+)\/?["']/i.exec(article)?.[1];
    const heading = /<h3\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i.exec(article)?.[1];
    const isMovie = /class=["'][^"']*\banime-type-peli\b[^"']*["'][^>]*>[\s\S]*?pel[ií]cula/i.test(article);
    if (path && heading && isMovie === movie && sameTitle(htmlText(heading), title)) return path;
  }
  return undefined;
}

export const tioAnimeProvider: ScrapeProvider = {
  id: 'tioanime', name: 'TioAnime', types: ['anime'], languages: ['es'], region: 'Anime en español',
  async fetchSources(request: ScrapeRequest, context: ScrapeContext): Promise<ScrapedSource[]> {
    const title = request.title?.trim();
    if (!title) return [];
    const movie = request.type === 'movie';
    if (!movie && (request.season !== 1 || !Number.isInteger(request.episode) || request.episode! < 1)) return [];
    const headers = { 'User-Agent': context.userAgent, Referer: `${SITE}/` };
    try {
      const directory = await context.fetchText(`${SITE}/directorio?q=${encodeURIComponent(title)}&p=1`, { headers });
      const slug = directoryMatches(directory, title, movie);
      if (!slug) return [];
      const detail = await context.fetchText(`${SITE}/anime/${slug}`, { headers });
      const episodes = jsonArrayAfter(detail, 'var episodes').filter((value): value is number =>
        Number.isInteger(value) && Number(value) > 0);
      const number = movie ? episodes[0] : request.episode;
      if (!number || !episodes.includes(number)) return [];
      const episodeUrl = `${SITE}/ver/${slug}-${number}`;
      const player = await context.fetchText(episodeUrl, { headers: { ...headers, Referer: `${SITE}/anime/${slug}` } });
      const videos = jsonArrayAfter(player, 'var videos');
      const sources = await Promise.all(videos.slice(0, 8).map((entry) => {
        if (!Array.isArray(entry) || entry.length < 2 || typeof entry[0] !== 'string' ||
            typeof entry[1] !== 'string' || !['voe', 'yourupload'].includes(entry[0].toLowerCase())) return [];
        return playableSources(entry[1], episodeUrl, 'TioAnime', context);
      }));
      return sources.flat();
    } catch { return []; }
  },
};
