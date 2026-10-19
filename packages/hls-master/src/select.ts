/**
 * Politicas de seleccion de variantes y pistas dentro de un master playlist.
 *
 * Un master de un stream de debrid suele traer 10-20 variantes (4K, 1080p, 720p,
 * audio 5.1/2.0, Dolby Vision...). Elegir a ciegas es lo que hace que un TV
 * ue un stream 4K HDR en un dispositivo que no lo soporta. Aqui se decide de
 * forma explicita segun las capacidades del dispositivo y las preferencias del
 * perfil (idioma de audio/subtitulos).
 */

import type { MasterPlaylist, MediaRendition, RenditionType, Variant } from './parser.js';

export interface DeviceCapabilities {
  /** Altura maxima soportada (2160, 1080, 720...). */
  maxHeight?: number;
  /** Codecs soportados, en orden de preferencia. */
  preferredCodecs?: string[];
  /** Soporta HDR/Dolby Vision. */
  supportsHdr?: boolean;
  /** Soporta video de alto rango dinamico. */
  supportsDolbyVision?: boolean;
  /** Tasa de cuadros maxima. */
  maxFrameRate?: number;
  /** Ancho de banda maximo estimado en Mbps. */
  maxBandwidthMbps?: number;
}

export interface SelectionPreferences {
  /** Idioma de audio preferido (ISO 639-1 o 639-2, p.ej. "es"). */
  audioLanguage?: string;
  /** Idioma de subtitulos preferido. */
  subtitleLanguage?: string;
  /** Prefiere que los subtitulos esten activados por defecto. */
  preferSubtitles?: boolean;
}

export interface VariantSelection {
  variant: Variant;
  audio?: MediaRendition;
  subtitles?: MediaRendition;
  /** Motivo de la eleccion (util para depurar en la UI). */
  reason: string;
}

const CODEC_RANK: Record<string, number> = {
  av1: 3,
  hevc: 2,
  h265: 2,
  vp9: 1,
  h264: 0,
  avc: 0,
};

function codecOf(variant: Variant): string {
  for (const codec of variant.codecs ?? []) {
    const key = codec.toLowerCase();
    if (key.startsWith('av01')) return 'av1';
    if (key.startsWith('hvc1') || key.startsWith('hev1')) return 'hevc';
    if (key.startsWith('vp09') || key.startsWith('vp9')) return 'vp9';
    if (key.startsWith('avc1') || key.startsWith('avc3')) return 'h264';
  }
  return 'h264';
}

function isHevc(codec: string): boolean {
  return codec === 'hevc';
}

/** Variante de audio puro (sin resolucion) en un master. */
function isAudioOnly(variant: Variant): boolean {
  return variant.height === undefined && variant.width === undefined;
}

/** ¿La variante es de alto rango dinamico (HDR10 / HLG)? */
function isHdrVariant(variant: Variant): boolean {
  if (variant.videoRange === 'PQ' || variant.videoRange === 'HLG') return true;
  const name = variant.name ?? '';
  return /\b(hdr|hdr10|hlg|dolby\s?vision|dovi)\b/i.test(name);
}

/** Normaliza "es", "spa", "es-ES" a un comparador de dos niveles. */
function languageMatches(candidate: string | undefined, wanted: string | undefined): boolean {
  if (!candidate || !wanted) return false;
  const a = candidate.toLowerCase().replace('_', '-');
  const b = wanted.toLowerCase().replace('_', '-');
  if (a === b) return true;
  const aPrimary = a.split('-')[0];
  const bPrimary = b.split('-')[0];
  // "es" (Latin American Spanish) y "spa" (Spanish) se consideran el mismo idioma.
  const aliases: Record<string, string> = { spa: 'es', eng: 'en', fre: 'fr', ger: 'de', deu: 'de' };
  return (aliases[aPrimary ?? ''] ?? aPrimary) === (aliases[bPrimary ?? ''] ?? bPrimary);
}

