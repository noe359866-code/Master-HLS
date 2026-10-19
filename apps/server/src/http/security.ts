/**
 * Utilidades de autenticación y secretos del servidor.
 *
 * El servidor está pensado para una LAN doméstica, pero puede exponerse fuera
 * de ella. `ADMIN_TOKEN` es la barrera opcional para las rutas que pueden
 * provocar descargas del servidor o cambiar su configuración; el token de
 * dispositivo (`X-Vibe-Flix-Token`) sigue protegiendo la biblioteca.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

/** Valor que la API devuelve en lugar de una clave guardada. */
export const SECRET_PLACEHOLDER = '••••';

/** Comparación en tiempo constante sin filtrar la longitud de los secretos. */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Token de administrador presente en `Authorization` o en su cabecera propia. */
export function adminTokenFrom(headers: IncomingHttpHeaders): string | undefined {
  const explicit = headerValue(headers, 'x-vibe-flix-admin-token');
  if (explicit?.trim()) return explicit.trim();
  const authorization = headerValue(headers, 'authorization');
  if (!authorization) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || undefined;
}

/** true si la petición trae el token de administrador configurado. */
export function hasValidAdminToken(headers: IncomingHttpHeaders, expected: string): boolean {
  if (!expected) return false;
  const provided = adminTokenFrom(headers);
  return Boolean(provided) && constantTimeEqual(provided!, expected);
}

const ADMIN_PREFIXES = ['/api/scrapers', '/api/addons', '/api/settings', '/api/debrid'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Rutas que exigen `ADMIN_TOKEN` cuando está configurado.
 *
 * - `/api/scrapers*`: puede descargar URLs y su GET incluye cabeceras de
 *   proveedores propios. Se protege también la lectura.
 * - `/api/addons`, `/api/settings`, `/api/debrid`: sólo mutaciones (el GET de
 *   ajustes devuelve las claves enmascaradas).
 * - `POST /api/pairing`: emitir un token de dispositivo es una operación de
 *   administración; canjear un código (`/claim`) sigue siendo posible con el
 *   código, que prueba acceso físico al servidor.
 */
export function requiresAdminToken(method: string, pathname: string): boolean {
  const upper = method.toUpperCase();
  if (pathname === '/api/pairing' && upper === 'POST') return true;
  const underPrefix = ADMIN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!underPrefix) return false;
  if (pathname === '/api/scrapers' || pathname.startsWith('/api/scrapers/')) return true;
  return !SAFE_METHODS.has(upper);
}

/** Devuelve la clave real si el cliente reenvía el marcador enmascarado. */
export function restoreSecret(incoming: unknown, current: string): string {
  return incoming === SECRET_PLACEHOLDER ? current : String(incoming ?? '');
}

/** Enmascara una clave sin revelar si es corta o larga. */
export function maskSecret(value: string | undefined): string {
  return value ? SECRET_PLACEHOLDER : '';
}
