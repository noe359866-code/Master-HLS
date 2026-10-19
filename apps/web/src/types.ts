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

/** Nivel de madurez máximo del control parental del perfil. */
export type MaturityLevel = 'off' | 'kids' | 'teen' | 'adult';

/** Reglas de control parental de un perfil. */
export interface ParentalSettings {
  maxMaturity: MaturityLevel;
  blockedGenres: string[];
  requirePin: boolean;
}

/** Parche de perfil para la API (`parental: null` desactiva el control). */
export type ProfilePatch = Omit<Partial<Profile>, 'parental'> & {
  currentPin?: string;
  parental?: ParentalSettings | null;
};

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  color: string;
  pin?: string;
  /** Control parental del perfil (NuvioTV: ParentalGuide). Ausente = off. */
  parental?: ParentalSettings;
  /** Idioma/región de fuentes elegido en el perfil. */
  contentLanguage?: string;
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
  /** Modo de experiencia (NuvioTV: Essential / Advanced). */
  uiMode: 'essential' | 'advanced';
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
    maxBandwidthMbps: number;
  };
  /** Reproduccion: techo de bitrate, buffer, cuenta atras, reanudacion... */
  playback: {
    maxBitrateMbps: number;
    bufferSeconds: number;
    autoplayCountdown: number;
    resume: boolean;
    videoScale: 'contain' | 'cover' | 'fill' | 'zoom';
    thumbnails: boolean;
    speed: number;
    progressIntervalSeconds: number;
  };
  /** Apariencia y comportamiento de los subtitulos. */
  subtitles: {
    enabled: boolean;
    size: number;
    color: string;
    opacity: number;
    backgroundOpacity: number;
    edge: 'none' | 'outline' | 'shadow' | 'raised';
    verticalPosition: number;
    bold: boolean;
    cleanSdh: boolean;
    delayMs: number;
    onlyForForeignAudio: boolean;
    customRenderer: boolean;
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
  /** Scrapers nativos: addon de streams resuelto en el servidor. */
  scrapers: {
    /** Activar el addon nativo de scrapers. */
    enabled: boolean;
    /** Ids de los proveedores activos (vacio = todos). */
    providers: string[];
    /** Proveedores propios descritos por configuracion. */
    configs: ProviderConfig[];
  };
  /** Filtros de contenido (WuPlay: Content Filters). */
  filters: {
    includeGenres: string[];
    excludeGenres: string[];
    excludeKeywords: string[];
    minRating: number;
    hideAdult: boolean;
  };
  /** Menu de navegacion personalizable (mostrar/ocultar y orden). */
  sidebar: SidebarItem[];
}

/** Elemento del menu de navegacion. */
export interface SidebarItem {
  id: string;
  hidden: boolean;
  order: number;
}

/** Genero de la pantalla de generos. */
export interface Genre {
  id: string;
  name: string;
  /** Valor canonico que entiende el extra `genre` de los addons. */
  catalog: string;
  emoji: string;
  color: string;
}

/** Decada de la pantalla de decadas. */
export interface Decade {
  id: string;
  label: string;
  from: number;
  to: number;
}

/** Entrada del historial de busquedas. */
export interface SearchHistoryEntry {
  term: string;
  at: number;
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

/** Proveedor de scrapers descrito por configuracion (sin codigo). */
export interface ProviderConfig {
  id: string;
  name: string;
  types: Array<'movie' | 'series' | 'episode' | 'anime' | 'dorama'>;
  languages?: string[];
  region?: string;
  /** URL de busqueda con las plantillas {title}, {year}, {season}... */
  searchUrl?: string;
  /** URL del item con {id} = id encontrado en la búsqueda. */
  itemUrl?: string;
  /** Grupo 1 = id, grupo 2 opcional = título. */
  itemPattern?: string;
  /** URL del episodio concreto, con {season}/{episode}. */
  episodeUrl?: string;
  /** Patrón de la ficha que captura la URL del episodio (grupo 1). */
  episodePattern?: string;
  /** Expresiones regulares que extraen la URL del stream. */
  streamPatterns?: string[];
  /** Usar el resolutor de embeds generico. */
  useEmbedResolver?: boolean;
  /** Calidad por defecto. */
  defaultQuality?: string;
  /** Cabeceras extra al descargar. */
  headers?: Record<string, string>;
}

/** Descripcion de un proveedor de scrapers. */
export interface ScraperProviderInfo {
  id: string;
  name: string;
  region: string;
  languages: string[];
  types: string[];
  verification: 'mock-tested' | 'not-tested';
  liveVerified: boolean;
  coverage: 'full' | 'partial';
  limitations: string[];
}

/** Cobertura real de los adaptadores frente al inventario de StreamFlix. */
export interface ScraperCoverage {
  upstreamVod: number;
  ported: number;
  pending: number;
  partial: string[];
  mockTested: number;
  liveVerified: number;
  extraProviders: string[];
  pendingProviders: Array<{
    file: string;
    languages: string[];
    media: string[];
    upstreamUrl: string;
  }>;
}

/** Estado de los scrapers nativos en el servidor. */
export interface ScraperStatus {
  enabled: boolean;
  providers: ScraperProviderInfo[];
  available: ScraperProviderInfo[];
  configs: ProviderConfig[];
  selected: string[];
  coverage?: ScraperCoverage;
  upstreamInventory?: string;
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
  /** Hojas de sprites para previsualizar el salto (`EXT-X-IMAGE-STREAM-INF`). */
  imageStreams: Array<{
    uri: string;
    width?: number;
    height?: number;
    tilesX?: number;
    tilesY?: number;
    durationSeconds?: number;
  }>;
  selected: {
    variant: { uri: string; height?: number; name?: string };
    audio?: { name: string; language?: string; uri?: string };
    subtitles?: { name: string; language?: string; uri?: string };
    reason: string;
  } | null;
  url: string;
}

/** Recorte de una hoja de sprites (lo que devuelve `/hls/thumbnails`). */
export interface Thumbnail {
  url: string;
  startMs: number;
  endMs: number;
  x: number;
  y: number;
  width: number;
  height: number;
  sheetWidth?: number;
  sheetHeight?: number;
}

/** Cueva de subtitulo ya normalizada por el proxy (`/api/subtitles/proxy`). */
export interface ProxyCue {
  id?: string;
  startMs: number;
  endMs: number;
  lines: string[];
  settings?: string;
}

/** Respuesta del proxy de subtitulos en modo JSON. */
export interface ProxySubtitleResult {
  cues: ProxyCue[];
  count: number;
  encoding: string;
  guessedEncoding: boolean;
  sourceFormat: 'vtt' | 'srt' | 'ass' | 'ssa' | 'unknown';
  sdh: boolean;
  repaired: boolean;
  language?: string;
  offsetMs?: number;
  cleanSdh?: boolean;
}
