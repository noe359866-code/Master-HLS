/**
 * Proveedor de Internet Archive (dominio público).
 *
 * Internet Archive expone una API pública y gratuita con miles de peliculas
 * de dominio publico que se sirven directamente como MP4. Es un proveedor
 * *legitimo*
 * que sirve de referencia y de ejemplo de como escribir un scraper: se
 * busca por titulo, se lee la ficha del item y se elige el mejor archivo.
 *
 * API:
 *   GET https://archive.org/advancedsearch.php?q=...&output=json
 *   GET https://archive.org/metadata/<identifier>
 */

import { titleMatches } from '../normalize.js';
import type { ScrapeContext, ScrapeProvider, ScrapeRequest, ScrapedSource } from '../types.js';

const SEARCH_URL = 'https://archive.org/advancedsearch.php';
const METADATA_URL = 'https://archive.org/metadata';

interface ArchiveSearchItem {
  identifier?: string;
  title?: string;
  year?: number | string;
}

interface ArchiveFile {
  name?: string;
  format?: string;
  size?: number | string;
}

interface ArchiveMetadata {
  files?: ArchiveFile[];
  metadata?: { title?: string; year?: string | number };
}

/** Formatos de video que se pueden reproducir en el navegador. */
const PLAYABLE_FORMATS = ['h.264', 'mpeg4', '512kb mpeg4', 'h.264 ia', 'h.264 hd'];

/** Extrae la resolucion del nombre del archivo ("Movie 720p.mp4"). */
function qualityFromName(name: string): string | undefined {
  const match =
    /(?:^|[^a-z0-9])(2160p|1440p|1080p|720p|480p|360p|240p)(?![0-9])/i.exec(name);
  return match ? match[1]!.toLowerCase() : undefined;
}

/** Elige el mejor archivo de video del item. */
export function pickBestFile(files: ArchiveFile[]): ArchiveFile | undefined {
  const playable = files.filter((file) => {
    const name = (file.name ?? '').toLowerCase();
    if (!name.endsWith('.mp4') && !name.endsWith('.ogv') && !name.endsWith('.webm')) return false;
    return PLAYABLE_FORMATS.some((format) => (file.format ?? '').toLowerCase().includes(format));
  });
  const candidates = playable.length ? playable : files.filter((file) => (file.name ?? '').endsWith('.mp4'));
  return candidates.sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0))[0];
}

export const archiveProvider: ScrapeProvider = {
  id: 'internet-archive',
  name: 'Internet Archive',
  types: ['movie'],
  languages: ['en', 'es', 'de', 'fr', 'it'],
  region: 'Dominio público',

  async fetchSources(request: ScrapeRequest, context: ScrapeContext): Promise<ScrapedSource[]> {
    const title = (request.title ?? '').trim();
    if (!title) return [];

    const query = [
      `title:("${title}")`,
      'AND mediatype:(movies)',
      request.year ? `AND year:${request.year}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const searchUrl =
      `${SEARCH_URL}?q=${encodeURIComponent(query)}` +
      '&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year' +
      '&rows=8&page=1&output=json';

    let items: ArchiveSearchItem[] = [];
    try {
      const response = await context.fetchJson<{ response?: { docs?: ArchiveSearchItem[] } }>(searchUrl, {
        headers: { 'User-Agent': context.userAgent },
      });
      items = response.response?.docs ?? [];
    } catch {
      return [];
    }

    const sources: ScrapedSource[] = [];
    for (const item of items.slice(0, 5)) {
      const identifier = item.identifier;
      if (!identifier) continue;
      // Solo se aceptan coincidencias reales de titulo.
      if (item.title && !titleMatches(item.title, title)) continue;

      let metadata: ArchiveMetadata;
      try {
        metadata = await context.fetchJson<ArchiveMetadata>(
          `${METADATA_URL}/${encodeURIComponent(identifier)}`,
          { headers: { 'User-Agent': context.userAgent } },
        );
      } catch {
        continue;
      }

      const file = pickBestFile(metadata.files ?? []);
      const fileName = file?.name;
      if (!fileName) continue;

      const year = Number(item.year ?? metadata.metadata?.year ?? 0) || undefined;
      sources.push({
        url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(fileName)}`,
        provider: 'Internet Archive',
        quality: qualityFromName(fileName),
        size: file?.size ? Number(file.size) : undefined,
        label: `Internet Archive${year ? ` · ${year}` : ''}`,
      });
    }

    return sources;
  },
};
