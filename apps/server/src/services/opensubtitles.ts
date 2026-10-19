/**
 * Cliente nativo de OpenSubtitles (API REST v1).
 *
 * A diferencia del addon `opensubtitles-v3.strem.io` (que obliga a tener un
 * addon instalado), aqui la integracion es **nativa**: el servidor habla
 * directamente con OpenSubtitles y cachea el resultado, de modo que todos los
 * clientes (web, Android TV y el propio addon Stremio) obtienen los mismos
 * subtitulos.
 *
 * - Requiere una API key gratuita de OpenSubtitles (Ajustes de la app).
 * - La busqueda acepta `imdb_id` (con temporada/episodio) o texto libre.
 * - La descarga devuelve el subtitulo en SRT; el servidor lo convierte a
 *   WebVTT, que es lo que reproducen los navegadores y ExoPlayer.
 */

import { gunzipSync } from 'node:zlib';

import { parseSubtitles, toSrt, toWebVtt, type SubtitleCue } from '@vibeflix/skip-intro';

/** Opciones del servicio. */
export interface OpenSubtitlesOptions {
  /** API key de OpenSubtitles (sin ella el servicio queda desactivado). */
  apiKey: string;
  /** User-Agent que exige OpenSubtitles. */
  userAgent?: string;
  /** URL base de la API (para tests). */
  baseUrl?: string;
  /** `fetch` inyectable (para tests). */
  fetchImpl?: typeof fetch;
}

/** Un subtitulo disponible en OpenSubtitles. */
export interface OpenSubtitleEntry {
  /** Identificador del fichero (se usa para descargar). */
  fileId: number;
  /** Nombre del fichero. */
  fileName: string;
  /** Codigo de idioma (ISO 639-1). */
  language: string;
  /** Nombre del idioma. */
  languageName: string;
  /** Numero de descargas (util para ordenar). */
  downloadCount: number;
  /** true si es para sordos. */
  hearingImpaired: boolean;
  /** Titulo de la pelicula o serie. */
  title: string;
  /** Version del release (por ejemplo `1080p`). */
  release: string;
}

/** Resultado de la descarga. */
export interface DownloadedSubtitle {
  /** Subtitulo normalizado. */
  cues: SubtitleCue[];
  /** Version en WebVTT. */
  vtt: string;
  /** Version en SRT. */
  srt: string;
  /** Formato original detectado. */
  format: 'srt' | 'vtt';
}

const DEFAULT_BASE_URL = 'https://api.opensubtitles.com/api/v1';
const DEFAULT_USER_AGENT = 'VibeFlix v1.0.0';

export class OpenSubtitlesService {
  private readonly apiKey: string;
  private readonly userAgent: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenSubtitlesOptions) {
    this.apiKey = options.apiKey?.trim() ?? '';
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** true si hay API key configurada. */
  get enabled(): boolean {
    return this.apiKey.length > 0;
  }

  private headers(): Record<string, string> {
    return {
      'api-key': this.apiKey,
      'user-agent': this.userAgent,
      accept: 'application/json',
    };
  }

  /**
   * Busca subtitulos.
   *
   * Con `imdbId` se busca por identificador de IMDb (el caso normal: el
   * titulo ya viene del catalogo); si no, se busca por texto.
   */
  async search(params: {
    imdbId?: string;
    season?: number;
    episode?: number;
    language?: string;
    query?: string;
  }): Promise<OpenSubtitleEntry[]> {
    if (!this.enabled) return [];

    const query = new URLSearchParams();
    if (params.imdbId) {
      // La API oficial espera el id numerico (`1373213`), no el `tt1373213`
      // que usan los addons y los catálogos.
      query.set('imdb_id', params.imdbId.replace(/^tt/i, ''));
    }
    if (params.season !== undefined) query.set('season_number', String(params.season));
    if (params.episode !== undefined) query.set('episode_number', String(params.episode));
    if (params.language) query.set('language_codes', params.language);
    if (!params.imdbId && params.query) query.set('query', params.query);
    if (!query.toString()) return [];

    const response = await this.fetchImpl(`${this.baseUrl}/subtitles?${query.toString()}`, {
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error(`OpenSubtitles: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    return normalizeSearchResponse(payload);
  }

  /** Descarga un subtitulo y lo normaliza (SRT/WebVTT). */
  async download(fileId: number): Promise<DownloadedSubtitle> {
    if (!this.enabled) throw new Error('OpenSubtitles: falta la API key');

    const response = await this.fetchImpl(`${this.baseUrl}/download/${fileId}`, {
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error(`OpenSubtitles: HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const raw = decodeMaybeGzip(buffer).toString('utf8');
    const cues = parseSubtitles(raw);
    if (!cues.length) throw new Error('OpenSubtitles: el subtitulo no tiene contenido');

    return {
      cues,
      vtt: toWebVtt(cues),
      srt: toSrt(cues),
      format: raw.trimStart().toUpperCase().startsWith('WEBVTT') ? 'vtt' : 'srt',
    };
  }
}

/** Descomprime si el cuerpo viene en gzip (OpenSubtitles sirve el .gz del fichero). */
function decodeMaybeGzip(buffer: Buffer): Buffer {
  if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      return gunzipSync(buffer);
    } catch {
      return buffer;
    }
  }
  return buffer;
}

/** Normaliza la respuesta de la API (que anade metadata yvaries). */
export function normalizeSearchResponse(payload: unknown): OpenSubtitleEntry[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  const entries: OpenSubtitleEntry[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const attributes = (item as { attributes?: Record<string, unknown> }).attributes;
    if (!attributes || typeof attributes !== 'object') continue;

    const language = attributes['language'] as { code?: string; name?: string } | undefined;
    const files = Array.isArray(attributes['files']) ? attributes['files'] : [];
    const downloadCount = Number(attributes['download_count'] ?? 0);

    for (const file of files) {
      if (!file || typeof file !== 'object') continue;
      const fileId = Number((file as { id?: unknown }).id);
      if (!Number.isFinite(fileId)) continue;
      entries.push({
        fileId,
        fileName: String((file as { file_name?: unknown }).file_name ?? `subtitulo-${fileId}`),
        language: language?.code ?? 'und',
        languageName: language?.name ?? 'Desconocido',
        downloadCount,
        hearingImpaired: Boolean(attributes['hearing_impaired']),
        title: String(attributes['movie_name'] ?? attributes['series_title'] ?? ''),
        release: String(attributes['release'] ?? ''),
      });
    }
  }

  // Mas descargas primero; a igualdad, el idioma pedido y el nombre del
  // fichero mas corto (los releases "forced" suelen ser los mejores).
  entries.sort((a, b) => {
    if (b.downloadCount !== a.downloadCount) return b.downloadCount - a.downloadCount;
    return a.fileName.length - b.fileName.length;
  });
  return entries;
}
