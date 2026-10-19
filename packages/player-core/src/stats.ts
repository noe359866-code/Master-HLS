/**
 * Estadisticas de reproduccion.
 *
 * Stremio tiene un menu de estadisticas (`SETTINGS_SHORTCUT_MENU_STATISTICS`) y
 * NuvioTV expone el rendimiento del decoder. En la web los mismos datos salen
 * de hls.js (bitrate, estimacion de ancho de banda, nivel) y del elemento de
 * video (`getVideoPlaybackQuality()`, `buffered`).
 *
 * Aqui solo se calculan y se formatean: nada de DOM.
 */

import { formatBitrate, qualityLabel, type ClientLevel } from './abr.js';

/** Rango de buffer del elemento de video (interface minima, compatible con `TimeRanges`). */
export interface BufferedRanges {
  readonly length: number;
  start(index: number): number;
  end(index: number): number;
}

export interface PlaybackStats {
  /** Nivel activo (-1 = auto). */
  currentLevel: number;
  /** Nivel que se esta reproduciendo realmente. */
  activeLevel?: ClientLevel | null;
  /** ABR activo. */
  autoLevel: boolean;
  /** Estimacion de ancho de banda de hls.js (bps). */
  bandwidthEstimate: number;
  /** Segundos de video por delante de la posicion actual. */
  bufferedAhead: number;
  /** Segundos de video por detras (back buffer). */
  bufferBehind: number;
  /** Fotogramas descartados por el decoder. */
  droppedFrames: number;
  /** Fotogramas decodificados. */
  decodedFrames: number;
  /** Milisegundos hasta el primer fotograma. */
  timeToFirstFrameMs?: number;
  /** Numero de parones (rebuffering). */
  stallCount: number;
  /** Milisegundos totales de parones. */
  stallTotalMs: number;
  /** Bitrate del nivel activo (bps). */
  bitrate: number;
}

/** Segundos de video por delante de `time`. */
export function bufferAhead(buffered: BufferedRanges | null | undefined, time: number): number {
  if (!buffered || !buffered.length) return 0;
  let best = 0;
  for (let index = 0; index < buffered.length; index += 1) {
    const start = buffered.start(index);
    const end = buffered.end(index);
    if (time >= start - 0.5 && time <= end) best = Math.max(best, end - time);
    else if (start > time) best = Math.max(best, 0);
  }
  return Math.max(0, best);
}

/** Segundos de video guardados por detras de `time` (back buffer). */
export function bufferBehind(buffered: BufferedRanges | null | undefined, time: number): number {
  if (!buffered || !buffered.length) return 0;
  let behind = 0;
  for (let index = 0; index < buffered.length; index += 1) {
    const start = buffered.start(index);
    const end = buffered.end(index);
    if (end <= time) behind = Math.max(behind, end - start);
    else if (start < time) behind = Math.max(behind, time - start);
  }
  return behind;
}

/** Salud del buffer segun los segundos por delante. */
export function bufferHealth(aheadSeconds: number): 'good' | 'fair' | 'poor' {
  if (aheadSeconds >= 20) return 'good';
  if (aheadSeconds >= 6) return 'fair';
  return 'poor';
}

/** Porcentaje de fotogramas descartados (calidad del decoder). */
export function droppedRatio(stats: Pick<PlaybackStats, 'droppedFrames' | 'decodedFrames'>): number {
  const total = stats.decodedFrames + stats.droppedFrames;
  if (!total) return 0;
  return stats.droppedFrames / total;
}

/** Filas listas para pintar en el panel de estadisticas. */
export function describeStats(stats: PlaybackStats): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Calidad', value: qualityLabel(stats.activeLevel) || 'auto' },
    {
      label: 'Bitrate',
      value: stats.bitrate ? formatBitrate(stats.bitrate) : '—',
    },
    { label: 'Ancho de banda', value: formatBitrate(stats.bandwidthEstimate) },
    { label: 'Buffer', value: `${stats.bufferedAhead.toFixed(1)} s` },
    { label: 'Back buffer', value: `${stats.bufferBehind.toFixed(1)} s` },
    {
      label: 'Fotogramas',
      value: `${stats.decodedFrames} / -${stats.droppedFrames}`,
    },
    { label: 'Parones', value: `${stats.stallCount} (${(stats.stallTotalMs / 1000).toFixed(1)} s)` },
  ];
  if (stats.timeToFirstFrameMs !== undefined) {
    rows.push({ label: 'Arranque', value: `${Math.round(stats.timeToFirstFrameMs)} ms` });
  }
  rows.push({ label: 'ABR', value: stats.autoLevel ? 'activo' : 'manual' });
  return rows;
}
