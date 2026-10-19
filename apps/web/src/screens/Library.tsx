import { useState } from 'react';

import { api } from '../api';
import { useApp } from '../store';
import type { Meta } from '../types';
import { Button, EmptyState, Poster, Row } from '../components/ui';

function toMeta(item: { id: string; type: string; name: string; poster?: string }): Meta {
  return { id: item.id, type: item.type, name: item.name, poster: item.poster };
}

export function ListsScreen() {
  const { lists, navigate, reloadLibrary, activeProfileId } = useApp();
  const [newListName, setNewListName] = useState('');

  const createList = async () => {
    const name = newListName.trim();
    if (!name) return;
    await api.createList(name, activeProfileId || undefined);
    setNewListName('');
    await reloadLibrary();
  };

  return (
    <div className="screen">
      <div className="lists__create">
        <input
          className="lists__input"
          type="text"
          value={newListName}
          placeholder="Nombre de la nueva lista"
          onChange={(event) => setNewListName(event.target.value)}
        />
        <Button onClick={() => void createList()}>Crear lista</Button>
      </div>

      {lists.length === 0 ? (
        <EmptyState
          title="Todavía no tienes listas"
          hint="Crea una lista y añade películas desde la ficha de detalle."
        />
      ) : null}

      {lists.map((list) => (
        <Row key={list.id} title={list.name} subtitle={`${list.items.length} elementos`}>
          {list.items.map((item) => (
            <Poster
              key={`${list.id}-${item.id}-${item.episodeId ?? ''}`}
              meta={toMeta(item)}
              onSelect={(meta) =>
                navigate({ name: 'detail', id: meta.id, type: meta.type ?? 'movie' })
              }
            />
          ))}
        </Row>
      ))}
    </div>
  );
}

export function HistoryScreen() {
  const { history, progress, navigate, reloadLibrary, activeProfileId } = useApp();

  const clear = async () => {
    await api.clearHistory(activeProfileId || undefined);
    await reloadLibrary();
  };

  const continueWatching = progress
    .filter((entry) => entry.duration > 0 && entry.position / entry.duration < 0.95)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="screen">
      <div className="history__actions">
        <Button variant="danger" onClick={() => void clear()}>
          Borrar historial
        </Button>
      </div>

      {continueWatching.length ? (
        <Row title="Continuar viendo">
          {continueWatching.map((entry) => (
            <Poster
              key={entry.id}
              meta={{ id: entry.id, type: entry.type, name: entry.name, poster: entry.poster }}
              progress={entry.duration ? (entry.position / entry.duration) * 100 : 0}
              onSelect={(meta) =>
                navigate({ name: 'detail', id: meta.id, type: meta.type ?? 'movie' })
              }
            />
          ))}
        </Row>
      ) : null}

      {history.length ? (
        <Row title="Historial" subtitle={`${history.length} elementos`}>
          {history.map((entry) => (
            <Poster
              key={entry.id}
              meta={{ id: entry.id, type: entry.type, name: entry.name, poster: entry.poster }}
              badge={entry.streamName}
              onSelect={(meta) =>
                navigate({ name: 'detail', id: meta.id, type: meta.type ?? 'movie' })
              }
            />
          ))}
        </Row>
      ) : (
        <EmptyState title="Sin historial" hint="Lo que veas aparecerá aquí." />
      )}
    </div>
  );
}
