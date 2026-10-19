import { useEffect, useState } from 'react';

import { api } from '../api';
import { useApp } from '../store';
import { PageHeader } from '../components/PageHeader';
import type { Meta } from '../types';
import { ErrorState, Loader, Poster, Row } from '../components/ui';

/**
 * Ficha de persona (WuPlay: "Cast & crew" con ficha y filmografia completa).
 *
 * El servidor busca el nombre en los catalogos y devuelve los titulos en los
 * que la persona aparece en el reparto o la direccion.
 */
export function PersonScreen({ person }: { person: string }) {
  const { navigate } = useApp();
  const [titles, setTitles] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const result = await api.person(person);
        if (!cancelled) setTitles(result.titles);
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [person]);

  return (
    <div className="screen person">
      <PageHeader
        title={person}
        hint={loading ? 'Buscando filmografía…' : `${titles.length} títulos`}
      />

      {loading ? <Loader /> : null}
      {error ? <ErrorState message={error} /> : null}

      {!loading && !error && titles.length === 0 ? (
        <p className="row__empty">
          No se han encontrado títulos para «{person}». Puede que los addons instalados noCubran este
          catálogo.
        </p>
      ) : null}

      {titles.length ? (
        <Row title="Filmografía">
          {titles.map((meta) => (
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
