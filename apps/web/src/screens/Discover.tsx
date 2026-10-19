import { useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import { useApp } from '../store';
import { PageHeader } from '../components/PageHeader';
import type { Meta } from '../types';
import { Button, Loader, Poster, Row } from '../components/ui';

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
      <PageHeader
        title="Descubrir"
        hint="Todo el catálogo agregado, filtrado por género."
      />
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
        <Button onClick={() => navigate({ name: 'genres' })}>Géneros</Button>
        <Button onClick={() => navigate({ name: 'decades' })}>Décadas</Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'search' })}>
          Buscar
        </Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'addons' })}>
          Gestionar addons
        </Button>
      </div>
    </div>
  );
}
