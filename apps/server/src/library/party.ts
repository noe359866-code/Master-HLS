/**
 * Salas de watch party (NuvioTV: `PartyApi` / `PartySync`).
 *
 * NuvioTV tiene watch parties donde varios usuarios ven lo mismo sincronizado:
 * el servidor mantiene el estado de cada sala (qué se reproduce, dónde va
 * cada participante) y los clientes se sincronizan por `PartySync`
 * (NUDGE_START_MS 250, SEEK_THRESHOLD 1500 ms, etc.).
 *
 * Aquí se implementa el mínimo viable para el servidor: cada sala es un
 * recurso REST con el estado de reproducción y la lista de miembros. Los
 * clientes hacen polling (el WS vendrá después); la lógica de sincronización
 * del cliente replica los umbrales de NuvioTV.
 */

export interface PartyMember {
  id: string;
  name: string;
  joinedAt: number;
  lastSeenAt: number;
  /** Posición reportada por el cliente (segundos). */
  position?: number;
  /** true si está en pausa. */
  paused?: boolean;
}

export interface PartyRoom {
  id: string;
  /** Creador de la sala. */
  hostId: string;
  /** Contenido en reproducción (meta id). */
  contentId: string;
  contentType: string;
  contentName: string;
  /** Video/episodio concreto. */
  videoId?: string;
  /** URL del stream elegido por el host. */
  streamUrl?: string;
  /** Estado de reproducción mandado por el host. */
  state: 'playing' | 'paused' | 'idle';
  /** Posición del host (segundos). */
  position: number;
  /** Cuándo se actualizó el estado. */
  updatedAt: number;
  members: PartyMember[];
  createdAt: number;
}

/** Umbrales de sincronización (NuvioTV: `PartySync`). */
export const PARTY_NUDGE_START_MS = 250;
export const PARTY_SEEK_THRESHOLD_MS = 1500;
export const PARTY_HEARTBEAT_MS = 5000;
export const PARTY_MEMBER_TIMEOUT_MS = 60_000;
export const PARTY_TTL_MS = 2 * 60 * 60 * 1000;

export function isPartyExpired(room: PartyRoom, now = Date.now()): boolean {
  return now - room.updatedAt > PARTY_TTL_MS;
}

export function pruneStaleMembers(room: PartyRoom, now = Date.now()): PartyRoom {
  const members = room.members.filter((m) => now - m.lastSeenAt <= PARTY_MEMBER_TIMEOUT_MS);
  return { ...room, members };
}

/** Valida un cuerpo de creación de sala. */
export function sanitizePartyCreate(input: unknown): Omit<PartyRoom, 'id' | 'members' | 'createdAt' | 'updatedAt'> | null {
  const raw = (input ?? {}) as Record<string, unknown>;
  const contentId = typeof raw['contentId'] === 'string' ? raw['contentId'].trim() : '';
  if (!contentId) return null;
  return {
    hostId: typeof raw['hostId'] === 'string' ? raw['hostId'].trim().slice(0, 64) : 'host',
    contentId: contentId.slice(0, 128),
    contentType: typeof raw['contentType'] === 'string' ? raw['contentType'].trim().slice(0, 16) : 'movie',
    contentName: typeof raw['contentName'] === 'string' ? raw['contentName'].trim().slice(0, 120) : contentId,
    videoId: typeof raw['videoId'] === 'string' ? raw['videoId'].trim().slice(0, 128) : undefined,
    streamUrl: typeof raw['streamUrl'] === 'string' ? raw['streamUrl'].trim().slice(0, 2048) : undefined,
    state: raw['state'] === 'playing' || raw['state'] === 'paused' ? raw['state'] : 'idle',
    position: typeof raw['position'] === 'number' && Number.isFinite(raw['position']) ? Math.max(0, raw['position']) : 0,
  };
}

/** Valida una actualización de estado. */
export function sanitizePartyUpdate(input: unknown): Partial<Pick<PartyRoom, 'state' | 'position' | 'streamUrl' | 'videoId'>> | null {
  const raw = (input ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if ('state' in raw && (raw['state'] === 'playing' || raw['state'] === 'paused' || raw['state'] === 'idle')) {
    patch['state'] = raw['state'];
  }
  if ('position' in raw && typeof raw['position'] === 'number' && Number.isFinite(raw['position'])) {
    patch['position'] = Math.max(0, raw['position']);
  }
  if ('streamUrl' in raw && typeof raw['streamUrl'] === 'string') {
    patch['streamUrl'] = raw['streamUrl'].trim().slice(0, 2048);
  }
  if ('videoId' in raw && typeof raw['videoId'] === 'string') {
    patch['videoId'] = raw['videoId'].trim().slice(0, 128);
  }
  return Object.keys(patch).length ? patch as Partial<Pick<PartyRoom, 'state' | 'position' | 'streamUrl' | 'videoId'>> : null;
}
