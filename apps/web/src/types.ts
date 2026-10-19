/** Tipos compartidos con el servidor (subconjunto del protocolo Stremio). */

export interface Meta {
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
  director?: string[];
  writer?: string[];
  cast?: string[];
  links?: Array<{ name: string; category: string; url?: string }>;
  trailers?: Array<{ ytId?: string; source?: string; name?: string }>;
  videos?: Video[];
  behaviorHints?: { defaultVideoId?: string };
  app_extras?: {
    cast?: Array<{ name: string; character?: string; photo?: string }>;
    directors?: Array<{ name: string; photo?: string }>;
    writers?: Array<{ name: string; photo?: string }>;
  };
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
}

export interface Stream {
  name?: string;
  title?: string;
  description?: string;
  url?: string;
  ytId?: string;
  externalUrl?: string;
  infoHash?: string;
  fileIdx?: number;
  sources?: string[];
  subtitles?: Subtitle[];
  behaviorHints?: {
    notWebReady?: boolean;
    bingeGroup?: string;
    proxyHeaders?: { request?: Record<string, string>; response?: Record<string, string> };
    filename?: string;
    videoSize?: number;
  };
}

export interface Subtitle {
  id?: string;
  url?: string;
  lang?: string;
  language?: string;
  headers?: Record<string, string>;
}

export interface Catalog {
  type: string;
  id: string;
  name: string;
  extra?: Array<{ name: string; options?: string[] }>;
  extraSupported?: string[];
  extraRequired?: string[];
  pageSize?: number;
  showInHome?: boolean;
  addonIds?: string[];
  order?: number;
  hidden?: boolean;
}

export interface Manifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  logo?: string;
  background?: string;
  types: string[];
  idPrefixes: string[];
  resources: string[];
  catalogs: Catalog[];
  behaviorHints?: { configurable?: boolean };
}

export interface InstalledAddon {
  id: string;
  name: string;
  version: string;
  manifestUrl: string;
  catalogs: Catalog[];
  supports: { catalog: boolean; meta: boolean; stream: boolean; subtitles: boolean };
  installedAt: number;
}

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  color: string;
  pin?: string;
  audioLanguage?: string;
  subtitleLanguage?: string;
  autoplay: boolean;
  autoplayFirstStream: boolean;
  createdAt: number;
}

export interface WatchlistItem {
  id: string;
  type: string;
  name: string;
  poster?: string;
  episodeId?: string;
  addedAt: number;
}

export interface Watchlist {
  id: string;
  name: string;
  description?: string;
  items: WatchlistItem[];
  createdAt: number;
  updatedAt: number;
}

export interface HistoryEntry {
  id: string;
  type: string;
  name: string;
  poster?: string;
  streamName?: string;
  lastWatchedAt: number;
}

export interface ProgressEntry {
  id: string;
  type: string;
  name: string;
  poster?: string;
  position: number;
  duration: number;
  mediaType: 'movie' | 'series' | 'episode';
  season?: number;
  episode?: number;
  updatedAt: number;
}

export interface AppSettings {
  language: string;
  /** Metadata integrada: usar la app sin instalar addons. */
  builtInMetadata: boolean;
  /** Proveedor de la metadata integrada (compatible con Cinemeta). */
  builtInMetadataUrl: string;
  theme: 'dark' | 'midnight' | 'amoled';
  autoplayTrailers: boolean;
  itemsPerRow: number;
  showAddonPrefix: boolean;
  preferredStreamAddons: string[];
  /** Debrid nativo: el servidor resuelve los enlaces premium. */
  debrid: {
    provider: 'realdebrid' | 'alldebrid' | 'torbox' | 'premiumize' | '';
    apiKey: string;
  };
  device: {
    maxHeight: number;
    maxFrameRate: number;
    supportsHdr: boolean;
    supportsDolbyVision: boolean;
    preferredCodecs: string[];
  };
  /** OpenSubtitles nativo (busqueda y descarga desde el servidor). */
  opensubtitles: {
    apiKey: string;
  };
  /** Omitir intro: deteccion nativa a partir de los subtitulos. */
  skipIntro: {
    enabled: boolean;
    offsetSeconds: number;
  };
}

/** Respuesta del servidor con el segmento saltable. */
export interface SkipIntroResult {
  /** false si el usuario desactivó la función en los ajustes. */
  enabled: boolean;
  segment: SkipSegment;
  source: string;
  cues: number;
}

/** Segmento saltable (intro o recap) detectado por el servidor. */
export interface SkipSegment {
  startMs: number;
  endMs: number;
  kind: 'intro' | 'recap';
  confidence: number;
  source: 'subtitles' | 'fallback';
}

/** Subtitulo disponible en OpenSubtitles. */
export interface OpenSubtitleEntry {
  fileId: number;
  fileName: string;
  language: string;
  languageName: string;
  downloadCount: number;
  hearingImpaired: boolean;
  title: string;
  release: string;
}

/** Valoracion de un titulo ("Me gusta" / "No para mi"). */
export interface Rating {
  id: string;
  type: string;
  name: string;
  poster?: string;
  rating: 'like' | 'dislike';
  genres?: string[];
  updatedAt: number;
}

/** Estado del servicio de debrid en el servidor. */
export interface DebridStatus {
  enabled: boolean;
  provider: 'realdebrid' | 'alldebrid' | 'torbox' | 'premiumize' | null;
  name: string | null;
  tag: string | null;
  hosters: string[];
  lastError?: string;
}

export interface MasterInfo {
  isMaster: boolean;
  variants: Array<{
    uri: string;
    width?: number;
    height?: number;
    frameRate?: number;
    bandwidth?: number;
    codecs?: string[];
    videoRange?: string;
    name?: string;
  }>;
  renditions: Array<{
    type: string;
    groupId: string;
    name: string;
    language?: string;
    uri?: string;
    isDefault: boolean;
    channels?: string;
  }>;
  selected: {
    variant: { uri: string; height?: number; name?: string };
    audio?: { name: string; language?: string; uri?: string };
    subtitles?: { name: string; language?: string; uri?: string };
    reason: string;
  } | null;
  url: string;
}
