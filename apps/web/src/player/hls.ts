/**
 * Envoltorio de hls.js para el reproductor.
 *
 * Concentra lo que antes estaba repartido (y mal) en `Player.tsx`:
 *
 *  - **Carga diferida**: `import('hls.js')` solo se ejecuta al entrar en el
 *    reproductor, asi el arranque de la app no paga ~400 KB de JavaScript.
 *  - **ABR de verdad**: el nivel inicial y el techo salen de `planStartup()`
 *    (capacidades del panel, ancho de banda estimado, techo del usuario y la
 *    variante que eligio el servidor). Antes se forzaba `currentLevel` al nivel
 *    mas alto, que es justo lo que no hay que hacer: desactiva el ABR y satura
 *    el buffer en conexiones justas.
 *  - **Buffer segun dispositivo**: `planBuffer()` calcula segundos y bytes con
 *    la memoria disponible (la misma idea que el `BitrateAwareLoadControl` de
 *    NuvioTV, pero en el navegador).
 *  - **Escalera de recuperacion**: `RecoveryPlanner` decide entre reintentar la
 *    carga, reiniciar el playlist, recuperar el medio, cambiar el codec de
 *    audio, probar otro stream o rendirse. Sin esto, cualquier fallo de red
 *    dejaba la pantalla congelada con un mensaje.
 */

import type Hls from 'hls.js';

import {
  RecoveryPlanner,
  describeError,
  planBuffer,
  planStartup,
  qualityLabel,
  type BufferDevice,
  type BufferPlan,
  type ClientLevel,
  type PlaybackCapabilities,
  type PlayerErrorInfo,
  type RecoveryStep,
  type ServerVariant,
  type StartupPlan,
} from '@vibeflix/player-core';

/** Constructor de hls.js (se carga en diferido). */
type HlsConstructor = typeof Hls;

let hlsLoader: Promise<HlsConstructor> | null = null;

/** Carga hls.js una sola vez y lo deja en cache para las siguientes. */
export function loadHls(): Promise<HlsConstructor> {
  hlsLoader ??= import('hls.js').then((module) => (module.default ?? module) as HlsConstructor);
  return hlsLoader;
}

/** true si el navegador puede reproducir HLS sin hls.js (Safari, WebKit TV). */
export function supportsNativeHls(video: HTMLVideoElement | null): boolean {
  return Boolean(video?.canPlayType('application/vnd.apple.mpegurl'));
}

export interface HlsControllerOptions {
  video: HTMLVideoElement;
  capabilities: PlaybackCapabilities;
  /** Techo de bitrate elegido por el usuario (Mbps; 0 = sin limite). */
  maxBitrateMbps?: number;
  /** Buffer preferido en segundos (0 = automatico). */
  bufferSeconds?: number;
  /** Datos del dispositivo para dimensionar el buffer. */
  device?: BufferDevice;
  /** Variante elegida por el servidor (`/hls/master`). */
  serverVariant?: ServerVariant | null;
  /** Contenido en directo. */
  live?: boolean;
  /** true si hay otro stream disponible para el plan de recuperacion. */
  hasAlternateStream?: () => boolean;
  onReady?: (plan: StartupPlan) => void;
  onLevels?: (levels: ClientLevel[]) => void;
  onLevelSwitched?: (index: number, level: ClientLevel | undefined, label: string) => void;
  onTracks?: () => void;
  onError?: (info: PlayerErrorInfo, step: RecoveryStep, message: string) => void;
  onRecovering?: (step: RecoveryStep) => void;
  /** El plan pide cambiar de fuente. */
  onSwitchStream?: () => void;
  onStats?: (stats: { bandwidth: number; droppedFrames: number; decodedFrames: number }) => void;
}

/** Niveles de hls.js adaptados a la forma que entiende `player-core`. */
export function toClientLevels(levels: Hls['levels']): ClientLevel[] {
  return levels.map((level) => ({
    // `uri` permite emparejar el nivel con la variante que eligio el servidor.
    uri: level.uri || undefined,
    bitrate: level.bitrate ?? 0,
    width: level.width || undefined,
    height: level.height || undefined,
    codecs: level.codecSet ? level.codecSet.split(',').filter(Boolean) : undefined,
    videoRange: level.videoRange || undefined,
    name: level.name || undefined,
  }));
}

/**
 * Controlador de una reproduccion.
 *
 * Se crea por cada stream y se destruye al cambiar de fuente o al salir: no
 * guarda estado entre reproducciones (el plan de recuperacion se reinicia).
 */
