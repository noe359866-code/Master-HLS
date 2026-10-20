/**
 * Pantalla de colecciones (NuvioTV: `Collection` / `CollectionSource`).
 *
 * Cada colección es un catálogo curado (franquicia, productora, cadena,
 * persona, keyword) que aparece como un hub más en el Home. Se pueden crear
 * desde presets de un clic o con un formulario libre, y se persisten en el
 * servidor.
 */

import { useEffect, useState } from 'react';

import { api } from '../api';
import { useApp } from '../store';
import { PageHeader } from '../components/PageHeader';
import { Button, EmptyState, ErrorState, Loader } from '../components/ui';
import type { CollectionDefinition } from '../types';

export function CollectionsScreen() {
  const { navigate } = useApp();
  const [collections, setCollections] = useState<CollectionDefinition[]>([]);
  const [presets, setPresets] = useState<Array<Record<string, string>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, p] = await Promise.all([api.collections(), api.collectionPresets()]);
      setCollections(c.collections);
      setPresets(p.presets as Array<Record<string, string>>);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const create = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api.createCollection(payload);
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await api.deleteCollection(id);
      setCollections((cur) => cur.filter((c) => c.id !== id));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loader label="Cargando colecciones…" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const visible = collections.filter((c) => !c.hidden);

  return (
    <div className="screen collections">
      <PageHeader
        title="Colecciones"
        hint="Catálogos curados por franquicia, productora o cadena. Aparecen como filas en el Home."
      />

      {visible.length ? (
        <section className="collections__list">
          {visible.map((c) => (
            <article key={c.id} className="collections__card" style={{ borderInlineStartColor: c.color }}>
              <div className="collections__card-head">
                <span className="collections__emoji">{c.emoji ?? '🎬'}</span>
                <h3>{c.title}</h3>
                <span className="collections__type">{c.sourceType}</span>
              </div>
              {c.description ? <p className="collections__desc">{c.description}</p> : null}
              <div className="collections__actions">
                <Button
                                    onClick={() => navigate({ name: 'detail', id: c.sourceId ?? c.id, type: c.mediaType === 'tv' ? 'series' : 'movie' })}
                >
                  Ver
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => void remove(c.id)}>
                  Quitar
                </Button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <EmptyState title="Sin colecciones" hint="Añade una desde los presets o crea una personalizada." />
      )}

      <section className="panel">
        <h2>Presets</h2>
        <p className="panel__hint">Un clic para añadir una colección curada.</p>
        <div className="collections__presets">
          {presets.map((p) => (
            <button
              key={p['sourceId']}
                            className="collections__preset"
              style={{ background: p['color'] }}
              disabled={busy}
              onClick={() =>
                void create({
                  title: p['title'],
                  description: p['description'],
                  sourceType: p['sourceType'],
                  sourceId: p['sourceId'],
                  mediaType: p['mediaType'],
                  emoji: p['emoji'],
                  color: p['color'],
                })
              }
            >
              <span>{p['emoji']}</span>
              <span>{p['title']}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Colección personalizada</h2>
        <div className="collections__form">
          <input
            className="collections__input"
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Título (ej. Cine español)"
            maxLength={80}
          />
          <input
            className="collections__input"
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="Palabra clave o ID (ej. almodovar)"
            maxLength={80}
          />
          <Button
                        disabled={busy || !newTitle.trim() || !newKeyword.trim()}
            onClick={() => {
              void create({
                title: newTitle.trim(),
                sourceType: 'keyword',
                sourceId: newKeyword.trim(),
                mediaType: 'all',
                emoji: '🎬',
              });
              setNewTitle('');
              setNewKeyword('');
            }}
          >
            Añadir
          </Button>
        </div>
      </section>
    </div>
  );
}
