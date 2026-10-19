/**
 * Contrato de los proveedores de debrid (servicios que descargan en tu nombre
 * y te dan un enlace directo).
 *
 * WuPlay solo trabaja con streams HTTP y delega el debrid en los addons;
 * NuvioTV trae debrid nativo (RealDebrid, Premiumize, TorBox). Master-HLS lo
 * resuelve en el *servidor*, una sola vez, y el resultado se cachea para que
 * todos los dispositivos (web, Android TV, Stremio) aprovechen el mismo enlace.
 *
 * Decisión de diseño heredada de WuPlay: el motor sigue siendo "solo HTTP".
 * Un enlace resuelto por debrid es HTTP, asi que el proxy HLS puede seguir
 * reescribiendo cabeceras y playlists sin tratarlo como caso especial.
 */

import type { HttpClient } from '../http.js';
import type { Stream } from '../types.js';

export type DebridProviderId = 'realdebrid' | 'alldebrid' | 'torbox' | 'premiumize';

export const DEBRID_PROVIDERS: DebridProviderId[] = [
  'realdebrid',
  'alldebrid',
  'torbox',
  'premiumize',
];

export interface DebridConfig {
  provider: DebridProviderId;
  apiKey: string;
}

export interface DebridResolution {
  /** Enlace directo (HTTP) ya descargado por el proveedor. */
  url: string;
  /** Nombre del release resuelto. */
  name?: string;
  /** Tamaño en bytes, si el proveedor lo informa. */
  size?: number;
  /** true si el contenido ya estaba cacheado en el proveedor. */
  cached?: boolean;
  /** Expiracion estimada del enlace (epoch ms). */
  expiresAt?: number;
}

export interface DebridProvider {
  readonly id: DebridProviderId;
  readonly name: string;
  /** Etiqueta corta que se añade al titulo del stream (p. ej. `[RD]`). */
  readonly tag: string;
  /** Dominios de hoster soportados (para diagnostico en la UI). */
  readonly hosters: string[];
  /** true si el stream es un candidato a resolverse. */
  supports(stream: Stream): boolean;
  /** Resuelve el stream a un enlace directo. */
  resolve(stream: Stream, http: HttpClient): Promise<DebridResolution>;
  /** Comprueba las credenciales (opcional). */
  verify?(http: HttpClient): Promise<{ ok: boolean; message: string }>;
}

/** Enlace extraible de un stream: magnet (torrent) o URL de hoster. */
export interface DebridLink {
  kind: 'magnet' | 'url';
  value: string;
  /** Hash del torrent si lo hay. */
  infoHash?: string;
}

/** Extrae el enlace "premium" de un stream de Stremio. */
export function linkOf(stream: Stream): DebridLink | null {
  const infoHash = typeof stream.infoHash === 'string' ? stream.infoHash.trim() : '';
  if (infoHash) {
    const name = typeof stream.title === 'string' ? stream.title : '';
    return {
      kind: 'magnet',
      value: `magnet:?xt=urn:btih:${infoHash}${name ? `&dn=${encodeURIComponent(name)}` : ''}`,
      infoHash,
    };
  }

  const url = typeof stream.url === 'string' ? stream.url.trim() : '';
  if (url.startsWith('magnet:')) {
    const match = /urn:btih:([a-zA-Z0-9]+)/.exec(url);
    return { kind: 'magnet', value: url, infoHash: match?.[1] };
  }

  const external = typeof stream.externalUrl === 'string' ? stream.externalUrl.trim() : '';
  if (external && /^https?:\/\//i.test(external)) {
    return { kind: 'url', value: external };
  }

  return null;
}

/** Dominio del hoster de un enlace (sin `www.`). */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** true si el enlace apunta a un hoster premium conocido. */
export function isHosterLink(url: string, hosters: string[]): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return hosters.some((hoster) => host === hoster || host.endsWith(`.${hoster}`));
}

/** Elige el archivo de video mas grande de una lista de archivos. */
export function pickLargest<T extends { size?: number; name?: string; filename?: string }>(
  files: T[],
): T | undefined {
  return [...files].sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0];
}

/** Convierte bytes en una etiqueta legible (p. ej. `1.4 GB`). */
export function formatSize(bytes?: number): string | undefined {
  if (!bytes || bytes <= 0) return undefined;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