export class HlsController {
  private readonly options: HlsControllerOptions;
  private readonly planner = new RecoveryPlanner();
  private readonly timers = new Set<number>();
  private hls: Hls | null = null;
  private source = '';
  private destroyed = false;
  /** true cuando se usa el HLS nativo del navegador (Safari/WebKit). */
  native = false;
  plan: StartupPlan | null = null;
  bufferPlan: BufferPlan | null = null;
  /** Calidad fijada por el usuario (`-1` = automatico). */
  pinnedLevel = -1;

  constructor(options: HlsControllerOptions) {
    this.options = options;
  }

  /** true si hls.js puede usarse en este navegador. */
  static async isSupported(): Promise<boolean> {
    const HlsClass = await loadHls();
    return HlsClass.isSupported();
  }

  get levels(): ClientLevel[] {
    return this.hls ? toClientLevels(this.hls.levels) : [];
  }

  get currentLevelIndex(): number {
    return this.hls ? this.hls.currentLevel : -1;
  }

  get currentLevel(): ClientLevel | undefined {
    return this.levels[this.hls?.currentLevel ?? -1];
  }

  get audioTracks(): Hls['audioTracks'] {
    return this.hls?.audioTracks ?? [];
  }

  get subtitleTracks(): Hls['subtitleTracks'] {
    return this.hls?.subtitleTracks ?? [];
  }

  get bandwidthEstimate(): number {
    const levels = this.hls?.levels ?? [];
    const active = levels[this.hls?.currentLevel ?? 0];
    return this.hls?.bandwidthEstimate ?? active?.bitrate ?? 0;
  }

