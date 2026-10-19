/**
 * AllDebrid: resolucion por magnet con enlace instantaneo cuando el torrent
 * ya esta en su cache; si no, se sube y se espera a que quede "ready".
 */

import type { HttpClient } from '../http.js';
import type { Stream } from '../types.js';
import {
  linkOf,
  pickLargest,
  type DebridProvider,
  type DebridResolution,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.alldebrid.com/v4';
const AGENT = 'masterhls';

interface AdInstantFile {
  filename?: string;
  size?: number;
  link?: string;
  root_folder?: string;
}

interface AdInstantResponse {
  status?: string;
  error?: { code?: string; message?: string };
  data?: {
    magnets?: Record<
      string,
      {
        instant?: boolean;
        name?: string;
        hash?: string;
        files?: Record<string, AdInstantFile>;
        link?: string;
      }
    >;
  };
}

interface AdStatusResponse {
  status?: string;
  error?: { code?: string; message?: string };
  data?: {
    magnets?: Record<
      string,
      {
        status?: string;
        name?: string;
        download?: string;
        files?: Record<string, AdInstantFile>;
      }
    >;
  };
}

export interface AllDebridOptions {
  apiKey: string;
  baseUrl?: string;
  pollIntervalMs?: number;
  maxPolls?: number;
  ttlSeconds?: number;
}

export class AllDebridProvider implements DebridProvider {
  readonly id = 'alldebrid' as const;
  readonly name = 'AllDebrid';
  readonly tag = 'AL';
  readonly hosters = [
    'rapidgator.net',
    'uploadflare.com',
    '1fichier.com',
    'mega.nz',
    'mixdrop.co',
    'alldebrid.com',
    'pixeldrain.com',
    'gofile.io',
    'send.cm',
    'turbofile.net',
  ];

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly pollIntervalMs: number;
  private readonly maxPolls: number;
  private readonly ttlSeconds: number;

  constructor(options: AllDebridOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.pollIntervalMs = options.pollIntervalMs ?? 1_500;
    this.maxPolls = options.maxPolls ?? 40;
    this.ttlSeconds = options.ttlSeconds ?? 3 * 3_600;
  }

  supports(stream: Stream): boolean {
    return Boolean(this.apiKey) && linkOf(stream) !== null;
  }

  async resolve(stream: Stream, http: HttpClient): Promise<DebridResolution> {
    const link = linkOf(stream);
    if (!link) throw new Error('El stream no tiene enlace resoluble');

    if (link.kind === 'magnet') {
      return this.resolveMagnet(link.value, http);
    }
    return this.unlockUrl(link.value, http);
  }

  async verify(http: HttpClient): Promise<{ ok: boolean; message: string }> {
    const user = await http.getJson<{ status?: string; data?: { username?: string }; error?: { message?: string } }>(
      `${this.baseUrl}/user?agent=${AGENT}&apikey=${encodeURIComponent(this.apiKey)}`,
    );
    if (user?.status !== 'success' || !user.data?.username) {
      return { ok: false, message: user?.error?.message ?? 'Credenciales no válidas' };
    }
    return { ok: true, message: `Conectado como ${user.data.username}` };
  }

  private async unlockUrl(url: string, http: HttpClient): Promise<DebridResolution> {
    const response = await http.getJson<{
      status?: string;
      data?: { link?: string; filename?: string; size?: number; ready?: number };
      error?: { message?: string };
    }>(
      `${this.baseUrl}/link/unlock?agent=${AGENT}&apikey=${encodeURIComponent(this.apiKey)}&link=${encodeURIComponent(url)}`,
    );
    if (response?.status !== 'success' || !response.data?.link) {
      throw new Error(response?.error?.message ?? 'AllDebrid no ha desbloqueado el enlace');
    }
    return {
      url: response.data.link,
      name: response.data.filename,
      size: response.data.size,
      cached: true,
      expiresAt: Date.now() + this.ttlSeconds * 1000,
    };
  }

  private async resolveMagnet(magnet: string, http: HttpClient): Promise<DebridResolution> {
    const key = magnet.startsWith('magnet:') ? magnet : `magnet:${magnet}`;
    const query = `agent=${AGENT}&apikey=${encodeURIComponent(this.apiKey)}&magnets[]=${encodeURIComponent(key)}`;

    // 1) Enlace instantaneo (el torrent ya esta cacheado).
    const instant = await http.getJson<AdInstantResponse>(`${this.baseUrl}/magnet/instant?${query}`);
    const instantEntry = instant?.data?.magnets?.[key];
    const instantFiles = Object.values(instantEntry?.files ?? {});
    if (instant?.status === 'success' && instantEntry?.instant && instantFiles.length) {
      const best = pickLargest(instantFiles);
      if (best?.link) {
        return {
          url: best.link,
          name: best.filename,
          size: best.size,
          cached: true,
          expiresAt: Date.now() + this.ttlSeconds * 1000,
        };
      }
    }

    // 2) Subir el magnet y esperar a que AllDebrid lo descargue.
    const upload = await http.getJson<{ status?: string; data?: { magnets?: Record<string, { id: number | string }> }; error?: { message?: string } }>(
      `${this.baseUrl}/magnet/upload?${query}`,
    );
    const magnetId = upload?.data?.magnets?.[key]?.id;
    if (upload?.status !== 'success' || magnetId === undefined) {
      throw new Error(upload?.error?.message ?? 'AllDebrid no ha aceptado el magnet');
    }

    for (let attempt = 0; attempt < this.maxPolls; attempt += 1) {
      const status = await http.getJson<AdStatusResponse>(
        `${this.baseUrl}/magnet/status?agent=${AGENT}&apikey=${encodeURIComponent(this.apiKey)}&id=${encodeURIComponent(String(magnetId))}`,
      );
      const entry = status?.data?.magnets?.[String(magnetId)];
      const files = Object.values(entry?.files ?? {});
      if (entry?.status === 'ready') {
        const best = pickLargest(files);
        if (best?.link) {
          return {
            url: best.link,
            name: best.filename,
            size: best.size,
            cached: true,
            expiresAt: Date.now() + this.ttlSeconds * 1000,
          };
        }
        if (entry?.download) {
          return this.unlockUrl(entry.download, http);
        }
      }
      if (entry?.status === 'error' || entry?.status === 'erro') {
        throw new Error('AllDebrid: error al preparar el magnet');
      }
      await sleep(this.pollIntervalMs);
    }

    throw new Error('AllDebrid: el torrent no ha terminado a tiempo');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
