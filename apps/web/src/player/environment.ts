/**
 * Deteccion del dispositivo para el reproductor.
 *
 * Se separa del reproductor porque la necesitan dos sitios: `Player.tsx` (para
 * calcular el techo de calidad al arrancar) y la pantalla de Ajustes (para el
 * boton «Detectar dispositivo»). Un solo lugar donde leer el entorno evita que
 * las dos vistas discrepen.
 *
 * Todo lo que se lee es opcional: en navegadores sin `deviceMemory` o sin
 * Network Information API el resultado simplemente no incluye ese dato y
 * `detectCapabilities()` aplica sus valores por defecto.
 */

import type { DeviceEnvironment } from '@vibeflix/player-core';

/** `canPlayType` del video pasado, si se proporciona. */
export type CanPlayProbe = (mime: string) => string;

/**
 * Lee el entorno del navegador.
 *
 * @param video elemento de video opcional para probar codecs reales.
 */
export function deviceEnvironment(video?: HTMLVideoElement | null): DeviceEnvironment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return {};

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; downlink?: number; saveData?: boolean };
  };

  const hdr = (): boolean => {
    const probe = (query: string): boolean => {
      try {
        return window.matchMedia?.(query).matches ?? false;
      } catch {
        return false;
      }
    };
    return probe('(dynamic-range: high)') || probe('(video-dynamic-range: high)');
  };

  const wideColorGamut = (): boolean => {
    try {
      return window.matchMedia?.('(color-gamut: p3)').matches ?? false;
    } catch {
      return false;
    }
  };

  return {
    screenHeight: window.screen?.height,
    screenWidth: window.screen?.width,
    devicePixelRatio: window.devicePixelRatio,
    hdrMediaQuery: hdr(),
    wideColorGamut: wideColorGamut(),
    canPlay: video ? (mime: string) => video.canPlayType(mime) : undefined,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    connection: nav.connection,
    userAgent: navigator.userAgent,
    // La mayoria de paneles son de 60 Hz; `screen.refreshRate` solo existe en
    // algunos Chromium y, cuando no, mejor no inventar un techo de 120 fps.
    refreshRate: (window.screen as Screen & { refreshRate?: number }).refreshRate ?? 60,
  };
}
