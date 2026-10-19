/**
 * Frembed: dominio API -> ID TMDb (o búsqueda) -> /api/films|series ->
 * servidores VF -> enlaces multimedia. Las pistas VO/VOSTFR no se atribuyen
 * al audio francés. No portamos redirecciones sin Location ni extractores JS
 * especializados: si no se resuelve un fichero/HLS, se devuelve vacío.
 * https://git.gay/streamflix-reborn2/streamflix/src/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/FrembedProvider.kt
 * https://git.gay/streamflix-reborn2/streamflix/src/branch/main/app/src/main/java/com/streamflixreborn/streamflix/extractors/FrembedExtractor.kt
 */
import type { ScrapeContext, ScrapeProvider, ScrapeRequest, ScrapedSource } from '../types.js';
import { playableSources, sameTitle } from './site-tools.js';

const SITE = 'https://frembed.casa/';

interface SearchItem {
  tmdb?: number | string;
  title?: string;
  title_fr?: string;
  name?: string;
  year?: string;
}
interface Link { url?: string; lang?: string }
interface Links {
  links?: Link[];
  [legacy: string]: Link[] | string | undefined;
}

function numeric(value?: string | number): string | undefined {
  return value !== undefined && /^\d{1,12}$/.test(String(value)) ? String(value) : undefined;
}

async function domain(context: ScrapeContext): Promise<string> {
  try {
    const response = await context.fetchJson<{ domain?: string }>(`${SITE}api/domain`);
    const hostname = response.domain?.toLowerCase();
    // El sitio controla la respuesta; nunca dejarle apuntar al localhost/LAN.
    if (hostname && /^frembed\.[a-z0-9.-]+$/.test(hostname) && !hostname.endsWith('.')) {
      return `https://${hostname}/`;
    }
  } catch { /* se prueba el dominio predeterminado */ }
  return SITE;
}

function frenchLinks(data: Links): string[] {
  if (Array.isArray(data.links) && data.links.length) {
    return data.links.filter((link) => !link.lang || link.lang.toLowerCase() === 'vf')
      .map((link) => link.url).filter((url): url is string => typeof url === 'string');
  }
  return Array.from({ length: 7 }, (_, index) => data[`link${index + 1}`])
    .filter((url): url is string => typeof url === 'string');
}

export const frembedProvider: ScrapeProvider = {
  id: 'frembed', name: 'Frembed', types: ['movie', 'series'], languages: ['fr'], region: 'Francés',
  async fetchSources(request: ScrapeRequest, context: ScrapeContext): Promise<ScrapedSource[]> {
    const movie = request.type === 'movie';
    if (!movie && (!Number.isInteger(request.season) || request.season! < 0 ||
                   !Number.isInteger(request.episode) || request.episode! < 1)) return [];
    const base = await domain(context);
    const headers = { 'User-Agent': context.userAgent, Referer: base };
    let id = numeric(request.tmdbId) ?? numeric(request.titleId?.startsWith('tmdb:')
      ? request.titleId.slice(5) : undefined);
    try {
      if (!id) {
        const title = request.title?.trim();
        if (!title) return [];
        const search = await context.fetchJson<{ movies?: SearchItem[]; tvShows?: SearchItem[] }>(
          `${base}api/public/search?page=1&query=${encodeURIComponent(title)}`, { headers },
        );
        const match = (movie ? search.movies : search.tvShows)?.find((item) =>
          [item.title_fr, item.title, item.name].some((name) =>
            !!name && sameTitle(name, title, request.year, item.year ? Number(item.year.slice(0, 4)) : undefined)));
        id = numeric(match?.tmdb);
      }
      if (!id) return [];
      const api = movie
        ? `${base}api/films?id=${id}&idType=tmdb`
        : `${base}api/series?id=${id}&sa=${request.season}&epi=${request.episode}&idType=tmdb`;
      const data = await context.fetchJson<Links>(api, { headers });
      if (!data || typeof data !== 'object') return [];
      return (await Promise.all(frenchLinks(data).slice(0, 8).map((url) =>
        playableSources(url, base, 'Frembed', context),
      ))).flat();
    } catch { return []; }
  },
};
