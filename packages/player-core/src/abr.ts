/**
 * Plan de arranque del reproductor (ABR).
 *
 * Es la pieza que conecta el **nucleo HLS master del servidor** con el
 * reproductor del cliente: el servidor ya ha elegido la mejor variante segun
 * las capacidades del dispositivo (`@vibeflix/hls-master`), y aqui esa
 * decision se traduce a los parametros reales de hls.js / MSE.
 *
 * Por que hace falta:
 *  - Arrancar en la variante mas alta (lo intuitivo) satura un TV box y tarda
 *    mas en pintar el primer fotograma.
 *  - Arrancar siempre en auto (lo que hace hls.js por defecto) empieza con una
 *    estimacion de ancho de banda de 500 kbps y sube poco a poco: el usuario
 *    ve 30 s de 480p teniendo fibra.
 *  - La solucion es **sembrar** el estimador ABR con el bitrate de la variante
 *    elegida por el servidor y limitar el nivel maximo al techo real del
 *    dispositivo (altura, HDR y bitrate maximo), dejando que el ABR siga
 *    adaptandose despues.
 *
 * Todo es logica pura: sin hls.js ni DOM, testeable en Node y reutilizable
 * desde el shell Android si se quisiera aplicar la misma politica.
 */

/** Nivel de reproduccion tal y como lo ve el cliente (hls.js `Level`). */
export interface ClientLevel {
  /** URI del playlist de la variante. */
  uri?: string;
  /** Bitrate declarado en bps. */
  bitrate?: number;
  /** Altura en pixeles. */
  height?: number;
  /** Ancho en pixeles. */
  width?: number;
  /** Rango de video declarado (SDR, PQ, HLG). */
  videoRange?: string;
  /** Codecs declarados. */
  codecs?: string[];
  /** Nombre legible, si el playlist lo trae. */
  name?: string;
}

/** Variante elegida por el servidor (`/hls/master` → `selected.variant`). */
export interface ServerVariant {
  uri?: string;
  height?: number;
  width?: number;
  bandwidth?: number;
  averageBandwidth?: number;
  videoRange?: string;
  codecs?: string[];
  name?: string;
}

/** Capacidades y limites del dispositivo. */
export interface PlaybackCapabilities {
  /** Altura maxima del panel (1080, 2160...). */
  maxHeight?: number;
  /** Ancho de banda maximo usable en Mbps (0 o undefined = sin limite). */
  maxBandwidthMbps?: number;
  /** Soporta HDR10/HLG. */
  supportsHdr?: boolean;
  /** Soporta Dolby Vision. */
  supportsDolbyVision?: boolean;
  /** Tamano real del elemento de video (para no decodificar de mas). */
  playerWidth?: number;
  playerHeight?: number;
}

export interface StartupPlan {
  /** Nivel inicial (indice en `levels`); `-1` deja que el ABR decida. */
  startLevel: number;
  /** Nivel maximo permitido (`-1` = sin limite). */
  capLevel: number;
  /** Bitrate maximo para el ABR en bps (`undefined` = sin limite). */
  maxBitrate?: number;
  /** Semilla del estimador ABR (bps). */
  abrEwmaDefaultEstimate: number;
  /** Mantener el ABR activo tras el arranque. */
  autoLevel: boolean;
  /** Motivo legible (se muestra en el panel de estadisticas). */
  reason: string;
}

/** Bitrate por defecto que hls.js usa como estimacion inicial. */
export const HLS_DEFAULT_ABR_ESTIMATE = 500_000;

/** Margen de seguridad sobre el bitrate declarado antes de arrancar. */
const STARTUP_HEADROOM = 1.15;

/** Bitrate minimo razonable para sembrar el ABR. */
const MIN_SEED_BITRATE = 800_000;