/** Puntuacion de una variante segun las capacidades del dispositivo. */
export function scoreVariant(variant: Variant, capabilities: DeviceCapabilities = {}): number {
  let score = 0;
  const height = variant.height ?? 0;

  if (capabilities.maxHeight) {
    if (height > capabilities.maxHeight) {
      // Penalizacion fuerte: no es reproducible.
      return -1000 + height;
    }
    score += height * 10;
  } else {
    score += height * 10;
  }

  if (capabilities.maxFrameRate && variant.frameRate) {
    if (variant.frameRate > capabilities.maxFrameRate) score -= 40;
    else score += 20;
  }

  if (capabilities.maxBandwidthMbps && variant.bandwidth) {
    const mbps = variant.bandwidth / 1_000_000;
    if (mbps > capabilities.maxBandwidthMbps) score -= 60;
  }

  const codec = codecOf(variant);
  const preferred = capabilities.preferredCodecs ?? [];
  const preferredIndex = preferred.findIndex((entry) => entry.toLowerCase() === codec);
  if (preferredIndex >= 0) score += 60 - preferredIndex * 15;
  score += (CODEC_RANK[codec] ?? 0) * 8;

  const isHdr = variant.videoRange === 'PQ' || variant.videoRange === 'HLG';
  if (isHdr) {
    if (capabilities.supportsHdr) score += 40;
    else score -= 120;
  }

  // Bitrate: a igual resolucion, mejor el mas alto (dentro del margen de red).
  score += Math.min((variant.bandwidth ?? 0) / 1_000_000, 60);

  return score;
}

/** Selecciona la mejor variante del master segun las capacidades. */
export function selectVariant(
  master: MasterPlaylist,
  capabilities: DeviceCapabilities = {},
): Variant | undefined {
  let candidates = master.variants.filter((variant) => !isAudioOnly(variant));
  if (!candidates.length) candidates = master.variants;

  // Un dispositivo sin soporte HDR no debe recibir variantes PQ/HLG: se
  // reproducibles pero con washed colors, por eso se descartan de entrada.
  if (capabilities.supportsHdr === false) {
    const sdr = candidates.filter((variant) => !isHdrVariant(variant));
    if (sdr.length) candidates = sdr;
  }

  if (!candidates.length) return undefined;

  let best: Variant | undefined;
  let bestScore = -Infinity;
  for (const variant of candidates) {
    const score = scoreVariant(variant, capabilities);
    if (score > bestScore) {
      bestScore = score;
      best = variant;
    }
  }
  return best;
}

/** Selecciona una pista (audio o subtitulos) por idioma y preferencias. */
export function selectRendition(
  master: MasterPlaylist,
  type: RenditionType,
  options: {
    groupId?: string;
    language?: string;
    preferDefault?: boolean;
  } = {},
): MediaRendition | undefined {
  const pool = master.renditions.filter(
    (rendition) =>
      rendition.type === type && (!options.groupId || rendition.groupId === options.groupId),
  );
  if (!pool.length) return undefined;

  if (options.language) {
    const exact = pool.find((rendition) => languageMatches(rendition.language, options.language));
    if (exact) return exact;
    const partial = pool.find((rendition) => languageMatches(rendition.language, options.language));
    if (partial) return partial;
  }

  if (options.preferDefault !== false) {
    const fallback = pool.find((rendition) => rendition.isDefault) ?? pool.find((rendition) => rendition.autoselect);
    if (fallback) return fallback;
  }
  return pool[0];
}

/**
 * Seleccion completa: variante + pistas de audio y subtitulos.
 * Es lo que usa el reproductor para fijar la calidad y los idiomas.
 */
export function selectBest(
  master: MasterPlaylist,
  options: {
    capabilities?: DeviceCapabilities;
    preferences?: SelectionPreferences;
  } = {},
): VariantSelection | undefined {
  const variant = selectVariant(master, options.capabilities ?? {});
  if (!variant) return undefined;

  const audio = selectRendition(master, 'AUDIO', {
    groupId: variant.audioGroup,
    language: options.preferences?.audioLanguage,
  });
  const subtitles = options.preferences?.preferSubtitles
    ? selectRendition(master, 'SUBTITLES', {
        groupId: variant.subtitleGroup,
        language: options.preferences?.subtitleLanguage,
      })
    : undefined;

  return {
    variant,
    audio,
    subtitles,
    reason: `height=${variant.height ?? 'n/a'} codec=${codecOf(variant)} range=${variant.videoRange ?? 'SDR'}`,
  };
}

/** Lista de variantes ordenada de mejor a peor para mostrarla en la UI. */
export function listVariants(
  master: MasterPlaylist,
  capabilities: DeviceCapabilities = {},
): Variant[] {
  return [...master.variants].sort(
    (a, b) => scoreVariant(b, capabilities) - scoreVariant(a, capabilities),
  );
}

export { codecOf, isHevc, languageMatches };
