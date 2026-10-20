/**
 * MStream / Moflix (de): estado de búsqueda -> ID de título/vídeo -> API de
 * watch o listado/episodio -> URL multimedia. Se omiten vídeos premium.
 * No se presume que el idioma declarado por el catálogo sea doblaje alemán.
 * https://git.gay/streamflix-reborn2/streamflix/src/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/MStreamProvider.kt
 */
import type { ScrapeContext, ScrapeProvider, ScrapeRequest, ScrapedSource } from '../types.js';
import { jsonObjectAfter, playableSources, sameTitle } from './site-tools.js';

const SITE = 'https://moflix-stream.xyz';

type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue : undefined;
}
function items(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(object).filter((entry): entry is RecordValue => !!entry) : [];
}
function safeId(value: unknown): string | undefined {
  const text = String(value ?? '');
  // IDs numéricos o UUID/slug seguros como segmentos de ruta (sin / ni ?).
  return /^[a-z0-9_-]{1,64}$/i.test(text) ? text : undefined;
}
function yearOf(value: unknown): number | undefined {
  const year = Number(String(value ?? '').slice(0, 4));
  return year >= 1900 && year <= 2100 ? year : undefined;
}

export const mstreamProvider: ScrapeProvider = {
  id: 'mstream', name: 'MStream', types: ['movie', 'series'], languages: ['de'], region: 'Alemán',
  async fetchSources(request: ScrapeRequest, context: ScrapeContext): Promise<ScrapedSource[]> {
    const movie = request.type === 'movie';
    const title = request.title?.trim();
    if (!title || !movie && (!Number.isInteger(request.season) || request.season! < 0 ||
                             !Number.isInteger(request.episode) || request.episode! < 1)) return [];
    const headers = { Referer: `${SITE}/`, 'User-Agent': context.userAgent };
    try {
      const html = await context.fetchText(`${SITE}/search/${encodeURIComponent(title)}`, { headers });
      const root = jsonObjectAfter(html, 'window.bootstrapData');
      const search = object(object(root?.loaders)?.searchPage);
      const match = items(search?.results).find((entry) => {
        const value = object(entry.title) ?? entry;
        const name = value.name;
        return typeof name === 'string' && Boolean(entry.is_series) === !movie &&
          sameTitle(name, title, request.year, yearOf(value.year));
      });
      const data = object(match?.title) ?? match;
      const titleId = safeId(data?.id);
      if (!titleId) return [];
      let videos: RecordValue[] = [];
      let referer: string;
      if (movie) {
        const watchId = safeId(object(data?.primary_video)?.id);
        if (!watchId) return [];
        referer = `${SITE}/api/v1/watch/${watchId}`;
        const response = await context.fetchJson<RecordValue>(referer, { headers });
        videos = items(response.alternative_videos);
      } else {
        const season = request.season!;
        const episode = request.episode!;
        const listUrl = `${SITE}/api/v1/titles/${titleId}/seasons/${season}/episodes?perPage=999&orderBy=episode_number&orderDir=asc`;
        const list = await context.fetchJson<RecordValue>(listUrl, { headers });
        const exists = items(object(list.pagination)?.data).some((item) =>
          Number(item.episode_number) === episode && String(item.title_id) === titleId &&
          Number(item.season_number) === season);
        if (!exists) return [];
        referer = `${SITE}/api/v1/titles/${titleId}/seasons/${season}/episodes/${episode}?loader=episodePage`;
        const response = await context.fetchJson<RecordValue>(referer, { headers });
        const entry = object(response.episode);
        // Comprobar el episodio también en la respuesta del player: ninguna
        // caché, redirect o resultado de otro título debe contaminar la lista.
        if (String(entry?.title_id) !== titleId || Number(entry?.season_number) !== season ||
            Number(entry?.episode_number) !== episode) return [];
        videos = items(entry?.videos);
      }
      return (await Promise.all(videos.slice(0, 10).map((video) => {
        if (video.premium_locked === true || typeof video.src !== 'string' || !video.src) return [];
        return playableSources(video.src, referer, 'MStream', context);
      }))).flat();
    } catch { return []; }
  },
};