/** true si la variante anuncia HDR (PQ/HLG) o Dolby Vision. */
export function isHdrLevel(level: ClientLevel): boolean {
  const range = (level.videoRange ?? '').toUpperCase();
  if (range === 'PQ' || range === 'HLG') return true;
  const codecs = (level.codecs ?? []).join(' ').toLowerCase();
  return codecs.includes('dvh1') || codecs.includes('dvhe') || codecs.includes('hvc1.2');
}

/** Altura efectiva de un nivel (0 si no se declara). */
export function levelHeight(level: ClientLevel): number {
  return level.height ?? 0;
}

/**
 * Indice del nivel que se corresponde con la variante elegida por el servidor.
 *
 * Primero se intenta por URI (coincidencia exacta o ignorando la query, que
 * muchos CDN rotan con tokens) y, si no aparece, por la pareja altura/bitrate
 * mas cercana: los proxys y reescritores de playlists cambian las URIs.
 */
export function matchLevelIndex(levels: ClientLevel[], variant?: ServerVariant | null): number {
  if (!variant || !levels.length) return -1;

  const normalize = (value?: string): string => (value ?? '').split('?')[0]?.replace(/\/+$/, '') ?? '';
  const target = normalize(variant.uri);
  if (target) {
    const exact = levels.findIndex((level) => normalize(level.uri) === target);
    if (exact >= 0) return exact;
  }

  const height = variant.height ?? 0;
  const bitrate = variant.bandwidth ?? variant.averageBandwidth ?? 0;
  let best = -1;
  let bestScore = -Infinity;
  levels.forEach((level, index) => {
    if (!height && !bitrate) return;
    const heightDelta = Math.abs(levelHeight(level) - height);
    const bitrateDelta = Math.abs((level.bitrate ?? 0) - bitrate) / Math.max(bitrate, 1);
    // La altura pesa mucho mas que el bitrate: es lo que el usuario percibe.
    const score = -heightDelta * 4 - bitrateDelta * 100;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

/**
 * Nivel maximo reproducible segun el techo del dispositivo.
 *
 * Descarta (no solo penaliza) lo que el panel no puede mostrar: por encima de
 * `maxHeight`, HDR en un dispositivo sin HDR y por encima del bitrate maximo.
 * Devuelve `-1` cuando ningun nivel queda limitado.
 */
export function capLevelIndex(levels: ClientLevel[], capabilities: PlaybackCapabilities = {}): number {
  if (!levels.length) return -1;

  const heightCeiling = Math.min(
    capabilities.maxHeight ?? Infinity,
    capabilities.playerHeight || Infinity,
  );
  const bandwidthCeiling = capabilities.maxBandwidthMbps
    ? capabilities.maxBandwidthMbps * 1_000_000
    : Infinity;

  const usable = levels
    .map((level, index) => ({ level, index }))
    .filter(({ level }) => {
      if (heightCeiling !== Infinity && levelHeight(level) > heightCeiling) return false;
      if (capabilities.supportsHdr === false && isHdrLevel(level)) return false;
      if (bandwidthCeiling !== Infinity && (level.bitrate ?? 0) > bandwidthCeiling) return false;
      return true;
    });

  // Si ningun nivel cabe en el techo, se degrada al mas pequeno en vez de
  // quedarse sin reproduccion: es lo que hacen los clientes de TV.
  const pool = usable.length ? usable : levels.map((level, index) => ({ level, index }));
  const top = usable.length
    ? pool.reduce((acc, entry) => (levelHeight(entry.level) >= levelHeight(acc.level) ? entry : acc))
    : pool.reduce((acc, entry) => (levelHeight(entry.level) <= levelHeight(acc.level) ? entry : acc));
  const isLast = top.index === levels.length - 1;
  const unbounded = usable.length === levels.length && heightCeiling === Infinity;
  return isLast && unbounded ? -1 : top.index;
}

/**
 * Plan de arranque: que nivel usar al empezar, que techo poner y con que
 * estimacion de ancho de banda arranca el ABR.
 */
export function planStartup(options: {
  levels: ClientLevel[];
  variant?: ServerVariant | null;
  capabilities?: PlaybackCapabilities;
  /** Techo de bitrate elegido por el usuario (Mbps). */
  maxBitrateMbps?: number;
  /** Calidad fijada manualmente por el usuario (indice de nivel). */
  pinnedLevel?: number;
}): StartupPlan {
  const { levels, variant, capabilities = {}, maxBitrateMbps, pinnedLevel } = options;
  if (!levels.length) {
    return {
      startLevel: -1,
      capLevel: -1,
      abrEwmaDefaultEstimate: HLS_DEFAULT_ABR_ESTIMATE,
      autoLevel: true,
      reason: 'sin niveles',
    };
  }

  const limits: PlaybackCapabilities = { ...capabilities };
  if (maxBitrateMbps && maxBitrateMbps > 0) {
    const current = limits.maxBandwidthMbps ?? Infinity;
    limits.maxBandwidthMbps = Math.min(current, maxBitrateMbps);
  }

  const capLevel = pinnedLevel !== undefined && pinnedLevel >= 0
    ? Math.min(pinnedLevel, levels.length - 1)
    : capLevelIndex(levels, limits);

  const serverIndex = matchLevelIndex(levels, variant);
  const wanted = serverIndex >= 0 ? serverIndex : capLevel >= 0 ? capLevel : levels.length - 1;
  const startLevel = capLevel >= 0 && wanted > capLevel ? capLevel : wanted;

  const startBitrate = levels[startLevel]?.bitrate ?? 0;
  const seedFromVariant = variant?.bandwidth ?? variant?.averageBandwidth ?? 0;
  const seed = Math.max(startBitrate, seedFromVariant) * STARTUP_HEADROOM;
  const maxBitrate = limits.maxBandwidthMbps ? Math.round(limits.maxBandwidthMbps * 1_000_000) : undefined;

  let estimate = seed >= MIN_SEED_BITRATE ? Math.round(seed) : HLS_DEFAULT_ABR_ESTIMATE;
  if (maxBitrate) estimate = Math.min(estimate, maxBitrate);

  const reasons: string[] = [];
  if (serverIndex >= 0) reasons.push(`variante del servidor (#${serverIndex})`);
  else reasons.push('sin variante del servidor');
  if (capLevel >= 0) reasons.push(`techo ${levelHeight(levels[capLevel] ?? {}) || '?'}p`);
  if (maxBitrate) reasons.push(`max ${(maxBitrate / 1_000_000).toFixed(1)} Mbps`);
  if (pinnedLevel !== undefined && pinnedLevel >= 0) reasons.push('calidad fijada');

  return {
    startLevel: pinnedLevel !== undefined && pinnedLevel >= 0 ? startLevel : startLevel,
    capLevel,
    ...(maxBitrate ? { maxBitrate } : {}),
    abrEwmaDefaultEstimate: estimate,
    autoLevel: pinnedLevel === undefined || pinnedLevel < 0,
    reason: reasons.join(' · '),
  };
}

/** Etiqueta corta de calidad para la interfaz ("1080p", "4K HDR"). */
export function qualityLabel(level?: ClientLevel | null): string {
  if (!level) return '';
  const height = levelHeight(level);
  if (!height) {
    const bitrate = level.bitrate ?? 0;
    return bitrate ? formatBitrate(bitrate) : 'auto';
  }
  const base = height >= 2160 ? '4K' : height >= 1440 ? '1440p' : `${height}p`;
  const hdr = isHdrLevel(level);
  return hdr ? `${base} HDR` : base;
}

/** Formatea un bitrate en bps como texto legible. */
export function formatBitrate(bitrate: number): string {
  if (!Number.isFinite(bitrate) || bitrate <= 0) return '0 Mbps';
  const mbps = bitrate / 1_000_000;
  return mbps >= 10 ? `${mbps.toFixed(0)} Mbps` : `${mbps.toFixed(1)} Mbps`;
}
