/**
 * Tipos del protocolo de addons Stremio.
 *
 * Ref: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api.md
 * El modelado es deliberadamente tolerante: los addons del ecosistema son
 * inconsistentes entre si (mismo campo con string o array, claves ausentes,
 * `behaviorHints` incompletos), igual que documenta NuvioTV en sus DTOs.
 */

export type ContentType = 'movie' | 'series' | 'tv' | 'channel' | 'other';

export const CONTENT_TYPES: ContentType[] = ['movie', 'series', 'tv', 'channel', 'other'];

/** Addon tal y como se instala: una URL de manifest. */
export interface AddonTransport {
  /** URL base del manifest, con su query original (api keys, configuracion). */
  manifestUrl: string;
  /** Parametros de configuracion fusionados con los del manifest (p.ej. token). */
  config?: Record<string, string>;
}

export interface CatalogExtraDescriptor {
  name: string;
  options?: string[];
  isRequired?: boolean;
  optionsLimit?: number;
}

export interface CatalogDescriptor {
  type: string;
  id: string;
  name: string;
  extra?: CatalogExtraDescriptor[];
  extraSupported?: string[];
  extraRequired?: string[];
  pageSize?: number;
  page?: number;
  genres?: string[];
  showInHome?: boolean;
  [key: string]: unknown;
}

export interface BehaviorHints {
  configurable?: boolean;
  configurationRequired?: boolean;
  configurationMandatory?: boolean;
  newEpisodeNotifications?: boolean;
  adult?: boolean;
  p2p?: boolean;
  countryWhitelist?: string[];
  proxyHeaders?: {
    request?: Record<string, string>;
    response?: Record<string, string>;
  };
  defaultVideoId?: string;
  hasScheduledVideos?: boolean;
  [key: string]: unknown;
}

export interface ResourceDescriptor {
  name: string;
  types?: string[];
  idPrefixes?: string[];
  extra?: Array<{ name: string; options?: string[]; isRequired?: boolean }>;
  [key: string]: unknown;
}

export interface StremioAddonsConfig {
  issuer?: string;
  signature?: string;
  [key: string]: unknown;
}

/** Manifest de un addon. */
export interface AddonManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  logo?: string;
  background?: string;
  catalogs?: CatalogDescriptor[];
  resources?: Array<string | ResourceDescriptor>;
  types?: string[];
  idPrefixes?: string[];
  behaviorHints?: BehaviorHints;
  stremioAddonsConfig?: StremioAddonsConfig;
  language?: string;
  configVersion?: number;
  /** Marca temporal de la ultima lectura del manifest (cache). */
  fetchedAt?: number;
}

export interface MetaPreview {
  id: string;
  type?: string;
  name?: string;
  poster?: string;
  posterShape?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  genres?: string[];
  runtime?: string;
  status?: string;
  released?: string;
  country?: string;
  language?: string;
  awards?: string;
  imdb_id?: string;
  slug?: string;
  landscapePoster?: string;
  director?: string | string[];
  writer?: string | string[];
  writers?: string | string[];
  cast?: string | string[];
  links?: MetaLink[];
  trailers?: MetaTrailer[];
  videos?: Video[];
  behaviorHints?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MetaLink {
  name: string;
  category: string;
  url?: string;
}

export interface MetaTrailer {
  source?: string;
  type?: string;
  name?: string;
  ytId?: string;
  lang?: string;
}

export interface Video {
  id: string;
  title?: string;
  name?: string;
  released?: string;
  thumbnail?: string;
  season?: number;
  episode?: number;
  number?: number;
  overview?: string;
  description?: string;
  runtime?: string;
  rating?: string;
  available?: boolean;
  streams?: Stream[];
  subtitles?: Subtitle[];
  [key: string]: unknown;
}

export interface StreamBehaviorHints {
  notWebReady?: boolean;
  bingeGroup?: string;
  countryWhitelist?: string[];
  proxyHeaders?: {
    request?: Record<string, string>;
    response?: Record<string, string>;
  };
  videoHash?: string;
  videoSize?: number;
  filename?: string;
  audioDelayMs?: number;
  [key: string]: unknown;
}

export interface Subtitle {
  id?: string;
  url?: string;
  lang?: string;
  language?: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

/** Un stream del protocolo Stremio (compatible con `behaviorHints` de Nuvio/WuPlay). */
export interface Stream {
  name?: string;
  title?: string;
  description?: string;
  url?: string;
  ytId?: string;
  infoHash?: string;
  fileIdx?: number;
  externalUrl?: string;
  sources?: string[];
  subtitles?: Subtitle[];
  behaviorHints?: StreamBehaviorHints;
  [key: string]: unknown;
}

export interface CatalogResponse {
  metas: MetaPreview[];
}

export interface MetaResponse {
  meta: MetaDetail | null;
}

export interface MetaDetail extends MetaPreview {
  videos?: Video[];
  app_extras?: {
    cast?: Array<{ name: string; character?: string; photo?: string; tmdbId?: number }>;
    directors?: Array<{ name: string; character?: string; photo?: string; tmdbId?: number }>;
    writers?: Array<{ name: string; character?: string; photo?: string; tmdbId?: number }>;
    [key: string]: unknown;
  };
}

export interface StreamResponse {
  streams: Stream[];
}

export interface SubtitleResponse {
  subtitles: Subtitle[];
}

export interface AddonCatalogRequest {
  type: string;
  id: string;
  extra?: Record<string, string>;
}

export interface AddonMetaRequest {
  type: string;
  id: string;
}

export interface AddonStreamRequest {
  type: string;
  id: string;
}

export interface AddonSubtitleRequest {
  type: string;
  id: string;
}

/** Error normalizado de un addon (se usa para aislar fallos en el fan-out). */
export class AddonError extends Error {
  readonly addonId: string;
  readonly status?: number;
  override readonly cause?: unknown;

  constructor(addonId: string, message: string, options?: { status?: number; cause?: unknown }) {
    super(message);
    this.name = 'AddonError';
    this.addonId = addonId;
    this.status = options?.status;
    this.cause = options?.cause;
  }
}
