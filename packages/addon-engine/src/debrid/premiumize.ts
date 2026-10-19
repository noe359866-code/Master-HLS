/**
 * Premiumize: un unico endpoint resuelve tanto enlaces http como magnets
 * (`/api/transfer/direct`).
 */

import type { HttpClient } from '../http.js';
import type { Stream } from '../types.js';
import {
  linkOf,
  pickLargest,
  type DebridProvider,
  type DebridResolution,
} from './types.js';

const DEFAULT_BASE_URL = 'https://www.premiumize.me/api';

interface PmContent {
  type?: string;
  path?: string;
  size?: number;
  link?: string;
  stream_link?: string;
  filename?: string;
  transcode_status?: string;
}

interface PmResponse {
  status?: string;
  message?: string;
  content?: PmContent[];
}

export interface PremiumizeOptions {
  apiKey: string;
  baseUrl?: string;
  ttlSeconds?: number;
}

export class PremiumizeProvider implements DebridProvider {
  readonly id = 'premiumize' as const;
  readonly name = 'Premiumize';
  readonly tag = 'PM';
  readonly hosters = [
    'mega.nz',
    '1fichier.com',
    'rapidgator.net',
    'uploadflare.com',
    'pixeldrain.com',
    'gofile.io',
    'alldebrid.com',
    'real-debrid.com',
    'premiumize.me',
  ];

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly ttlSeconds: number;

  constructor(options: PremiumizeOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.ttlSeconds = options.ttlSeconds ?? 3 * 3_600;
  }

  supports(stream: Stream): boolean {
    return Boolean(this.apiKey) && linkOf(stream) !== null;
  }

  async resolve(stream: Stream, http: HttpClient): Promise<DebridResolution> {
    const link = linkOf(stream);
    if (!link) throw new Error('El stream no tiene enlace resoluble');

    const response = await http.getJson<PmResponse>(
      `${this.baseUrl}/transfer/direct?apikey=${encodeURIComponent(this.apiKey)}&src=${encodeURIComponent(link.value)}`,
    );

    if (response?.status !== 'success' || !response.content?.length) {
      throw new Error(response?.message ?? 'Premiumize no ha devuelto enlaces');
    }

    const best = pickLargest(
      response.content.map((entry) => ({
        ...entry,
        name: entry.filename ?? entry.path,
      })),
    );

    const url = best?.link ?? best?.stream_link;
    if (!url) throw new Error('Premiumize no ha devuelto un enlace directo');

    return {
      url,
      name: best?.filename ?? best?.path,
      size: best?.size,
      cached: true,
      expiresAt: Date.now() + this.ttlSeconds * 1000,
    };
  }

  async verify(http: HttpClient): Promise<{ ok: boolean; message: string }> {
    const account = await http.getJson<{ status?: string; message?: string; customer_id?: number; premium_until?: number }>(
      `${this.baseUrl}/account/info?apikey=${encodeURIComponent(this.apiKey)}`,
    );
    if (account?.status !== 'success') {
      return { ok: false, message: account?.message ?? 'Credenciales no válidas' };
    }
    return { ok: true, message: 'Conectado a Premiumize' };
  }
}
