import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

import { api } from '../api';
import { useApp } from '../store';
import type { MasterInfo } from '../types';
import { Button, ErrorState, Loader } from '../components/ui';

export interface PlayerProps {
  id: string;
  type: string;
  streamUrl?: string;
  streamName?: string;
  title?: string;
  poster?: string;
}

export function PlayerScreen({ id, type, streamUrl, streamName, title, poster }: PlayerProps) {
  const { navigate, activeProfileId, activeProfile, settings, reloadLibrary } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [master, setMaster] = useState<MasterInfo | null>(null);
  const [quality, setQuality] = useState<string>('');
  const [showInfo, setShowInfo] = useState(false);

  const device = settings?.device;
  const maxHeight = device?.maxHeight ?? 1080;

  // ------------------------------------------------------------- carga del stream
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
            const best = levels.reduce((acc, level, index) =>
              (level.height ?? 0) > (levels[acc]?.height ?? 0) ? index : acc, 0);
            hls.currentLevel = best;
            setQuality(`${levels[best]?.height ?? ''}p`);
          }
        });
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

  // --------------------------------------------------- historial y progreso
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

  const selectQuality = (level: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = level;
    const info = hls.levels[level];
    setQuality(`${info?.height ?? ''}p`);
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
      />

      {loading ? <Loader label="Preparando stream…" /> : null}

      <div className="player__overlay">
        <div className="player__meta">
          <strong>{title ?? streamName ?? 'Reproduciendo'}</strong>
          <span>
            {streamName}
            {quality ? ` · ${quality}` : ''}
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

      {showInfo && master ? (
        <aside className="player__info">
          <h3>Variantes HLS</h3>
          <p className="player__info-note">
            {master.selected
              ? `Seleccion automatica: ${master.selected.reason}`
              : 'El stream no es un master multivariant.'}
          </p>
          <div className="player__levels">
            {master.variants.map((variant, index) => (
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

          {master.renditions.length ? (
            <>
              <h3>Pistas</h3>
              <div className="player__levels">
                {master.renditions.map((rendition) => (
                  <span key={`${rendition.groupId}-${rendition.name}`} className="chip">
                    {rendition.type === 'AUDIO' ? '🔊' : '💬'} {rendition.name}
                    {rendition.language ? ` (${rendition.language})` : ''}
                    {rendition.channels ? ` ${rendition.channels}ch` : ''}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
