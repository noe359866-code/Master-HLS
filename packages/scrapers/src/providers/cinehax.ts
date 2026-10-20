/**
 * Port nativo, acotado, del flujo de CineHax en StreamFlix Reborn:
 * TMDb ID -> /f/embed/movie|tv/... -> finalizePlayer -> enlaces reproducibles.
 * Cuando falta TMDb ID usa su búsqueda WP AJAX con nonce. Sin DOM del sitio,
 * sin URLs de iframe en la respuesta y sin inventar temporada/episodio.
 * Fuente: https://git.gay/streamflix-reborn2/streamflix/src/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/CineHaxProvider.kt
 */
import { detectQuality } from '../embed.js';
import type { ScrapeContext, ScrapeProvider, ScrapeRequest, ScrapedSource } from '../types.js';
import { playableSources, publicHttpUrl, sameTitle } from './site-tools.js';

const SITE = 'https://cinehax.com';
const PLAYER = 'https://unlimplay.com/f/embed';

interface SearchItem {
  id?: number | string;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
}

function numericId(value: string | number | undefined): string | undefined {
  return value !== undefined && /^\d{1,12}$/.test(String(value)) ? String(value) : undefined;
}

async function searchTmdbId(request: ScrapeRequest, context: ScrapeContext, tv: boolean): Promise<string | undefined> {
  const title = request.title?.trim();
  if (!title) return undefined;
  const headers = { 'User-Agent': context.userAgent, Referer: `${SITE}/` };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const homepage = await context.fetchText(SITE, { headers });
    const nonce = /["']nonce["']\s*:\s*["']([^"']+)["']/i.exec(homepage)?.[1];
    if (!nonce) return undefined;
    const url = `${SITE}/wp-admin/admin-ajax.php?action=tmdb_live_search&query=${encodeURIComponent(title)}&nonce=${encodeURIComponent(nonce)}`;
    try {
      const response = await context.fetchJson<{ success?: boolean; data?: SearchItem[] }>(url, { headers });
      if (!response.success || !Array.isArray(response.data)) continue; // nonce caducado
      const item = response.data.find((entry) => {
        const name = tv ? entry.name ?? entry.title : entry.title ?? entry.name;
        const date = tv ? entry.first_air_date : entry.release_date;
        const itemTv = entry.media_type === 'tv' || (!entry.title && !!entry.name);
        return itemTv === tv && name && sameTitle(name, title, request.year, date ? Number(date.slice(0, 4)) : undefined);
      });
      return numericId(item?.id);
    } catch { /* renovación del nonce */ }
  }
  return undefined;
}

/** Sólo `latino` y `castellano` son grupos de doblaje en español. */
export function cineHaxLanguageOrder(language?: string): Array<'latino' | 'castellano'> {
  return language?.toLowerCase() === 'es-es' ? ['castellano', 'latino'] : ['latino', 'castellano'];
}

export function parseCineHaxPlayers(html: string): Record<string, Record<string, string>> {
  const match = /finalizePlayer\s*\(\s*(\{[\s\S]*?\})\s*\)/.exec(html.slice(0, 500_000));
  if (!match) return {};
  try {
    const parsed: unknown = JSON.parse(match[1]!);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, Record<string, string>>;
  } catch { return {}; }
}

export const cineHaxProvider: ScrapeProvider = {
  id: 'cinehax', name: 'CineHax', types: ['movie', 'series'], languages: ['es'], region: 'Español',
  async fetchSources(request: ScrapeRequest, context: ScrapeContext): Promise<ScrapedSource[]> {
    const tv = request.type !== 'movie';
    if (tv && (!Number.isInteger(request.season) || request.season! < 0 ||
               !Number.isInteger(request.episode) || request.episode! < 1)) return [];
    let tmdbId = numericId(request.tmdbId) ?? numericId(request.titleId?.startsWith('tmdb:')
      ? request.titleId.slice(5) : undefined);
    try {
      tmdbId ??= await searchTmdbId(request, context, tv);
      if (!tmdbId) return [];
      const embedUrl = tv
        ? `${PLAYER}/tv/${tmdbId}/${request.season}/${request.episode}`
        : `${PLAYER}/movie/${tmdbId}`;
      const html = await context.fetchText(embedUrl, {
        headers: { Referer: `${SITE}/`, 'User-Agent': context.userAgent },
      });
      const players = parseCineHaxPlayers(html);
      for (const lang of cineHaxLanguageOrder(request.language)) {
        const links = players[lang];
        if (!links || typeof links !== 'object' || Array.isArray(links)) continue;
        const results = await Promise.all(Object.entries(links).slice(0, 8).map(async ([server, raw]) => {
          if (typeof raw !== 'string') return [];
          const url = publicHttpUrl(raw, embedUrl);
          if (!url) return [];
          // En upstream el host remux sirve MP4 directo (a veces sin extensión).
          if (server.toLowerCase() === 'remux' && new URL(url).hostname === 'remux.unlimplay.com') {
            return [{ url, provider: 'CineHax', quality: detectQuality(url),
              headers: { Referer: embedUrl, 'User-Agent': context.userAgent } }];
          }
          return playableSources(url, embedUrl, 'CineHax', context);
        }));
        const sources = results.flat();
        if (sources.length) return sources; // doblaje de la región antes que el alternativo
      }
      return []; // 'subtitulado' no garantiza audio español
    } catch { return []; }
  },
};
