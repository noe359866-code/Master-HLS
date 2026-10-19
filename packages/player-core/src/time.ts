/**
 * Tiempo y posicion en el reproductor.
 *
 * Incluye lo que WuPlay muestra en la barra («Ends at 22:40») y los saltos
 * rapidos por porcentaje, ademas de un reloj que usa **digitos estandar** en
 * cualquier idioma (WuPlay v0.9.3 corrigio justo eso: numeros arabes o
 * devanagari en el reloj del reproductor rompian la lectura en TV).
 */

/** Formatea segundos como `h:mm:ss` o `m:ss`, siempre con digitos ASCII. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  const ascii = (value: string) => toAsciiDigits(value);
  return hours > 0
    ? ascii(`${hours}:${pad(minutes)}:${pad(secs)}`)
    : ascii(`${minutes}:${pad(secs)}`);
}

/** Convierte digitos de cualquier sistema de escritura a ASCII (0-9). */
export function toAsciiDigits(value: string): string {
  return value.replace(/[^\u0030-\u0039]/g, (character) => {
    const code = character.codePointAt(0) ?? 0;
    // Bloques numericos comunes: arabes-indicos, devanagari, bengali, persas.
    const blocks = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0e50, 0x0ed0, 0x0f20, 0xff10];
    for (const base of blocks) {
      if (code >= base && code <= base + 9) return String(code - base);
    }
    return character;
  });
}

/** Hora de fin estimada («Termina a las 22:40»). */
export function endsAt(remainingSeconds: number, now: Date = new Date()): string {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return '';
  const end = new Date(now.getTime() + remainingSeconds * 1000);
  return toAsciiDigits(
    `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
  );
}

/** Limita un salto a los bordes del medio. */
export function clampSeek(time: number, duration: number): number {
  if (!Number.isFinite(time)) return 0;
  const max = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
  return Math.min(Math.max(0, time), max);
}

/** Posicion correspondiente a un porcentaje del medio. */
export function seekToPercent(percent: number, duration: number): number {
  const ratio = Math.min(100, Math.max(0, percent)) / 100;
  return clampSeek(duration * ratio, duration);
}

/** Porcentaje reproducido (0-100), seguro con duraciones desconocidas. */
export function progressPercent(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(100, Math.max(0, (time / duration) * 100));
}

/** Velocidades de reproduccion ofrecidas (Stremio/WuPlay usan la misma escala). */
export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

/** Siguiente velocidad de la escala (o la misma en el extremo). */
export function nextSpeed(current: number, direction: 1 | -1): number {
  const speeds = [...PLAYBACK_SPEEDS];
  const index = speeds.findIndex((speed) => Math.abs(speed - current) < 0.01);
  if (index === -1) return 1;
  const next = index + direction;
  if (next < 0 || next >= speeds.length) return speeds[index] ?? 1;
  return speeds[next] ?? 1;
}

/** Etiqueta de velocidad («1.25x»). */
export function speedLabel(speed: number): string {
  return `${toAsciiDigits(speed.toFixed(2).replace(/\.?0+$/, ''))}x`;
}

/** Pasos de salto rapido (segundos) usados por los atajos. */
export const SEEK_STEPS = {
  short: 10,
  long: 60,
  tiny: 5,
} as const;

/** Pasos del desfase de subtitulos (Stremio usa G/H con 0.25 s). */
export const SUBTITLE_DELAY_STEP_MS = 250;

/** Formatea un desfase de subtitulos («+0.25 s»). */
export function formatDelay(offsetMs: number): string {
  const seconds = offsetMs / 1000;
  const sign = seconds > 0 ? '+' : seconds < 0 ? '−' : '';
  return `${sign}${toAsciiDigits(Math.abs(seconds).toFixed(2))} s`;
}
