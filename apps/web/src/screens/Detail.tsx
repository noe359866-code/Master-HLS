import { useEffect, useMemo, useRef, useState } from 'react';

import { api, ApiError } from '../api';
import { useI18n } from '../i18n';
import { setParentalPin as persistParentalPin } from '../session';
import { useApp } from '../store';
import type { Meta, OpenSubtitleEntry, Rating, Stream, Video } from '../types';
import { Button, ErrorState, Loader, Modal, Poster, useBackdrop } from '../components/ui';

export function DetailScreen({ id, type }: { id: string; type: string }) {
  const { navigate, lists, toggleWatchlistItem, activeProfile } = useApp();
  const { t } = useI18n();
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
  const [hiddenDone, setHiddenDone] = useState(false);
  const autoplayed = useRef(false);

  // OpenSubtitles nativo
  const [subsOpen, setSubsOpen] = useState(false);
  const [subs, setSubs] = useState<OpenSubtitleEntry[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsEnabled, setSubsEnabled] = useState(true);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [selectedSubtitle, setSelectedSubtitle] = useState<{ url: string; label: string } | null>(null);

  // Control parental
  const [parentalBlock, setParentalBlock] = useState<{ requiresPin: boolean; message: string } | null>(null);
  const [parentalPinInput, setParentalPinInput] = useState('');
  const [parentalError, setParentalError] = useState<string | null>(null);
  const [streamsNonce, setStreamsNonce] = useState(0);

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
    setHiddenDone(false);
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

    return () => { cancelled = true; };
  }, [id, type]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.similar(id, type);
        if (!cancelled) setSimilar(result.titles);
      } catch { if (!cancelled) setSimilar([]); }
    })();
    return () => { cancelled = true; };
  }, [id, type]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ratings = await api.ratings();
        if (!cancelled) setRating(ratings.find((entry) => entry.id === id) ?? null);
      } catch { if (!cancelled) setRating(null); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const vote = async (value: 'like' | 'dislike' | 'love') => {
    if (!meta) return;
    const next = rating?.rating === value ? '' : value;
    try {
      const ratings = await api.rate({
        id, type, name: meta.name ?? id, poster: meta.poster,
        rating: next as 'like' | 'dislike' | 'love' | '', genres: meta.genres,
      });
      setRating(ratings.find((entry) => entry.id === id) ?? null);
    } catch { /* ignore */ }
  };

  const doHide = async () => {
    try {
      await api.hideTitle({ id, type, name: meta?.name ?? id });
      setHiddenDone(true);
      setTimeout(() => navigate({ name: 'home' }), 900);
    } catch { /* ignore */ }
  };

  const doRandomEpisode = async () => {
    try {
      const { episode: ep } = await api.randomEpisode(id, type);
      // Encuentra video coincidente o navega directo al player con ese id
      const vid = (meta?.videos ?? []).find((v) => v.id === ep.id) ?? ep as unknown as Video;
      const streams = await api.streams(type, ep.id);
      const first = streams.streams.find((s) => s.url || s.externalUrl);
      if (first) play(first, vid);
      else setEpisode(vid);
    } catch { /* no episodes */ }
  };

  const markWatched = async (video: Video) => {
    try {
      await api.markWatched({ id: video.id, type: 'episode', name: video.title ?? video.name ?? video.id, season: video.season, episode: video.episode ?? video.number });
    } catch { /* ignore */ }
  };

  const videos = useMemo(() => meta?.videos ?? [], [meta]);
  const seasons = useMemo(() => [...new Set(videos.map((video) => video.season ?? 1))].sort((a, b) => a - b), [videos]);
  const episodes = useMemo(() => videos.filter((video) => (season ?? seasons[0] ?? 1) === (video.season ?? 1)).sort((a, b) => (a.episode ?? a.number ?? 0) - (b.episode ?? b.number ?? 0)), [videos, season, seasons]);

  const currentEpisode = episode ?? episodes[0] ?? null;
  const streamId = currentEpisode?.id ?? id;
  const streams = streamResult?.id === streamId ? streamResult.streams : [];
  useEffect(() => {
    if (!meta) return;
    let cancelled = false;
    setStreamsLoading(true);
    void api.streams(type, streamId)
      .then((result) => {
        if (cancelled) return;
        setParentalBlock(null);
        setStreamResult({ id: streamId, streams: result.streams });
      })
      .catch((cause) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.code === 'parental_blocked') {
          setParentalBlock({ requiresPin: cause.requiresPin, message: cause.message });
        }
        setStreamResult({ id: streamId, streams: [] });
      })
      .finally(() => { if (!cancelled) setStreamsLoading(false); });
    return () => { cancelled = true; };
  }, [type, streamId, meta, streamsNonce]);

  useEffect(() => {
    if (!activeProfile?.autoplayFirstStream) return;
    if (autoplayed.current || !streams.length || !meta) return;
    autoplayed.current = true;
    play(streams[0]!, currentEpisode ?? undefined);
  }, [streams, meta, currentEpisode?.id, activeProfile?.autoplayFirstStream]);

  const trailer = useMemo(() => {
    const fromMeta = meta?.trailers?.find((entry) => entry.ytId);
    return fromMeta?.ytId ?? null;
  }, [meta]);

  const isInWatchlist = useMemo(() => lists.some((list) => list.items.some((item) => item.id === id)), [lists, id]);

  const play = (stream: Stream, video?: Video) => {
    const url = stream.url ?? stream.externalUrl;
    if (!url) return;
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

  const openSubtitles = async () => {
    setSubsLoading(true);
    setSubsError(null);
    try {
      const [imdbId, seasonNumber, episodeNumber] = (currentEpisode?.id ?? id).split(':');
      const result = await api.openSubtitles({ imdbId, season: seasonNumber ? Number(seasonNumber) : undefined, episode: episodeNumber ? Number(episodeNumber) : undefined });
      setSubsEnabled(result.enabled);
      setSubs(result.subtitles);
    } catch (cause) { setSubsError((cause as Error).message); } finally { setSubsLoading(false); }
  };

  const chooseSubtitle = async (entry: OpenSubtitleEntry) => {
    setSubsLoading(true);
    setSubsError(null);
    try {
      const result = await api.downloadOpenSubtitle(entry.fileId);
      setSelectedSubtitle({ url: result.path, label: `${entry.languageName} (OpenSubtitles)` });
    } catch (cause) { setSubsError((cause as Error).message); } finally { setSubsLoading(false); }
  };

  if (loading) return <Loader label="Cargando detalle…" />;
  if (error) return <ErrorState message={error} />;
  if (!meta) return <ErrorState message="No se ha encontrado el contenido" />;

  const firstStream = streams[0];
  const sourcesPending = streamsLoading || streamResult?.id !== streamId;

  // Info expandida (WuPlay v0.9.1 expanded info card)
  const releaseDate = meta.released ?? meta.releaseInfo ?? '';
  const runtime = meta.runtime ?? '';
  const country = meta.country ?? (meta.countryList?.join(', ') ?? '');
  const language = meta.language ?? (meta.languageList?.join(', ') ?? '');
  const network = meta.network ?? meta.networks?.join(', ') ?? '';
  const studios = meta.studios ?? (meta.studio ? [meta.studio] : []);
  const keywords = meta.keywords ?? [];
  const budget = meta.budget ?? '';
  const revenue = meta.revenue ?? '';

  return (
    <div className="detail">
      {backdrop ? <div className="detail__backdrop" style={{ backgroundImage: `url(${backdrop})` }} aria-hidden="true" /> : null}
      <div className="detail__content">
        <header className="detail__header">
          {meta.poster ? <img className="detail__poster" src={meta.poster} alt="" /> : null}
          <div className="detail__info">
            <h1>{meta.name}</h1>
            <div className="detail__facts">
              {releaseDate ? <span>{releaseDate}</span> : null}
              {runtime ? <span>{runtime}</span> : null}
              {meta.imdbRating ? <span>⭐ {meta.imdbRating}</span> : null}
              {meta.status ? <span>{meta.status}</span> : null}
              {meta.genres?.slice(0, 4).map((genre) => <span key={genre}>{genre}</span>) ?? null}
            </div>
            {meta.description ? <p className="detail__description">{meta.description}</p> : null}

            {/* Expanded info card: country, language, networks, studios, keywords, budget/revenue */}
            {(country || language || network || studios.length || keywords.length || budget || revenue || meta.awards) ? (
              <div className="detail__meta-card">
                {country ? <div className="detail__meta-row"><strong>País:</strong> {country}</div> : null}
                {language ? <div className="detail__meta-row"><strong>Idioma:</strong> {language}</div> : null}
                {network ? <div className="detail__meta-row"><strong>Cadena:</strong> {network}</div> : null}
                {studios.length ? (
                  <div className="detail__meta-row">
                    <strong>Estudios:</strong>{' '}
                    {studios.map((s) => (
                      <button key={s} type="button" data-focusable="true" className="chip chip--small" onClick={() => navigate({ name: 'search', q: s } as unknown as Parameters<typeof navigate>[0])}>{s}</button>
                    ))}
                  </div>
                ) : null}
                {keywords.length ? (
                  <div className="detail__meta-row">
                    <strong>Palabras clave:</strong>{' '}
                    {keywords.slice(0, 8).map((kw) => (
                      <button key={kw} type="button" data-focusable="true" className="chip chip--small" onClick={() => void api.browse({ keyword: kw }).then(() => navigate({ name: 'search', q: kw } as unknown as Parameters<typeof navigate>[0]))}>{kw}</button>
                    ))}
                  </div>
                ) : null}
                {budget ? <div className="detail__meta-row"><strong>Presupuesto:</strong> {budget}</div> : null}
                {revenue ? <div className="detail__meta-row"><strong>Recaudación:</strong> {revenue}</div> : null}
                {meta.awards ? <div className="detail__meta-row"><strong>Premios:</strong> {meta.awards}</div> : null}
              </div>
            ) : null}

            <div className="detail__actions">
              {firstStream ? <Button onClick={() => play(firstStream, currentEpisode ?? undefined)}>▶ Reproducir</Button> : <span className="detail__hint">{sourcesPending ? 'Buscando fuentes…' : 'Sin fuentes disponibles'}</span>}
              {videos.length ? <Button variant="ghost" onClick={() => void doRandomEpisode()}>🎲 Aleatorio</Button> : null}
              <Button variant="ghost" onClick={() => toggleWatchlistItem({ id, type, name: meta.name ?? id, poster: meta.poster } as unknown as Parameters<typeof toggleWatchlistItem>[0])}>{isInWatchlist ? '★ En lista' : '☆ Añadir a lista'}</Button>
              {trailer ? <Button variant="ghost" onClick={() => setTrailerOpen(true)}>▶ Trailer</Button> : null}
              <Button variant="ghost" onClick={() => { setSubsOpen(true); void openSubtitles(); }}>💬 Subtítulos</Button>
              {hiddenDone ? <span className="detail__hint">✓ Ocultado</span> : <Button variant="ghost" onClick={() => void doHide()}>🙈 No mostrar</Button>}
              <Button variant={rating?.rating === 'like' ? 'primary' : 'ghost'} onClick={() => void vote('like')} aria-pressed={rating?.rating === 'like'}>{rating?.rating === 'like' ? '👍 Me gusta' : '👍'}</Button>
              <Button variant={rating?.rating === 'love' ? 'primary' : 'ghost'} onClick={() => void vote('love')} aria-pressed={rating?.rating === 'love'}>💖 {rating?.rating === 'love' ? '¡Me encanta!' : ''}</Button>
              <Button variant={rating?.rating === 'dislike' ? 'primary' : 'ghost'} onClick={() => void vote('dislike')} aria-pressed={rating?.rating === 'dislike'}>{rating?.rating === 'dislike' ? '👎 No para mí' : '👎'}</Button>
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
                    <button key={entry} type="button" data-focusable="true" className={`chip ${(season ?? seasons[0]) === entry ? 'chip--active' : ''}`} onClick={() => { setSeason(entry); setEpisode(null); setSelectedSubtitle(null); }}>Temporada {entry}</button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="episode-list">
              {episodes.map((video) => (
                <button key={video.id} type="button" data-focusable="true" className={`episode ${currentEpisode?.id === video.id ? 'episode--active' : ''}`} onClick={() => { setEpisode(video); setSelectedSubtitle(null); }}>
                  {video.thumbnail ? <img src={video.thumbnail} alt="" /> : null}
                  <span className="episode__number">{video.episode ?? video.number ?? '—'}</span>
                  <span className="episode__title">{video.title ?? video.name ?? video.id}</span>
                  {video.rating ? <span className="episode__rating">⭐ {video.rating}</span> : null}
                  <span className="episode__overview">{video.overview ?? video.description ?? ''}</span>
                  <span className="episode__actions">
                    <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); void markWatched(video); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void markWatched(video); } }} className="chip chip--small">✓ Visto</span>
                  </span>
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
                  <button key={`${stream.name ?? 'stream'}-${index}`} type="button" data-focusable="true" className={`stream ${needsDebrid ? 'stream--locked' : ''}`} onClick={() => (needsDebrid ? undefined : play(stream, currentEpisode ?? undefined))}>
                    <span className="stream__name">{stream.name ?? stream.title ?? 'Stream'}</span>
                    {stream.description ? <span className="stream__description">{stream.description}</span> : null}
                    {needsDebrid ? <span className="stream__url">Necesita debrid (torrent)</span> : null}
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
                <button key={`dir-${name}`} type="button" data-focusable="true" className="chip" onClick={() => navigate({ name: 'person', person: name })}>🎬 {name}</button>
              ))}
              {meta.cast?.map((name) => (
                <button key={`cast-${name}`} type="button" data-focusable="true" className="chip" onClick={() => navigate({ name: 'person', person: name })}>{name}</button>
              ))}
            </div>
          </section>
        ) : null}

        {similar.length ? (
          <section className="detail__section">
            <h2>Similares</h2>
            <div className="row__items">
              {similar.map((item) => <Poster key={item.id} meta={item} onSelect={(selected) => navigate({ name: 'detail', id: selected.id, type: selected.type ?? 'movie' })} />)}
            </div>
          </section>
        ) : null}

        {subsOpen ? (
          <Modal title="Subtítulos (OpenSubtitles)" onClose={() => setSubsOpen(false)}>
            {!subsEnabled ? <p className="panel__hint">OpenSubtitles está desactivado. Añade la API key en Ajustes.</p> : null}
            {subsError ? <p className="panel__hint">{subsError}</p> : null}
            {subsLoading ? <Loader label="Buscando subtítulos…" /> : null}
            {subsEnabled && !subsLoading && !subs.length ? <p className="panel__hint">No se han encontrado subtítulos.</p> : null}
            <div className="subtitle-list">
              {subs.map((entry) => (
                <button key={entry.fileId} type="button" data-focusable="true" className={`stream ${selectedSubtitle?.url.endsWith(`os-${entry.fileId}.vtt`) ? 'stream--active' : ''}`} onClick={() => void chooseSubtitle(entry)}>
                  <span className="stream__name">{entry.languageName} · {entry.release || entry.fileName}</span>
                  <span className="stream__description">{entry.hearingImpaired ? 'Para sordos · ' : ''}{entry.downloadCount} descargas</span>
                </button>
              ))}
            </div>
            {selectedSubtitle ? <div className="detail__actions"><Button onClick={() => setSelectedSubtitle(null)}>Quitar subtítulo</Button></div> : null}
          </Modal>
        ) : null}

        {trailerOpen && trailer ? (
          <Modal title="Trailer" onClose={() => setTrailerOpen(false)}>
            <div className="trailer"><iframe src={`https://www.youtube.com/embed/${trailer}?autoplay=1&rel=0`} title="Trailer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
          </Modal>
        ) : null}

        {parentalBlock ? (
          <Modal title={t('PARENTAL_BLOCKED')} onClose={() => setParentalBlock(null)}>
            <div className="detail__parental">
              <p>{parentalBlock.message}</p>
              {parentalBlock.requiresPin ? (
                <>
                  <p className="panel__hint">{t('PARENTAL_PIN_HINT')}</p>
                  <input type="password" inputMode="numeric" autoComplete="off" data-focusable="true" maxLength={12} value={parentalPinInput} placeholder={t('VIBE_PIN_REQUIRED')} onChange={(event) => setParentalPinInput(event.target.value.replace(/\D/g, ''))} />
                  {parentalError ? <p className="pin-dialog__error" role="alert">{parentalError}</p> : null}
                  <div className="detail__actions">
                    <Button onClick={() => { if (!parentalPinInput) { setParentalError(t('PARENTAL_PIN_HINT')); return; } persistParentalPin(parentalPinInput); setParentalBlock(null); setParentalPinInput(''); setParentalError(null); setStreamsNonce((v) => v + 1); }}>{t('PARENTAL_UNLOCK')}</Button>
                    <Button variant="ghost" onClick={() => setParentalBlock(null)}>{t('BACK')}</Button>
                  </div>
                </>
              ) : <div className="detail__actions"><Button variant="ghost" onClick={() => setParentalBlock(null)}>{t('BACK')}</Button></div>}
            </div>
          </Modal>
        ) : null}
      </div>
    </div>
  );
}
