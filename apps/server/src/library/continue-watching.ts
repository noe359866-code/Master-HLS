/**
 * Lógica de «Continuar viendo» (NuvioTV: `WatchedItem` / `WatchProgress`).
 *
 * NuvioTV distingue entre progreso local y progreso de proveedores (Trakt,
 * Simkl, MDBList) y los fusiona con `TrackingProgressProjection`. También
 * ofrece el «siguiente episodio» (next-up) proyectando el último visto
 * contra la lista de episodios de la serie.
 *
 * Aquí se implementa el núcleo de esa lógica para el servidor: dado el
 * historial de progreso y la lista de episodios (metadata), se proyecta qué
 * ver a continuación y si un episodio está completado.
 */

import type { ProgressEntry } from '../model.js';

export const STARTED_THRESHOLD = 0.02;
export const COMPLETED_THRESHOLD = 0.90;

/** true si el progreso está completado (≥90 %, como NuvioTV). */
export function isCompleted(entry: Pick<ProgressEntry, 'position' | 'duration'>, threshold = COMPLETED_THRESHOLD): boolean {
  if (!entry.duration) return false;
  return entry.position / entry.duration >= threshold;
}

/** true si está en curso (≥2 % y <90 %). */
export function isInProgress(entry: Pick<ProgressEntry, 'position' | 'duration'>): boolean {
  if (!entry.duration) return false;
  const pct = entry.position / entry.duration;
  return pct >= STARTED_THRESHOLD && pct < COMPLETED_THRESHOLD;
}

/** Porcentaje 0..1. */
export function progressPercent(entry: Pick<ProgressEntry, 'position' | 'duration'>): number {
  if (!entry.duration) return 0;
  return Math.min(1, Math.max(0, entry.position / entry.duration));
}

/** Tiempo restante en ms. */
export function remainingMs(entry: Pick<ProgressEntry, 'position' | 'duration'>): number {
  if (!entry.duration) return 0;
  return Math.max(0, (entry.duration - entry.position) * 1000);
}

export interface EpisodeRef {
  id: string;
  season: number;
  episode: number;
  released?: string;
}

export interface NextUpResult {
  /** Episodio que toca ver (o null si no hay siguiente). */
  nextEpisode: EpisodeRef | null;
  /** Episodio actual (el último visto). */
  current: EpisodeRef | null;
  /** true si el episodio actual está completado. */
  isCurrentCompleted: boolean;
}

/**
 * Calcula el «siguiente episodio» a partir del progreso y la lista completa.
 * Si el episodio actual está completado, devuelve el siguiente en orden de
 * temporada/episodio; si no, devuelve el actual.
 */
export function nextUp(
  episodes: EpisodeRef[],
  currentSeason: number | undefined,
  currentEpisode: number | undefined,
  isCompletedFlag: boolean,
): NextUpResult {
  const sorted = [...episodes].sort((a, b) =>
    a.season !== b.season ? a.season - b.season : a.episode - b.episode,
  );
  const current = currentSeason !== undefined && currentEpisode !== undefined
    ? (sorted.find((ep) => ep.season === currentSeason && ep.episode === currentEpisode) ?? null)
    : null;
  if (!current) return { nextEpisode: sorted[0] ?? null, current: null, isCurrentCompleted: false };
  if (!isCompletedFlag) return { nextEpisode: current, current, isCurrentCompleted: false };
  const idx = sorted.indexOf(current);
  const next = idx >= 0 ? (sorted[idx + 1] ?? null) : null;
  return { nextEpisode: next, current, isCurrentCompleted: true };
}

/**
 * Fusiona progreso local y de proveedor (NuvioTV: `mergeProgressProjectionWithRetainedLocal`).
 * Los del proveedor mandan; los locales se conservan solo si no están en el proveedor.
 */
export function mergeProgress(
  provider: ProgressEntry[],
  local: ProgressEntry[],
  retainsLocal: (id: string) => boolean = () => true,
): ProgressEntry[] {
  const providerKeys = new Set(provider.map((p) => `${p.id}:${p.season ?? ''}:${p.episode ?? ''}`));
  const extra = local.filter((p) => retainsLocal(p.id) && !providerKeys.has(`${p.id}:${p.season ?? ''}:${p.episode ?? ''}`));
  return [...provider, ...extra].sort((a, b) => b.updatedAt - a.updatedAt);
}
