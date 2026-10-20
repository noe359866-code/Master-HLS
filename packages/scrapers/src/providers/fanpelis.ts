/**
 * Fanpelis: búsqueda -> ID de publicación -> episodio exacto -> player ->
 * extractor de enlaces directos. Adaptado de su proveedor Kotlin, sin portar
 * la interfaz de catálogos ni exponer el iframe como stream reproducible.
 * https://git.gay/streamflix-reborn2/streamflix/src/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/FanpelisProvider.kt
 */
import type { ScrapeContext, ScrapeProvider, ScrapeRequest, ScrapedSource } from '../types.js';
import { playableSources, sameTitle } from './site-tools.js';

const API = 'https://fanpelis.to/api/rest/';
const SITE = 'https://fanpelis.to/';

interface Item {
  _id?: number;
  title?: string;
  type?: string;
  slug?: string;
  release_date?: string;
}
interface Episode {
  _id?: number;
  season_number?: number;
  episode_number?: number;
}
interface Embed {
  url?: string;
  lang?: string;
  quality?: string;
}
interface Response<T> { data?: T; error?: boolean }

function query(path: string, parameters: Record<string, string | number>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) params.set(key, String(value));
  return `${API}${path}?${params}`;
}

/** La etiqueta de catálogo no prueba el idioma de audio; sí excluimos una etiqueta explícita distinta. */
export function fanpelisAudioCompatible(value?: string): boolean {
  if (!value) return true;
  const label = value.trim().toLowerCase();
  if (/^(?:en|eng|english|vo|original|sub|subtitulado|vostfr|fr|french|it|de|pl|pt|por|portuguese|portugues|japanese|jap|korean|kor)(?:\b|[-_])/.test(label)) return false;
  return true; // etiquetas no estandarizadas no se interpretan como garantía
}

export const fanpelisProvider: ScrapeProvider = {
  id: 'fanpelis', name: 'Fanpelis', types: ['movie', 'series', 'anime'], languages: ['es'], region: 'Español',
  async fetchSources(request: ScrapeRequest, context: ScrapeContext): Promise<ScrapedSource[]> {
    const title = request.title?.trim();
    if (!title) return [];
    const movie = request.type === 'movie';
    if (!movie && (!Number.isInteger(request.season) || request.season! < 0 ||
                   !Number.isInteger(request.episode) || request.episode! < 1)) return [];
    const headers = { 'User-Agent': context.userAgent, Referer: SITE };
    try {
      const search = await context.fetchJson<Response<{ posts?: Item[] }>>(
        query('search', { query: title, page: 1, post_type: 'movies,tvshows,animes', posts_per_page: 16 }),
        { headers },
      );
      if (search.error) return [];
      const match = search.data?.posts?.find((item) => {
        const typeMatches = movie ? item.type === 'movies' :
          item.type === 'tvshows' || (request.kind === 'anime' && item.type === 'animes');
        const year = item.release_date ? Number(item.release_date.slice(0, 4)) : undefined;
        return typeMatches && item.title && sameTitle(item.title, title, request.year, year);
      });
      if (!match || !Number.isSafeInteger(match._id) || match._id! <= 0) return [];

      let postId = match._id!;
      if (!movie) {
        const episodes = await context.fetchJson<Response<Episode[]>>(
          query('episodes', { post_id: postId }), { headers },
        );
        const found = episodes.data?.find((entry) => entry.season_number === request.season &&
          entry.episode_number === request.episode);
        if (!Number.isSafeInteger(found?._id) || found!._id! <= 0) return [];
        postId = found!._id!;
      }
      const player = await context.fetchJson<Response<{ embeds?: Embed[] }>>(
        query('player', { post_id: postId, _any: 1 }), { headers },
      );
      const embeds = (player.data?.embeds ?? []).filter((embed) =>
        typeof embed.url === 'string' && fanpelisAudioCompatible(embed.lang)).slice(0, 8);
      return (await Promise.all(embeds.map((embed) =>
        playableSources(embed.url!, SITE, 'Fanpelis', context, embed.quality),
      ))).flat();
    } catch { return []; }
  },
};
