/**
 * Proveedor descrito por configuración: buscar título -> ficha -> episodio ->
 * embed/vídeo. Es el mismo esquema de proveedores/extractores de StreamFlix,
 * sin ejecutar JavaScript remoto. Solo funciona con fuentes configuradas por
 * el usuario; no presupone que un sitio de terceros vaya a estar disponible.
 */

import { detectQuality, extractStreams, normalizeUrl, resolveEmbed } from '../embed.js';
import { extractYear, titleMatches } from '../normalize.js';
import { publicHttpUrl } from '../ssrf.js';
import type { ProviderConfig, ScrapeContext, ScrapeProvider, ScrapeRequest, ScrapedSource } from '../types.js';

/** Sustituye las plantillas de una URL con los datos de la petición. */
export function fillTemplate(template: string, request: ScrapeRequest): string {
  const values: Record<string, string> = {
    title: encodeURIComponent(request.title ?? ''),
    year: request.year === undefined ? '' : String(request.year),
    season: request.season === undefined ? '' : String(request.season),
    episode: request.episode === undefined ? '' : String(request.episode),
    imdbId: request.imdbId ?? (/^tt\d+$/i.test(request.titleId ?? request.id) ? (request.titleId ?? request.id) : ''),
    tmdbId: request.tmdbId ?? '',
    id: request.id,
    titleId: request.titleId ?? request.id,
  };
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? values[key]! : match,
  );
}

function isEpisode(request: ScrapeRequest): boolean {
  return request.season !== undefined && request.episode !== undefined;
}

/** Crea un proveedor a partir de su configuración. */
export function createConfigProvider(config: ProviderConfig): ScrapeProvider {
  return {
    id: config.id,
    name: config.name,
    types: config.types,
    languages: config.languages,
    region: config.region,
    async fetchSources(request, context) {
      const sources: ScrapedSource[] = [];
      if (!config.searchUrl && !config.itemUrl && !config.episodeUrl) return sources;
      // Una ficha de serie puede contener el primer episodio. Nunca devolverla
      // como otro episodio sin una ruta o un patrón que incluya temporada/num.
      const episodic = isEpisode(request);
      if (episodic && !config.episodeUrl && !config.episodePattern &&
          ![config.searchUrl, config.itemUrl].some((url) =>
            url?.includes('{season}') && url.includes('{episode}'))) return sources;
      if (!episodic && !config.itemUrl && !config.searchUrl) return sources;

      const searchUrl = config.searchUrl ? fillTemplate(config.searchUrl, request) : '';
      const headers = {
        'User-Agent': context.userAgent,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        ...(config.headers ?? {}),
      };
      let html = '';
      if (searchUrl) {
        try {
          html = await context.fetchText(searchUrl, { headers });
        } catch {
          return sources;
        }
      }

      // Si el patrón ofrece un segundo grupo (título) se verifica, para no
      // servir por accidente otra película con un nombre parecido.
      const itemIds: string[] = [];
      if (config.itemPattern && searchUrl) {
        const pattern = new RegExp(config.itemPattern, 'gi');
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(html)) !== null) {
          const id = match[1];
          const candidateTitle = match[2];
          if (id && (!candidateTitle || !request.title || titleMatches(candidateTitle, request.title)) &&
              (!candidateTitle || !request.year || !extractYear(candidateTitle) ||
                extractYear(candidateTitle) === request.year)) itemIds.push(id);
          if (itemIds.length >= 5) break;
          if (!match[0]) pattern.lastIndex += 1;
        }
      } else if (config.itemUrl || config.episodeUrl) {
        // URL directa por IMDb/TMDb (también para episodios).
        itemIds.push(request.titleId ?? request.id);
      }

      const sourceFor = (url: string, quality?: string, referer?: string): ScrapedSource | undefined => {
        // Un sitio comprometido no puede convertir la lista de fuentes en un
        // salto a la red interna del servidor o del reproductor. Los magnet no
        // se descargan en el servidor y siguen siendo válidos.
        const safe = url.startsWith('magnet:') ? url : publicHttpUrl(url);
        if (!safe) return undefined;
        return {
          url: safe,
          provider: config.name,
          quality: config.defaultQuality ?? quality ?? detectQuality(safe),
          headers: { ...(referer ? { Referer: referer } : {}), ...(config.headers ?? {}) },
        };
      };

      for (const itemId of itemIds) {
        const itemUrl = config.itemUrl
          ? fillTemplate(config.itemUrl.replace('{id}', encodeURIComponent(itemId)), request)
          : searchUrl;
        let pageUrl = itemUrl;
        if (episodic && config.episodeUrl) {
          pageUrl = fillTemplate(config.episodeUrl.replace('{id}', encodeURIComponent(itemId)), request);
        } else if (episodic && config.episodePattern) {
          const itemHtml = await context.fetchText(itemUrl, {
            headers: { ...headers, ...(searchUrl ? { Referer: searchUrl } : {}) },
          }).catch(() => '');
          const match = new RegExp(fillTemplate(config.episodePattern, request), 'i').exec(itemHtml);
          const episodeUrl = normalizeUrl(match?.[1] ?? '', itemUrl);
          if (!episodeUrl) continue;
          pageUrl = episodeUrl;
        }
        if (!pageUrl) continue;

        const pageHtml = pageUrl === searchUrl ? html : await context.fetchText(pageUrl, {
          headers: { ...headers, ...(itemUrl || searchUrl ? { Referer: itemUrl || searchUrl } : {}) },
        }).catch(() => '');
        if (!pageHtml) continue;

        for (const pattern of config.streamPatterns ?? []) {
          const match = new RegExp(pattern, 'i').exec(pageHtml);
          const url = normalizeUrl(match?.[1] ?? '', pageUrl);
          const source = url ? sourceFor(url, undefined, pageUrl) : undefined;
          if (source) sources.push(source);
        }

        if (config.useEmbedResolver) {
          const candidates = await resolveEmbed(pageUrl, {
            fetchText: context.fetchText,
            headers: { ...headers, Referer: itemUrl || searchUrl },
          });
          for (const candidate of candidates) {
            const source = sourceFor(candidate.url, candidate.quality, pageUrl);
            if (source) sources.push(source);
          }
        }
      }

      // Sitios cuya búsqueda apunta directamente al vídeo. Solo para una
      // película, o para una búsqueda parametrizada por episodio concreto.
      if (!itemIds.length && !config.itemUrl && !config.episodeUrl && searchUrl &&
          (!episodic || (config.searchUrl?.includes('{season}') && config.searchUrl.includes('{episode}')))) {
        for (const candidate of extractStreams(html, searchUrl)) {
          const source = sourceFor(candidate.url, candidate.quality, searchUrl);
          if (source) sources.push(source);
        }
      }

      return sources;
    },
  };
}
