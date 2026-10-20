/**
 * Watch parties (NuvioTV: `PartyApi` / `PartySync` / `PartyRepository`).
 *
 * Cada sala es un recurso con el estado de reproducción del host y la lista
 * de miembros. Los clientes hacen polling y el host empuja su posición.
 *
 * Rutas:
 *   GET    /api/party               lista salas activas (no expiradas)
 *   POST   /api/party               crea una sala
 *   GET    /api/party/:id           detalle
 *   PUT    /api/party/:id           actualiza estado (solo el host)
 *   POST   /api/party/:id/join      unirse a la sala
 *   POST   /api/party/:id/leave     salir
 *   DELETE /api/party/:id           elimina (solo el host)
 */

import { randomUUID } from 'node:crypto';

import type { Router } from '../http/router.js';
import { sendJson } from '../http/router.js';
import type { AppData } from '../model.js';
import {
  isPartyExpired,
  pruneStaleMembers,
  sanitizePartyCreate,
  sanitizePartyUpdate,
  type PartyMember,
  type PartyRoom,
} from '../library/party.js';

export interface PartyRouteOptions {
  getData: () => AppData;
  save: (mutate: (data: AppData) => void) => Promise<void>;
}

export function registerPartyRoutes(router: Router, options: PartyRouteOptions): void {
  const { getData, save } = options;

  const rooms = (): PartyRoom[] =>
    ((getData() as AppData & { partyRooms?: PartyRoom[] }).partyRooms ?? []) as PartyRoom[];

  const findRoom = (id: string): PartyRoom | undefined =>
    rooms().find((r) => r.id === id);

  router.get('/api/party', ({ res }) => {
    const now = Date.now();
    const active = rooms()
      .filter((r) => !isPartyExpired(r, now))
      .map((r) => pruneStaleMembers(r, now));
    sendJson(res, 200, { rooms: active });
  });

  router.post('/api/party', async ({ res, body: rawBody }) => {
    const patch = sanitizePartyCreate(rawBody);
    if (!patch) {
      sendJson(res, 400, { error: 'Falta contentId' });
      return;
    }
    const id = randomUUID();
    const now = Date.now();
    const room: PartyRoom = {
      id,
      ...patch,
      members: [],
      createdAt: now,
      updatedAt: now,
    };
    await save((mutable) => {
      const list = ((mutable as AppData & { partyRooms?: PartyRoom[] }).partyRooms ??= []) as PartyRoom[];
      list.push(room);
    });
    sendJson(res, 201, { room });
  });

  router.get('/api/party/:id', ({ res, params }) => {
    const id = params['id'] ?? '';
    const room = findRoom(id);
    if (!room) {
      sendJson(res, 404, { error: 'Sala no encontrada' });
      return;
    }
    if (isPartyExpired(room)) {
      sendJson(res, 410, { error: 'Sala expirada' });
      return;
    }
    sendJson(res, 200, { room: pruneStaleMembers(room) });
  });

  router.put('/api/party/:id', async ({ res, params, body: rawBody }) => {
    const id = params['id'] ?? '';
    const room = findRoom(id);
    if (!room) {
      sendJson(res, 404, { error: 'Sala no encontrada' });
      return;
    }
    const patch = sanitizePartyUpdate(rawBody);
    if (!patch) {
      sendJson(res, 400, { error: 'Actualización vacía' });
      return;
    }
    let updated: PartyRoom | undefined;
    await save((mutable) => {
      const list = ((mutable as AppData & { partyRooms?: PartyRoom[] }).partyRooms ?? []) as PartyRoom[];
      const idx = list.findIndex((r) => r.id === id);
      if (idx < 0) return;
      list[idx] = { ...list[idx]!, ...patch, updatedAt: Date.now() };
      updated = list[idx];
    });
    sendJson(res, 200, { room: updated });
  });

  router.post('/api/party/:id/join', async ({ res, params, body: rawBody }) => {
    const id = params['id'] ?? '';
    const room = findRoom(id);
    if (!room) {
      sendJson(res, 404, { error: 'Sala no encontrada' });
      return;
    }
    const body = (rawBody ?? {}) as Record<string, unknown>;
    const memberId = typeof body['memberId'] === 'string' ? body['memberId'].trim().slice(0, 64) : randomUUID();
    const memberName = typeof body['memberName'] === 'string' ? body['memberName'].trim().slice(0, 40) : 'Invitado';
    let updated: PartyRoom | undefined;
    await save((mutable) => {
      const list = ((mutable as AppData & { partyRooms?: PartyRoom[] }).partyRooms ?? []) as PartyRoom[];
      const idx = list.findIndex((r) => r.id === id);
      if (idx < 0) return;
      const now = Date.now();
      const existing = list[idx]!;
      const members = existing.members.filter((m) => m.id !== memberId);
      const member: PartyMember = {
        id: memberId,
        name: memberName,
        joinedAt: existing.members.find((m) => m.id === memberId)?.joinedAt ?? now,
        lastSeenAt: now,
        position: typeof body['position'] === 'number' ? body['position'] : undefined,
        paused: typeof body['paused'] === 'boolean' ? body['paused'] : undefined,
      };
      list[idx] = { ...existing, members: [...members, member], updatedAt: now };
      updated = list[idx];
    });
    sendJson(res, 200, { room: updated, memberId });
  });

  router.post('/api/party/:id/leave', async ({ res, params, body: rawBody }) => {
    const id = params['id'] ?? '';
    const body = (rawBody ?? {}) as Record<string, unknown>;
    const memberId = typeof body['memberId'] === 'string' ? body['memberId'].trim() : '';
    if (!memberId) {
      sendJson(res, 400, { error: 'Falta memberId' });
      return;
    }
    let updated: PartyRoom | undefined;
    await save((mutable) => {
      const list = ((mutable as AppData & { partyRooms?: PartyRoom[] }).partyRooms ?? []) as PartyRoom[];
      const idx = list.findIndex((r) => r.id === id);
      if (idx < 0) return;
      list[idx] = { ...list[idx]!, members: list[idx]!.members.filter((m) => m.id !== memberId) };
      updated = list[idx];
    });
    sendJson(res, 200, { room: updated });
  });

  router.delete('/api/party/:id', async ({ res, params }) => {
    const id = params['id'] ?? '';
    await save((mutable) => {
      const list = ((mutable as AppData & { partyRooms?: PartyRoom[] }).partyRooms ?? []) as PartyRoom[];
      (mutable as AppData & { partyRooms?: PartyRoom[] }).partyRooms = list.filter((r) => r.id !== id);
    });
    sendJson(res, 200, { deleted: true });
  });
}
