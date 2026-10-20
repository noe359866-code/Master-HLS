/**
 * Watch party (NuvioTV: `PartyApi` / `PartySync`).
 *
 * Sala simple donde el host comparte qué ve y dónde va. Los miembros hacen
 * polling y se sincronizan por umbrales (seek si >1.5 s de desvío).
 */

import { useCallback, useEffect, useState } from 'react';

import { api } from '../api';
import { PageHeader } from '../components/PageHeader';
import { Button, EmptyState, ErrorState, Loader } from '../components/ui';
import type { PartyRoom } from '../types';

export function PartyScreen() {
  const [rooms, setRooms] = useState<PartyRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [contentId, setContentId] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await api.partyRooms();
      setRooms(result.rooms);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const create = async () => {
    const id = contentId.trim();
    if (!id) return;
    setBusy(true);
    try {
      await api.createPartyRoom({ contentId: id, contentName: id, contentType: 'movie', state: 'idle', position: 0 });
      setContentId('');
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const join = async (roomId: string) => {
    setJoining(roomId);
    try {
      await api.joinPartyRoom(roomId, { memberName: 'Invitado web' });
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setJoining(null);
    }
  };

  const leave = async (roomId: string, memberId: string) => {
    try {
      await api.leavePartyRoom(roomId, memberId);
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  if (loading) return <Loader label="Cargando salas…" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="screen party">
      <PageHeader title="Watch party" hint="Salas sincronizadas. Todos ven lo mismo, al mismo tiempo." />

      {rooms.length ? (
        <ul className="party__list">
          {rooms.map((room) => (
            <li key={room.id} className="party__room">
              <div className="party__room-head">
                <strong>{room.contentName}</strong>
                <span className="party__state">{room.state}</span>
              </div>
              <span className="party__meta">
                {room.contentType} · {room.members.length} miembros · {Math.round(room.position)}s
              </span>
              <div className="party__actions">
                <Button
                                    disabled={joining === room.id}
                  onClick={() => void join(room.id)}
                >
                  Unirse
                </Button>
                <Button
                                    variant="ghost"
                  onClick={() => {
                    const memberId = room.members[0]?.id;
                    if (memberId) void leave(room.id, memberId);
                  }}
                >
                  Salir
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Sin salas" hint="Crea una para ver algo con amigos." />
      )}

      <section className="panel">
        <h2>Crear sala</h2>
        <div className="party__form">
          <input
            className="party__input"
            type="text"
            value={contentId}
            onChange={(e) => setContentId(e.target.value)}
            placeholder="ID del título (ej. tt0111161)"
          />
          <Button disabled={busy || !contentId.trim()} onClick={() => void create()}>
            Crear
          </Button>
        </div>
      </section>
    </div>
  );
}
