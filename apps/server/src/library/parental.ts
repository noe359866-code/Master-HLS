/**
 * **Control parental** por perfil (inspirado en el `ParentalGuide` de NuvioTV
 * y en el PIN de perfil de WuPlay).
 *
 * NuvioTV consulta la guía parental de IMDb (violencia, desnudos, drogas…)
 * y la superpone al reproductor como aviso. Aquí, sin depender de servicios
 * externos, el control se aplica **en el servidor** sobre los metadatos que
 * ya circulan (clasificación `contentRating` cuando existe, géneros y
 * palabras clave), de modo que vale igual para la web TV, el shell Android y
 * el addon instalado en Stremio/WuPlay/Nuvio.
 *
 * Semántica de los niveles (madurez máxima permitida):
 *
 *   - `off`   — sin control parental: no se filtra nada.
 *   - `kids`  — hasta ~12 años: solo géneros infantiles/familiares y sin
 *               vocabulario adulto en nombre/descripción.
 *   - `teen`  — hasta ~15 años: se bloquea lo marcado para adultos y lo que
 *               declare clasificación ≥ 16 (R, TV-MA, 18…).
 *   - `adult` — hasta 18: solo se bloquea lo marcado explícitamente como
 *               contenido para adultos (XXX/erotismo).
 *
 * Cuando la ficha declara una clasificación por edades (`contentRating`,
 * `certification`) esta manda; si no existe, se aplican las heurísticas de
 * género y palabras clave. Los géneros bloqueados por el usuario se aplican
 * siempre, por encima del nivel.
 *
 * Desbloqueo: si el perfil tiene PIN y `requirePin` está activo, el cliente
 * puede enviar el PIN (`X-Vibe-Flix-Parental-Pin`) para reproducir un título
 * bloqueado; el PIN nunca sale del servidor (hash scrypt, como el del perfil).
 */

import type { MetaPreview } from '@vibeflix/addon-engine';

import { isAdult } from './filters.js';
import { normalizeGenre, normalizeText } from './genres.js';
import { verifyProfilePin } from './profile-pin.js';

/** Nivel de madurez máximo permitido por el control parental. */
export type MaturityLevel = 'off' | 'kids' | 'teen' | 'adult';

/** Reglas de control parental de un perfil. */
export interface ParentalSettings {
  /** Madurez máxima permitida (`off` = sin control parental). */
  maxMaturity: MaturityLevel;
  /** Géneros bloqueados siempre (adiccionales al nivel). */
  blockedGenres: string[];
  /**
   * Pedir el PIN del perfil para desbloquear un título restringido.
   * Con `false` (o sin PIN en el perfil) los títulos quedan ocultos y punto.
   */
  requirePin: boolean;
}

/** Sin control parental: la configuración por defecto. */
export const DEFAULT_PARENTAL: ParentalSettings = {
  maxMaturity: 'off',
  blockedGenres: [],
  requirePin: true,
};

/** Niveles con etiqueta legible (para la interfaz). */
export const MATURITY_LEVELS: Array<{ id: MaturityLevel; label: string; description: string }> = [
  { id: 'off', label: 'Sin control', description: 'No se filtra ningún contenido.' },
  { id: 'kids', label: 'Infantil (≤12)', description: 'Solo animación, familiar y títulos sin vocabulario adulto.' },
  { id: 'teen', label: 'Adolescente (≤15)', description: 'Bloquea contenido adulto y clasificaciones R/TV-MA/18.' },
  { id: 'adult', label: 'Adulto (≤18)', description: 'Solo bloquea el contenido marcado explícitamente como adulto.' },
];

const MATURITY_IDS: MaturityLevel[] = ['off', 'kids', 'teen', 'adult'];

/**
 * Edad máxima de cada nivel. La edad de una ficha se deduce de su
 * clasificación; si la ficha no la declara, mandan las heurísticas.
 */
const LEVEL_MAX_AGE: Record<MaturityLevel, number | null> = {
  off: null,
  kids: 12,
  teen: 15,
  adult: 18,
};

/** Géneros permitidos para el nivel infantil (lista blanca). */
const KIDS_ALLOWED_GENRES = new Set([
  'animation',
  'anime',
  'family',
  'adventure',
  'comedy',
  'fantasy',
  'music',
  'sci fi',
]);

