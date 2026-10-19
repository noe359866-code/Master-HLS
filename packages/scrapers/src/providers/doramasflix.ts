/**
 * Doramasflix: búsqueda GraphQL -> ficha Next.js -> ID de dorama ->
 * listEpisodes (temporada y episodio exactos) -> links_online -> extractor.
 * Conservar la distinción CAST/LAT/SUB/POR: el idioma `es` del catálogo no
 * convierte mágicamente audio subtitulado o portugués en español.
 * Fuente: https://git.gay/streamflix-reborn2/streamflix/src/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/DoramasflixProvider.kt
 */
import type { ScrapeContext, ScrapeProvider, ScrapeRequest, ScrapedSource } from '../types.js';
import { playableSources, publicHttpUrl, sameTitle } from './site-tools.js';

const SITE = 'https://doramasflix.in';
const API = 'https://sv1.fluxcedene.net/api/gql';
// Cabecera pública del cliente Kotlin upstream, no una credencial de usuario.
const PLATFORM = 'RxARncfg1S_MdpSrCvreoLu_SikCGMzE1NzQzODc3NjE2MQ==';

interface CatalogItem { slug?: string; name?: string; name_es?: string }
interface Episode { slug?: string; season_number?: number; episode_number?: number }
interface Link { link?: string; lang?: string }
interface ApolloEntry { _id?: string; links_online?: { json?: Link[] }; server?: { json?: Link } }

const searchQuery = 'query searchAll($input: String!) {' +
  ' searchDorama(input: $input, limit: 32) { _id slug name name_es }' +
  ' searchMovie(input: $input, limit: 32) { _id slug name name_es } }';
const episodeQuery = 'query listEpisodes($season_number: Float!, $serie_id: MongoID!) {' +
  ' listEpisodes(sort: NUMBER_ASC, filter: {type_serie: "dorama", serie_id: $serie_id, season_number: $season_number})' +
  ' { _id slug episode_number season_number } }';

function nextState(html: string): Record<string, ApolloEntry> | undefined {
  const json = /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json);
    const state = parsed?.props?.pageProps?.apolloState;
    return state && typeof state === 'object' ? state : undefined;
  } catch { return undefined; }
}

function safeSlug(value?: string): string | undefined {
  return value && /^[a-z0-9-]+$/i.test(value) ? value : undefined;
}

/** Orden según idioma/región: sólo doblaje CAST/LAT o audio sin etiquetar. */
function audioPriority(language: string | undefined, value: string | undefined): number {
  if (!value) return 1; // sin metadata de audio: última opción, sin garantía
  const es = language?.toLowerCase() === 'es-es';
  if (value === '37') return es ? 3 : 2; // CAST
  if (value === '38') return es ? 2 : 3; // LAT
  return 0; // SUB/POR/ENG/COR/JAP no son doblajes españoles
}

async function decodePlayer(url: string, context: ScrapeContext): Promise<string | undefined> {
  if (new URL(url).hostname !== 'fkplayer.xyz') return url;
  if (!context.postJson) return undefined;
  const html = await context.fetchText(url, { headers: { Referer: `${SITE}/` } });
  const state = /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
  if (!state) return undefined;
  const token = JSON.parse(state)?.props?.pageProps?.token;
  if (typeof token !== 'string' || !token) return undefined;
  const decoded = await context.postJson<{ link?: string }>('https://fkplayer.xyz/api/decoding',
    { token }, { headers: { Referer: url, 'User-Agent': context.userAgent } });
  if (typeof decoded.link !== 'string') return undefined;
  return publicHttpUrl(Buffer.from(decoded.link, 'base64').toString('utf8'));
}

export const doramasflixProvider: ScrapeProvider = {
  id: 'doramasflix', name: 'Doramasflix', types: ['dorama', 'movie'], languages: ['es'], region: 'Doramas en español',
  async fetchSources(request: ScrapeRequest, context: ScrapeContext): Promise<ScrapedSource[]> {
    const movie = request.type === 'movie';
    if (!movie && (!Number.isInteger(request.season) || request.season! < 0 ||
                   !Number.isInteger(request.episode) || request.episode! < 1)) return [];
    const title = request.title?.trim();
    if (!title || !context.postJson) return [];
    const headers = {
      'User-Agent': context.userAgent,
      platform: 'doramasflix', authorization: 'Bear',
      'x-access-jwt-token': '', 'x-access-platform': PLATFORM,
    };
    const gql = <T>(operationName: string, query: string, variables: Record<string, unknown>) =>
      context.postJson!<{ data?: T }>(API, { operationName, variables, query }, { headers });
    try {
      const search = await gql<{ searchDorama?: CatalogItem[]; searchMovie?: CatalogItem[] }>(
        'searchAll', searchQuery, { input: title },
      );
      const entry = (movie ? search.data?.searchMovie : search.data?.searchDorama)?.find((item) =>
        [item.name, item.name_es].some((name) => !!name && sameTitle(name, title)));
      const slug = safeSlug(entry?.slug);
      if (!slug) return [];
      const path = movie ? `peliculas-online/${slug}` : `doramas-online/${slug}`;
      let episodeSlug: string | undefined;
      if (!movie) {
        const detail = await context.fetchText(`${SITE}/${path}`, { headers: { 'User-Agent': context.userAgent } });
        const state = nextState(detail);
        const doramaId = state && Object.entries(state).find(([key]) => key.startsWith('Dorama:') || key.startsWith('Movie:'))?.[1]?._id;
        if (typeof doramaId !== 'string' || !/^[a-f\d]{24}$/i.test(doramaId)) return [];
        const episodes = await gql<{ listEpisodes?: Episode[] }>(
          'listEpisodes', episodeQuery, { serie_id: doramaId, season_number: request.season },
        );
        const found = episodes.data?.listEpisodes?.find((item) =>
          item.season_number === request.season && item.episode_number === request.episode);
        episodeSlug = safeSlug(found?.slug);
        if (!episodeSlug) return [];
      }
      const watchUrl = movie ? `${SITE}/${path}` : `${SITE}/episodios/${episodeSlug}`;
      const watch = await context.fetchText(watchUrl, { headers: { 'User-Agent': context.userAgent } });
      const state = nextState(watch);
      if (!state) return [];
      const data = Object.entries(state).find(([key]) =>
        key.startsWith(movie ? 'Movie:' : 'Episode:') || (!movie && key.startsWith('Movie:')))?.[1];
      const links = data?.links_online?.json?.length ? data.links_online.json :
        Object.entries(state).filter(([key]) => key.startsWith('ROOT_QUERY.listProblems'))
          .flatMap(([, item]) => item.server?.json ? [item.server.json] : []);
      const candidates = (links ?? []).filter((item) =>
        typeof item.link === 'string' && audioPriority(request.language, item.lang) > 0)
        .sort((a, b) => audioPriority(request.language, b.lang) - audioPriority(request.language, a.lang))
        .slice(0, 8);
      const streams = await Promise.all(candidates.map(async (item) => {
        try {
          const link = publicHttpUrl(item.link!);
          const real = link && await decodePlayer(link, context);
          return real ? playableSources(real, watchUrl, 'Doramasflix', context) : [];
        } catch { return []; }
      }));
      return streams.flat();
    } catch { return []; }
  },
};
