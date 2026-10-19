import { useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import { useApp } from '../store';
import type { Meta } from '../types';
import { Button, ErrorState, Loader, Poster, Row } from '../components/ui';

/** Buscador global: consulta todos los catalogos que soportan `search`. */
export function SearchScreen() {
  const { navigate } = useApp();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const search = async (value: string) => {
    if (!value.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.search(value.trim());
      setResults(response.metas);
      setHasSearched(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void search(term), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  return (
    <div className="screen">
      <div className="search">
        <input
          className="search__input"
          type="text"
          value={term}
          placeholder="Busca películas, series, personas…"
          onChange={(event) => setTerm(event.target.value)}
          autoFocus
        />
      </div>

      {loading ? <Loader label="Buscando…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void search(term)} /> : null}

      {hasSearched && !loading && results.length === 0 ? (
        <p className="row__empty">Sin resultados para “{term}”.</p>
      ) : null}

      {results.length ? (
        <Row title={`Resultados (${results.length})`}>
          {results.map((meta) => (
            <Poster
              key={meta.id}
              meta={meta}
              onSelect={(selected) =>
                navigate({ name: 'detail', id: selected.id, type: selected.type ?? 'movie' })
              }
            />
          ))}
        </Row>
      ) : null}
    </div>
  );
}

/** Descubrimiento: generos y catalogo completo. */
export function DiscoverScreen() {
  const { manifest, navigate, catalogs } = useApp();
  const [genre, setGenre] = useState<string | null>(null);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(false);

  const genres = useMemo(() => {
    const set = new Set<string>();
    for (const catalog of manifest?.catalogs ?? []) {
      for (const extra of catalog.extra ?? []) {
        for (const option of extra.options ?? []) set.add(option);
      }
    }
    return [...set].slice(0, 24);
  }, [manifest]);

  useEffect(() => {
    const catalog = catalogs.find((entry) => entry.extraSupported?.includes('genre'));
    if (!catalog) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const response = await api.catalog(
          catalog.type,
          catalog.id,
          genre ? { genre } : {},
        );
        if (!cancelled) setMetas(response.metas);
      } catch {
        if (!cancelled) setMetas([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [genre, catalogs]);

  return (
    <div className="screen">
      {genres.length ? (
        <div className="genre-bar">
          <button
            type="button"
            data-focusable="true"
            className={`chip ${genre === null ? 'chip--active' : ''}`}
            onClick={() => setGenre(null)}
          >
            Todos
          </button>
          {genres.map((option) => (
            <button
              key={option}
              type="button"
              data-focusable="true"
              className={`chip ${genre === option ? 'chip--active' : ''}`}
              onClick={() => setGenre(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? <Loader /> : null}

      <Row title={genre ? `Género: ${genre}` : 'Catálogo'}>
        {metas.map((meta) => (
          <Poster
            key={meta.id}
            meta={meta}
            onSelect={(selected) =>
              navigate({ name: 'detail', id: selected.id, type: selected.type ?? 'movie' })
            }
          />
        ))}
      </Row>

      <div className="discover__actions">
        <Button variant="ghost" onClick={() => navigate({ name: 'addons' })}>
          Gestionar addons
        </Button>
      </div>
    </div>
  );
}
