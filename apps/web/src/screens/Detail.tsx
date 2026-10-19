import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api';
import { useApp } from '../store';
import type { Meta, OpenSubtitleEntry, Rating, Stream, Video } from '../types';
import { Button, ErrorState, Loader, Modal, Poster, useBackdrop } from '../components/ui';

export function DetailScreen({ id, type }: { id: string; type: string }) {
  const { navigate, lists, toggleWatchlistItem, activeProfile } = useApp();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [streamResult, setStreamResult] = useState<{ id: string; streams: Stream[] } | null>(null);
  const [streamsLoading, setStreamsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [episode, setEpisode] = useState<Video | null>(null);
  const [similar, setSimilar] = useState<Meta[]>([]);
  const [rating, setRating] = useState<Rating | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const autoplayed = useRef(false);

  // OpenSubtitles nativo: busqueda, descarga y subtitulo elegido.
  const [subsOpen, setSubsOpen] = useState(false);
  const [subs, setSubs] = useState<OpenSubtitleEntry[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsEnabled, setSubsEnabled] = useState(true);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [selectedSubtitle, setSelectedSubtitle] = useState<{ url: string; label: string } | null>(
    null,
  );

  const backdrop = useBackdrop(meta);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMeta(null);
    setStreamResult(null);
    setStreamsLoading(true);
    setEpisode(null);
    setSeason(null);
    autoplayed.current = false;

    void (async () => {
      try {
        const metaResult = await api.meta(type, id);
        if (cancelled) return;
        setMeta(metaResult.meta ?? null);
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, type]);

  // Titulos similares (WuPlay: "Similar Titles").
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.similar(id, type);
        if (!cancelled) setSimilar(result.titles);
      } catch {
        if (!cancelled) setSimilar([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, type]);

  // Valoracion del titulo (WuPlay: "Me gusta" / "No para mi").
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ratings = await api.ratings();
        if (!cancelled) setRating(ratings.find((entry) => entry.id === id) ?? null);
      } catch {
        if (!cancelled) setRating(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const vote = async (value: 'like' | 'dislike') => {
    if (!meta) return;
    const next = rating?.rating === value ? '' : value;
    try {
      const ratings = await api.rate({
        id,
        type,
        name: meta.name ?? id,
        poster: meta.poster,
        rating: next,
        genres: meta.genres,
      });
      setRating(ratings.find((entry) => entry.id === id) ?? null);
    } catch {
      // Si falla la valoracion se ignora: no interrumpe la navegacion.
    }
  };

  const videos = useMemo(() => meta?.videos ?? [], [meta]);
  const seasons = useMemo(
    () => [...new Set(videos.map((video) => video.season ?? 1))].sort((a, b) => a - b),
    [videos],
  );
  const episodes = useMemo(
    () =>
      videos
        .filter((video) => (season ?? seasons[0] ?? 1) === (video.season ?? 1))
        .sort((a, b) => (a.episode ?? a.number ?? 0) - (b.episode ?? b.number ?? 0)),
    [videos, season, seasons],
  );

  // Cada episodio tiene sus propias fuentes: no reutilizar los streams de la
  // ficha general ni los de la selección anterior al cambiar de temporada.
  const currentEpisode = episode ?? episodes[0] ?? null;
  const streamId = currentEpisode?.id ?? id;
  const streams = streamResult?.id === streamId ? streamResult.streams : [];
  useEffect(() => {
    if (!meta) return;
    let cancelled = false;
    setStreamsLoading(true);
    void api.streams(type, streamId)
      .then((result) => { if (!cancelled) setStreamResult({ id: streamId, streams: result.streams }); })
      .catch(() => { if (!cancelled) setStreamResult({ id: streamId, streams: [] }); })
      .finally(() => { if (!cancelled) setStreamsLoading(false); });
    return () => { cancelled = true; };
  }, [type, streamId, meta]);

  // Autoplay: si el perfil lo pide, se reproduce el primer stream disponible.
  useEffect(() => {
    if (!activeProfile?.autoplayFirstStream) return;
    if (autoplayed.current || !streams.length || !meta) return;
    autoplayed.current = true;
    play(streams[0]!, currentEpisode ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streams, meta, currentEpisode?.id, activeProfile?.autoplayFirstStream]);

  const trailer = useMemo(() => {
    const fromMeta = meta?.trailers?.find((entry) => entry.ytId);
    return fromMeta?.ytId ?? null;
  }, [meta]);

  const isInWatchlist = useMemo(
    () => lists.some((list) => list.items.some((item) => item.id === id)),
    [lists, id],
  );

  const play = (stream: Stream, video?: Video) => {
    const url = stream.url ?? stream.externalUrl;
    if (!url) return;
    // Episodio siguiente (para el autoplay del reproductor).
    const currentIndex = video ? episodes.findIndex((entry) => entry.id === video.id) : -1;
    const nextEpisode = currentIndex >= 0 ? episodes[currentIndex + 1] : undefined;
    navigate({
      name: 'player',
      id: video?.id ?? id,
      type: video ? 'episode' : type,
      streamUrl: url,
      streamName: stream.name ?? stream.title ?? 'Stream',
      title: meta?.name,
      poster: meta?.poster,
      subtitleUrl: selectedSubtitle?.url,
      subtitleLabel: selectedSubtitle?.label,
      nextId: nextEpisode?.id,
      nextTitle: nextEpisode?.title ?? nextEpisode?.name,
    });
  };

  // -------------------------------------------------------- OpenSubtitles
  const openSubtitles = async () => {
    setSubsLoading(true);
    setSubsError(null);
    try {
      const [imdbId, seasonNumber, episodeNumber] = (currentEpisode?.id ?? id).split(':');
      const result = await api.openSubtitles({
        imdbId,
        season: seasonNumber ? Number(seasonNumber) : undefined,
        episode: episodeNumber ? Number(episodeNumber) : undefined,
      });
      setSubsEnabled(result.enabled);
      setSubs(result.subtitles);
    } catch (cause) {
      setSubsError((cause as Error).message);
    } finally {
      setSubsLoading(false);
    }
  };

  const chooseSubtitle = async (entry: OpenSubtitleEntry) => {
    setSubsLoading(true);
    setSubsError(null);
    try {
      const result = await api.downloadOpenSubtitle(entry.fileId);
      setSelectedSubtitle({
        url: result.path,
        label: `${entry.languageName} (OpenSubtitles)`,
      });
    } catch (cause) {
      setSubsError((cause as Error).message);
    } finally {
      setSubsLoading(false);
    }
  };

  if (loading) return <Loader label="Cargando detalle…" />;
  if (error) return <ErrorState message={error} />;
  if (!meta) return <ErrorState message="No se ha encontrado el contenido" />;

  const firstStream = streams[0];
  const sourcesPending = streamsLoading || streamResult?.id !== streamId;

  return (
    <div className="detail">
      {backdrop ? (
        <div
          className="detail__backdrop"
          style={{ backgroundImage: `url(${backdrop})` }}
          aria-hidden="true"
        />
      ) : null}

      <div className="detail__content">
        <header className="detail__header">
          {meta.poster ? <img className="detail__poster" src={meta.poster} alt="" /> : null}
          <div className="detail__info">
            <h1>{meta.name}</h1>
            <div className="detail__facts">
              {meta.releaseInfo ? <span>{meta.releaseInfo}</span> : null}
              {meta.runtime ? <span>{meta.runtime}</span> : null}
              {meta.imdbRating ? <span>⭐ {meta.imdbRating}</span> : null}
              {meta.genres?.slice(0, 4).map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
            </div>
            {meta.description ? <p className="detail__description">{meta.description}</p> : null}

            <div className="detail__actions">
              {firstStream ? (
                <Button onClick={() => play(firstStream, currentEpisode ?? undefined)}>
                  ▶ Reproducir
                </Button>
              ) : (
                <span className="detail__hint">
                  {sourcesPending
                    ? (currentEpisode ? 'Buscando fuentes para este episodio…' : 'Buscando fuentes…')
                    : 'Sin streams disponibles para este título'}
                </span>
              )}
              <Button
                variant="ghost"
                onClick={() =>
                  void toggleWatchlistItem({
                    id,
                    type,
                    name: meta.name ?? id,
                    poster: meta.poster,
                  })
                }
              >
                {isInWatchlist ? '✓ En favoritos' : '+ Favoritos'}
              </Button>
              {trailer ? (
                <Button variant="ghost" onClick={() => setTrailerOpen(true)}>
                  ▶ Trailer
                </Button>
              ) : null}
              <Button
                variant="ghost"
                onClick={() => {
                  setSubsOpen(true);
                  void openSubtitles();
                }}
              >
                💬 Subtítulos
              </Button>
              <Button
                variant="ghost"
                onClick={() => void vote('like')}
                aria-pressed={rating?.rating === 'like'}
              >
                {rating?.rating === 'like' ? '👍 Me gusta' : '👍'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => void vote('dislike')}
                aria-pressed={rating?.rating === 'dislike'}
              >
                {rating?.rating === 'dislike' ? '👎 No para mí' : '👎'}
              </Button>
            </div>
          </div>
        </header>

        {videos.length ? (
          <section className="detail__section">
            <div className="detail__section-header">
              <h2>Episodios</h2>
              {seasons.length > 1 ? (
                <div className="season-picker">
                  {seasons.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      data-focusable="true"
                      className={`chip ${(season ?? seasons[0]) === entry ? 'chip--active' : ''}`}
                      onClick={() => {
                        setSeason(entry);
                        setEpisode(null);
                        setSelectedSubtitle(null);
                      }}
                    >
                      Temporada {entry}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="episode-list">
              {episodes.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  data-focusable="true"
                  className={`episode ${currentEpisode?.id === video.id ? 'episode--active' : ''}`}
                  onClick={() => {
                    setEpisode(video);
                    setSelectedSubtitle(null);
                  }}
                >
                  {video.thumbnail ? <img src={video.thumbnail} alt="" /> : null}
                  <span className="episode__number">{video.episode ?? video.number ?? '—'}</span>
                  <span className="episode__title">{video.title ?? video.name ?? video.id}</span>
                  <span className="episode__overview">{video.overview ?? video.description ?? ''}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {streams.length ? (
          <section className="detail__section">
            <h2>Streams ({streams.length})</h2>
            <div className="stream-list">
              {streams.map((stream, index) => {
                const url = stream.url ?? stream.externalUrl;
                const needsDebrid = !url && Boolean(stream.infoHash);
                return (
                  <button
                    key={`${stream.name ?? 'stream'}-${index}`}
                    type="button"
                    data-focusable="true"
                    className={`stream ${needsDebrid ? 'stream--locked' : ''}`}
                    onClick={() => (needsDebrid ? undefined : play(stream, currentEpisode ?? undefined))}
                  >
                    <span className="stream__name">{stream.name ?? stream.title ?? 'Stream'}</span>
                    {stream.description ? (
                      <span className="stream__description">{stream.description}</span>
                    ) : null}
                    {needsDebrid ? (
                      <span className="stream__url">Necesita debrid (torrent)</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {meta.cast?.length || meta.director?.length ? (
          <section className="detail__section">
            <h2>Reparto y equipo</h2>
            <div className="cast-list">
              {meta.director?.map((name) => (
                <button
                  key={`dir-${name}`}
                  type="button"
                  data-focusable="true"
                  className="chip"
                  onClick={() => navigate({ name: 'person', person: name })}
                >
                  🎬 {name}
                </button>
              ))}
              {meta.cast?.map((name) => (
                <button
                  key={`cast-${name}`}
                  type="button"
                  data-focusable="true"
                  className="chip"
                  onClick={() => navigate({ name: 'person', person: name })}
                >
                  {name}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {similar.length ? (
          <section className="detail__section">
            <h2>Similares</h2>
            <div className="row__items">
              {similar.map((item) => (
                <Poster
                  key={item.id}
                  meta={item}
                  onSelect={(selected) =>
                    navigate({ name: 'detail', id: selected.id, type: selected.type ?? 'movie' })
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        {subsOpen ? (
          <Modal title="Subtítulos (OpenSubtitles)" onClose={() => setSubsOpen(false)}>
            {!subsEnabled ? (
              <p className="panel__hint">
                OpenSubtitles está desactivado. Añade la API key en Ajustes para buscar
                subtítulos de forma nativa.
              </p>
            ) : null}
            {subsError ? <p className="panel__hint">{subsError}</p> : null}
            {subsLoading ? <Loader label="Buscando subtítulos…" /> : null}
            {subsEnabled && !subsLoading && !subs.length ? (
              <p className="panel__hint">No se han encontrado subtítulos para este título.</p>
            ) : null}
            <div className="subtitle-list">
              {subs.map((entry) => (
                <button
                  key={entry.fileId}
                  type="button"
                  data-focusable="true"
                  className={`stream ${
                    selectedSubtitle?.url.endsWith(`os-${entry.fileId}.vtt`)
                      ? 'stream--active'
                      : ''
                  }`}
                  onClick={() => void chooseSubtitle(entry)}
                >
                  <span className="stream__name">
                    {entry.languageName} · {entry.release || entry.fileName}
                  </span>
                  <span className="stream__description">
                    {entry.hearingImpaired ? 'Para sordos · ' : ''}
                    {entry.downloadCount} descargas
                  </span>
                </button>
              ))}
            </div>
            {selectedSubtitle ? (
              <div className="detail__actions">
                <Button onClick={() => setSelectedSubtitle(null)}>Quitar subtítulo</Button>
              </div>
            ) : null}
          </Modal>
        ) : null}

        {trailerOpen && trailer ? (
          <Modal title="Trailer" onClose={() => setTrailerOpen(false)}>
            <div className="trailer">
              <iframe
                src={`https://www.youtube.com/embed/${trailer}?autoplay=1&rel=0`}
                title="Trailer"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </Modal>
        ) : null}

      </div>
    </div>
  );
}
