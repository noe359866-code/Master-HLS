import { useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import { useApp } from '../store';
import type { Meta } from '../types';
import { Button, ErrorState, Poster, Row, Skeleton, SkeletonRow } from '../components/ui';
import { Icon } from '../components/icons';

interface CatalogState {
  key: string;
  title: string;
  metas: Meta[];
  loading: boolean;
  error?: string;
  presetId?: string;
}

function premiereBadge(meta: Meta): string | undefined {
  const y = Number((meta as unknown as { year?: unknown }).year ?? 0);
  if (!y) return undefined;
  const cur = new Date().getFullYear();
  if (y === cur) {
    const d = (meta as unknown as { released?: string }).released ?? meta.releaseInfo ?? '';
    if (d) {
      const parsed = Date.parse(d);
      if (Number.isFinite(parsed)) {
        const diffDays = Math.round((parsed - Date.now()) / 86400000);
        if (diffDays === 0) return 'Estreno hoy';
        if (diffDays > 0 && diffDays <= 7) return `Estrena en ${diffDays}d`;
        if (diffDays < 0 && diffDays >= -7) return 'Nuevo';
      }
    }
    if (y === cur) return 'Estreno';
  }
  if (y > cur) return `Próximamente ${y}`;
  return undefined;
}

export function HomeScreen() {
  const { manifest, progress, history, navigate } = useApp();
  const [rows, setRows] = useState<CatalogState[]>([]);
  const [recommended, setRecommended] = useState<Meta[]>([]);
  const [trending, setTrending] = useState<Meta[]>([]);
  const [upcoming, setUpcoming] = useState<Meta[]>([]);
  const [upcomingSchedule, setUpcomingSchedule] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [ratings, setRatings] = useState<import('../types').Rating[]>([]);

  const catalogs = useMemo(() => (manifest?.catalogs ?? []).filter((catalog) => catalog.showInHome !== false && !catalog.hidden), [manifest]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all(
          catalogs.map(async (catalog) => {
            const key = `${catalog.type}:${catalog.id}`;
            try {
              const response = await api.catalog(catalog.type, catalog.id);
              return { key, title: catalog.name, metas: response.metas, loading: false };
            } catch (cause) {
              return { key, title: catalog.name, metas: [], loading: false, error: (cause as Error).message };
            }
          }),
        );
        if (!cancelled) setRows(results);
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      } finally { if (!cancelled) setLoading(false); }
    };
    if (catalogs.length) void load();
    else setLoading(false);
    return () => { cancelled = true; };
  }, [catalogs]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [rec, ratingsRes] = await Promise.all([api.recommended({ limit: 24 }), api.ratings().catch(() => [] as import('../types').Rating[])]);
        if (cancelled) return;
        setRecommended(rec);
        setRatings(ratingsRes);
      } catch { if (!cancelled) { setRecommended([]); } }
      try {
        const tr = await api.preset('trending_today', { limit: 12 });
        if (!cancelled) setTrending(tr.metas);
      } catch { /* no presets without catalogs */ }
      try {
        const up = await api.preset('upcoming_movies', { limit: 12 });
        if (!cancelled) setUpcoming(up.metas);
      } catch { /* */ }
      try {
        const sched = await api.upcoming();
        if (!cancelled) setUpcomingSchedule(sched.upcoming);
      } catch { /* */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const continueWatching = useMemo(() => progress.filter((entry) => entry.duration > 0 && entry.position / entry.duration < 0.95).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12), [progress]);
  const recent = useMemo(() => [...history].sort((a, b) => b.lastWatchedAt - a.lastWatchedAt).slice(0, 12), [history]);

  const liked = useMemo(() => ratings.filter((r) => r.rating === 'like'), [ratings]);
  const loved = useMemo(() => ratings.filter((r) => r.rating === 'love'), [ratings]);

  const openDetail = (meta: Meta) => navigate({ name: 'detail', id: meta.id, type: meta.type ?? 'movie' });

  const metaIndex = useMemo(() => {
    const index = new Map<string, Meta>();
    for (const row of rows) for (const meta of row.metas) if (meta?.id) index.set(meta.id, meta);
    for (const meta of recommended) if (meta?.id) index.set(meta.id, meta);
    return index;
  }, [rows, recommended]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onFocusIn = (event: FocusEvent): void => {
      const element = event.target as HTMLElement | null;
      const id = element?.closest?.('[data-meta-id]')?.getAttribute('data-meta-id') ?? null;
      if (timer) clearTimeout(timer);
      if (!id) return;
      timer = setTimeout(() => setFocusedId(id), 400);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => { if (timer) clearTimeout(timer); document.removeEventListener('focusin', onFocusIn); };
  }, []);

  const hero = useMemo<Meta | null>(() => {
    const focused = focusedId ? metaIndex.get(focusedId) : undefined;
    if (focused) return focused;
    const fromProgress = continueWatching[0];
    if (fromProgress) return { id: fromProgress.id, type: fromProgress.type, name: fromProgress.name, poster: fromProgress.poster };
    if (recommended[0]) return recommended[0] ?? null;
    for (const row of rows) { const first = row.metas[0]; if (first) return first; }
    return null;
  }, [continueWatching, focusedId, metaIndex, recommended, rows]);

  if (loading) {
    return (
      <div className="screen">
        <section className="hero hero--skeleton">
          <div className="hero__body">
            <Skeleton width={150} height={22} radius={999} />
            <Skeleton width="62%" height={48} radius={12} />
            <Skeleton width="42%" height={16} radius={8} />
            <Skeleton width="88%" height={16} radius={8} />
            <Skeleton width="70%" height={16} radius={8} />
          </div>
        </section>
        <SkeletonRow /><SkeletonRow /><SkeletonRow />
      </div>
    );
  }
  if (error) return <ErrorState message={error} />;

  if (!catalogs.length) {
    return (
      <div className="screen screen--empty">
        <h2>No hay catálogos todavía</h2>
        <p>Instala un addon de metadatos desde <strong>Ajustes → Addons</strong> para empezar.</p>
      </div>
    );
  }

  return (
    <div className="screen">
      {hero ? (
        <section className="hero" key={hero.id}>
          <div className="hero__backdrop" style={{ backgroundImage: `url(${hero.background ?? hero.landscapePoster ?? hero.poster ?? ''})` }} />
          <div className="hero__scrim" />
          <div className="hero__body">
            <span className="hero__eyebrow"><b>★</b>{' '}{focusedId && focusedId === hero.id ? 'Destacado' : continueWatching.length ? 'Continúa donde lo dejaste' : 'Destacado'}</span>
            <h1 className="hero__title">{hero.name}</h1>
            <div className="hero__facts">
              {hero.releaseInfo ? <span>{hero.releaseInfo}</span> : null}
              {hero.imdbRating ? <span className="is-rating">★ {hero.imdbRating}</span> : null}
              {(hero.genres ?? []).slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)}
            </div>
            {hero.description ? <p className="hero__description">{hero.description}</p> : null}
            <div className="hero__actions">
              <Button onClick={() => openDetail(hero)}>Ver detalles</Button>
              <Button variant="ghost" onClick={() => navigate({ name: 'search' })}>Buscar</Button>
            </div>
          </div>
          <div className="hero__side">
            {hero.landscapePoster || hero.background ? (
              <div className="hero__card">
                <img src={hero.landscapePoster ?? hero.background ?? ''} alt={hero.name ?? ''} loading="lazy" decoding="async" />
                <span className="hero__card-body">{hero.name}</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <nav className="quick" aria-label="Acciones rápidas">
        <button type="button" data-focusable="true" className="quick__item" onClick={() => navigate({ name: 'search' })}><Icon name="search" /> Buscar</button>
        <button type="button" data-focusable="true" className="quick__item" onClick={() => navigate({ name: 'genres' })}><Icon name="genres" /> Géneros</button>
        <button type="button" data-focusable="true" className="quick__item" onClick={() => navigate({ name: 'decades' })}><Icon name="decades" /> Décadas</button>
        <button type="button" data-focusable="true" className="quick__item" onClick={() => navigate({ name: 'lists' })}><Icon name="lists" /> Mis listas</button>
        <button type="button" data-focusable="true" className="quick__item" onClick={() => navigate({ name: 'addons' })}><Icon name="addons" /> Addons</button>
      </nav>

      {upcomingSchedule.length ? (
        <Row title="Próximamente">
          {upcomingSchedule.map((meta) => <Poster key={`sched-${meta.id}`} meta={meta} badge="Próximamente" onSelect={openDetail} />)}
        </Row>
      ) : null}

      {continueWatching.length ? (
        <Row title="Continuar viendo">
          {continueWatching.map((entry) => <Poster key={entry.id} meta={{ id: entry.id, type: entry.type, name: entry.name, poster: entry.poster }} progress={entry.duration ? (entry.position / entry.duration) * 100 : 0} onSelect={openDetail} />)}
        </Row>
      ) : null}

      {recent.length ? (
        <Row title="Visto recientemente">
          {recent.map((entry) => <Poster key={entry.id} meta={{ id: entry.id, type: entry.type, name: entry.name, poster: entry.poster }} onSelect={openDetail} />)}
        </Row>
      ) : null}

      {loved.length ? (
        <Row title="💖 Te encanta">
          {loved.map((r) => <Poster key={`loved-${r.id}`} meta={{ id: r.id, type: r.type, name: r.name, poster: r.poster }} onSelect={openDetail} />)}
        </Row>
      ) : null}

      {liked.length ? (
        <Row title="👍 Te gusta">
          {liked.map((r) => <Poster key={`liked-${r.id}`} meta={{ id: r.id, type: r.type, name: r.name, poster: r.poster }} onSelect={openDetail} />)}
        </Row>
      ) : null}

      {recommended.length ? (
        <Row title="Recomendado para ti" subtitle={`${recommended.length} según tus gustos`}>
          {recommended.map((meta) => (
            <Poster key={meta.id} meta={meta} badge={premiereBadge(meta)} onSelect={openDetail} />
          ))}
        </Row>
      ) : null}

      {trending.length ? (
        <Row title="🔥 Tendencia hoy">{trending.map((meta) => <Poster key={`trend-${meta.id}`} meta={meta} onSelect={openDetail} />)}</Row>
      ) : null}

      {upcoming.length ? (
        <Row title="🎬 Próximos estrenos">{upcoming.map((meta) => <Poster key={`up-${meta.id}`} meta={meta} badge={premiereBadge(meta)} onSelect={openDetail} />)}</Row>
      ) : null}

      {rows.map((row) => (
        <Row key={row.key} title={row.title} emptyLabel="Sin elementos" subtitle={row.error}>
          {row.metas.map((meta) => <Poster key={meta.id} meta={meta} badge={premiereBadge(meta)} onSelect={openDetail} />)}
        </Row>
      ))}
    </div>
  );
}
