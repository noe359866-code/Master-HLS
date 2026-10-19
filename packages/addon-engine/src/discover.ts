/**
 * Descubrimiento: ficha de persona y titulos similares.
 *
 * WuPlay tiene "Cast & crew" con ficha de persona (filmografia completa) y
 * "Similar Titles" desde la ficha de cualquier titulo. Aqui se resuelven con
 * el mismo motor de busqueda: se busca por nombre y se filtra por la
 * aparicion de la persona (cast/director) o por generos compartidos.
 */

import { toStringArray } from './normalize.js';
import type { AddonRegistry } from './registry.js';
import type { MetaPreview } from './types.js';

export interface PersonFilmography {
  name: string;
  /** Titulos en los que aparece la persona. */
  titles: MetaPreview[];
  /** Catalogos que aportaron resultados. */
  sources: string[];
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿Aparece esta persona en el reparto o la direccion de esta meta? */
export function personAppearsIn(meta: MetaPreview, person: string): boolean {
  const target = normalizeName(person);
  if (!target) return false;
  // `cast`/`director` llegan como string o como array segun el addon.
  const people = [
    ...(toStringArray(meta.cast) ?? []),
    ...(toStringArray(meta.director) ?? []),
    ...(toStringArray(meta.writer) ?? []),
  ];
  return people.some((entry) => normalizeName(entry).includes(target));
}

/**
 * Filmografia de una persona: busca su nombre en los catalogos y se queda con
 * los titulos en los que aparece.
 *
 * Los catalogos no siempre traen el reparto, asi que se consulta la meta
 * completa de los candidatos antes de decidir.
 */
export async function findPersonFilmography(
  registry: AddonRegistry,
  name: string,
  options: { type?: string; limit?: number; maxCandidates?: number } = {},
): Promise<PersonFilmography> {
  const result = await registry.search(name, { type: options.type });
  const candidates = result.value.metas.slice(0, options.maxCandidates ?? 12);

  const detailed = await Promise.all(
    candidates.map(async (candidate) => {
      if (personAppearsIn(candidate, name)) return candidate;
      try {
        const meta = await registry.meta({ type: candidate.type ?? 'movie', id: candidate.id });
        if (meta.value.meta && personAppearsIn(meta.value.meta, name)) {
          return { ...candidate, ...meta.value.meta };
        }
      } catch {
        // Un addon caido no debe impedir listar la filmografia.
      }
      return null;
    }),
  );

  const titles = detailed
    .filter((meta): meta is MetaPreview => meta !== null)
    .sort((a, b) => ratingValue(b) - ratingValue(a));

  return {
    name,
    titles: options.limit ? titles.slice(0, options.limit) : titles,
    sources: result.sources,
  };
}

/** Limpia el titulo para usarlo como termino de busqueda. */
export function searchTermForTitle(title: string): string {
  return title
    .replace(/\(\d{4}\)/g, '')
    .replace(/\[\d{4}\]/g, '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/^(the|a|an|el|la|los|las|le|la)\s+/i, '')
    .trim();
}

/**
 * Titulos similares: se busca por el nombre del titulo y se priorizan los que
 * comparten generos con el original.
 */
export async function findSimilarTitles(
  registry: AddonRegistry,
  meta: MetaPreview,
  options: { type?: string; limit?: number } = {},
): Promise<MetaPreview[]> {
  const term = searchTermForTitle(meta.name ?? '');
  if (!term) return [];

  const result = await registry.search(term, { type: options.type ?? meta.type });
  const genres = new Set((meta.genres ?? []).map((genre) => genre.toLowerCase()));

  return result.value.metas
    .filter((candidate) => candidate.id !== meta.id)
    .map((candidate) => {
      const shared = (candidate.genres ?? []).filter((genre) =>
        genres.has(genre.toLowerCase()),
      ).length;
      const sameType = candidate.type === meta.type ? 1 : 0;
      return { candidate, shared, score: shared * 10 + sameType * 3 + ratingValue(candidate) };
    })
    // Sin generos en comun no es un titulo "similar": solo coincidencias de
    // nombre, que no aportan valor.
    .filter((entry) => entry.shared > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 12)
    .map((entry) => entry.candidate);
}

function ratingValue(meta: MetaPreview): number {
  const rating = Number.parseFloat(meta.imdbRating ?? '');
  return Number.isFinite(rating) ? rating : 0;
}
