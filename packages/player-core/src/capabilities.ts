/**
 * Capacidades reales del dispositivo de reproduccion.
 *
 * El nucleo HLS del servidor decide la variante segun las capacidades que le
 * declare el cliente (`maxHeight`, `supportsHdr`, `preferredCodecs`,
 * `maxBandwidthMbps`). Hasta ahora la web usaba valores fijos (1080p, sin HDR),
 * asi que en un TV 4K con HDR se elegia una variante peor y en un movil con red
 * lenta una demasiado grande.
 *
 * Estas funciones reciben un **entorno** (no tocan `window` ni `navigator`
 * directamente) para poder testearlas y para que el shell Android pueda
 * reutilizar la misma politica con sus propios valores.
 */

import type { PlaybackCapabilities } from './abr.js';

/** Entorno minimo que necesita la deteccion. */
export interface DeviceEnvironment {
  /** Altura fisica de la pantalla en pixeles CSS. */
  screenHeight?: number;
  screenWidth?: number;
  devicePixelRatio?: number;
  /** `(dynamic-range: high)` o `(video-dynamic-range: high)`. */
  hdrMediaQuery?: boolean;
  wideColorGamut?: boolean;
  /** Resultado de `video.canPlayType(...)`. */
  canPlay?: (mime: string) => string;
  /** Nucleos de CPU. */
  hardwareConcurrency?: number;
  /** Memoria del dispositivo en GB (API de Chromium). */
  deviceMemory?: number;
  /** Informacion de red (Network Information API). */
  connection?: { effectiveType?: string; downlink?: number; saveData?: boolean };
  userAgent?: string;
  /** Refresco de pantalla en Hz. */
  refreshRate?: number;
}

/** Codecs de video que se prueban, en orden de preferencia. */
export const CODEC_PROBES: Array<{ id: string; mime: string }> = [
  { id: 'av1', mime: 'video/mp4; codecs="av01.0.08M.08"' },
  { id: 'hevc', mime: 'video/mp4; codecs="hvc1.1.6.L120.90"' },
  { id: 'vp9', mime: 'video/webm; codecs="vp09.00.10.08"' },
  { id: 'h264', mime: 'video/mp4; codecs="avc1.640028"' },
];

/** Altura maxima tipica segun la resolucion de la pantalla. */
export function displayCeiling(height?: number, width?: number): number {
  const longest = Math.max(height ?? 0, width ?? 0);
  if (longest >= 3800) return 2160;
  if (longest >= 2500) return 1440;
  if (longest >= 1900) return 1080;
  if (longest >= 1200) return 720;
  if (longest >= 700) return 540;
  return longest ? 480 : 1080;
}

/** Codecs reproducibles, en orden de preferencia (mejor compresion primero). */
export function supportedCodecs(env: DeviceEnvironment): string[] {
  if (!env.canPlay) return ['h264'];
  const supported: string[] = [];
  for (const probe of CODEC_PROBES) {
    const answer = env.canPlay(probe.mime);
    if (answer === 'probably' || answer === 'maybe') supported.push(probe.id);
  }
  return supported.length ? supported : ['h264'];
}

/**
 * Ancho de banda maximo razonable en Mbps.
 *
 * Se parte del `downlink` declarado por el navegador (Chromium) y se recorta
 * segun la red efectiva y el modo de ahorro de datos. Sin informacion se
 * devuelve `undefined` (sin limite) para no capar artificialmente.
 */
export function estimateBandwidthMbps(env: DeviceEnvironment): number | undefined {
  const connection = env.connection;
  if (!connection) return undefined;
  let mbps = typeof connection.downlink === 'number' && connection.downlink > 0
    ? connection.downlink
    : undefined;

  if (!mbps) {
    const byType: Record<string, number> = {
      'slow-2g': 0.1,
      '2g': 0.4,
      '3g': 2,
      '4g': 12,
      '5g': 40,
    };
    mbps = byType[connection.effectiveType ?? ''] ?? undefined;
  }
  if (!mbps) return undefined;
  // El video no deberia comerse todo el enlace: se deja un 25 % de margen.
  let usable = mbps * 0.75;
  if (connection.saveData) usable = Math.min(usable, 1.5);
  return Math.max(0.5, Number(usable.toFixed(1)));
}

/** true si el dispositivo puede con HDR (HDR10/HLG). */
export function supportsHdr(env: DeviceEnvironment): boolean {
  if (env.hdrMediaQuery) return true;
  const codecs = supportedCodecs(env);
  // Sin la media query, se exige HEVC (el HDR en web llega por HEVC/VP9).
  return codecs.includes('hevc') || codecs.includes('vp9') || codecs.includes('av1');
}

/** true si parece un dispositivo Dolby Vision (muy raro en web). */
export function supportsDolbyVision(env: DeviceEnvironment): boolean {
  const answer = env.canPlay?.('video/mp4; codecs="dvh1.05.01"') ?? '';
  return answer === 'probably' || answer === 'maybe';
}

/** Refresco maximo asumible (Hz). */
export function frameRateCeiling(env: DeviceEnvironment): number {
  if (env.refreshRate && env.refreshRate > 0) return Math.round(env.refreshRate);
  const ua = env.userAgent ?? '';
  if (/120\s?Hz|SM-G9[89]|iPhone1[4-6]/i.test(ua)) return 120;
  return 60;
}

/**
 * Capacidades completas listas para enviarse al servidor (`/hls/master`).
 */
export function detectCapabilities(env: DeviceEnvironment): PlaybackCapabilities & {
  preferredCodecs: string[];
  maxFrameRate: number;
  supportsDolbyVision: boolean;
} {
  const ceiling = displayCeiling(
    env.screenHeight ? Math.round(env.screenHeight * (env.devicePixelRatio || 1)) : undefined,
    env.screenWidth ? Math.round(env.screenWidth * (env.devicePixelRatio || 1)) : undefined,
  );
  const codecs = supportedCodecs(env);
  return {
    maxHeight: ceiling,
    maxFrameRate: frameRateCeiling(env),
    supportsHdr: supportsHdr(env),
    supportsDolbyVision: supportsDolbyVision(env),
    preferredCodecs: codecs,
    ...(estimateBandwidthMbps(env) !== undefined
      ? { maxBandwidthMbps: estimateBandwidthMbps(env) }
      : {}),
  };
}
/** true si el dispositivo es de gama baja (recorta animaciones y buffers). */
export function isLowEndDevice(env: DeviceEnvironment): boolean {
  const cores = env.hardwareConcurrency ?? 8;
  const memory = env.deviceMemory ?? 8;
  return cores <= 4 || memory <= 2;
}
