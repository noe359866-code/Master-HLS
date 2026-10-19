/**
 * Real-Debrid: el proveedor mas usado y el que mejor cachea.
 *
 * Flujo magnet: `addMagnet` -> `selectFiles` -> espera a `downloaded` ->
 * `unrestrict/links` con el magnet -> enlace directo del archivo de video.
 * Flujo hoster premium: `unrestrict/links` directo con la URL.
 */

import type { HttpClient } from '../http.js';
import type { Stream } from '../types.js';
import {
  formatSize,
  linkOf,
  pickLargest,
  type DebridProvider,
  type DebridResolution,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.real-debrid.com/rest/1.0';

interface RdUnrestrictedLink {
  id?: string;
  filename?: string;
  filesize?: number;
  host?: string;
  link?: string;
  download?: string;
  streamable?: number | boolean;
}

interface RdTorrentInfo {
  id: string;
  status?: string;
  progress?: number;
  files?: Array<{ id: number; path: string; bytes: number; selected?: number }>;
}

export interface RealDebridOptions {
  apiKey: string;
  baseUrl?: string;
  /** Espera entre sondeos del estado del torrent (ms). */
  pollIntervalMs?: number;
  /** Numero maximo de sondeos antes de rendirse. */
  maxPolls?: number;
  /** Segundos de validez que se asumen para el enlace resuelto. */
  ttlSeconds?: number;
}

export class RealDebridProvider implements DebridProvider {
  readonly id = 'realdebrid' as const;
  readonly name = 'Real-Debrid';
  readonly tag = 'RD';
  readonly hosters = [
    'rapidgator.net',
    'uploadflare.com',
    '1fichier.com',
    'mega.nz',
    'mixdrop.co',
    'hexupload.com',
    'krakenfiles.com',
    'alldebrid.com',
    'real-debrid.com',
    'premiumize.me',
    'torbox.app',
    'pixeldrain.com',
    'gofile.io',
    'send.cm',
  ];

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly pollIntervalMs: number;
  private readonly maxPolls: number;
  private readonly ttlSeconds: number;

  constructor(options: RealDebridOptions) {
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
      await this.prepareMagnet(link.value, http);
    }

    const links = await http.postForm<RdUnrestrictedLink[]>(
      `${this.baseUrl}/unrestrict/links`,
      { link: link.value, apikey: this.apiKey, format: 'json' },
    );

    if (!Array.isArray(links) || links.length === 0) {
      throw new Error('Real-Debrid no ha devuelto enlaces');
    }

    const best = pickLargest(
      links.map((entry) => ({
        ...entry,
        name: entry.filename,
        size: entry.filesize,
      })),
    );

    const url = best?.link || best?.download;
    if (!url) throw new Error('Real-Debrid no ha devuelto un enlace directo');

    return {
      url,
      name: best?.filename,
      size: best?.filesize,
      cached: true,
      expiresAt: Date.now() + this.ttlSeconds * 1000,
    };
  }

  async verify(http: HttpClient): Promise<{ ok: boolean; message: string }> {
    const user = await http.getJson<{ username?: string; premium?: number; type?: string }>(
      `${this.baseUrl}/user?apikey=${encodeURIComponent(this.apiKey)}`,
    );
    if (!user?.username) {
      return { ok: false, message: 'Credenciales no válidas' };
    }
    return {
      ok: true,
      message: `Conectado como ${user.username}${user.type ? ` (${user.type})` : ''}`,
    };
  }

  /** Añade el magnet a la cuenta y espera a que se descargue. */
  private async prepareMagnet(magnet: string, http: HttpClient): Promise<void> {
    const added = await http.postForm<{ id?: string }>(
      `${this.baseUrl}/torrents/addMagnet`,
      { magnet, apikey: this.apiKey },
    );
    const id = added?.id;
    if (!id) throw new Error('Real-Debrid no ha devuelto el id del torrent');

    await http.postForm(`${this.baseUrl}/torrents/selectFiles/${id}`, {
      files: 'all',
      apikey: this.apiKey,
    });

    for (let attempt = 0; attempt < this.maxPolls; attempt += 1) {
      const info = await http.getJson<RdTorrentInfo>(
        `${this.baseUrl}/torrents/info/${id}?apikey=${encodeURIComponent(this.apiKey)}`,
      );
      if (info.status === 'downloaded' || info.status === 'finished') return;
      if (info.status === 'error' || info.status === 'magnet_not_found' || info.status === 'virus') {
        throw new Error(`Real-Debrid: estado ${info.status}`);
      }
      await sleep(this.pollIntervalMs);
    }

    throw new Error('Real-Debrid: el torrent no ha terminado a tiempo');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { formatSize };
