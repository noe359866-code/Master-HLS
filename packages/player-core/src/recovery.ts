/**
 * Recuperacion de errores de reproduccion.
 *
 * Un error fatal de HLS casi nunca es definitivo: puede ser un 403 transitorio
 * del CDN, un token de segmento caducado o un buffer de MSE roto tras un
 * cambio de pista. Los clientes maduros (NuvioTV reintenta con libmpv, WuPlay
 * recarga el stream) no muestran un error al primer fallo; agotan una escalera
 * de recuperacion y solo entonces dan el control al usuario.
 *
 * La escalera aqui es pura y determinista, asi que se puede testear:
 *
 *   red    → reintentar la carga (hasta 3 veces, con espera creciente)
 *          → recargar el playlist desde el principio
 *          → pasar al siguiente stream disponible
 *   media  → recoverMediaError (hasta 2 veces)
 *          → swapAudioCodec + recoverMediaError (1 vez)
 *          → pasar al siguiente stream
 *   mux    → pasar al siguiente stream directamente
 *   otro   → dar por fallido
 */

/** Tipo de error tal y como lo clasifica hls.js. */
export type PlayerErrorType = 'networkError' | 'mediaError' | 'muxError' | 'otherError';

/** Datos minimos del error que necesita el planificador. */
export interface PlayerErrorInfo {
  type: PlayerErrorType | string;
  /** Detalle del error (`levelLoadError`, `bufferStalledError`...). */
  details: string;
  fatal: boolean;
  /** URL implicada, si la hay. */
  url?: string;
}

/** Accion que debe ejecutar el reproductor. */
export type RecoveryAction =
  | 'reload'
  | 'restartPlaylist'
  | 'recoverMedia'
  | 'swapAudioCodec'
  | 'nextStream'
  | 'giveUp'
  | 'ignore';

export interface RecoveryStep {
  action: RecoveryAction;
  /** Espera recomendada antes de ejecutar la accion (ms). */
  delayMs: number;
  /** Motivo legible para la interfaz. */
  reason: string;
}

/** Errores de red que merecen un reintento inmediato. */
const RETRYABLE_NETWORK = new Set([
  'levelLoadError',
  'levelLoadTimeout',
  'fragLoadError',
  'fragLoadTimeout',
  'keyLoadError',
  'keyLoadTimeout',
  'manifestLoadError',
  'manifestLoadTimeout',
  'manifestParsingError',
  'levelEmptyError',
]);

/** Errores de red definitivos: no tiene sentido reintentar. */
const FATAL_NETWORK = new Set(['manifestIncompatibleCodecsError', 'levelSwitchError']);

const MAX_NETWORK_RETRIES = 3;
const MAX_MEDIA_RECOVERIES = 2;
const MAX_SWAP_ATTEMPTS = 1;
const RETRY_BACKOFF_MS = 800;

/**
 * Planificador con estado: se crea una vez por reproduccion y se llama en cada
 * error. Devuelve la siguiente accion (o `giveUp` cuando se agota la escalera).
 */
export class RecoveryPlanner {
  private networkRetries = 0;
  private mediaRecoveries = 0;
  private swapAttempts = 0;
  private restarts = 0;
  private nextStreamAttempts = 0;
  private lastFailureAt = 0;

  /** Reinicia los contadores (p.ej. tras reproducir mas de un minuto seguido). */
  reset(): void {
    this.networkRetries = 0;
    this.mediaRecoveries = 0;
    this.swapAttempts = 0;
    this.restarts = 0;
  }

  /** Intentos consumidos (para la interfaz). */
  get attempts(): number {
    return this.networkRetries + this.mediaRecoveries + this.swapAttempts + this.restarts;
  }

  /** true si ya se puede probar con otro stream. */
  get canSwitchStream(): boolean {
    return this.nextStreamAttempts < 2;
  }

