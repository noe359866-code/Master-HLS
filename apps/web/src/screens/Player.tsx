import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';

import { api } from '../api';
import { useApp } from '../store';
import type { MasterInfo, SkipSegment, Subtitle } from '../types';
import { Button, ErrorState, Loader } from '../components/ui';

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

interface TrackInfo {
  id: number;
  name: string;
  lang: string;
  isDefault: boolean;
}

/** Tamaños de subtitulo disponibles. */
const SUBTITLE_SIZES = [
  { id: 'small', label: 'S', scale: 0.85 },
  { id: 'normal', label: 'M', scale: 1 },
  { id: 'large', label: 'L', scale: 1.25 },
] as const;

/** Segundos que se muestra la cuenta atras del siguiente episodio. */
const AUTOPLAY_COUNTDOWN = 5;

/**
 * Reproductor de Vibe Flix.
 *
 * - Reproduce el master playlist dejando que hls.js negocie la calidad, y
 *   ofrece el selector de variantes real que devuelve el servidor.
 * - Permite elegir pista de audio y de subtitulos (incluidos los externos del
 *   stream y los descargados de OpenSubtitles).
 * - **Omitir intro**: el servidor detecta el final de la intro a partir de los
 *   subtitulos y aqui aparece el boton para saltar a ese punto.
 * - **Autoplay**: al terminar, ofrece el siguiente episodio con una cuenta
 *   atras que se puede cancelar.
 * - Continua donde lo dejo (progreso guardado por el servidor).
 */
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [master, setMaster] = useState<MasterInfo | null>(null);
  const [quality, setQuality] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [audioTracks, setAudioTracks] = useState<TrackInfo[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<TrackInfo[]>([]);
  const [activeAudio, setActiveAudio] = useState(-1);
  const [activeSubtitle, setActiveSubtitle] = useState(-1);
  const [subtitlesOn, setSubtitlesOn] = useState(false);
  const [externalTracks, setExternalTracks] = useState<Array<{ name: string; lang: string; url: string }>>([]);
  const [resumedAt, setResumedAt] = useState<number | null>(null);

  // Reproduccion
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [subtitleSize, setSubtitleSize] = useState(1);

  // Omitir intro
  const [skipSegment, setSkipSegment] = useState<SkipSegment | null>(null);
  const [skipped, setSkipped] = useState(false);

  // Autoplay
  const [countdown, setCountdown] = useState<number | null>(null);

  const device = settings?.device;
  const maxHeight = device?.maxHeight ?? 1080;
  const skipEnabled = settings?.skipIntro?.enabled !== false;

  // --------------------------------------------------------------- carga
  useEffect(() => {
    if (!streamUrl) {
      setError('No hay URL de stream');
      setLoading(false);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    setLoading(true);
    setError(null);

    const cleanup = () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };

    const attach = (source: string) => {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 60,
          maxBufferLength: 30,
          startLevel: -1,
        });
        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoading(false);
          const levels = hls.levels;
          if (levels.length) {
            const best = levels.reduce(
              (acc, level, index) =>
                (level.height ?? 0) > (levels[acc]?.height ?? 0) ? index : acc,
              0,
            );
            hls.currentLevel = best;
            setQuality(`${levels[best]?.height ?? ''}p`);
          }
          refreshTracks(hls);
        });

        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => refreshTracks(hls));
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => refreshTracks(hls));

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setError(`Error de reproducción: ${data.details}`);
            setLoading(false);
          }
        });

        hls.loadSource(source);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = source;
        video.addEventListener('loadedmetadata', () => setLoading(false), { once: true });
      } else {
        setError('Este navegador no puede reproducir HLS');
        setLoading(false);
      }
    };

    attach(streamUrl);
    return cleanup;
  }, [streamUrl]);

  const refreshTracks = useCallback((hls: Hls) => {
    setAudioTracks(
      hls.audioTracks.map((track, index) => ({
        id: index,
        name: track.name || track.lang || `Audio ${index + 1}`,
        lang: track.lang ?? '',
        isDefault: Boolean(track.default),
      })),
    );
    setSubtitleTracks(
      hls.subtitleTracks.map((track, index) => ({
        id: index,
        name: track.name || track.lang || `Subtítulos ${index + 1}`,
        lang: track.lang ?? '',
        isDefault: Boolean(track.default),
      })),
    );
  }, []);

  // ------------------------------------------- subtitulos externos del stream
  //
  // hls.js v1 no expone las pistas externas del stream, asi que se cargan con
  // <track> nativo del navegador (WebVTT), que es lo que usan los clientes
  // Stremio de escritorio.
  useEffect(() => {
    if (!streamUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        // En Stremio, un episodio se pide como tipo `series` con el id
        // completo (`tt123:1:2`), que es lo que entienden los addons.
        const { streams } = await api.streams(
          type === 'episode' ? 'series' : type,
          id,
        );
        const found = streams.find((stream) => stream.url === streamUrl);
        const subtitles: Subtitle[] = found?.subtitles ?? [];
        const tracks = subtitles
          .filter((subtitle) => Boolean(subtitle.url))
          .map((subtitle) => ({
            name: subtitle.lang ?? subtitle.language ?? 'Subtitulos',
            lang: subtitle.lang ?? subtitle.language ?? 'und',
            url: subtitle.url!,
          }));
        if (!cancelled) setExternalTracks(tracks);
      } catch {
        // Sin subtitulos externos: no es un error.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [streamUrl, id, type]);

  // ------------------------------------------------- analisis del master HLS
  useEffect(() => {
    if (!streamUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const info = await api.masterInfo(streamUrl, {
          maxHeight,
          audioLang: activeProfile?.audioLanguage,
        });
        if (!cancelled) setMaster(info);
      } catch {
        // Si no es un master (o falla), se reproduce tal cual.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [streamUrl, maxHeight, activeProfile?.audioLanguage]);

  // ------------------------------------------------------ deteccion de intro
  //
  // El servidor analiza los subtitulos y dice hasta donde llega la intro.
  useEffect(() => {
    if (!skipEnabled) return;
    let cancelled = false;
    const [imdbId, season, episode] = id.split(':');
    void (async () => {
      try {
        const result = await api.skipIntro({
          type: type === 'episode' ? 'series' : type,
          id: imdbId,
          imdbId,
          season: season ? Number(season) : undefined,
          episode: episode ? Number(episode) : undefined,
        });
        if (!cancelled && result.segment) setSkipSegment(result.segment);
      } catch {
        // Sin deteccion: se queda el boton con el offset por defecto.
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
      .pushHistory(
        { id, type, name: title, poster, streamName },
        activeProfileId || undefined,
      )
      .then(() => reloadLibrary())
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type, title]);

  const lastSaved = useRef(0);
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    setDuration(video.duration || 0);
    if (video.buffered.length) setBuffered(video.buffered.end(video.buffered.length - 1));

    if (!title) return;
    const now = Date.now();
    if (now - lastSaved.current < 15_000) return;
    lastSaved.current = now;
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
  }, [id, type, title, poster, activeProfileId]);

  // ------------------------------------------------- continuar donde lo deje
  useEffect(() => {
    const video = videoRef.current;
    if (!video || resumedAt !== null) return;
    const onLoaded = () => {
      void (async () => {
        try {
          const entries = await api.progress(activeProfileId || undefined);
          const entry = entries.find((item) => item.id === id);
          if (entry && entry.position > 30 && entry.duration > 0) {
            const ratio = entry.position / entry.duration;
            if (ratio < 0.95) {
              video.currentTime = entry.position;
              setResumedAt(entry.position);
            }
          }
        } catch {
          // Sin progreso guardado: se empieza desde el principio.
        }
      })();
    };
    video.addEventListener('loadedmetadata', onLoaded);
    return () => video.removeEventListener('loadedmetadata', onLoaded);
  }, [id, activeProfileId, resumedAt]);

  // -------------------------------------------------- siguiente episodio
  //
  // Si la ruta no trae el siguiente (p.ej. se entra desde la biblioteca), se
  // busca en la ficha de la serie.
  const [detectedNext, setDetectedNext] = useState<{ id: string; title: string } | null>(null);

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
            title: next.title ?? next.name ?? `Episodio ${next.episode ?? index + 2}`,
          });
        }
      } catch {
        // Sin informacion de episodios: no hay autoplay siguiente.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, type, nextId]);

  const resolvedNextId = nextId ?? detectedNext?.id ?? '';
  const resolvedNextTitle = nextTitle ?? detectedNext?.title;

  const playNext = useCallback(async () => {
    if (!resolvedNextId) return;
    try {
      const { streams } = await api.streams('series', resolvedNextId);
      const stream = streams[0];
      if (!stream?.url) return;
      navigate({
        name: 'player',
        id: resolvedNextId,
        type: 'episode',
        streamUrl: stream.url,
        streamName: stream.name ?? stream.title ?? 'Stream',
        title: resolvedNextTitle ?? title,
        poster,
      });
    } catch {
      // Sin streams para el siguiente episodio.
    }
  }, [resolvedNextId, resolvedNextTitle, navigate, title, poster]);

  // Cuenta atras de autoplay al terminar el episodio.
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

  // ------------------------------------------------------------- controles
  /** true si el foco esta dentro de la barra de controles. */
  const focusInControls = useCallback((target: EventTarget | null) => {
    const element = target as HTMLElement | null;
    return Boolean(element?.closest?.('.player__bar'));
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimer.current) window.clearTimeout(controlsTimer.current);
    controlsTimer.current = window.setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  useEffect(() => {
    showControls();
    return () => {
      if (controlsTimer.current) window.clearTimeout(controlsTimer.current);
    };
  }, [showControls]);

  /** Lleva el foco al primer control de la barra (D-pad hacia arriba/abajo). */
  const focusControls = useCallback(() => {
    const bar = containerRef.current?.querySelector<HTMLElement>(
      '.player__bar [data-focusable="true"]',
    );
    bar?.focus();
    showControls();
  }, [showControls]);

  // Al entrar en el reproductor el foco va al video: las flechasseek y el
  // espacio play/pausa.
  useEffect(() => {
    containerRef.current?.focus();
  }, [streamUrl]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + delta));
    showControls();
  }, [showControls]);

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
  }, []);

  const skipIntro = useCallback(() => {
    const video = videoRef.current;
    if (!video || !skipSegment) return;
    video.currentTime = Math.max(0, skipSegment.endMs / 1000);
    setSkipped(true);
    showControls();
  }, [skipSegment, showControls]);

  const toggleFullscreen = useCallback(() => {
    const container = document.querySelector('.player');
    if (!container) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void container.requestFullscreen?.();
  }, []);

  // Atajos de teclado del reproductor.
  //
  // Se escuchan en la fase de captura y se detiene la propagacion: asi el
  // reproductor manda en las flechas y la navegacion espacial del D-pad solo
  // actua cuando el foco esta dentro de la barra de controles.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Los campos (volumen, progreso) se comportan de forma nativa.
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      // Con el foco en la barra, las flechas mueven el foco entre controles y
      // espacio/enter activan el boton enfocado.
      if (
        focusInControls(event.target) &&
        (event.key.startsWith('Arrow') || event.key === ' ' || event.key === 'Enter')
      ) {
        return;
      }

      let handled = true;
      switch (event.key) {
        case ' ':
        case 'k':
          togglePlay();
          break;
        case 'ArrowLeft':
          seekBy(-10);
          break;
        case 'ArrowRight':
          seekBy(10);
          break;
        case 'ArrowUp':
        case 'ArrowDown':
          // Arriba/abajo: el foco pasa a la barra de controles (o vuelve al
          // video si ya estaba en ella).
          if (focusInControls(event.target)) {
            containerRef.current?.focus();
          } else {
            focusControls();
          }
          break;
        case 'm':
          toggleMute();
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'i':
          setShowInfo((value) => !value);
          break;
        case 'Escape':
          navigate({ name: 'detail', id, type });
          break;
        default:
          handled = false;
      }
      if (!handled) return;
      event.preventDefault();
      event.stopPropagation();
      showControls();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [
    togglePlay,
    seekBy,
    focusControls,
    focusInControls,
    toggleMute,
    toggleFullscreen,
    showControls,
    navigate,
    id,
    type,
  ]);

  // -------------------------------------------------------------- acciones
  const selectQuality = (level: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = level;
    setQuality(`${hls.levels[level]?.height ?? ''}p`);
  };

  const selectExternalSubtitle = (index: number) => {
    const video = videoRef.current;
    if (!video) return;
    Array.from(video.textTracks).forEach((track, position) => {
      track.mode = position === index ? 'showing' : 'hidden';
    });
    setActiveSubtitle(1000 + index);
    setSubtitlesOn(true);
  };

  const selectAudio = (index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.audioTrack = index;
    setActiveAudio(index);
  };

  const selectSubtitle = (index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.subtitleTrack = index;
    hls.subtitleDisplay = index >= 0;
    setActiveSubtitle(index);
    setSubtitlesOn(index >= 0);
  };

  const turnSubtitlesOff = () => {
    const hls = hlsRef.current;
    if (hls) hls.subtitleDisplay = false;
    const video = videoRef.current;
    if (video) {
      Array.from(video.textTracks).forEach((track) => {
        track.mode = 'hidden';
      });
    }
    setSubtitlesOn(false);
    setActiveSubtitle(-1);
  };

  // ------------------------------------------------------------- render
  const allExternalTracks = useMemo(() => {
    const tracks = [...externalTracks];
    if (subtitleUrl) {
      tracks.push({
        name: subtitleLabel ?? 'OpenSubtitles',
        lang: 'os',
        url: subtitleUrl,
      });
    }
    return tracks;
  }, [externalTracks, subtitleUrl, subtitleLabel]);

  const showSkipButton =
    skipEnabled &&
    !skipped &&
    Boolean(skipSegment) &&
    currentTime < (skipSegment?.endMs ?? 0) / 1000 - 1;

  if (error) {
    return (
      <div className="player player--error">
        <ErrorState message={error} />
        <Button variant="ghost" onClick={() => navigate({ name: 'detail', id, type })}>
          Volver al detalle
        </Button>
      </div>
    );
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      data-focusable="true"
      className={`player ${controlsVisible ? 'player--controls' : ''}`}
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
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onVolumeChange={(event) => {
          const video = event.currentTarget;
          setVolume(video.volume);
          setMuted(video.muted);
        }}
        onEnded={() => {
          if (resolvedNextId && activeProfile?.autoplay) setCountdown(AUTOPLAY_COUNTDOWN);
        }}
        style={{ ['--subtitle-scale' as string]: subtitleSize }}
      >
        {allExternalTracks.map((track) => (
          <track
            key={track.url}
            kind="subtitles"
            src={track.url}
            srcLang={track.lang}
            label={track.name}
          />
        ))}
      </video>

      {loading ? <Loader label="Preparando stream…" /> : null}

      {/* Boton de omitir intro */}
      {showSkipButton && skipSegment ? (
        <button
          type="button"
          data-focusable="true"
          className="player__skip"
          onClick={skipIntro}
        >
          ⏭ Saltar {skipSegment.kind === 'recap' ? 'el resumen' : 'la intro'}
        </button>
      ) : null}

      {/* Cuenta atras del siguiente episodio */}
      {countdown !== null ? (
        <div className="player__next" role="status">
          <div className="player__next-card">
            <span className="player__next-label">Siguiente episodio</span>
            <strong>{resolvedNextTitle ?? 'Reproduciendo…'}</strong>
            <div className="player__next-actions">
              <Button onClick={() => void playNext()}>Reproducir ahora</Button>
              <Button variant="ghost" onClick={() => setCountdown(null)}>
                Cancelar
              </Button>
            </div>
            <span className="player__next-count">{countdown}s</span>
          </div>
        </div>
      ) : null}

      {/* Barra de controles nativa */}
      <div className="player__bar" data-focusable="true">
        <div className="player__progress">
          <div className="player__progress-track">
            <div className="player__progress-buffered" style={{ width: `${bufferedPercent}%` }} />
            <div className="player__progress-played" style={{ width: `${progressPercent}%` }} />
          </div>
          <input
            className="player__progress-input"
            type="range"
            min={0}
            max={Math.max(1, Math.floor(duration))}
            value={Math.floor(currentTime)}
            aria-label="Progreso"
            onChange={(event) => {
              const video = videoRef.current;
              if (video) video.currentTime = Number(event.target.value);
            }}
          />
        </div>

        <div className="player__row">
          <span className="player__time">
            {formatClock(currentTime)} / {formatClock(duration)}
          </span>

          <div className="player__actions">
            <button type="button" data-focusable="true" className="player__btn" onClick={() => seekBy(-10)}>
              ⏪ 10s
            </button>
            <button
              type="button"
              data-focusable="true"
              className="player__btn player__btn--primary"
              onClick={togglePlay}
              aria-label={playing ? 'Pausar' : 'Reproducir'}
            >
              {playing ? '⏸' : '▶'}
            </button>
            <button type="button" data-focusable="true" className="player__btn" onClick={() => seekBy(10)}>
              10s ⏩
            </button>

            <button
              type="button"
              data-focusable="true"
              className="player__btn"
              onClick={toggleMute}
              aria-label="Silenciar"
            >
              {muted || volume === 0 ? '🔇' : '🔊'}
            </button>
            <input
              className="player__volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              aria-label="Volumen"
              onChange={(event) => changeVolume(Number(event.target.value))}
            />
          </div>

          <div className="player__meta">
            <span className="player__title">{title ?? streamName ?? 'Reproduciendo'}</span>
            {quality ? <span className="player__badge">{quality}</span> : null}
            {resumedAt ? <span className="player__badge">reanudado</span> : null}
          </div>

          <div className="player__actions">
            <button
              type="button"
              data-focusable="true"
              className="player__btn"
              onClick={() => setShowInfo((value) => !value)}
            >
              {showInfo ? 'Ocultar info' : 'Info HLS'}
            </button>
            <button
              type="button"
              data-focusable="true"
              className="player__btn"
              onClick={toggleFullscreen}
              aria-label="Pantalla completa"
            >
              ⛶
            </button>
            <button
              type="button"
              data-focusable="true"
              className="player__btn"
              onClick={() => navigate({ name: 'detail', id, type })}
            >
              Volver
            </button>
          </div>
        </div>
      </div>

      {showInfo ? (
        <aside className="player__info">
          <h3>Variantes HLS</h3>
          <p className="player__info-note">
            {master?.selected
              ? `Seleccion automatica: ${master.selected.reason}`
              : 'El stream no es un master multivariant.'}
          </p>
          <div className="player__levels">
            {(master?.variants ?? []).map((variant, index) => (
              <button
                key={`${variant.uri}-${index}`}
                type="button"
                data-focusable="true"
                className="chip"
                onClick={() => selectQuality(index)}
              >
                {variant.height ? `${variant.height}p` : 'auto'}
                {variant.codecs?.length ? ` · ${variant.codecs[0]?.split('.')[0]}` : ''}
                {variant.videoRange ? ` · ${variant.videoRange}` : ''}
              </button>
            ))}
          </div>

          {audioTracks.length ? (
            <>
              <h3>Audio</h3>
              <div className="player__levels">
                {audioTracks.map((track) => (
                  <button
                    key={`audio-${track.id}`}
                    type="button"
                    data-focusable="true"
                    className={`chip ${activeAudio === track.id ? 'chip--active' : ''}`}
                    onClick={() => selectAudio(track.id)}
                  >
                    {track.name}
                    {track.lang ? ` (${track.lang})` : ''}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {subtitleTracks.length || allExternalTracks.length ? (
            <>
              <h3>Subtítulos</h3>
              <div className="player__levels">
                <button
                  type="button"
                  data-focusable="true"
                  className={`chip ${!subtitlesOn ? 'chip--active' : ''}`}
                  onClick={turnSubtitlesOff}
                >
                  Off
                </button>
                {subtitleTracks.map((track) => (
                  <button
                    key={`sub-${track.id}`}
                    type="button"
                    data-focusable="true"
                    className={`chip ${activeSubtitle === track.id ? 'chip--active' : ''}`}
                    onClick={() => selectSubtitle(track.id)}
                  >
                    {track.name}
                    {track.lang ? ` (${track.lang})` : ''}
                  </button>
                ))}
                {allExternalTracks.map((track, index) => (
                  <button
                    key={`ext-${track.url}`}
                    type="button"
                    data-focusable="true"
                    className={`chip ${activeSubtitle === 1000 + index ? 'chip--active' : ''}`}
                    onClick={() => selectExternalSubtitle(index)}
                  >
                    {track.name}
                    {track.lang ? ` (${track.lang})` : ''}
                  </button>
                ))}
              </div>
              <h3>Tamaño de los subtítulos</h3>
              <div className="player__levels">
                {SUBTITLE_SIZES.map((size) => (
                  <button
                    key={size.id}
                    type="button"
                    data-focusable="true"
                    className={`chip ${subtitleSize === size.scale ? 'chip--active' : ''}`}
                    onClick={() => setSubtitleSize(size.scale)}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}

/** Formatea segundos como `h:mm:ss` o `mm:ss`. */
function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}
