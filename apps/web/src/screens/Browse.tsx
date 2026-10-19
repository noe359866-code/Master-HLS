import { useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import { useApp } from '../store';
import { PageHeader } from '../components/PageHeader';
import type { Decade, Genre, Meta } from '../types';
import { Button, ErrorState, Loader, Poster } from '../components/ui';

/**
 * Pantallas de contenido al estilo WuPlay: **Generos** y **Decadas**.
 *
 * Los generos usan el extra `genre` de los catalogos (lo que el addon de
 * metadata ya soporta) y las decadas se calculan en el servidor filtrando
 * los metadatos por su ano de estreno: no hace falta ningun servicio externo.
 */
export function GenresScreen() {
  const { navigate } = useApp();
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.genres();
        if (!cancelled) setGenres(result.genres);
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Loader label="Cargando géneros…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="screen browse-screen">
      <PageHeader
        title="Géneros"
        hint="Explora el catálogo por género. El contenido lo traen los addons instalados."
      />

      <div className="genre-grid">
        {genres.map((genre) => (
          <button
            key={genre.id}
            type="button"
            data-focusable="true"
            className="genre-card"
            style={{ background: `linear-gradient(140deg, ${genre.color}, #10141f)` }}
            onClick={() => navigate({ name: 'genre', genre: genre.catalog, label: genre.name })}
          >
            <span className="genre-card__emoji" aria-hidden="true">
              {genre.emoji}
            </span>
            <span className="genre-card__name">{genre.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Ficha de un genero: los titulos del catalogo filtrado. */
export function GenreScreen({ genre, label }: { genre: string; label?: string }) {
  const { navigate } = useApp();
  const [metas, setMetas] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await api.browse({ genre });
        if (!cancelled) setMetas(result.metas);
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [genre]);

  return (
    <div className="screen browse-screen">
      <PageHeader
        title={label ?? genre}
        actions={
          <Button variant="ghost" onClick={() => navigate({ name: 'genres' })}>
            ← Géneros
          </Button>
        }
      />

      {loading ? <Loader /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !metas.length ? (
        <p className="row__empty">No hay títulos de este género en tus catálogos.</p>
      ) : null}

      <div className="row__items">
        {metas.map((meta) => (
          <Poster
            key={meta.id}
            meta={meta}
            onSelect={(selected) =>
              navigate({ name: 'detail', id: selected.id, type: selected.type ?? 'movie' })
            }
          />
        ))}
      </div>
    </div>
  );
}

/** Pantalla de decadas. */
export function DecadesScreen() {
  const { navigate } = useApp();
  const [decades, setDecades] = useState<Decade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.genres();
        if (!cancelled) setDecades(result.decades);
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Loader label="Cargando décadas…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="screen browse-screen">
      <PageHeader
        title="Décadas"
        hint="Los clásicos de cada época, ordenados por puntuación."
      />

      <div className="decade-grid">
        {decades.map((decade) => (
          <button
            key={decade.id}
            type="button"
            data-focusable="true"
            className="decade-card"
            onClick={() => navigate({ name: 'decade', decade: decade.id, label: decade.label })}
          >
            <span className="decade-card__years">{decade.from}</span>
            <span className="decade-card__label">{decade.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Ficha de una decada: los titulos estrenados en ese periodo. */
export function DecadeScreen({ decade, label }: { decade: string; label?: string }) {
  const { navigate } = useApp();
  const [metas, setMetas] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await api.browse({ decade });
        if (!cancelled) setMetas(result.metas);
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [decade]);

  const title = useMemo(() => label ?? decade, [decade, label]);

  return (
    <div className="screen browse-screen">
      <PageHeader
        title={title}
        actions={
          <Button variant="ghost" onClick={() => navigate({ name: 'decades' })}>
            ← Décadas
          </Button>
        }
      />

      {loading ? <Loader /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !metas.length ? (
        <p className="row__empty">No hay títulos de esta década en tus catálogos.</p>
      ) : null}

      <div className="row__items">
        {metas.map((meta) => (
          <Poster
            key={meta.id}
            meta={meta}
            onSelect={(selected) =>
              navigate({ name: 'detail', id: selected.id, type: selected.type ?? 'movie' })
            }
          />
        ))}
      </div>
    </div>
  );
}
