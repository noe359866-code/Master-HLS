/**
 * Reproductor de Vibe Flix.
 *
 * Lo que hace y por que (todo sale de la comparativa con Stremio, WuPlay y
 * NuvioTV):
 *
 *  - **ABR real**: el nivel inicial y el techo los calcula `planStartup()` con
 *    las capacidades del panel, el ancho de banda estimado, el techo que fije el
 *    usuario y la variante que eligio el servidor. El ABR sigue activo despues
 *    del arranque; antes se forzaba el nivel mas alto y la reproduccion se
 *    ahogaba en cuanto la red bajaba.
 *  - **Recuperacion de errores**: escalera `startLoad → recoverMediaError →
 *    swapAudioCodec → otro stream → error`, con `RecoveryPlanner`.
 *  - **Buffer segun dispositivo**: `planBuffer()` (memoria + bitrate), la idea
 *    del `BitrateAwareLoadControl` de NuvioTV llevada al navegador.
 *  - **Subtitulos propios**: se sirven por `/api/subtitles/proxy` (SRT/ASS →
 *    cues, cualquier codificacion, Clean SDH) y se pintan con `SubtitleLayer`,
 *    asi que el desfase, el tamano, el color y el borde cambian en caliente.
 *  - **Previsualizacion del salto**: `EXT-X-IMAGE-STREAM-INF` → `/hls/thumbnails`
 *    (WuPlay v0.9.3).
 *  - **Progreso fiable**: se guarda cada N segundos **y** al pausar, al ocultar
 *    la pestaña y al salir; antes se perdia hasta un cuarto de minuto.
 *  - **Autoplay con `bingeGroup`**: se preconsultan los streams del siguiente
 *    episodio y se elige con `pickBingeStream()` para mantener la misma fuente.
 *  - **Atajos completos** (`playerAction`): j/l, 0-9, `,`/`.`, `[`/`]`, G/H,
 *    `+`/`-`, PiP, escala de imagen, velocidad, estadisticas.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  FRAME_STEP_SECONDS,
  SHORTCUTS,
  clampSeek,
  describeStats,
  detectCapabilities,
  endsAt,
  formatBitrate,
  formatClock,
  formatDelay,
  isLowEndDevice,
  matchLevelIndex,
  nextSpeed,
  nextVideoScale,
  normalizeSubtitleStyle,
  pickBingeStream,
  playerAction,
  progressPercent,
  qualityLabel,
  rankStreams,
  seekToPercent,
  shouldEnableSubtitles,
  speedLabel,
  subtitleTrackLabel,
  thumbnailAt,
  thumbnailBox,
  thumbnailCss,
  toAsciiDigits,
  videoScaleCss,
  videoScaleLabel,
  type ClientLevel,
  type Cue,
  type PlaybackStats,
  type PlayerAction,
  type SubtitleStyle,
  type VideoScale,
} from '@vibeflix/player-core';

import { api } from '../api';
import { useApp } from '../store';
import type { TrackPreference } from '../types';
import { useI18n } from '../i18n';
import type { MasterInfo, SkipSegment, Stream, Thumbnail } from '../types';
import { Button } from '../components/ui';
import { Icon } from '../components/icons';
import { HlsController } from '../player/hls';
import { deviceEnvironment } from '../player/environment';
import { SubtitleLayer } from '../player/SubtitleLayer';

export interface PlayerProps {
  id: string;
  type: string;
  streamUrl?: string;
  streamName?: string;
  title?: string;
  poster?: string;
  /** Subtitulo externo elegido en la ficha (WebVTT). */
  subtitleUrl?: string;
  subtitleLabel?: string;
  /** Id y titulo del siguiente episodio (autoplay). */
  nextId?: string;
  nextTitle?: string;
}

/** Pista de subtitulos visible en el selector. */
interface SubtitleOption {
  key: string;
  label: string;
  lang: string;
  /** Indice en `hls.subtitleTracks` (pistas del manifest). */
  native?: number;
  /** URL del fichero externo (se normaliza por el proxy). */
  url?: string;
  sdh?: boolean;
}

type MenuId =
  | 'subtitles'
  | 'audio'
  | 'quality'
  | 'speed'
  | 'stats'
  | 'info'
  | 'shortcuts'
  | 'episodes'
  | null;

/** Milisegundos que dura un aviso breve en pantalla. */
const TOAST_MS = 1800;