/**
 * Palabras de contenido adulto en nombre/descripción. Lista corta y de alta
 * precisión: solo marca lo que de verdad no debe aparecer en perfiles
 * restringidos (el género hace el resto).
 */
const MATURE_WORDS = [
  'xxx',
  'porn',
  'porno',
  'pornografia',
  'pornographic',
  'erotic',
  'erotico',
  'erotica',
  'sexo explicito',
  'sex tape',
  'desnudo integral',
  'nudity',
];

/** Límite de intentos de PIN por perfil para el desbloqueo parental. */
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MS = 5 * 60 * 1000;

interface AttemptState {
  failures: number;
  blockedUntil: number;
}

const pinAttempts = new Map<string, AttemptState>();

/** Segundos que quedan de bloqueo tras varios PIN incorrectos (0 = sin bloqueo). */
export function parentalPinLockRemaining(profileId: string): number {
  const entry = pinAttempts.get(profileId);
  // `blockedUntil` solo se rellena al agotar los intentos: mientras tanto el
  // contador de fallos se conserva (no es un bloqueo «caducado»).
  if (!entry || !entry.blockedUntil) return 0;
  const remaining = Math.ceil((entry.blockedUntil - Date.now()) / 1000);
  if (remaining <= 0) {
    pinAttempts.delete(profileId);
    return 0;
  }
  return remaining;
}

function recordAttempt(profileId: string, ok: boolean): void {
  if (ok) {
    pinAttempts.delete(profileId);
    return;
  }
  const entry = pinAttempts.get(profileId) ?? { failures: 0, blockedUntil: 0 };
  entry.failures += 1;
  if (entry.failures >= MAX_PIN_ATTEMPTS) {
    entry.blockedUntil = Date.now() + PIN_LOCK_MS;
    entry.failures = 0;
  }
  pinAttempts.set(profileId, entry);
}

/** Completa y valida unas reglas parentales que llegan del cliente. */
export function normalizeParental(input: unknown): ParentalSettings {
  const raw = (input ?? {}) as Partial<Record<keyof ParentalSettings, unknown>>;
  const level = MATURITY_IDS.includes(raw.maxMaturity as MaturityLevel)
    ? (raw.maxMaturity as MaturityLevel)
    : DEFAULT_PARENTAL.maxMaturity;
  const blockedGenres = Array.isArray(raw.blockedGenres)
    ? raw.blockedGenres
        .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
        .map((entry) => normalizeGenre(entry))
        .filter(Boolean)
        .slice(0, 32)
    : DEFAULT_PARENTAL.blockedGenres;
  return {
    maxMaturity: level,
    blockedGenres,
    requirePin: typeof raw.requirePin === 'boolean' ? raw.requirePin : DEFAULT_PARENTAL.requirePin,
  };
}

/** true si unas reglas parentales restringen algo (para no filtrar en balde). */
export function parentalActive(rules: ParentalSettings | undefined): boolean {
  if (!rules || rules.maxMaturity === 'off') {
    return Boolean(rules?.blockedGenres?.length);
  }
  return true;
}

/**
 * Edad implícita en la clasificación por edades de la ficha, si la declara.
 *
 * Entiende las etiquetas habituales de IMDb/TMDB/TV (G, PG, PG-13, R, TV-14,
 * 18, +16…) y sus variantes. Devuelve `null` cuando no hay clasificación.
 */
export function ratingAgeOf(meta: MetaPreview): number | null {
  const candidate =
    (meta as { contentRating?: unknown }).contentRating ??
    (meta as { certification?: unknown }).certification;
  const raw = Array.isArray(candidate) ? candidate[0] : candidate;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const value = normalizeText(raw);

  if (/^(tv )?(ma|mature)|^r$|^nc 17|^18|^18$|^\+18|^x$|^xxx/.test(value)) return 18;
  if (/^(tv )?14|^pg 13|^15$|^\+15|^16$|^\+16/.test(value)) return 15;
  if (/^(tv )?pg$|^12$|^\+12|^13$|^\+13|^10$|^\+10/.test(value)) return 12;
  if (/^(tv )?g$|^(tv )?y$|^tv y7|^all$|^0$|^\+0$|^6$|^\+6|^7$|^\+7/.test(value)) return 7;
  // Etiquetas numéricas sueltas («14», «+16») ya están cubiertas arriba.
  const age = /^(\d{1,2})$/.exec(value);
  if (age) return Number(age[1]);
  return null;
}

