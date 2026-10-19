/**
 * Filtros de contenido (WuPlay: "Content Filters", antes "Catalog Filters").
 *
 * Los filtros son globales de la app (se guardan en los ajustes del
 * servidor) y se aplican a las pantallas de contenido: busqueda, generos y
 * decadas. Entre los addons y la metadata, lo que llega a la pantalla es
 * "lo que hay"; estos filtros permitenlimpiarlo sin instalar nada.
 *
 * WuPlay tambien permite excluir palabras clave ("exclude keywords and
 * genres in content filters"): aqui se soporta con los generos y las
 * palabras clave de la ficha, que es lo que traen los metadatos.
 */

import type { MetaPreview } from '@vibeflix/addon-engine';

import { normalizeGenre, normalizeText } from './genres.js';

/** Filtros de contenido de la app. */
export interface ContentFilters {
  /** Generos a mostrar (vacio = todos). */
  includeGenres: string[];
  /** Generos a ocultar. */
  excludeGenres: string[];
  /** Palabras clave a excluir (se comparan con el nombre y los generos). */
  excludeKeywords: string[];
  /** Puntuacion minima (0 = sin filtro). Usa `imdbRating` / `rating`. */
  minRating: number;
  /** Ocultar el contenido marcado como para adultos. */
  hideAdult: boolean;
}

/** Filtros por defecto: no ocultan nada. */
export const DEFAULT_FILTERS: ContentFilters = {
  includeGenres: [],
  excludeGenres: [],
  excludeKeywords: [],
  minRating: 0,
  hideAdult: false,
};

/** Genero o etiqueta que marca el contenido para adultos. */
const ADULT_TAGS = ['adult', 'xxx', 'porn', 'erotica', 'erotico'];

/** Devuelve el ano de estreno de una meta (0 si no se sabe). */
export function yearOf(meta: MetaPreview): number {
  const fromRelease = /(\d{4})/.exec(meta.releaseInfo ?? '');
  if (fromRelease) return Number(fromRelease[1]);
  const fromYear = Number((meta as { year?: number }).year ?? 0);
  return Number.isFinite(fromYear) ? fromYear : 0;
}

/** Devuelve la puntuacion normalizada de una meta (0 si no la tiene). */
export function ratingOf(meta: MetaPreview): number {
  const raw = meta.imdbRating ?? (meta as { rating?: string }).rating ?? '';
  const parsed = Number.parseFloat(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** true si la meta parece contenido para adultos. */
export function isAdult(meta: MetaPreview): boolean {
  const genres = (meta.genres ?? []).map(normalizeGenre);
  if (genres.some((genre) => ADULT_TAGS.includes(genre))) return true;
  const text = normalizeText(`${meta.name ?? ''} ${(meta.description ?? '').slice(0, 120)}`);
  return /\bxxx\b/.test(text);
}

/**
 * Aplica los filtros de contenido a una lista de metas.
 *
 * Se maintains el orden original: el servidor ya ordeno por calidad.
 */
export function applyContentFilters(
  metas: MetaPreview[],
  filters: ContentFilters | undefined,
): MetaPreview[] {
  if (!filters) return metas;

  const include = (filters.includeGenres ?? []).map(normalizeGenre).filter(Boolean);
  const exclude = (filters.excludeGenres ?? []).map(normalizeGenre).filter(Boolean);
  const keywords = (filters.excludeKeywords ?? []).map(normalizeText).filter(Boolean);
  const minRating = filters.minRating > 0 ? filters.minRating : 0;

  return metas.filter((meta) => {
    const genres = (meta.genres ?? []).map(normalizeGenre);

    if (include.length && !genres.some((genre) => include.includes(genre))) return false;
    if (exclude.length && genres.some((genre) => exclude.includes(genre))) return false;

    if (keywords.length) {
      const haystack = normalizeText(
        `${meta.name ?? ''} ${(meta.genres ?? []).join(' ')} ${meta.description ?? ''}`,
      );
      if (keywords.some((keyword) => haystack.includes(keyword))) return false;
    }

    if (minRating > 0 && ratingOf(meta) < minRating) return false;
    if (filters.hideAdult && isAdult(meta)) return false;

    return true;
  });
}
