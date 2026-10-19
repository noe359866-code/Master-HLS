import { useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import { useApp } from '../store';
import type { Meta } from '../types';
import { ErrorState, Loader, Poster, Row } from '../components/ui';

interface CatalogState {
  key: string;
  title: string;
  metas: Meta[];
  loading: boolean;
  error?: string;
}

export function HomeScreen() {
  const { manifest, progress, history, navigate, settings } = useApp();
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

  if (loading) return <Loader label="Cargando catálogos…" />;
  if (error) return <ErrorState message={error} />;

  if (!catalogs.length) {
    return (
      <div className="screen screen--empty">
        <h2>No hay catálogos todavía</h2>
        <p>
          Instala un addon de metadatos (Cinemeta, ThePirateBay+…) desde <strong>Ajustes → Addons</strong> para
          empezar. Master-HLS agregará todos sus catálogos en esta pantalla.
        </p>
      </div>
    );
  }

  return (
    <div className="screen">
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

      {settings?.autoplayTrailers ? null : null}
    </div>
  );
}