export function PlayerScreen({
  id,
  type,
  streamUrl,
  streamName,
  title,
  poster,
  subtitleUrl,
  subtitleLabel,
  nextId,
  nextTitle,
}: PlayerProps) {
  const { navigate, activeProfileId, activeProfile, settings, reloadLibrary } = useApp();
  const { t } = useI18n();

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<HlsController | null>(null);
  const controlsTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  const startedAt = useRef<number>(0);
  const stallCount = useRef(0);
  const stallStartedAt = useRef(0);
  const stallTotalMs = useRef(0);
  const lastSavedAt = useRef(0);
  const resumeKeyRef = useRef('');
  const nextStreamsRef = useRef<Stream[] | null>(null);

  const playback = settings?.playback;
  // Modo esencial (NuvioTV): el reproductor oculta los controles avanzados
  // (estadísticas y modo de imagen); los atajos de teclado siguen igual.
  const essentialMode = settings?.uiMode === 'essential';
  const subtitleSettings = settings?.subtitles;
  const deviceSettings = settings?.device;
  const skipEnabled = settings?.skipIntro?.enabled !== false;
  const countdownSeconds = playback?.autoplayCountdown ?? 5;
  const saveEveryMs = Math.max(3, playback?.progressIntervalSeconds ?? 15) * 1000;

  // ------------------------------------------------------------- estado
  const [activeUrl, setActiveUrl] = useState(streamUrl ?? '');
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<{ message: string; detail: string } | null>(null);
  const [recovering, setRecovering] = useState<string | null>(null);
  const [master, setMaster] = useState<MasterInfo | null>(null);
  const [levels, setLevels] = useState<ClientLevel[]>([]);
  const [quality, setQuality] = useState('');
  const [pinned, setPinned] = useState(-1);
  const [menu, setMenu] = useState<MenuId>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [videoScale, setVideoScale] = useState<VideoScale>(playback?.videoScale ?? 'contain');
  const [bandwidth, setBandwidth] = useState(0);
  const [frames, setFrames] = useState({ dropped: 0, decoded: 0 });
  const [resumedAt, setResumedAt] = useState<number | null>(null);

  // Subtitulos
  const [subtitleOptions, setSubtitleOptions] = useState<SubtitleOption[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<string | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [subtitleDelay, setSubtitleDelay] = useState(subtitleSettings?.delayMs ?? 0);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(() =>
    normalizeSubtitleStyle({
      size: subtitleSettings?.size,
      color: subtitleSettings?.color,
      opacity: subtitleSettings?.opacity,
      backgroundOpacity: subtitleSettings?.backgroundOpacity,
      edge: subtitleSettings?.edge,
      verticalPosition: subtitleSettings?.verticalPosition,
      bold: subtitleSettings?.bold,
    }),
  );
  const [cleanSdh, setCleanSdh] = useState(subtitleSettings?.cleanSdh ?? false);
  const [audioOptions, setAudioOptions] = useState<Array<{ index: number; label: string; lang: string }>>([]);
  const [activeAudio, setActiveAudio] = useState(-1);

  // Preferencias de pista por vídeo (NuvioTV: `TrackPreferenceDataStore`).
  // `undefined` = aún cargando: no se decide ni se sobrescribe hasta que llegue.
  const [trackPref, setTrackPref] = useState<TrackPreference | null | undefined>(undefined);
  const savePrefTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** true cuando ya se decidió/apagó un subtítulo para este vídeo. */
  const subtitleChosenRef = useRef(false);
  /** Instantánea fresca de lo que hay que guardar (se lee al disparar el debounce). */
  const latestPrefRef = useRef<Partial<Omit<TrackPreference, 'updatedAt'>>>({});
  latestPrefRef.current = {
    audioLanguage: audioOptions.find((track) => track.index === activeAudio)?.lang,
    // Solo se recuerda el subtítulo si ya hubo decisión (o el usuario eligió):
    // un `null` significa «apagados a propósito», no «aún no elegidos».
    ...(subtitleChosenRef.current ? { subtitleKey: activeSubtitle } : {}),
    subtitleLanguage: subtitleOptions.find((option) => option.key === activeSubtitle)?.lang,
    delayMs: subtitleDelay,
    speed,
  };

  // Omitir intro y autoplay
  const [skipSegment, setSkipSegment] = useState<SkipSegment | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [detectedNext, setDetectedNext] = useState<{ id: string; title: string } | null>(null);

  // Miniaturas de previsualizacion
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [previewAt, setPreviewAt] = useState<number | null>(null);
  const [previewX, setPreviewX] = useState(0);

  const allStreams = useRef<Stream[]>([]);

  // ------------------------------------------------------- avisos breves
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  // ------------------------------------------------------- controles UI
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimer.current) window.clearTimeout(controlsTimer.current);
    controlsTimer.current = window.setTimeout(() => {
      // Con un menu abierto no se ocultan: el usuario esta eligiendo algo.
      setMenu((current) => {
        if (current) return current;
        setControlsVisible(false);
        return null;
      });
    }, 4000);
  }, []);

  useEffect(() => {
    showControls();
    return () => {
      if (controlsTimer.current) window.clearTimeout(controlsTimer.current);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [showControls]);

  useEffect(() => {
    containerRef.current?.focus();
  }, [activeUrl]);

  // ------------------------------------------------- analisis del master
  //
  // Se pide antes de arrancar hls.js: la variante que elige el servidor
  // (teniendo en cuenta el panel y el idioma) se usa como semilla del plan de
  // arranque, y de paso llegan las hojas de sprites para el scrubbing.
  useEffect(() => {
    if (!activeUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const info = await api.masterInfo(activeUrl, {
          maxHeight: deviceSettings?.maxHeight,
          audioLang: activeProfile?.audioLanguage,
        });
        if (cancelled) return;
        setMaster(info);
        if (!info.isMaster) return;
        if (playback?.thumbnails === false || !info.imageStreams?.length) return;
        try {
          const result = await api.thumbnails(activeUrl);
          if (!cancelled) setThumbnails(result.thumbnails as Thumbnail[]);
        } catch {
          // Sin miniaturas: el scrubbing funciona igual, solo sin previsualizacion.
        }
      } catch {
        // Si no es un master (o falla), se reproduce tal cual.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeUrl, deviceSettings?.maxHeight, activeProfile?.audioLanguage, playback?.thumbnails]);

  // ------------------------------------------------------ arranque HLS
  useEffect(() => {
    if (!activeUrl) {
      setFatal({ message: t('PLAYER_ERROR'), detail: 'sin url de stream' });
      setLoading(false);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    let controller: HlsController | null = null;
    let cancelled = false;
    setLoading(true);
    setFatal(null);
    setRecovering(null);
    setResumedAt(null);
    startedAt.current = Date.now();
    stallCount.current = 0;
    stallTotalMs.current = 0;

    const environment = deviceEnvironment(video);
    const detected = detectCapabilities(environment);
    const lowEnd = isLowEndDevice(environment);
    const capabilities = {
      ...detected,
      // El techo declarado en los ajustes manda sobre el detectado.
      maxHeight: Math.min(deviceSettings?.maxHeight ?? detected.maxHeight ?? 4096, detected.maxHeight ?? 4096),
      ...(deviceSettings?.supportsHdr === false ? { supportsHdr: false } : {}),
    };

    void (async () => {
      try {
        controller = new HlsController({
          video,
          capabilities,
          maxBitrateMbps: playback?.maxBitrateMbps,
          bufferSeconds: playback?.bufferSeconds,
          device: {
            deviceMemory: environment.deviceMemory,
            hardwareConcurrency: environment.hardwareConcurrency,
            lowEnd,
          },
          serverVariant: master?.selected?.variant ?? null,
          live: type === 'tv' || type === 'channel',
          hasAlternateStream: () => allStreams.current.filter((stream) => stream.url).length > 1,
          onReady: () => {
            if (cancelled) return;
            setLoading(false);
            setBuffering(false);
          },
          onLevels: (next) => {
            if (cancelled) return;
            setLevels(next);
          },
          onLevelSwitched: (_index, level, label) => {
            if (cancelled) return;
            setQuality(label);
          },
          onTracks: () => {
            if (cancelled || !controller) return;
            setAudioOptions(
              controller.audioTracks.map((track, index) => ({
                index,
                label: track.name || track.lang || `${t('AUDIO')} ${index + 1}`,
                lang: track.lang ?? '',
              })),
            );
          },
          onStats: (stats) => {
            if (cancelled) return;
            setBandwidth(stats.bandwidth);
            setFrames({ dropped: stats.droppedFrames, decoded: stats.decodedFrames });
          },
          onRecovering: (step) => {
            if (cancelled) return;
            setRecovering(step.reason);
            setLoading(true);
          },
          onError: (info, step, message) => {
            if (cancelled) return;
            if (step.action === 'giveUp' && info.fatal) {
              setLoading(false);
              setRecovering(null);
              setFatal({ message: t('PLAYER_ERROR'), detail: `${message} (${info.details})` });
              return;
            }
            if (info.fatal) setFatal(null);
          },
          onSwitchStream: () => {
            if (cancelled) return;
            void switchToAlternateStream();
          },
        });
        controllerRef.current = controller;
        await controller.start(activeUrl);
        // Camino nativo (Safari/WebKit): no hay MANIFEST_PARSED que avise.
        if (controller.native) {
          video.addEventListener(
            'loadedmetadata',
            () => {
              if (!cancelled) {
                setLoading(false);
                setQuality(t('PLAYER_QUALITY_AUTO'));
              }
            },
            { once: true },
          );
          video.src = activeUrl;
        }
      } catch (error) {
        if (!cancelled) {
          setLoading(false);
          setFatal({ message: t('PLAYER_ERROR'), detail: (error as Error).message });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller?.destroy();
      controllerRef.current = null;
    };
    // `master` se lee dentro pero no debe reiniciar la reproduccion: solo se
    // usa como semilla del plan si ya llego.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUrl]);

  // ------------------------------------------------- streams alternativos
  const switchToAlternateStream = useCallback(async () => {
    const candidates = rankStreams(allStreams.current, { maxHeight: deviceSettings?.maxHeight }).filter(
      (stream) => stream.url && stream.url !== activeUrl,
    );
    const next = candidates[0];
    if (!next?.url) {
      setFatal({ message: t('PLAYER_ERROR'), detail: t('PLAYER_ERROR_NEXT_STREAM') });
      setLoading(false);
      return;
    }
    setActiveUrl(next.url);
    notify(t('PLAYER_ERROR_NEXT_STREAM'));
  }, [activeUrl, deviceSettings?.maxHeight, notify, t]);

  /** Todos los streams del titulo: para el selector y para la recuperacion. */
  useEffect(() => {
    if (!activeUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const { streams } = await api.streams(type === 'episode' ? 'series' : type, id);
        if (cancelled) return;
        allStreams.current = streams;
        // Subtitulos que trae el stream (el protocolo los declara ahi).
        const found = streams.find((stream) => stream.url === activeUrl);
        const fromStream: SubtitleOption[] = (found?.subtitles ?? [])
          .filter((subtitle) => Boolean(subtitle.url))
          .map((subtitle, index) => ({
            key: `ext:${index}`,
            label: subtitleTrackLabel({ lang: subtitle.lang ?? subtitle.language, name: subtitle.lang }),
            lang: subtitle.lang ?? subtitle.language ?? '',
            url: subtitle.url as string,
          }));
        const fromProp: SubtitleOption[] = subtitleUrl
          ? [{
              key: `ext:${fromStream.length}`,
              label: subtitleLabel ?? 'OpenSubtitles',
              lang: '',
              url: subtitleUrl,
            }]
          : [];
        setSubtitleOptions((previous) => [
          ...previous.filter((option) => option.native !== undefined),
          ...fromStream,
          ...fromProp,
        ]);
      } catch {
        // Sin lista de streams: se reproduce el que vino en la ruta.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeUrl, id, type, subtitleUrl, subtitleLabel]);

  // --------------------------------------- pistas del manifest + por defecto
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    const native = controller.subtitleTracks.map((track, index) => ({
      key: `native:${index}`,
      label: subtitleTrackLabel({ lang: track.lang, name: track.name }),
      lang: track.lang ?? '',
      native: index,
      sdh: /sdh|cc/i.test(track.name ?? ''),
    }));
    if (!native.length) return;
    setSubtitleOptions((previous) => [...native, ...previous.filter((option) => option.native === undefined)]);
  }, [levels, quality]);

  // Cargar las preferencias guardadas para este vídeo (audio, subtítulo,
  // desfase y velocidad). El desfase es **por vídeo**: un valor calibrado para
  // un episodio no sirve para el siguiente (NuvioTV #1063).
  useEffect(() => {
    let cancelled = false;
    setTrackPref(undefined);
    void api.trackPref(id, activeProfileId || undefined)
      .then((pref) => {
        if (cancelled) return;
        setTrackPref(pref);
        if (typeof pref?.delayMs === 'number') setSubtitleDelay(pref.delayMs);
        else setSubtitleDelay(subtitleSettings?.delayMs ?? 0);
        const rememberedSpeed = pref?.speed && pref.speed !== 1 ? pref.speed : 1;
        setSpeed(rememberedSpeed);
        if (videoRef.current) videoRef.current.playbackRate = rememberedSpeed;
      })
      .catch(() => { if (!cancelled) setTrackPref(null); });
    return () => {
      cancelled = true;
      if (savePrefTimer.current) clearTimeout(savePrefTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, activeProfileId]);

  // Restaurar la pista de audio recordada cuando aparezcan las pistas (solo
  // si el usuario no ha elegido todavía en esta sesión).
  useEffect(() => {
    if (trackPref === undefined || !audioOptions.length || activeAudio !== -1) return;
    const wanted = trackPref?.audioLanguage;
    if (!wanted) return;
    const match =
      audioOptions.find((track) => track.lang && track.lang === wanted) ??
      audioOptions.find((track) => track.lang && track.lang.startsWith(wanted.slice(0, 2)));
    if (match) {
      controllerRef.current?.setAudioTrack(match.index);
      setActiveAudio(match.index);
    }
  }, [trackPref, audioOptions, activeAudio]);

  // Decision inicial: subtitulos activos solo si el ajuste lo pide (y, con
  // «solo para audio extranjero», solo si el audio no es el del perfil).
  useEffect(() => {
    if (!subtitleOptions.length || activeSubtitle !== null) return;
    if (trackPref === undefined) return;
    // A partir de aquí hay decisión (aunque sea «dejarlos apagados»).
    subtitleChosenRef.current = true;
    // La preferencia guardada para este vídeo manda sobre el idioma del
    // perfil: `null` significa que el usuario los apagó a propósito.
    const remembered = trackPref;
    if (remembered && remembered.subtitleKey === null) return;
    if (remembered) {
      const match =
        (remembered.subtitleKey
          ? subtitleOptions.find((option) => option.key === remembered.subtitleKey)
          : undefined) ??
        (remembered.subtitleLanguage
          ? subtitleOptions.find((option) =>
              option.lang &&
              option.lang.toLowerCase().startsWith(remembered.subtitleLanguage!.toLowerCase().slice(0, 2)),
            )
          : undefined);
      if (match) {
        setActiveSubtitle(match.key);
        return;
      }
    }
    if (subtitleSettings?.enabled === false) return;
    const wanted = activeProfile?.subtitleLanguage ?? activeProfile?.contentLanguage ?? settings?.language;
    const enable = shouldEnableSubtitles({
      audioLanguage: audioOptions.find((track) => track.index === activeAudio)?.lang,
      contentLanguage: wanted,
      onlyForForeignAudio: subtitleSettings?.onlyForForeignAudio,
      preferSubtitles: subtitleSettings?.enabled,
    });
    if (!enable) return;
    const match =
      subtitleOptions.find((option) => option.lang && wanted && option.lang.toLowerCase().startsWith(wanted.toLowerCase().slice(0, 2))) ??
      subtitleOptions.find((option) => option.native !== undefined) ??
      subtitleOptions[0];
    if (match) setActiveSubtitle(match.key);
  }, [subtitleOptions, activeSubtitle, subtitleSettings, activeProfile, settings?.language, audioOptions, activeAudio, trackPref]);

  // ---------------------------------------------- carga de subtitulos
  useEffect(() => {
    const option = subtitleOptions.find((entry) => entry.key === activeSubtitle);
    if (!option) {
      setCues([]);
      controllerRef.current?.setSubtitleTrack(-1);
      return;
    }
    if (option.native !== undefined) {
      setCues([]);
      controllerRef.current?.setSubtitleTrack(option.native);
      return;
    }
    if (!option.url) return;

    let cancelled = false;
    void (async () => {
      try {
        const result = await api.subtitleProxy({
          url: option.url as string,
          lang: option.lang || undefined,
          clean: cleanSdh,
          format: 'json',
        });
        if (cancelled || !result.json) return;
        setCues(result.json.cues as Cue[]);
        controllerRef.current?.setSubtitleTrack(-1);
      } catch {
        // Sin subtitulos: la reproduccion sigue.
        if (!cancelled) setCues([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSubtitle, subtitleOptions, cleanSdh]);

  // ------------------------------------------------------ deteccion de intro
  useEffect(() => {
    if (!skipEnabled) return;
    let cancelled = false;
    const [imdbId, season, episode] = id.split(':');
    void (async () => {
      try {
        const result = await api.skipIntro({
          type: type === 'episode' ? 'series' : type,
          id: imdbId ?? id,
          imdbId: imdbId ?? '',
          season: season ? Number(season) : undefined,
          episode: episode ? Number(episode) : undefined,
          duration: 0,
        });
        if (!cancelled && result.enabled && result.segment) setSkipSegment(result.segment);
      } catch {
        // Sin deteccion: no aparece el boton.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, type, skipEnabled]);

  // ---------------------------------------------------- historial y progreso
  useEffect(() => {
    if (!title) return;
    void api
      .pushHistory({ id, type, name: title, poster, streamName }, activeProfileId || undefined)
      .then(() => reloadLibrary())
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type, title]);

  /** Guarda el progreso (y lo marca como guardado para no repetir). */
  const saveProgress = useCallback(
    (options: { force?: boolean } = {}) => {
      const video = videoRef.current;
      if (!video || !title) return;
      const now = Date.now();
      if (!options.force && now - lastSavedAt.current < saveEveryMs) return;
      if (!Number.isFinite(video.currentTime) || video.currentTime <= 0) return;
      lastSavedAt.current = now;
      void api
        .saveProgress(
          {
            id,
            type,
            name: title,
            poster,
            position: Math.floor(video.currentTime),
            duration: Math.floor(video.duration || 0),
            mediaType: type === 'episode' ? 'episode' : type === 'series' ? 'series' : 'movie',
          },
          activeProfileId || undefined,
        )
        .catch(() => undefined);
    },
    [activeProfileId, id, poster, saveEveryMs, title, type],
  );

  // Guardar al pausar, al ocultar la pestaña y al salir: son los tres momentos
  // en los que se perdia el progreso (apagon, cambio de input en la TV, cerrar).
  useEffect(() => {
    const flush = () => saveProgress({ force: true });
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [saveProgress]);

  // ------------------------------------------------- continuar donde lo deje
  useEffect(() => {
    const video = videoRef.current;
    if (!video || playback?.resume === false) return;
    const key = `${id}:${activeUrl}`;
    if (resumeKeyRef.current === key) return;

    const onLoaded = () => {
      if (resumeKeyRef.current === key) return;
      resumeKeyRef.current = key;
      void (async () => {
        try {
          const entries = await api.progress(activeProfileId || undefined);
          const entry = entries.find((item) => item.id === id);
          if (!entry || entry.position <= 30 || entry.duration <= 0) return;
          const ratio = entry.position / entry.duration;
          if (ratio >= 0.95) return;
          video.currentTime = entry.position;
          setResumedAt(entry.position);
          notify(`${t('PLAYER_RESUMED')} ${toAsciiDigits(formatClock(entry.position))}`);
        } catch {
          // Sin progreso guardado: se empieza desde el principio.
        }
      })();
    };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('durationchange', onLoaded);
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('durationchange', onLoaded);
    };
  }, [id, activeUrl, activeProfileId, playback?.resume, notify, t]);

  // -------------------------------------------------- siguiente episodio
  useEffect(() => {
    if (type !== 'episode' || nextId) return;
    const base = id.split(':')[0] ?? id;
    let cancelled = false;
    void (async () => {
      try {
        const { meta } = await api.meta('series', base);
        const videos = meta?.videos ?? [];
        const index = videos.findIndex((video) => video.id === id);
        const next = videos[index + 1];
        if (!cancelled && next) {
          setDetectedNext({
            id: next.id,
            title: next.title ?? next.name ?? `${t('EPISODE')} ${next.episode ?? index + 2}`,
          });
        }
      } catch {
        // Sin informacion de episodios: no hay autoplay.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, type, nextId, t]);

  const resolvedNextId = nextId ?? detectedNext?.id ?? '';
  const resolvedNextTitle = nextTitle ?? detectedNext?.title;

  // Se preconsultan los streams del siguiente episodio cuando queda poco: al
  // terminar, el autoplay no tiene que esperar al fan-out de addons.
  useEffect(() => {
    if (!resolvedNextId || !duration || nextStreamsRef.current) return;
    if (duration - currentTime > 90) return;
    let cancelled = false;
    void api
      .streams('series', resolvedNextId)
      .then(({ streams }) => {
        if (!cancelled) nextStreamsRef.current = streams;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [resolvedNextId, currentTime, duration]);

  const playNext = useCallback(async () => {
    if (!resolvedNextId) return;
    try {
      const streams =
        nextStreamsRef.current ?? (await api.streams('series', resolvedNextId)).streams;
      nextStreamsRef.current = null;
      const current = allStreams.current.find((stream) => stream.url === activeUrl) ?? null;
      // `bingeGroup` primero: mantiene la misma fuente y calidad entre episodios.
      const chosen =
        pickBingeStream(streams, current, { maxHeight: deviceSettings?.maxHeight }) ??
        rankStreams(streams, { maxHeight: deviceSettings?.maxHeight })[0];
      if (!chosen?.url) return;
      navigate({
        name: 'player',
        id: resolvedNextId,
        type: 'episode',
        streamUrl: chosen.url,
        streamName: chosen.name ?? chosen.title ?? t('PLAYER_STREAMS'),
        title: resolvedNextTitle ?? title,
        poster,
      });
    } catch {
      // Sin streams para el siguiente episodio.
    }
  }, [resolvedNextId, resolvedNextTitle, activeUrl, deviceSettings?.maxHeight, navigate, poster, t, title]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      void playNext();
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => (value === null ? null : value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, playNext]);

  // ------------------------------------------------------------- acciones
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else {
      video.pause();
      saveProgress({ force: true });
    }
    showControls();
  }, [saveProgress, showControls]);

  const seekBy = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = clampSeek(video.currentTime + delta, video.duration || 0);
      showControls();
    },
    [showControls],
  );

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = clampSeek(time, video.duration || 0);
  }, []);

  const changeVolume = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.max(0, Math.min(1, value));
    video.volume = next;
    video.muted = next === 0;
    setVolume(next);
    setMuted(next === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    notify(video.muted ? t('PLAYER_MUTE') : t('PLAYER_UNMUTE'));
  }, [notify, t]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void container.requestFullscreen?.();
  }, []);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
      notify(t('PLAYER_PIP'));
    } catch {
      // PiP no disponible en este navegador.
    }
  }, [notify, t]);

  const cycleScale = useCallback(() => {
    setVideoScale((current) => {
      const next = nextVideoScale(current);
      notify(`${t('PLAYER_VIDEO_SCALE')}: ${videoScaleLabel(next)}`);
      return next;
    });
  }, [notify, t]);

  /**
   * Guarda las pistas/desfase/velocidad de este vídeo (debounce corto: el
   * desfase se ajusta a golpes de ±250 ms). Nunca se guarda antes de cargar
   * la preferencia previa, para no sobrescribirla con los valores iniciales.
   * Los valores se leen de `latestPrefRef` al dispararse: así el debounce no
   * congela estados viejos.
   */
  const persistTrackPref = useCallback(() => {
    if (trackPref === undefined) return;
    if (savePrefTimer.current) clearTimeout(savePrefTimer.current);
    const videoId = id;
    const profileId = activeProfileId || undefined;
    savePrefTimer.current = setTimeout(() => {
      void api
        .saveTrackPref(videoId, { profileId, ...latestPrefRef.current })
        .catch(() => { /* sin red: se conserva el estado local */ });
    }, 800);
  }, [id, activeProfileId, trackPref]);

  const changeSpeed = useCallback(
    (direction: 1 | -1) => {
      setSpeed((current) => {
        const next = nextSpeed(current, direction);
        if (videoRef.current) videoRef.current.playbackRate = next;
        notify(`${t('PLAYER_PLAYBACK_SPEED')}: ${speedLabel(next)}`);
        return next;
      });
      persistTrackPref();
    },
    [notify, t, persistTrackPref],
  );

  /** Salto de fotograma a fotograma (`,` y `.` en teclado; util para ajustar). */
  const frameStep = useCallback(
    (deltaFrames: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      video.currentTime = Math.max(0, video.currentTime + deltaFrames * FRAME_STEP_SECONDS);
      showControls();
    },
    [showControls],
  );

  const skipIntro = useCallback(() => {
    const video = videoRef.current;
    if (!video || !skipSegment) return;
    video.currentTime = Math.max(0, skipSegment.endMs / 1000);
    setSkipped(true);
    notify(skipSegment.kind === 'recap' ? t('PLAYER_SKIP_RECAP') : t('PLAYER_SKIP_INTRO'));
    showControls();
  }, [skipSegment, notify, showControls, t]);

  const selectQuality = useCallback(
    (index: number) => {
      controllerRef.current?.setLevel(index);
      setPinned(index);
      setQuality(index < 0 ? t('PLAYER_QUALITY_AUTO') : qualityLabel(levels[index]));
      notify(index < 0 ? t('PLAYER_QUALITY_AUTO') : qualityLabel(levels[index]));
    },
    [levels, notify, t],
  );

  const selectSubtitle = useCallback((key: string | null) => {
    subtitleChosenRef.current = true;
    setActiveSubtitle(key);
    setMenu(null);
    persistTrackPref();
  }, [persistTrackPref]);

  const selectAudio = useCallback(
    (index: number) => {
      controllerRef.current?.setAudioTrack(index);
      setActiveAudio(index);
      setMenu(null);
      const chosen = audioOptions.find((track) => track.index === index);
      if (chosen) notify(chosen.label);
      persistTrackPref();
    },
    [audioOptions, notify, persistTrackPref],
  );

  const changeSubtitleDelay = useCallback(
    (deltaMs: number) => {
      setSubtitleDelay((current) => {
        const next = Math.max(-15_000, Math.min(15_000, current + deltaMs));
        notify(`${t('PLAYER_SUBTITLES_DELAY')} ${formatDelay(next)}`);
        return next;
      });
      persistTrackPref();
    },
    [notify, t, persistTrackPref],
  );

  const changeSubtitleSize = useCallback(
    (direction: 1 | -1) => {
      setSubtitleStyle((current) => {
        const next = Math.max(0.6, Math.min(2.4, Number((current.size + direction * 0.1).toFixed(2))));
        notify(`${t('PLAYER_SUBTITLES_SIZE')} ${Math.round(next * 100)}%`);
        return { ...current, size: next };
      });
    },
    [notify, t],
  );

  /** Ejecuta una accion del reproductor (teclado, mando o boton). */
  const run = useCallback(
    (action: PlayerAction) => {
      switch (action.type) {
        case 'togglePlay':
          togglePlay();
          break;
        case 'seek':
          seekBy(action.deltaSeconds);
          break;
        case 'seekPercent':
          seekTo(seekToPercent(action.percent, duration));
          break;
        case 'frameStep':
          frameStep(action.deltaFrames);
          break;
        case 'volume':
          changeVolume((muted ? 0 : volume) + action.delta);
          break;
        case 'toggleMute':
          toggleMute();
          break;
        case 'toggleFullscreen':
          toggleFullscreen();
          break;
        case 'togglePiP':
          void togglePiP();
          break;
        case 'cycleVideoScale':
          cycleScale();
          break;
        case 'speed':
          changeSpeed(action.direction);
          break;
        case 'speedReset':
          if (videoRef.current) videoRef.current.playbackRate = 1;
          setSpeed(1);
          notify(speedLabel(1));
          break;
        case 'subtitleDelay':
          changeSubtitleDelay(action.deltaMs);
          break;
        case 'subtitleSize':
          changeSubtitleSize(action.direction);
          break;
        case 'toggleSubtitles':
          setActiveSubtitle((current) => {
            if (current) return null;
            return subtitleOptions[0]?.key ?? null;
          });
          break;
        case 'menu':
          setMenu((current) => (current === action.menu ? null : action.menu));
          break;
        case 'nextEpisode':
          setCountdown(null);
          void playNext();
          break;
        case 'previousEpisode':
          seekTo(0);
          break;
        case 'skipIntro':
          skipIntro();
          break;
        case 'back':
          saveProgress({ force: true });
          navigate({ name: 'detail', id: id.split(':')[0] ?? id, type: type === 'episode' ? 'series' : type });
          break;
        case 'showControls':
          showControls();
          break;
        case 'shortcuts':
          setMenu((current) => (current === 'shortcuts' ? null : 'shortcuts'));
          break;
        default:
          break;
      }
      showControls();
    },
    [
      changeSpeed, changeSubtitleDelay, changeSubtitleSize, changeVolume, cycleScale, duration, frameStep,
      id, navigate, notify, playNext, saveProgress, seekBy, seekTo, showControls, skipIntro, subtitleOptions,
      toggleFullscreen, toggleMute, togglePiP, togglePlay, type, volume, muted,
    ],
  );

  // ------------------------------------------------------------- teclado
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField = Boolean(
        target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)),
      );
      const inControls = Boolean(target?.closest?.('.player__bar') || target?.closest?.('.player__menu'));

      // Con el foco dentro de la barra o del menu, las flechas y Enter son del
      // navegador (navegacion espacial del D-pad).
      if (inControls && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) {
        showControls();
        return;
      }
      // Arriba/abajo sin foco en los controles: llevan el foco a la barra.
      if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !inControls) {
        event.preventDefault();
        const bar = containerRef.current?.querySelector<HTMLElement>('.player__bar [data-focusable="true"]');
        bar?.focus();
        showControls();
        return;
      }

      const action = playerAction({
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        inField,
      });
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      run(action);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [run, showControls]);

  // -------------------------------------------------- eventos del video
  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    setDuration(video.duration || 0);
    if (video.buffered.length) setBuffered(video.buffered.end(video.buffered.length - 1));
    // Tras un minuto seguido sin fallos se reinicia la escalera de recuperacion.
    if (controllerRef.current && controllerRef.current.attempts && !video.paused) {
      controllerRef.current.resetRecovery();
      setRecovering(null);
    }
    saveProgress();
  }, [saveProgress]);

  const stats = useMemo<PlaybackStats>(
    () => ({
      currentLevel: controllerRef.current?.currentLevelIndex ?? -1,
      activeLevel: controllerRef.current?.currentLevel ?? null,
      autoLevel: pinned < 0,
      bandwidthEstimate: bandwidth || controllerRef.current?.bandwidthEstimate || 0,
      bufferedAhead: Math.max(0, buffered - currentTime),
      bufferBehind: Math.min(currentTime, controllerRef.current?.bufferPlan?.backBufferLength ?? 0),
      droppedFrames: frames.dropped,
      decodedFrames: frames.decoded,
      timeToFirstFrameMs: startedAt.current ? Date.now() - startedAt.current : undefined,
      stallCount: stallCount.current,
      stallTotalMs: stallTotalMs.current,
      bitrate: controllerRef.current?.currentLevel?.bitrate ?? 0,
    }),
    [bandwidth, buffered, currentTime, frames.decoded, frames.dropped, pinned, quality],
  );

  // ------------------------------------------------------------- derivados
  const showSkipButton =
    skipEnabled &&
    !skipped &&
    Boolean(skipSegment) &&
    currentTime < (skipSegment?.endMs ?? 0) / 1000 - 1;

  const preview = useMemo(() => {
    if (previewAt === null || !thumbnails.length) return null;
    const thumb = thumbnailAt(thumbnails, previewAt);
    if (!thumb) return null;
    const box = thumbnailBox(thumbnails, 220);
    return { thumb, box, style: thumbnailCss(thumb, box.width, box.height) };
  }, [previewAt, thumbnails]);

  const remaining = duration > 0 ? duration - currentTime : 0;
  const endsAtLabel = duration > 0 ? toAsciiDigits(endsAt(remaining)) : '';

  const scaleStyle = useMemo(() => videoScaleCss(videoScale), [videoScale]);

  // ---------------------------------------------------------------- render
  if (fatal) {
    return (
      <div className="player player--error">
        <div className="player__error">
          <h2>{fatal.message}</h2>
          <p className="player__error-detail">{fatal.detail}</p>
          <div className="player__error-actions">
            <Button onClick={() => void controllerRef.current?.retry()}>{t('PLAYER_ERROR_RETRY')}</Button>
            <Button variant="ghost" onClick={() => void switchToAlternateStream()}>
              {t('PLAYER_ERROR_NEXT_STREAM')}
            </Button>
            <Button variant="ghost" onClick={() => navigate({ name: 'detail', id: id.split(':')[0] ?? id, type })}>
              {t('BACK')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      data-focusable="true"
      className={`player ${controlsVisible ? 'player--controls' : ''} ${buffering ? 'player--buffering' : ''}`}
      onMouseMove={showControls}
      onMouseLeave={() => setControlsVisible(false)}
      onFocus={showControls}
    >
      <video
        ref={videoRef}
        className="player__video"
        autoPlay
        playsInline
        poster={poster}
        style={scaleStyle as CSSProperties}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => {
          setPlaying(true);
          setBuffering(false);
        }}
        onPause={() => {
          setPlaying(false);
          saveProgress({ force: true });
        }}
        onWaiting={() => {
          setBuffering(true);
          if (!stallStartedAt.current) stallStartedAt.current = Date.now();
        }}
        onStalled={() => setBuffering(true)}
        onPlaying={() => {
          setBuffering(false);
          if (stallStartedAt.current) {
            stallCount.current += 1;
            stallTotalMs.current += Date.now() - stallStartedAt.current;
            stallStartedAt.current = 0;
          }
        }}
        onCanPlay={() => {
          setBuffering(false);
          setLoading(false);
        }}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
        }}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0);
          setLoading(false);
        }}
        onEnded={() => {
          saveProgress({ force: true });
          if (resolvedNextId && activeProfile?.autoplay !== false && countdownSeconds > 0) {
            setCountdown(countdownSeconds);
          }
        }}
      />

      <SubtitleLayer
        cues={cues}
        timeMs={currentTime * 1000}
        delayMs={subtitleDelay}
        style={subtitleStyle}
        video={videoRef.current}
        nativeTrackIndex={
          subtitleOptions.find((option) => option.key === activeSubtitle)?.native ?? null
        }
      />

      {loading ? (
        <div className="player__loading">
          <Icon name="spinner" className="player__spinner" />
          <span>{recovering ?? t('PLAYER_PREPARING')}</span>
        </div>
      ) : null}

      {buffering && !loading ? (
        <div className="player__loading player__loading--soft" role="status">
          <Icon name="spinner" className="player__spinner" />
          <span>{t('PLAYER_BUFFERING')}</span>
        </div>
      ) : null}

      {toast ? <div className="player__toast" role="status">{toast}</div> : null}

      {showSkipButton && skipSegment ? (
        <button type="button" data-focusable="true" className="player__skip" onClick={skipIntro}>
          <Icon name="skip" />
          {skipSegment.kind === 'recap' ? t('PLAYER_SKIP_RECAP') : t('PLAYER_SKIP_INTRO')}
        </button>
      ) : null}

      {countdown !== null ? (
        <div className="player__next" role="status">
          <div className="player__next-card">
            <span className="player__next-label">{t('PLAYER_NEXT_EPISODE')}</span>
            <strong>{resolvedNextTitle ?? t('LOADING')}</strong>
            <div className="player__next-actions">
              <Button onClick={() => void playNext()}>{t('PLAYER_NEXT_VIDEO_BUTTON_WATCH')}</Button>
              <Button variant="ghost" onClick={() => setCountdown(null)}>
                {t('PLAYER_NEXT_VIDEO_BUTTON_DISMISS')}
              </Button>
            </div>
            <span className="player__next-count">{toAsciiDigits(String(countdown))}</span>
          </div>
        </div>
      ) : null}

      {/* Barra de controles */}
      <div className="player__bar" data-focusable="true">
        <div
          className="player__progress"
          onMouseMove={(event) => {
            if (!duration) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
            setPreviewAt(ratio * duration * 1000);
            setPreviewX(ratio * rect.width);
          }}
          onMouseLeave={() => setPreviewAt(null)}
        >
          <div className="player__progress-track">
            <div
              className="player__progress-buffered"
              style={{ width: `${progressPercent(buffered, duration)}%` }}
            />
            <div
              className="player__progress-played"
              style={{ width: `${progressPercent(currentTime, duration)}%` }}
            />
          </div>
          {preview ? (
            <div className="player__preview" style={{ left: Math.max(8, previewX - preview.box.width / 2) }}>
              <div className="player__preview-image" style={preview.style as CSSProperties} />
              <span>{toAsciiDigits(formatClock(previewAt !== null ? previewAt / 1000 : 0))}</span>
            </div>
          ) : null}
          <input
            className="player__progress-input"
            type="range"
            min={0}
            max={Math.max(1, Math.floor(duration))}
            value={Math.floor(currentTime)}
            aria-label={t('SEEK')}
            onChange={(event) => seekTo(Number(event.target.value))}
          />
        </div>

        <div className="player__row">
          <div className="player__time">
            <span>{toAsciiDigits(formatClock(currentTime))}</span>
            <span className="player__time-sep">/</span>
            <span>{toAsciiDigits(formatClock(duration))}</span>
            {endsAtLabel ? (
              <span className="player__ends">{t('PLAYER_CLOCK_ENDS_AT', [endsAtLabel])}</span>
            ) : null}
          </div>

          <div className="player__actions">
            <button type="button" data-focusable="true" className="player__btn" onClick={() => seekBy(-10)}
              aria-label={t('SETTINGS_SHORTCUT_SEEK_BACKWARD')}>
              <Icon name="back10" />
            </button>
            <button
              type="button"
              data-focusable="true"
              className="player__btn player__btn--primary"
              onClick={togglePlay}
              aria-label={playing ? t('PLAYER_PAUSE') : t('PLAYER_PLAY')}
            >
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
            <button type="button" data-focusable="true" className="player__btn" onClick={() => seekBy(10)}
              aria-label={t('SETTINGS_SHORTCUT_SEEK_FORWARD')}>
              <Icon name="forward10" />
            </button>
            <button type="button" data-focusable="true" className="player__btn" onClick={toggleMute}
              aria-label={muted ? t('PLAYER_UNMUTE') : t('PLAYER_MUTE')}>
              <Icon name={muted || volume === 0 ? 'volumeMute' : 'volume'} />
            </button>
            <input
              className="player__volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              aria-label={t('SETTINGS_SHORTCUT_VOLUME')}
              onChange={(event) => changeVolume(Number(event.target.value))}
            />
          </div>

          <div className="player__meta">
            <span className="player__title">{title ?? streamName ?? t('PLAYBACK')}</span>
            {quality ? <span className="player__badge">{quality}</span> : null}
            {speed !== 1 ? <span className="player__badge">{speedLabel(speed)}</span> : null}
            {resumedAt ? <span className="player__badge">{t('PLAYER_RESUMED')}</span> : null}
            {type === 'tv' || type === 'channel' ? (
              <span className="player__badge player__badge--live">{t('PLAYER_LIVE')}</span>
            ) : null}
          </div>

          <div className="player__actions">
            <button type="button" data-focusable="true" className="player__btn"
              onClick={() => setMenu(menu === 'subtitles' ? null : 'subtitles')}
              aria-label={t('SUBTITLES')}>
              <Icon name="subtitles" />
            </button>
            <button type="button" data-focusable="true" className="player__btn"
              onClick={() => setMenu(menu === 'audio' ? null : 'audio')} aria-label={t('AUDIO')}>
              <Icon name="audio" />
            </button>
            <button type="button" data-focusable="true" className="player__btn"
              onClick={() => setMenu(menu === 'quality' ? null : 'quality')} aria-label={t('QUALITY')}>
              <Icon name="quality" />
            </button>
            {!essentialMode ? (
              <>
                <button type="button" data-focusable="true" className="player__btn"
                  onClick={() => setMenu(menu === 'stats' ? null : 'stats')} aria-label={t('PLAYER_STATS')}>
                  <Icon name="stats" />
                </button>
                <button type="button" data-focusable="true" className="player__btn" onClick={cycleScale}
                  aria-label={t('PLAYER_VIDEO_SCALE')}>
                  <Icon name="scale" />
                </button>
              </>
            ) : null}
            <button type="button" data-focusable="true" className="player__btn" onClick={toggleFullscreen}
              aria-label={t('PLAYER_FULLSCREEN')}>
              <Icon name="expand" />
            </button>
            <button type="button" data-focusable="true" className="player__btn player__btn--back"
              onClick={() => run({ type: 'back' })} aria-label={t('BACK')}>
              <Icon name="back" />
            </button>
          </div>
        </div>
      </div>

      {menu ? (
        <aside className="player__menu" data-focusable="true">
          {menu === 'subtitles' ? (
            <>
              <h3>{t('PLAYER_SUBTITLE_TRACKS')}</h3>
              <div className="player__levels">
                <button type="button" data-focusable="true"
                  className={`chip ${activeSubtitle === null ? 'chip--active' : ''}`}
                  onClick={() => selectSubtitle(null)}>
                  {t('OFF')}
                </button>
                {subtitleOptions.map((option) => (
                  <button key={option.key} type="button" data-focusable="true"
                    className={`chip ${activeSubtitle === option.key ? 'chip--active' : ''}`}
                    onClick={() => selectSubtitle(option.key)}>
                    {option.label}
                    {option.sdh ? ' · SDH' : ''}
                  </button>
                ))}
              </div>

              <h3>{t('PLAYER_SUBTITLES_SETTINGS')}</h3>
              <div className="player__levels">
                <button type="button" data-focusable="true" className="chip" onClick={() => changeSubtitleDelay(-250)}>
                  {t('PLAYER_SUBTITLES_DELAY')} −250 ms
                </button>
                <button type="button" data-focusable="true" className="chip" onClick={() => changeSubtitleDelay(250)}>
                  {t('PLAYER_SUBTITLES_DELAY')} +250 ms
                </button>
                <button type="button" data-focusable="true" className="chip chip--value">
                  {formatDelay(subtitleDelay)}
                </button>
                <button type="button" data-focusable="true" className="chip" onClick={() => changeSubtitleSize(-1)}>
                  {t('PLAYER_SUBTITLES_SIZE')} −
                </button>
                <button type="button" data-focusable="true" className="chip" onClick={() => changeSubtitleSize(1)}>
                  {t('PLAYER_SUBTITLES_SIZE')} +
                </button>
                <button type="button" data-focusable="true"
                  className={`chip ${cleanSdh ? 'chip--active' : ''}`}
                  onClick={() => setCleanSdh((value) => !value)}>
                  {t('SETTINGS_CLEAN_SDH')}: {cleanSdh ? t('ON') : t('OFF')}
                </button>
              </div>
            </>
          ) : null}

          {menu === 'audio' ? (
            <>
              <h3>{t('PLAYER_AUDIO_TRACKS')}</h3>
              <div className="player__levels">
                {audioOptions.length ? (
                  audioOptions.map((track) => (
                    <button key={track.index} type="button" data-focusable="true"
                      className={`chip ${activeAudio === track.index ? 'chip--active' : ''}`}
                      onClick={() => selectAudio(track.index)}>
                      {track.label}
                    </button>
                  ))
                ) : (
                  <span className="player__empty">{t('AUDIO')}</span>
                )}
              </div>
              <h3>{t('PLAYER_PLAYBACK_SPEED')}</h3>
              <div className="player__levels">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
                  <button key={value} type="button" data-focusable="true"
                    className={`chip ${speed === value ? 'chip--active' : ''}`}
                    onClick={() => {
                      setSpeed(value);
                      if (videoRef.current) videoRef.current.playbackRate = value;
                      setMenu(null);
                      notify(speedLabel(value));
                      persistTrackPref();
                    }}>
                    {speedLabel(value)}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {menu === 'quality' ? (
            <>
              <h3>{t('PLAYER_QUALITY_LEVELS')}</h3>
              <div className="player__levels">
                <button type="button" data-focusable="true"
                  className={`chip ${pinned < 0 ? 'chip--active' : ''}`} onClick={() => selectQuality(-1)}>
                  {t('PLAYER_QUALITY_AUTO')}
                  {controllerRef.current?.plan ? ` · ${controllerRef.current.plan.reason}` : ''}
                </button>
                {levels.map((level, index) => (
                  <button key={`${level.height ?? index}-${index}`} type="button" data-focusable="true"
                    className={`chip ${pinned === index ? 'chip--active' : ''}`} onClick={() => selectQuality(index)}>
                    {qualityLabel(level)}
                    {level.bitrate ? ` · ${formatBitrate(level.bitrate)}` : ''}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {menu === 'stats' ? (
            <>
              <h3>{t('PLAYER_STATS')}</h3>
              <dl className="player__stats">
                {describeStats(stats).map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{toAsciiDigits(row.value)}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}

          {menu === 'info' ? (
            <>
              <h3>{t('PLAYER_INFO_HLS')}</h3>
              <p className="player__info-note">
                {master?.selected ? master.selected.reason : t('VIBE_NOT_MASTER')}
              </p>
              <div className="player__levels">
                {(master?.variants ?? []).map((variant, index) => (
                  <button key={`${variant.uri}-${index}`} type="button" data-focusable="true" className="chip"
                    onClick={() => {
                      // El indice del master del servidor no tiene por que
                      // coincidir con el de hls.js: se emparejan por URI/altura.
                      const mapped = matchLevelIndex(levels, variant);
                      selectQuality(mapped >= 0 ? mapped : index);
                    }}>
                    {variant.height ? `${variant.height}p` : t('PLAYER_QUALITY_AUTO')}
                    {variant.codecs?.length ? ` · ${variant.codecs[0]?.split('.')[0]}` : ''}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {menu === 'episodes' ? (
            <>
              <h3>{t('PLAYER_NEXT_EPISODE')}</h3>
              {resolvedNextId ? (
                <div className="player__levels">
                  <span className="player__empty">{resolvedNextTitle ?? resolvedNextId}</span>
                  <button type="button" data-focusable="true" className="chip chip--active"
                    onClick={() => {
                      setMenu(null);
                      void playNext();
                    }}>
                    {t('PLAYER_NEXT_VIDEO_BUTTON_WATCH')}
                  </button>
                </div>
              ) : (
                <p className="player__info-note">{t('NO_RESULTS')}</p>
              )}
            </>
          ) : null}

          {menu === 'shortcuts' ? (
            <>
              <h3>{t('PLAYER_SHORTCUTS')}</h3>
              <dl className="player__stats">
                {SHORTCUTS.map((entry) => (
                  <div key={entry.keys}>
                    <dt>{entry.keys}</dt>
                    <dd>{t(entry.labelKey)}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}

          <button type="button" data-focusable="true" className="player__menu-close" onClick={() => setMenu(null)}>
            {t('CLOSE')}
          </button>
        </aside>
      ) : null}
    </div>
  );
}