  /** Siguiente accion ante un error. */
  plan(error: PlayerErrorInfo, options: { hasAlternateStream?: boolean; now?: number } = {}): RecoveryStep {
    const now = options.now ?? Date.now();
    // Dos fallos seguidos en menos de 200 ms suelen ser el mismo fallo
    // propagado (playlist + segmentos): se ignora el segundo.
    const burst = now - this.lastFailureAt < 200;
    this.lastFailureAt = now;

    const type = error.type as PlayerErrorType;
    const alternate = options.hasAlternateStream ?? false;

    if (!error.fatal) return { action: 'ignore', delayMs: 0, reason: 'error no fatal' };

    if (type === 'networkError') {
      if (FATAL_NETWORK.has(error.details)) {
        return this.fallback(alternate, 'codec incompatible');
      }
      if (this.networkRetries < MAX_NETWORK_RETRIES) {
        this.networkRetries += 1;
        const delay = RETRY_BACKOFF_MS * this.networkRetries;
        return {
          action: 'reload',
          delayMs: delay,
          reason: `reintento de red ${this.networkRetries}/${MAX_NETWORK_RETRIES} (${error.details})`,
        };
      }
      if (this.restarts < 1) {
        this.restarts += 1;
        return {
          action: 'restartPlaylist',
          delayMs: 400,
          reason: 'recargando el playlist desde el principio',
        };
      }
      return this.fallback(alternate, `red agotada (${error.details})`);
    }

    if (type === 'mediaError') {
      if (this.mediaRecoveries < MAX_MEDIA_RECOVERIES && !burst) {
        this.mediaRecoveries += 1;
        return {
          action: 'recoverMedia',
          delayMs: 120,
          reason: `recuperando el buffer de video ${this.mediaRecoveries}/${MAX_MEDIA_RECOVERIES}`,
        };
      }
      if (this.swapAttempts < MAX_SWAP_ATTEMPTS) {
        this.swapAttempts += 1;
        return {
          action: 'swapAudioCodec',
          delayMs: 120,
          reason: 'reintentando con otro codec de audio',
        };
      }
      return this.fallback(alternate, `error de medio (${error.details})`);
    }

    if (type === 'muxError') return this.fallback(alternate, 'error de multiplexado');

    return this.fallback(alternate, error.details || 'error desconocido');
  }

  private fallback(alternate: boolean, reason: string): RecoveryStep {
    if (alternate && this.canSwitchStream) {
      this.nextStreamAttempts += 1;
      this.reset();
      return { action: 'nextStream', delayMs: 0, reason: `cambiando de fuente: ${reason}` };
    }
    return { action: 'giveUp', delayMs: 0, reason };
  }
}

/** Errores de red que se pueden reintentar sin mas (util para el proxy). */
export function isRetryableNetworkError(details: string): boolean {
  return RETRYABLE_NETWORK.has(details);
}

/** Mensaje legible para el dialogo de error (estilo Stremio `PLAYER_ERROR_*`). */
export function describeError(error: PlayerErrorInfo): string {
  const map: Record<string, string> = {
    manifestLoadError: 'no se pudo cargar la lista del stream',
    manifestLoadTimeout: 'el stream no respondio a tiempo',
    manifestParsingError: 'la lista del stream tiene un formato inesperado',
    levelLoadError: 'no se pudo cargar la calidad seleccionada',
    fragLoadError: 'no se pudo descargar un fragmento del video',
    fragLoadTimeout: 'la descarga del video se detuvo',
    keyLoadError: 'no se pudo obtener la clave de descifrado',
    bufferStalledError: 'el buffer se quedo sin datos',
    bufferFullError: 'el buffer del reproductor esta lleno',
    bufferAppendError: 'no se pudo anadir el video al buffer',
    bufferAppendedError: 'no se pudo anadir el video al buffer',
    levelEmptyError: 'la lista del video esta vacia',
    fragParsingError: 'el fragmento de video esta danado',
  };
  return map[error.details] ?? `error de reproduccion (${error.details || error.type})`;
}
