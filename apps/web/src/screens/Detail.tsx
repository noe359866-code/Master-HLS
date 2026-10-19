import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api';
import { useApp } from '../store';
import type { Meta, Rating, Stream, Video } from '../types';
import { Button, ErrorState, Loader, Modal, Poster, useBackdrop } from '../components/ui';

export function DetailScreen({ id, type }: { id: string; type: string }) {
  const { navigate, lists, toggleWatchlistItem, settings, activeProfile } = useApp();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [episode, setEpisode] = useState<Video | null>(null);
  const [similar, setSimilar] = useState<Meta[]>([]);
  const [rating, setRating] = useState<Rating | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const autoplayed = useRef(false);

  const backdrop = useBackdrop(meta);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMeta(null);
    setStreams([]);
    setEpisode(null);
    setSeason(null);

    void (async () => {
      try {
        const [metaResult, streamResult] = await Promise.all([
          api.meta(type, id),
          api.streams(type, id).catch(() => ({ streams: [] })),
        ]);
        if (cancelled) return;
        setMeta(metaResult.meta ?? null);
        setStreams(streamResult.streams);
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

  // Autoplay: si el perfil lo pide, se reproduce el primer stream disponible.
  useEffect(() => {
    if (!activeProfile?.autoplayFirstStream) return;
    if (autoplayed.current || !streams.length || !meta) return;
    autoplayed.current = true;
    play(streams[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streams, meta, activeProfile?.autoplayFirstStream]);

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
    navigate({
      name: 'player',
      id: video?.id ?? id,
      type: video ? 'episode' : type,
      streamUrl: url,
      streamName: stream.name ?? stream.title ?? 'Stream',
      title: meta?.name,
      poster: meta?.poster,
    });
  };

  if (loading) return <Loader label="Cargando detalle…" />;
  if (error) return <ErrorState message={error} />;
  if (!meta) return <ErrorState message="No se ha encontrado el contenido" />;

  const firstStream = streams[0];

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
                <Button onClick={() => play(firstStream, episode ?? undefined)}>
                  ▶ Reproducir
                </Button>
              ) : (
                <span className="detail__hint">Sin streams disponibles para este título</span>
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
                      onClick={() => setSeason(entry)}
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
                  className={`episode ${episode?.id === video.id ? 'episode--active' : ''}`}
                  onClick={() => setEpisode(video)}
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
                    onClick={() => (needsDebrid ? undefined : play(stream, episode ?? undefined))}
                  >
                    <span className="stream__name">{stream.name ?? stream.title ?? 'Stream'}</span>
                    {stream.description ? (
                      <span className="stream__description">{stream.description}</span>
                    ) : null}
                    {needsDebrid ? (
                      <span className="stream__url">Necesita debrid (torrent)</span>
                    ) : null}
                    {url ? <span className="stream__url">{url}</span> : null}
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

        {settings?.showAddonPrefix ? null : null}
      </div>
    </div>
  );
}