/** true si el texto de la ficha contiene vocabulario adulto. */
function hasMatureVocabulary(meta: MetaPreview): boolean {
  const haystack = normalizeText(`${meta.name ?? ''} ${(meta.description ?? '').slice(0, 200)}`);
  return MATURE_WORDS.some((word) => haystack.includes(word));
}

/** Géneros normalizados de la ficha (vacío si no los declara). */
function genresOf(meta: MetaPreview): string[] {
  return (meta.genres ?? []).map((genre) => normalizeGenre(String(genre))).filter(Boolean);
}

/**
 * Motivo por el que la ficha queda bloqueada por el control parental del
 * perfil, o `null` si se permite.
 */
export function parentalBlockReason(
  meta: MetaPreview,
  rules: ParentalSettings | undefined,
): string | null {
  if (!parentalActive(rules)) return null;
  const settings = rules ?? DEFAULT_PARENTAL;
  const maxAge = LEVEL_MAX_AGE[settings.maxMaturity];

  // 1. Géneros bloqueados por el usuario: siempre, por encima del nivel.
  const genres = genresOf(meta);
  if (settings.blockedGenres.length) {
    const blocked = genres.filter((genre) => settings.blockedGenres.includes(genre));
    if (blocked.length) return `Género bloqueado (${blocked.join(', ')})`;
  }

  // 2. Nivel `off`: solo mandan los géneros bloqueados del usuario.
  if (settings.maxMaturity === 'off') return null;

  // 3. Contenido marcado explícitamente para adultos: bloqueado en todos los
  //    niveles con control parental activo.
  if (isAdult(meta) || hasMatureVocabulary(meta)) {
    return 'Contenido para adultos';
  }

  // 4. Clasificación por edades declarada: manda sobre las heurísticas.
  const age = ratingAgeOf(meta);
  if (age !== null && maxAge !== null && age > maxAge) {
    return `Clasificación no permitida para este perfil`;
  }

  // 5. Heurísticas por género cuando no hay clasificación.
  if (age === null && settings.maxMaturity === 'kids' && genres.length) {
    const allowed = genres.some((genre) => KIDS_ALLOWED_GENRES.has(genre));
    if (!allowed) return 'Género no apto para perfiles infantiles';
  }

  return null;
}

/** true si la ficha queda bloqueada por el control parental. */
export function isParentalRestricted(
  meta: MetaPreview,
  rules: ParentalSettings | undefined,
): boolean {
  return parentalBlockReason(meta, rules) !== null;
}

/**
 * Aplica el control parental a una lista de metas (filtrado de catálogos,
 * búsqueda, géneros y décadas). Conserva el orden original.
 */
export function applyParentalFilters(
  metas: MetaPreview[],
  rules: ParentalSettings | undefined,
): MetaPreview[] {
  if (!parentalActive(rules)) return metas;
  return metas.filter((meta) => !isParentalRestricted(meta, rules));
}

/**
 * Verifica el PIN de desbloqueo parental enviado por el cliente.
 *
 * `storedPin` es el hash del perfil (o su PIN legado en claro); `given` llega
 * en la cabecera `X-Vibe-Flix-Parental-Pin`. Devuelve `false` tras agotar los
 * intentos, con el mismo bloqueo temporal que el PIN de perfil.
 */
export function verifyParentalPin(profileId: string, storedPin: string, given: string): boolean {
  const wait = parentalPinLockRemaining(profileId);
  if (wait) return false;
  if (!given || given.length > 128) {
    recordAttempt(profileId, false);
    return false;
  }
  const ok = verifyProfilePin(storedPin, given);
  recordAttempt(profileId, ok);
  return ok;
}

/** Cabecera HTTP con el PIN de desbloqueo parental. */
export const PARENTAL_PIN_HEADER = 'x-vibe-flix-parental-pin';

/** Limpia los intentos de PIN (utilidad de tests). */
export function resetParentalPinAttempts(): void {
  pinAttempts.clear();
}
