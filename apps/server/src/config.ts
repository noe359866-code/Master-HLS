/**
 * Configuracion del servidor, leida de variables de entorno.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface ServerConfig {
  port: number;
  host: string;
  /** Directorio de datos persistentes (addons, perfiles, historial). */
  dataDir: string;
  /** URL publica con la que se sirve el addon Stremio. */
  publicUrl: string;
  /** Addons instalados por defecto en el primer arranque. */
  defaultAddons: string[];
  /** Timeout del fan-out a addons (ms). */
  fanoutTimeoutMs: number;
  /** Directorio del cliente web compilado (apps/web/dist). */
  webRoot: string;
}

function envList(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadConfig(): ServerConfig {
  const port = Number(process.env['PORT'] ?? 8181);
  const host = process.env['HOST'] ?? '0.0.0.0';
  const dataDir = process.env['DATA_DIR'] ?? path.resolve(here, '../../../data');
  const publicUrl =
    process.env['PUBLIC_URL'] ?? `http://localhost:${port}`;

  return {
    port,
    host,
    dataDir,
    publicUrl: publicUrl.replace(/\/$/, ''),
    defaultAddons: envList('DEFAULT_ADDONS'),
    fanoutTimeoutMs: Number(process.env['FANOUT_TIMEOUT_MS'] ?? 10_000),
    webRoot: process.env['WEB_ROOT'] ?? path.resolve(here, '../../../apps/web/dist'),
  };
}
