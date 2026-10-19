/**
 * Dispositivos y sincronizacion multi-dispositivo.
 *
 * La biblioteca (watchlists, historial, progreso y valoraciones) ya vive en el
 * servidor, asi que "sincronizar" es, sobre todo, poder usarla desde otro
 * dispositivo sin montar cuentas (WuPlay y NuvioTV usan perfiles/Supabase).
 *
 * El mecanismo es un codigo de vinculacion:
 *   1. El dispositivo A pide un codigo (`POST /api/pairing`) y recibe ademas
 *      su propio token.
 *   2. El usuario teclea el codigo en el dispositivo B (`POST /api/pairing/claim`),
 *      que recibe su token.
 *   3. A partir de ahi ambos comparten la biblioteca y el servidor exige el
 *      token en las rutas de biblioteca.
 *
 * Si no hay ningun dispositivo vinculado, el servidor sigue en "modo local"
 * (sin autenticacion) para no romper instalaciones de un solo dispositivo.
 */

import { randomUUID } from 'node:crypto';
import type { Router, RouteContext } from '../http/router.js';
import { sendJson } from '../http/router.js';
import type { AppData, PairedDevice } from '../model.js';

export interface DeviceRouteOptions {
  getData: () => AppData;
  save: (mutate: (data: AppData) => void) => Promise<void>;
  /** Token de la peticion en curso (cabecera `X-Master-Hls-Token`). */
  getToken?: (ctx: RouteContext) => string | undefined;
}

const CODE_TTL_MS = 10 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(): string {
  const bytes = new Uint8Array(6);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]!).join('');
}

function randomToken(): string {
  return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
}

function touch(device: PairedDevice): void {
  device.lastSeenAt = Date.now();
}

export function registerDeviceRoutes(router: Router, options: DeviceRouteOptions): void {
  const { getData, save, getToken } = options;

  const tokenOf = (ctx: RouteContext): string | undefined => {
    const explicit = getToken?.(ctx);
    if (explicit) return explicit;
    const header = ctx.req.headers['x-master-hls-token'];
    return Array.isArray(header) ? header[0] : header;
  };

  const devices = (): PairedDevice[] => getData().devices ?? [];

  const findDevice = (token?: string): PairedDevice | undefined =>
    token ? devices().find((device) => device.token === token) : undefined;

  /**
   * Comprueba el acceso: en "modo local" (sin dispositivos vinculados) se
   * permite todo; en cuanto hay uno, hace falta un token valido.
   */
  const requireToken = (ctx: RouteContext, res: Parameters<typeof sendJson>[0]): boolean => {
    const list = devices();
    if (!list.length) return true;
    const device = findDevice(tokenOf(ctx));
    if (!device) {
      sendJson(res, 401, { error: 'Dispositivo no vinculado' });
      return false;
    }
    touch(device);
    return true;
  };

  /** Estado: si hace falta vincular, que dispositivos hay y cual es el actual. */
  router.get('/api/devices', (ctx) => {
    const list = devices();
    const current = findDevice(tokenOf(ctx));
    sendJson(ctx.res, 200, {
      // Si no hay ningun dispositivo, la app funciona en modo local.
      pairingRequired: list.length > 0,
      device: current
        ? { id: current.id, name: current.name, createdAt: current.createdAt }
        : null,
      devices: list.map((device) => ({
        id: device.id,
        name: device.name,
        createdAt: device.createdAt,
        lastSeenAt: device.lastSeenAt,
        current: current?.id === device.id,
      })),
    });
  });

  /**
   * Crea un codigo de vinculacion. El dispositivo que lo pide queda vinculado
   * y recibe su token.
   */
  router.post('/api/pairing', async (ctx) => {
    const body = (ctx.body ?? {}) as { name?: string };
    const name = (body.name ?? 'Este dispositivo').trim() || 'Este dispositivo';
    const code = randomCode();
    const token = randomToken();
    const now = Date.now();

    const device: PairedDevice = {
      id: randomUUID(),
      name,
      token,
      createdAt: now,
      lastSeenAt: now,
    };

    await save((data) => {
      data.devices ??= [];
      data.pairings ??= [];
      data.devices.push(device);
      data.pairings.push({
        code,
        deviceName: name,
        createdAt: now,
        expiresAt: now + CODE_TTL_MS,
      });
      // Se limpian los codigos caducados.
      data.pairings = data.pairings.filter((entry) => entry.expiresAt > now);
    });

    sendJson(ctx.res, 200, {
      code,
      expiresAt: now + CODE_TTL_MS,
      token,
      device: { id: device.id, name: device.name },
    });
  });

  /** Canjea un codigo por un token de dispositivo. */
  router.post('/api/pairing/claim', async (ctx) => {
    const body = (ctx.body ?? {}) as { code?: string; name?: string };
    const code = (body.code ?? '').trim().toUpperCase();
    const name = (body.name ?? 'Nuevo dispositivo').trim() || 'Nuevo dispositivo';

    if (!code) {
      sendJson(ctx.res, 400, { error: 'Falta code' });
      return;
    }

    const now = Date.now();
    const pairing = (getData().pairings ?? []).find(
      (entry) => entry.code === code && entry.expiresAt > now,
    );
    if (!pairing) {
      sendJson(ctx.res, 404, { error: 'Código no válido o caducado' });
      return;
    }

    const token = randomToken();
    const device: PairedDevice = {
      id: randomUUID(),
      name,
      token,
      createdAt: now,
      lastSeenAt: now,
    };

    await save((data) => {
      data.devices ??= [];
      data.devices.push(device);
      data.pairings = (data.pairings ?? []).filter((entry) => entry.code !== code);
    });

    sendJson(ctx.res, 200, {
      token,
      device: { id: device.id, name: device.name },
    });
  });

  /** Desvincula un dispositivo. */
  router.delete('/api/devices/:id', async (ctx) => {
    if (!requireToken(ctx, ctx.res)) return;
    const id = ctx.params['id'] ?? '';
    await save((data) => {
      data.devices = (data.devices ?? []).filter((device) => device.id !== id);
    });
    sendJson(ctx.res, 200, { deleted: true });
  });

  /** El cliente consulta esto para saber si su token sigue siendo valido. */
  router.get('/api/session', (ctx) => {
    const list = devices();
    const current = findDevice(tokenOf(ctx));
    sendJson(ctx.res, 200, {
      pairingRequired: list.length > 0,
      authenticated: list.length === 0 || Boolean(current),
      device: current ? { id: current.id, name: current.name } : null,
    });
  });
}
