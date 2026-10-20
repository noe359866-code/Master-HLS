/**
 * Preferencias de pista **por vídeo y perfil** (NuvioTV:
 * `TrackPreferenceDataStore`).
 *
 * NuvioTV guarda la selección de audio/subtítulo por contenido y el desfase de
 * subtítulo **por videoId** (#1063): un desfase calibrado para un
 * episodio/concreta no sirve para el siguiente, y arrastrarlo rompe la
 * sincronía. Aquí lo mismo: cada vídeo recuerda sus pistas, su desfase y su
 * velocidad, con un tope de entradas por perfil (se podan las más antiguas).
 */

/** Preferencia de pista de un vídeo concreto para un perfil. */
export interface TrackPreference {
  /** Idioma de la pista de audio elegida (ISO 639, puede ser ''). */
  audioLanguage?: string;
  /**
   * Clave de la pista de subtítulo elegida en el cliente (`native:0`,
   * `ext:1`…). `null` = el usuario apagó los subtítulos a propósito.
   * `undefined` = nunca eligió (usa la decisión por defecto).
   */
  subtitleKey?: string | null;
  /** Idioma de la pista de subtítulo elegida (para reconstruir en otro encode). */
  subtitleLanguage?: string;
  /** Desfase de subtítulo en ms (solo para este vídeo). */
  delayMs?: number;
  /** Desfase de audio en ms (solo para este vídeo; NuvioTV: AudioDelayRouteDataStore). */
  audioDelayMs?: number;
  /** Velocidad de reproducción (1 = normal). */
  speed?: number;
  /** Cuándo se guardó (para podar las entradas más antiguas). */
  updatedAt: number;
}

/** Parche parcial que envía el cliente (sin `updatedAt`). */
export type TrackPreferencePatch = Partial<Omit<TrackPreference, 'updatedAt'>>;

/** Máximo de vídeos con preferencia guardada por perfil. */
export const TRACK_PREFS_CAP = 200;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Valida un parche de preferencias: solo entran campos con tipo correcto y
 * rango sensato. Un `null` en `subtitleKey` es válido («sin subtítulos»).
 */
export function sanitizeTrackPreferencePatch(input: unknown): TrackPreferencePatch {
  const raw = (input ?? {}) as Record<string, unknown>;
  const patch: TrackPreferencePatch = {};
  if ('audioLanguage' in raw && (raw.audioLanguage === null || typeof raw.audioLanguage === 'string')) {
    patch.audioLanguage = (raw.audioLanguage ?? '').slice(0, 32);
  }
  if ('subtitleKey' in raw && (raw.subtitleKey === null || typeof raw.subtitleKey === 'string')) {
    patch.subtitleKey = raw.subtitleKey === null ? null : raw.subtitleKey.slice(0, 64);
  }
  if ('subtitleLanguage' in raw && (raw.subtitleLanguage === null || typeof raw.subtitleLanguage === 'string')) {
    patch.subtitleLanguage = (raw.subtitleLanguage ?? '').slice(0, 32);
  }
  if ('delayMs' in raw && typeof raw.delayMs === 'number' && Number.isFinite(raw.delayMs)) {
    // Mismo rango que el reproductor (±180 s, como WuPlay v0.5.0).
    patch.delayMs = Math.round(clamp(raw.delayMs, -180_000, 180_000));
  }
  if ('audioDelayMs' in raw && typeof raw.audioDelayMs === 'number' && Number.isFinite(raw.audioDelayMs)) {
    // Retardo de audio por vídeo (NuvioTV: AudioDelayRouteDataStore, ±60 s).
    patch.audioDelayMs = Math.round(clamp(raw.audioDelayMs, -60_000, 60_000));
  }
  if ('speed' in raw && typeof raw.speed === 'number' && Number.isFinite(raw.speed)) {
    patch.speed = clamp(raw.speed, 0.25, 4);
  }
  return patch;
}

/**
 * Fusiona un parche en la preferencia de un vídeo y la fecha. Devuelve la
 * entrada resultante (`null` si el parche no aporta nada).
 */
export function upsertTrackPreference(
  current: TrackPreference | undefined,
  patch: TrackPreferencePatch,
  now = Date.now(),
): TrackPreference | null {
  const merged: TrackPreference = {
    ...(current ?? { updatedAt: 0 }),
    ...patch,
    updatedAt: now,
  };
  const { audioLanguage, subtitleKey, subtitleLanguage, delayMs, audioDelayMs, speed } = merged;
  const hasAnything =
    (audioLanguage ?? '') !== '' ||
    subtitleKey !== undefined ||
    (subtitleLanguage ?? '') !== '' ||
    (delayMs ?? 0) !== 0 ||
    (audioDelayMs ?? 0) !== 0 ||
    (speed ?? 1) !== 1;
  return hasAnything ? merged : null;
}

/**
 * Guarda la preferencia de un vídeo en el mapa del perfil y poda las entradas
 * más antiguas si se pasa del tope. `null` en el parche elimina la entrada.
 */
export function saveTrackPreference(
  store: Record<string, Record<string, TrackPreference>>,
  profileId: string,
  videoId: string,
  patch: TrackPreferencePatch,
  now = Date.now(),
): TrackPreference | null {
  const forProfile = { ...(store[profileId] ?? {}) };
  const entry = upsertTrackPreference(forProfile[videoId], patch, now);
  if (entry) {
    forProfile[videoId] = entry;
  } else {
    delete forProfile[videoId];
  }

  const ids = Object.keys(forProfile);
  if (ids.length > TRACK_PREFS_CAP) {
    const sorted = ids
      .map((id) => ({ id, at: forProfile[id]?.updatedAt ?? 0 }))
      .sort((a, b) => a.at - b.at);
    for (const stale of sorted.slice(0, ids.length - TRACK_PREFS_CAP)) {
      delete forProfile[stale.id];
    }
  }

  store[profileId] = forProfile;
  return entry;
}
