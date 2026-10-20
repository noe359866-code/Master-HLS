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

export type FilmographyRole = 'all' | 'acting' | 'directing' | 'writing' | 'crew';

/** ¿Aparece esta persona en el reparto o la direccion de esta meta? */
export function personAppearsIn(meta: MetaPreview, person: string, role: FilmographyRole = 'all'): boolean {
  const target = normalizeName(person);
  if (!target) return false;
  const pools: Record<FilmographyRole, string[]> = {
    all: [
      ...(toStringArray(meta.cast) ?? []),
      ...(toStringArray(meta.director) ?? []),
      ...(toStringArray(meta.writer) ?? []),
    ],
    acting: [...(toStringArray(meta.cast) ?? [])],
    directing: [...(toStringArray(meta.director) ?? [])],
    writing: [...(toStringArray(meta.writer) ?? [])],
    crew: [...(toStringArray(meta.director) ?? []), ...(toStringArray(meta.writer) ?? [])],
  };
  const people = pools[role] ?? pools.all;
  return people.some((entry) => normalizeName(entry).includes(target));
}

/** Rol detectado para esta meta (para filtrar filmografia por rol). */
export function roleOfPersonIn(meta: MetaPreview, person: string): FilmographyRole[] {
  const roles: FilmographyRole[] = [];
  if (personAppearsIn(meta, person, 'acting')) roles.push('acting');
  if (personAppearsIn(meta, person, 'directing')) roles.push('directing');
  if (personAppearsIn(meta, person, 'writing')) roles.push('writing');
  return roles.length ? roles : [];
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
  options: { type?: string; limit?: number; maxCandidates?: number; role?: string } = {},
): Promise<PersonFilmography> {
  const role = (options.role as FilmographyRole) ?? 'all';
  const result = await registry.search(name, { type: options.type });
  const candidates = result.value.metas.slice(0, options.maxCandidates ?? 16);

  const detailed = await Promise.all(
    candidates.map(async (candidate) => {
      if (personAppearsIn(candidate, name, role)) return candidate;
      try {
        const meta = await registry.meta({ type: candidate.type ?? 'movie', id: candidate.id });
        if (meta.value.meta && personAppearsIn(meta.value.meta, name, role)) {
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
 * Titulos similares: nuevo motor WuPlay v0.9.2 (generos + cast + año).
 */
export async function findSimilarTitles(
  registry: AddonRegistry,
  meta: MetaPreview,
  options: { type?: string; limit?: number } = {},
): Promise<MetaPreview[]> {
  const term = searchTermForTitle(meta.name ?? '');
  if (!term) return [];
  let result = await registry.search(term, { type: options.type ?? meta.type });
  const primaryGenre = meta.genres?.[0];
  if (result.value.metas.length < 4 && primaryGenre) {
    try {
      const byGenre = await registry.catalog({ type: (meta.type ?? 'movie') as string, id: 'top', extra: { genre: primaryGenre } });
      const existing = new Set(result.value.metas.map((m) => m.id));
      for (const m of byGenre.value.metas) if (!existing.has(m.id)) result.value.metas.push(m);
    } catch { /* no catalog */ }
  }
  const genres = new Set((meta.genres ?? []).map((genre) => genre.toLowerCase()));
  const castSet = new Set((toStringArray(meta.cast) ?? []).map((c) => normalizeName(c)));
  const dirSet = new Set((toStringArray(meta.director) ?? []).map((c) => normalizeName(c)));
  return result.value.metas
    .filter((candidate) => candidate.id !== meta.id)
    .map((candidate) => {
      const shared = (candidate.genres ?? []).filter((genre) => genres.has(genre.toLowerCase())).length;
      const sameType = candidate.type === meta.type ? 1 : 0;
      const castOverlap = (toStringArray(candidate.cast) ?? []).filter((c) => castSet.has(normalizeName(c))).length;
      const dirOverlap = (toStringArray(candidate.director) ?? []).filter((c) => dirSet.has(normalizeName(c))).length;
      const yearBonus = (() => { const y1 = Number((meta as { year?: unknown }).year ?? 0); const y2 = Number((candidate as { year?: unknown }).year ?? 0); if (y1 && y2) return Math.max(0, 5 - Math.abs(y1 - y2) / 5); return 0; })();
      const score = shared * 12 + sameType * 3 + ratingValue(candidate) * 2 + castOverlap * 4 + dirOverlap * 6 + yearBonus;
      return { candidate, shared, score };
    })
    .filter((entry) => entry.shared > 0 || entry.score > 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 12)
    .map((entry) => entry.candidate);
}

function ratingValue(meta: MetaPreview): number {
  const rating = Number.parseFloat(meta.imdbRating ?? '');
  return Number.isFinite(rating) ? rating : 0;
}
