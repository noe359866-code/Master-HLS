/**
 * Proveedor descrito por configuracion.
 *
 * Permite anadir un proveedor **sin escribir codigo**: basta con indicar la
 * URL de busqueda (con las plantillas {title}, {year}...) y las expresiones
 * regulares que extraen el enlace del stream. Es el mismo spiritu que las
 * configuraciones de extractores del ecosistema Stremio, pero con el
 * procesador de texto del servidor.
 */

import { detectQuality, extractStreams, normalizeUrl, resolveEmbed } from '../embed.js';
import type { ProviderConfig, ScrapeContext, ScrapeProvider, ScrapeRequest, ScrapedSource } from '../types.js';

/** Sustituye las plantillas de una URL con los datos de la peticion. */
export function fillTemplate(template: string, request: ScrapeRequest): string {
  const values: Record<string, string> = {
    title: encodeURIComponent(request.title ?? ''),
    year: request.year ? String(request.year) : '',
    season: request.season ? String(request.season) : '',
    episode: request.episode ? String(request.episode) : '',
    imdbId: request.imdbId ?? request.id ?? '',
    tmdbId: request.tmdbId ?? '',
    id: request.id ?? '',
  };
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? values[key]! : match,
  );
}

/** Crea un proveedor a partir de su configuracion. */
export function createConfigProvider(config: ProviderConfig): ScrapeProvider {
  return {
    id: config.id,
    name: config.name,
    types: config.types,
    languages: config.languages,
    region: config.region,
    async fetchSources(request, context) {
      const sources: ScrapedSource[] = [];
      if (!config.searchUrl) return sources;

      const searchUrl = fillTemplate(config.searchUrl, request);
      let html = '';
      try {
        html = await context.fetchText(searchUrl, {
          headers: {
            'User-Agent': context.userAgent,
            Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
            ...(config.headers ?? {}),
          },
        });
      } catch {
        return sources;
      }

      // 1. Se buscan los items de la pagina de resultados.
      const itemIds: string[] = [];
      if (config.itemPattern) {
        const pattern = new RegExp(config.itemPattern, 'gi');
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(html)) !== null) {
          const value = match[1] ?? match[0];
          if (value) itemIds.push(value);
          if (itemIds.length >= 5) break;
        }
      }

      // 2. De cada item se extrae el enlace del stream.
      for (const itemId of itemIds) {
        if (!config.itemUrl) break;
        // `{id}` es el id del item encontrado; el resto de plantillas
        // ({title}, {year}...) se rellenan con los datos de la peticion.
        const itemUrl = fillTemplate(config.itemUrl.replace('{id}', itemId), request);
        const itemHtml = await context
          .fetchText(itemUrl, {
            headers: {
              'User-Agent': context.userAgent,
              Referer: searchUrl,
              ...(config.headers ?? {}),
            },
          })
          .catch(() => '');

        const patterns = config.streamPatterns ?? [];
        for (const pattern of patterns) {
          const match = new RegExp(pattern, 'i').exec(itemHtml);
          const url = normalizeUrl(match?.[1] ?? '', itemUrl);
          if (!url) continue;
          sources.push({
            url,
            provider: config.name,
            quality: config.defaultQuality ?? detectQuality(url),
          });
        }

        // 3. Si el item es un embed, se resuelve con el extractor generico.
        if (config.useEmbedResolver) {
          const candidates = await resolveEmbed(itemUrl, {
            fetchText: context.fetchText,
            headers: { Referer: searchUrl },
          });
          for (const candidate of candidates) {
            sources.push({
              url: candidate.url,
              provider: config.name,
              quality: candidate.quality ?? config.defaultQuality,
            });
          }
        }
      }

      // 4. Si no hay itemPattern, la propia pagina de busqueda puede traer
      //    los enlaces (sitios que lo hacen asi).
      if (!itemIds.length && !config.itemUrl) {
        for (const candidate of extractStreams(html, searchUrl)) {
          sources.push({
            url: candidate.url,
            provider: config.name,
            quality: candidate.quality ?? config.defaultQuality,
          });
        }
      }

      return sources;
    },
  };
}
