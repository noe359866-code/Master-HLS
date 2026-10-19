/**
 * TorBox: comprueba si el torrent ya esta en su cache y, si lo esta, crea el
 * enlace directo. Para magnets que no estan cacheados lo anade y espera.
 * Los enlaces http se resuelven con su API de "transfer".
 */

import type { HttpClient } from '../http.js';
import type { Stream } from '../types.js';
import {
  linkOf,
  pickLargest,
  type DebridProvider,
  type DebridResolution,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.torbox.app/v1/api';

interface TorboxFile {
  id?: number;
  name?: string;
  size?: number;
  short_name?: string;
  md5?: string;
  mimetype?: string;
}

interface TorboxCheckCached {
  success?: boolean;
  error?: string;
  data?: {
    id?: number;
    cached?: boolean;
    name?: string;
    files?: TorboxFile[];
  };
}

export interface TorboxOptions {
  apiKey: string;
  baseUrl?: string;
  pollIntervalMs?: number;
  maxPolls?: number;
  ttlSeconds?: number;
}

export class TorboxProvider implements DebridProvider {
  readonly id = 'torbox' as const;
  readonly name = 'TorBox';
  readonly tag = 'TB';
  readonly hosters = [
    'mega.nz',
    '1fichier.com',
    'rapidgator.net',
    'pixeldrain.com',
    'gofile.io',
    'send.cm',
    'alldebrid.com',
    'real-debrid.com',
    'premiumize.me',
    'torbox.app',
  ];

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly pollIntervalMs: number;
  private readonly maxPolls: number;
  private readonly ttlSeconds: number;

  constructor(options: TorboxOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
    this.maxPolls = options.maxPolls ?? 30;
    this.ttlSeconds = options.ttlSeconds ?? 3 * 3_600;
  }

  supports(stream: Stream): boolean {
    return Boolean(this.apiKey) && linkOf(stream) !== null;
  }

  async resolve(stream: Stream, http: HttpClient): Promise<DebridResolution> {
    const link = linkOf(stream);
    if (!link) throw new Error('El stream no tiene enlace resoluble');
    if (link.kind === 'url') return this.resolveTransfer(link.value, http);
    return this.resolveMagnet(link.value, http);
  }

  async verify(http: HttpClient): Promise<{ ok: boolean; message: string }> {
    const user = await http.getJson<{ success?: boolean; error?: string; data?: { email?: string; plan?: number } }>(
      `${this.baseUrl}/user?apikey=${encodeURIComponent(this.apiKey)}`,
    );
    if (!user?.success) {
      return { ok: false, message: user?.error ?? 'Credenciales no válidas' };
    }
    return { ok: true, message: `Conectado${user.data?.email ? ` como ${user.data.email}` : ''}` };
  }

  /** Enlaces http: se crean como "transfer" y se pide la descarga. */
  private async resolveTransfer(url: string, http: HttpClient): Promise<DebridResolution> {
    const created = await http.postJson<{ success?: boolean; error?: string; data?: { id?: number } }>(
      `${this.baseUrl}/transfer/create`,
      { link: url },
      { headers: { authorization: `Bearer ${this.apiKey}` } },
    );
    const id = created?.data?.id;
    if (!created?.success || id === undefined) {
      throw new Error(created?.error ?? 'TorBox no ha aceptado la transferencia');
    }

    const download = await http.getJson<{ success?: boolean; error?: string; data?: { link?: string; name?: string; size?: number } }>(
      `${this.baseUrl}/transfer/dl/${id}?apikey=${encodeURIComponent(this.apiKey)}`,
    );
    if (!download?.success || !download.data?.link) {
      throw new Error(download?.error ?? 'TorBox no ha devuelto el enlace');
    }
    return {
      url: download.data.link,
      name: download.data.name,
      size: download.data.size,
      cached: true,
      expiresAt: Date.now() + this.ttlSeconds * 1000,
    };
  }

  private async resolveMagnet(magnet: string, http: HttpClient): Promise<DebridResolution> {
    const hash = /urn:btih:([a-zA-Z0-9]+)/.exec(magnet)?.[1] ?? magnet.replace(/^magnet:/, '');

    const check = await http.getJson<TorboxCheckCached>(
      `${this.baseUrl}/torrents/checkcached?format=object&list_files=true&apikey=${encodeURIComponent(this.apiKey)}&hash=${encodeURIComponent(hash)}`,
    );

    if (!check?.success) {
      throw new Error(check?.error ?? 'TorBox no ha podido consultar el torrent');
    }

    if (!check.data?.cached) {
      await http.postJson(
        `${this.baseUrl}/torrents/createtorrent`,
        { magnet, seed: 1, allow_zip: false },
        { headers: { authorization: `Bearer ${this.apiKey}` } },
      );

      for (let attempt = 0; attempt < this.maxPolls; attempt += 1) {
        await sleep(this.pollIntervalMs);
        const retry = await http.getJson<TorboxCheckCached>(
          `${this.baseUrl}/torrents/checkcached?format=object&list_files=true&apikey=${encodeURIComponent(this.apiKey)}&hash=${encodeURIComponent(hash)}`,
        );
        if (retry?.success && retry.data?.cached) {
          check.data = retry.data;
          break;
        }
      }
    }

    const files = check.data?.files ?? [];
    const best = pickLargest(files);
    if (!best?.id || !check.data?.id) {
      throw new Error('TorBox: no hay archivos descargados');
    }

    const link = await http.getJson<{ success?: boolean; error?: string; data?: { link?: string; name?: string; size?: number } }>(
      `${this.baseUrl}/torrents/createlink?apikey=${encodeURIComponent(this.apiKey)}&torrent_id=${check.data.id}&file_id=${best.id}`,
    );
    if (!link?.success || !link.data?.link) {
      throw new Error(link?.error ?? 'TorBox no ha devuelto el enlace');
    }

    return {
      url: link.data.link,
      name: link.data.name ?? best.name,
      size: link.data.size ?? best.size,
      cached: true,
      expiresAt: Date.now() + this.ttlSeconds * 1000,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
