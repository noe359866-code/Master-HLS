/**
 * Dimensionado del buffer de reproduccion.
 *
 * NuvioTV tiene un `BitrateAwareLoadControl` que liga el buffer a un
 * **presupuesto de memoria** del dispositivo en vez de a un numero de segundos
 * fijo, y lo ajusta en caliente cuando el stream resulta ser mas pesado de lo
 * esperado (Dolby Vision, por ejemplo). En la web los parametros equivalentes
 * de hls.js son `maxBufferLength` (segundos), `maxBufferSize` (bytes) y
 * `backBufferLength` (segundos hacia atras).
 *
 * Aqui se calculan los tres segun el dispositivo y el bitrate real, con la
 * misma idea: que un TV box con 1 GB de RAM no reserve 60 MB de video y que
 * una fibra con un stream de 40 Mbps no llene memoria inutilmente.
 */

/** Presupuesto de memoria segun el dispositivo. */
export interface BufferDevice {
  /** Memoria del dispositivo en GB (si se conoce). */
  deviceMemory?: number;
  /** Nucleos de CPU. */
  hardwareConcurrency?: number;
  /** true si es un dispositivo de gama baja. */
  lowEnd?: boolean;
}

export interface BufferPlan {
  /** Segundos de video por delante (objetivo). */
  maxBufferLength: number;
  /** Bytes maximos del buffer. */
  maxBufferSize: number;
  /** Techo absoluto de segundos. */
  maxMaxBufferLength: number;
  /** Segundos que se conservan por detras (para retroceder sin red). */
  backBufferLength: number;
  /** Motivo legible. */
  reason: string;
}

/** Bytes por segundo estimados a partir del bitrate declarado. */
export function bytesPerSecond(bitrate: number): number {
  return Math.max(0, bitrate) / 8;
}

/**
 * Plan de buffer.
 *
 * @param bitrate bps del nivel activo (0 si se desconoce)
 */
export function planBuffer(options: {
  device?: BufferDevice;
  bitrate?: number;
  /** Contenido en directo: buffers cortos para no ir con retraso. */
  live?: boolean;
  /** Preferencia del usuario en segundos (0 = automatico). */
  preferredSeconds?: number;
}): BufferPlan {
  const { device = {}, bitrate = 0, live = false, preferredSeconds } = options;
  const memoryGb = device.deviceMemory ?? 4;
  const lowEnd = device.lowEnd ?? (memoryGb <= 2 || (device.hardwareConcurrency ?? 4) <= 2);

  // Presupuesto: el 6 % de la RAM del dispositivo, entre 8 y 96 MB.
  const budget = Math.min(96, Math.max(8, memoryGb * 1024 * 0.06)) * 1024 * 1024;

  if (live) {
    return {
      maxBufferLength: 12,
      maxBufferSize: Math.round(budget / 2),
      maxMaxBufferLength: 30,
      backBufferLength: 10,
      reason: 'directo: buffer corto para ir al borde',
    };
  }

  const seconds = lowEnd ? 25 : 45;
  const byBitrate = bitrate > 0 ? budget / bytesPerSecond(bitrate) : seconds;
  let target = Math.max(10, Math.min(seconds, byBitrate));
  if (preferredSeconds && preferredSeconds > 0) {
    target = Math.min(Math.max(5, preferredSeconds), 120);
  }

  return {
    maxBufferLength: Math.round(target),
    maxBufferSize: Math.round(Math.min(budget, Math.max(8 * 1024 * 1024, bytesPerSecond(bitrate) * target))),
    maxMaxBufferLength: Math.round(Math.min(300, target * 6)),
    backBufferLength: lowEnd ? 30 : 90,
    reason: lowEnd
      ? `dispositivo justo: ${Math.round(target)} s (presupuesto ${(budget / 1024 / 1024).toFixed(0)} MB)`
      : `${Math.round(target)} s de buffer (${(budget / 1024 / 1024).toFixed(0)} MB de presupuesto)`,
  };
}

/** true si el buffer real esta por debajo de lo que el plan pide. */
export function isBufferStarved(aheadSeconds: number, plan: Pick<BufferPlan, 'maxBufferLength'>): boolean {
  return aheadSeconds < Math.min(4, plan.maxBufferLength / 4);
}
