import { useEffect, useState } from 'react';

import { api } from '../api';
import { useApp } from '../store';
import { PageHeader } from '../components/PageHeader';
import type { Meta } from '../types';
import { ErrorState, Loader, Poster, Row } from '../components/ui';

/**
 * Ficha de persona con filtro por rol (WuPlay v0.9.2: filter filmography by role).
 */
export function PersonScreen({ person }: { person: string }) {
  const { navigate } = useApp();
  const [titles, setTitles] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const result = await api.person(person, role === 'all' ? undefined : role);
        if (!cancelled) setTitles(result.titles);
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [person, role]);

  return (
    <div className="screen person">
      <PageHeader title={person} hint={loading ? 'Buscando filmografía…' : `${titles.length} títulos`} />

      <div className="genre-bar">
        {[
          { id: 'all', label: 'Todo' },
          { id: 'acting', label: 'Actuando' },
          { id: 'directing', label: 'Dirección' },
          { id: 'writing', label: 'Guion' },
        ].map((entry) => (
          <button key={entry.id} type="button" data-focusable="true" className={`chip ${role === entry.id ? 'chip--active' : ''}`} onClick={() => setRole(entry.id)}>{entry.label}</button>
        ))}
      </div>

      {loading ? <Loader /> : null}
      {error ? <ErrorState message={error} /> : null}

      {!loading && !error && titles.length === 0 ? (
        <p className="row__empty">No se han encontrado títulos para «{person}» con este filtro.</p>
      ) : null}

      {titles.length ? (
        <Row title="Filmografía">
          {titles.map((meta) => (
            <Poster key={meta.id} meta={meta} onSelect={(selected) => navigate({ name: 'detail', id: selected.id, type: selected.type ?? 'movie' })} />
          ))}
        </Row>
      ) : null}
    </div>
  );
}