  /** Arranca la reproduccion de `source`. */
  async start(source: string): Promise<void> {
    this.source = source;
    this.destroyed = false;
    const { video } = this.options;

    const HlsClass = await loadHls();
    if (this.destroyed) return;

    if (!HlsClass.isSupported()) {
      if (supportsNativeHls(video)) {
        this.native = true;
        video.src = source;
        return;
      }
      throw new Error('Este navegador no puede reproducir HLS');
    }

    const bufferPlan = planBuffer({
      device: this.options.device,
      bitrate: this.options.serverVariant?.bandwidth ?? 0,
      live: this.options.live,
      preferredSeconds: this.options.bufferSeconds,
    });
    this.bufferPlan = bufferPlan;

    const hls = new HlsClass({
      enableWorker: true,
      lowLatencyMode: Boolean(this.options.live),
      backBufferLength: bufferPlan.backBufferLength,
      maxBufferLength: bufferPlan.maxBufferLength,
      maxBufferSize: bufferPlan.maxBufferSize,
      maxMaxBufferLength: bufferPlan.maxMaxBufferLength,
      // Semilla del estimador: sin ella hls.js arranca asumiendo 500 kbps y
      // tarda segundos en subir a la calidad que la conexion aguanta.
      abrEwmaDefaultEstimate: 500_000,
      startLevel: -1,
      // No escalar por encima del tamano real del video: en una TV a 1080p no
      // tiene sentido decodificar 4K.
      capLevelToPlayerSize: true,
      progressive: false,
      manifestLoadingTimeOut: 15_000,
      manifestLoadingMaxRetry: 2,
      levelLoadingMaxRetry: 3,
      fragLoadingMaxRetry: 4,
    });
    this.hls = hls;

    hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
      if (this.destroyed) return;
      const levels = this.levels;
      const plan = planStartup({
        levels,
        variant: this.options.serverVariant ?? null,
        capabilities: this.options.capabilities,
        maxBitrateMbps: this.options.maxBitrateMbps,
        pinnedLevel: this.pinnedLevel >= 0 ? this.pinnedLevel : undefined,
      });
      this.plan = plan;
      this.applyPlan(plan);
      this.options.onLevels?.(levels);
      this.options.onReady?.(plan);
    });

    hls.on(HlsClass.Events.LEVEL_SWITCHED, (_event, data: { level: number }) => {
      if (this.destroyed) return;
      const level = this.levels[data.level];
      this.options.onLevelSwitched?.(data.level, level, qualityLabel(level));
      // El plan de buffer depende del bitrate activo: se reajusta en caliente.
      if (this.hls && level?.bitrate) {
        const next = planBuffer({
          device: this.options.device,
          bitrate: level.bitrate,
          live: this.options.live,
          preferredSeconds: this.options.bufferSeconds,
        });
        this.bufferPlan = next;
        this.hls.config.maxBufferLength = next.maxBufferLength;
        this.hls.config.maxBufferSize = next.maxBufferSize;
      }
    });

    hls.on(HlsClass.Events.AUDIO_TRACKS_UPDATED, () => this.options.onTracks?.());
    hls.on(HlsClass.Events.SUBTITLE_TRACKS_UPDATED, () => this.options.onTracks?.());
    hls.on(HlsClass.Events.NON_NATIVE_TEXT_TRACKS_FOUND, () => this.options.onTracks?.());

    hls.on(HlsClass.Events.ERROR, (_event, data) => {
      if (this.destroyed) return;
      const info: PlayerErrorInfo = {
        type: data.type as PlayerErrorInfo['type'],
        details: data.details,
        fatal: Boolean(data.fatal),
      };
      const step = this.planner.plan(info, {
        hasAlternateStream: this.options.hasAlternateStream?.() ?? false,
      });
      const message = describeError(info);
      this.options.onError?.(info, step, message);
      if (!info.fatal) return;
      this.runStep(step);
    });

    hls.on(HlsClass.Events.FRAG_BUFFERED, () => {
      if (this.destroyed) return;
      const quality = video.getVideoPlaybackQuality?.();
      this.options.onStats?.({
        bandwidth: this.bandwidthEstimate,
        droppedFrames: quality?.droppedVideoFrames ?? 0,
        decodedFrames: quality?.totalVideoFrames ?? 0,
      });
    });

    hls.loadSource(source);
    hls.attachMedia(video);
  }

  /** Aplica el plan de arranque sin desactivar el ABR. */
  private applyPlan(plan: StartupPlan): void {
    const hls = this.hls;
    if (!hls) return;
    // El techo de bitrate del usuario ya esta aplicado en `plan.capLevel`
    // (que se calcula con `capLevelIndex`); aqui solo se siembra el estimador y
    // se limita el techo para que el ABR trabaje dentro de lo permitido.
    if (plan.maxBitrate) hls.config.abrMaxWithRealBitrate = true;
    hls.config.abrEwmaDefaultEstimate = plan.abrEwmaDefaultEstimate;
    // `capLevel` limita el techo; `startLevel` solo el arranque. El ABR sigue
    // activo (`autoLevel`), que es lo que adapta la calidad a la red real.
    if (plan.capLevel >= 0) hls.autoLevelCapping = plan.capLevel;
    if (plan.autoLevel) {
      hls.nextLevel = -1;
      hls.currentLevel = -1;
    } else if (plan.startLevel >= 0) {
      hls.currentLevel = plan.startLevel;
    }
  }

  /** Ejecuta la accion del plan de recuperacion. */
  private runStep(step: RecoveryStep): void {
    const hls = this.hls;
    const { video } = this.options;
    const later = (delayMs: number, action: () => void) => {
      const timer = window.setTimeout(() => {
        this.timers.delete(timer);
        if (!this.destroyed) action();
      }, delayMs);
      this.timers.add(timer);
    };

    this.options.onRecovering?.(step);

    switch (step.action) {
      case 'ignore':
        break;
      case 'reload':
        later(step.delayMs, () => hls?.startLoad());
        break;
      case 'restartPlaylist':
        later(step.delayMs, () => {
          hls?.destroy();
          void this.start(this.source);
        });
        break;
      case 'recoverMedia':
        later(step.delayMs, () => {
          hls?.recoverMediaError();
          video.play().catch(() => undefined);
        });
        break;
      case 'swapAudioCodec':
        later(step.delayMs, () => {
          hls?.swapAudioCodec();
          hls?.startLoad();
        });
        break;
      case 'nextStream':
        this.options.onSwitchStream?.();
        break;
      case 'giveUp':
      default:
        break;
    }
  }

  /** Fija una calidad (`-1` vuelve al ABR automatico). */
  setLevel(index: number): void {
    this.pinnedLevel = index;
    const hls = this.hls;
    if (!hls) return;
    if (index < 0) {
      hls.autoLevelCapping = this.plan?.capLevel ?? -1;
      hls.currentLevel = -1;
      hls.nextLevel = -1;
      return;
    }
    hls.autoLevelCapping = -1;
    hls.currentLevel = index;
  }

  setAudioTrack(index: number): void {
    if (this.hls) this.hls.audioTrack = index;
  }

  /** Activa una pista de subtitulos del manifest (`-1` los apaga). */
  setSubtitleTrack(index: number): void {
    const hls = this.hls;
    if (!hls) return;
    hls.subtitleTrack = index;
    // Se pintan con el renderizador propio (permite desfase, Clean SDH y
    // estilos), asi que el pintado nativo de hls.js se apaga.
    hls.subtitleDisplay = false;
  }

  /** Reinicia la escalera de recuperacion (tras reproducir un rato seguido). */
  resetRecovery(): void {
    this.planner.reset();
  }

  get attempts(): number {
    return this.planner.attempts;
  }

  /** Vuelve a intentarlo desde cero (boton «Reintentar»). */
  async retry(): Promise<void> {
    this.planner.reset();
    this.hls?.destroy();
    this.hls = null;
    await this.start(this.source);
  }

  destroy(): void {
    this.destroyed = true;
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    this.hls?.destroy();
    this.hls = null;
  }
}
