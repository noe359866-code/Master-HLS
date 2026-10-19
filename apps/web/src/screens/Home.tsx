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
}

export function HomeScreen() {
  const { manifest, progress, history, navigate } = useApp();
  const [rows, setRows] = useState<CatalogState[]>([]);
  const [recommended, setRecommended] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const catalogs = useMemo(
    () =>
      (manifest?.catalogs ?? []).filter(
        (catalog) => catalog.showInHome !== false && !catalog.hidden,
      ),
    [manifest],
  );

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
              return {
                key,
                title: catalog.name,
                metas: [],
                loading: false,
                error: (cause as Error).message,
              };
            }
          }),
        );
        if (!cancelled) setRows(results);
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (catalogs.length) void load();
    else setLoading(false);

    return () => {
      cancelled = true;
    };
  }, [catalogs]);

  // Recomendaciones personalizadas (se muestran si hay valoraciones "Me gusta").
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const titles = await api.recommended();
        if (!cancelled) setRecommended(titles);
      } catch {
        if (!cancelled) setRecommended([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const continueWatching = useMemo(
    () =>
      progress
        .filter((entry) => entry.duration > 0 && entry.position / entry.duration < 0.95)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 12),
    [progress],
  );

  const recent = useMemo(
    () => [...history].sort((a, b) => b.lastWatchedAt - a.lastWatchedAt).slice(0, 12),
    [history],
  );

  const openDetail = (meta: Meta) => navigate({ name: 'detail', id: meta.id, type: meta.type ?? 'movie' });

  /**
   * Portada: el título destacado es el primero de "continuar viendo", o la
   * primera recomendación, o el primer elemento del catálogo. Una sola
   * decisión: la pantalla dice qué ver, sin listas de decisiones.
   */
  const hero = useMemo<Meta | null>(() => {
    const fromProgress = continueWatching[0];
    if (fromProgress) {
      return {
        id: fromProgress.id,
        type: fromProgress.type,
        name: fromProgress.name,
        poster: fromProgress.poster,
      };
    }
    if (recommended[0]) return recommended[0] ?? null;
    for (const row of rows) {
      const first = row.metas[0];
      if (first) return first;
    }
    return null;
  }, [continueWatching, recommended, rows]);

  //while the catalogs arrive the home shows the skeleton of the final
  //layout: no spinners, no jumps.
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
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }
  if (error) return <ErrorState message={error} />;

  if (!catalogs.length) {
    return (
      <div className="screen screen--empty">
        <h2>No hay catálogos todavía</h2>
        <p>
          Instala un addon de metadatos (Cinemeta, ThePirateBay+…) desde <strong>Ajustes → Addons</strong> para
          empezar. Vibe Flix agregará todos sus catálogos en esta pantalla.
        </p>
      </div>
    );
  }

  return (
    <div className="screen">
      {hero ? (
        <section className="hero">
          <div
            className="hero__backdrop"
            style={{
              backgroundImage: `url(${hero.background ?? hero.landscapePoster ?? hero.poster ?? ''})`,
            }}
          />
          <div className="hero__scrim" />
          <div className="hero__body">
            <span className="hero__eyebrow">
              <b>★</b> {continueWatching.length ? 'Continúa donde lo dejaste' : 'Destacado'}
            </span>
            <h1 className="hero__title">{hero.name}</h1>
            <div className="hero__facts">
              {hero.releaseInfo ? <span>{hero.releaseInfo}</span> : null}
              {hero.imdbRating ? <span className="is-rating">★ {hero.imdbRating}</span> : null}
              {(hero.genres ?? []).slice(0, 3).map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
            </div>
            {hero.description ? <p className="hero__description">{hero.description}</p> : null}
            <div className="hero__actions">
              <Button onClick={() => openDetail(hero)}>Ver detalles</Button>
              <Button variant="ghost" onClick={() => navigate({ name: 'search' })}>
                Buscar
              </Button>
            </div>
          </div>
          <div className="hero__side">
            {hero.landscapePoster || hero.background ? (
              <div className="hero__card">
                <img
                  src={hero.landscapePoster ?? hero.background ?? ''}
                  alt={hero.name ?? ''}
                  loading="lazy"
                  decoding="async"
                />
                <span className="hero__card-body">{hero.name}</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Acciones rápidas: todo lo importante a un clic del mando. */}
      <nav className="quick" aria-label="Acciones rápidas">
        <button
          type="button"
          data-focusable="true"
          className="quick__item"
          onClick={() => navigate({ name: 'search' })}
        >
          <Icon name="search" /> Buscar
        </button>
        <button
          type="button"
          data-focusable="true"
          className="quick__item"
          onClick={() => navigate({ name: 'genres' })}
        >
          <Icon name="genres" /> Géneros
        </button>
        <button
          type="button"
          data-focusable="true"
          className="quick__item"
          onClick={() => navigate({ name: 'decades' })}
        >
          <Icon name="decades" /> Décadas
        </button>
        <button
          type="button"
          data-focusable="true"
          className="quick__item"
          onClick={() => navigate({ name: 'lists' })}
        >
          <Icon name="lists" /> Mis listas
        </button>
        <button
          type="button"
          data-focusable="true"
          className="quick__item"
          onClick={() => navigate({ name: 'addons' })}
        >
          <Icon name="addons" /> Addons
        </button>
      </nav>

      {continueWatching.length ? (
        <Row title="Continuar viendo">
          {continueWatching.map((entry) => (
            <Poster
              key={entry.id}
              meta={{
                id: entry.id,
                type: entry.type,
                name: entry.name,
                poster: entry.poster,
              }}
              progress={entry.duration ? (entry.position / entry.duration) * 100 : 0}
              onSelect={openDetail}
            />
          ))}
        </Row>
      ) : null}

      {recent.length ? (
        <Row title="Visto recientemente">
          {recent.map((entry) => (
            <Poster
              key={entry.id}
              meta={{ id: entry.id, type: entry.type, name: entry.name, poster: entry.poster }}
              onSelect={openDetail}
            />
          ))}
        </Row>
      ) : null}

      {recommended.length ? (
        <Row title="Recomendado para ti">
          {recommended.map((meta) => (
            <Poster key={meta.id} meta={meta} onSelect={openDetail} />
          ))}
        </Row>
      ) : null}

      {rows.map((row) => (
        <Row key={row.key} title={row.title} emptyLabel="Sin elementos" subtitle={row.error}>
          {row.metas.map((meta) => (
            <Poster key={meta.id} meta={meta} onSelect={openDetail} />
          ))}
        </Row>
      ))}
    </div>
  );
}
