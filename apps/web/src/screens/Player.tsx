import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

import { api } from '../api';
import { useApp } from '../store';
import type { MasterInfo, Subtitle } from '../types';
import { Button, ErrorState, Loader } from '../components/ui';

export interface PlayerProps {
  id: string;
  type: string;
  streamUrl?: string;
  streamName?: string;
  title?: string;
  poster?: string;
}

interface TrackInfo {
  id: number;
  name: string;
  lang: string;
  isDefault: boolean;
}

/**
 * Reproductor.
 *
 * - Reproduce el master playlist dejando que hls.js negocie la calidad, y
 *   ofrece el selector de variantes real que devuelve el servidor.
 * - Permite elegir pista de audio y de subtitulos (incluidos los subtitulos
 *   externos que trae el stream).
 * - Continua donde lo dejo (progreso guardado por el servidor).
 * - Reproduce automaticamente el siguiente episodio si el perfil lo pide.
 */
export function PlayerScreen({ id, type, streamUrl, streamName, title, poster }: PlayerProps) {
  const { navigate, activeProfileId, activeProfile, settings, reloadLibrary } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
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
  const [nextEpisode, setNextEpisode] = useState<string | null>(null);

  const device = settings?.device;
  const maxHeight = device?.maxHeight ?? 1080;

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
        const base = id.split(':')[0] ?? id;
        const { streams } = await api.streams(type === 'episode' ? 'series' : type, base);
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
    if (!video || !title) return;
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
  useEffect(() => {
    if (type !== 'episode') return;
    const base = id.split(':')[0] ?? id;
    let cancelled = false;
    void (async () => {
      try {
        const { meta } = await api.meta('series', base);
        const videos = meta?.videos ?? [];
        const index = videos.findIndex((video) => video.id === id);
        const next = videos[index + 1];
        if (!cancelled && next) setNextEpisode(next.id);
      } catch {
        // Sin informacion de episodios: no hay autoplay siguiente.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, type]);

  const playNext = useCallback(async () => {
    if (!nextEpisode || !activeProfile?.autoplay) return;
    try {
      const { streams } = await api.streams('series', nextEpisode);
      const stream = streams[0];
      if (!stream?.url) return;
      navigate({
        name: 'player',
        id: nextEpisode,
        type: 'episode',
        streamUrl: stream.url,
        streamName: stream.name ?? stream.title ?? 'Stream',
        title,
        poster,
      });
    } catch {
      // Sin streams para el siguiente episodio.
    }
  }, [nextEpisode, activeProfile?.autoplay, id, navigate, title, poster]);

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

  return (
    <div className="player">
      <video
        ref={videoRef}
        className="player__video"
        controls
        autoPlay
        playsInline
        poster={poster}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => void playNext()}
      >
        {externalTracks.map((track) => (
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

      <div className="player__overlay">
        <div className="player__meta">
          <strong>{title ?? streamName ?? 'Reproduciendo'}</strong>
          <span>
            {streamName}
            {quality ? ` · ${quality}` : ''}
            {resumedAt ? ' · reanudado' : ''}
          </span>
        </div>

        <div className="player__controls">
          <Button variant="ghost" onClick={() => navigate({ name: 'detail', id, type })}>
            Volver
          </Button>
          <Button variant="ghost" onClick={() => setShowInfo((value) => !value)}>
            {showInfo ? 'Ocultar info' : 'Info HLS'}
          </Button>
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

          {subtitleTracks.length || externalTracks.length ? (
            <>
              <h3>Subtítulos</h3>
              <div className="player__levels">
                <button
                  type="button"
                  data-focusable="true"
                  className={`chip ${!subtitlesOn ? 'chip--active' : ''}`}
                  onClick={() => {
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
                  }}
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
                {externalTracks.map((track, index) => (
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
            </>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
