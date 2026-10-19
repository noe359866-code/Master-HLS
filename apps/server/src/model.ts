/**
 * Modelo de datos de la app (lo que se persiste en disco).
 *
 * inspired en las dos bases:
 *  - WuPlay: perfiles con ajustes por perfil, watchlists, historial y progreso,
 *    configurador de addons, orden/visibilidad de catalogos, idioma preferido.
 *  - Nuvio: colecciones/listas, "continuar viendo", repeticiones, atajos.
 */

import type { DebridProviderId, MetaPreview } from '@vibeflix/addon-engine';
import type { ProviderConfig } from '@vibeflix/scrapers';

export interface InstalledAddonRecord {
  id: string;
  name: string;
  manifestUrl: string;
  config?: Record<string, string>;
  installedAt: number;
  lastError?: string;
}

export interface Profile {
  id: string;
  name: string;
  /** Emoji o inicial que se muestra como avatar. */
  avatar: string;
  /** Color de acento del perfil. */
  color: string;
  /** PIN opcional para cambiar de perfil (WuPlay). */
  pin?: string;
  /** Idioma/región de fuentes elegido explícitamente al entrar al perfil. */
  contentLanguage?: string;
  /** Idioma de audio preferido (ISO 639-1). */
  audioLanguage?: string;
  /** Idioma de subtitulos preferido. */
  subtitleLanguage?: string;
  /** Reproducir automaticamente el siguiente episodio. */
  autoplay: boolean;
  /** Reproduccion automatica del primer stream disponible. */
  autoplayFirstStream: boolean;
  createdAt: number;
}

export interface Watchlist {
  id: string;
  name: string;
  description?: string;
  items: WatchlistItem[];
  createdAt: number;
  updatedAt: number;
}

export interface WatchlistItem {
  id: string;
  type: string;
  name: string;
  poster?: string;
  /** Episodio concreto (series). */
  episodeId?: string;
  addedAt: number;
}

export interface HistoryEntry {
  id: string;
  type: string;
  name: string;
  poster?: string;
  /** Ultimo stream usado (para "continuar donde lo dejaste"). */
  streamName?: string;
  lastWatchedAt: number;
}

export interface ProgressEntry {
  id: string;
  type: string;
  name: string;
  poster?: string;
  /** Duracion vista en segundos. */
  position: number;
  /** Duracion total en segundos. */
  duration: number;
  updatedAt: number;
  /** Tipo de medio: movie | series | episode. */
  mediaType: 'movie' | 'series' | 'episode';
  /** Episodio (para series). */
  season?: number;
  episode?: number;
}

/** Valoracion de un titulo ("Me gusta" / "No para mi"). */
export interface RatingEntry {
  id: string;
  type: string;
  name: string;
  poster?: string;
  rating: 'like' | 'dislike';
  /** Generos del titulo: se usan para las recomendaciones. */
  genres?: string[];
  updatedAt: number;
}

/** Dispositivo vinculado a la biblioteca compartida. */
export interface PairedDevice {
  id: string;
  name: string;
  /** Token que el cliente envia en `X-Vibe-Flix-Token`. */
  token: string;
  createdAt: number;
  lastSeenAt: number;
}

/** Codigo temporal para vincular otro dispositivo. */
export interface PairingCode {
  code: string;
  deviceName: string;
  createdAt: number;
  expiresAt: number;
}

export interface CatalogPreference {
  /** Clave `type:id` del catalogo. */
  key: string;
  order: number;
  hidden: boolean;
}

export interface AppSettings {
  /** Idioma de la interfaz. */
  language: string;
  /**
   * Metadata integrada: permite usar la app sin instalar ningun addon
   * (el "built-in metadata" de WuPlay / modo "essential" de NuvioTV).
   */
  builtInMetadata: boolean;
  /** Proveedor de la metadata integrada (compatible con Cinemeta). */
  builtInMetadataUrl: string;
  /** Imagen de fondo preferida en la pantalla de inicio. */
  theme: 'dark' | 'midnight' | 'amoled';
  /** Reproducir trailers en las tarjetas. */
  autoplayTrailers: boolean;
  /** Numero de elementos por fila en las listas. */
  itemsPerRow: number;
  /** Legado: las fuentes públicas siempre muestran el título, no el proveedor. */
  showAddonPrefix: boolean;
  /** Addons de streams por defecto para los que no中选择. */
  preferredStreamAddons: string[];
  /**
   * Debrid nativo (NuvioTV lo trae integrado; WuPlay lo delega en los addons).
   * El servidor resuelve los enlaces una vez y los cachea para todos los
   * dispositivos, manteniendo la decision de diseno "solo HTTP".
   */
  debrid: {
    /** Proveedor elegido ('' = desactivado). */
    provider: DebridProviderId | '';
    /** API key del proveedor. */
    apiKey: string;
  };
  /**
   * OpenSubtitles nativo (no hace falta instalar el addon de subtitulos).
   *
   * La API key se puede obtener gratis en opensubtitles.com y da acceso a la
   * busqueda y descarga de subtitulos desde el propio servidor.
   */
  opensubtitles: {
    /** API key de OpenSubtitles (vacio = servicio desactivado). */
    apiKey: string;
  };
  /** Omitir intro: deteccion nativa a partir de los subtitulos. */
  skipIntro: {
    /** Mostrar el boton de saltar intro. */
    enabled: boolean;
    /** Offset por defecto (segundos) cuando no se puede detectar la intro. */
    offsetSeconds: number;
  };
  /**
   * Filtros de contenido (WuPlay: "Content Filters").
   *
   * Se aplican a las pantallas de busqueda, generos y decadas, de modo que
   * el usuario puede limpiar el catalogo sin instalar nada.
   */
  filters: {
    /** Generos a mostrar (vacio = todos). */
    includeGenres: string[];
    /** Generos a ocultar. */
    excludeGenres: string[];
    /** Palabras clave a excluir. */
    excludeKeywords: string[];
    /** Puntuacion minima (0 = sin filtro). */
    minRating: number;
    /** Ocultar el contenido para adultos. */
    hideAdult: boolean;
  };
  /**
   * Scrapers nativos (addon de streams resuelto en el servidor).
   *
   * Siguen el patron de StreamFlix Reborn: varios proveedores que resuelven
   * el titulo por su cuenta. Cada proveedor se consulta en paralelo, se
   * aisan los fallos y el resultado se fusiona con los streams de los addons
   * instalados.
   */
  scrapers: {
    /** Activar el addon nativo de scrapers. */
    enabled: boolean;
    /** Ids de los proveedores ACTIVOS (vacio = todos). */
    providers: string[];
    /** Proveedores propios descritos por configuracion (sin codigo). */
    configs: ProviderConfig[];
  };
  /**
   * Menu de navegacion personalizable (WuPlay: "manage sidebar items").
   *
   * Guarda el orden y la visibilidad de cada seccion; es compartido por
   * todos los dispositivos (web, TV y addon).
   */
  sidebar: Array<{ id: string; hidden: boolean; order: number }>;
  /** Capacidades declaradas del dispositivo (afectan a la seleccion HLS). */
  device: {
    maxHeight: number;
    maxFrameRate: number;
    supportsHdr: boolean;
    supportsDolbyVision: boolean;
    preferredCodecs: string[];
  };
}

export interface AppData {
  version: number;
  addons: InstalledAddonRecord[];
  profiles: Profile[];
  activeProfileId: string;
  /** Watchlists por id de perfil. */
  watchlists: Record<string, Watchlist[]>;
  /** Historial por id de perfil. */
  history: Record<string, HistoryEntry[]>;
  /** Progreso por id de perfil. */
  progress: Record<string, ProgressEntry[]>;
  /** Valoraciones por id de perfil. */
  ratings: Record<string, RatingEntry[]>;
  /** Dispositivos vinculados (sincronizacion multi-dispositivo sin cuenta). */
  devices: PairedDevice[];
  /** Codigos de vinculacion pendientes de canjear. */
  pairings: PairingCode[];
  /** Preferencia de orden/visibilidad de catalogos. */
  catalogPreferences: CatalogPreference[];
  /** Historial de busquedas por id de perfil. */
  searchHistory: Record<string, Array<{ term: string; at: number }>>;
  settings: AppSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'es',
  builtInMetadata: true,
  builtInMetadataUrl: 'https://v3-cinemeta.strem.io',
  theme: 'dark',
  autoplayTrailers: true,
  itemsPerRow: 8,
  showAddonPrefix: false,
  preferredStreamAddons: [],
  debrid: { provider: '', apiKey: '' },
  opensubtitles: { apiKey: '' },
  skipIntro: { enabled: true, offsetSeconds: 90 },
  scrapers: {
    enabled: true,
    providers: [],
    configs: [],
  },
  filters: {
    includeGenres: [],
    excludeGenres: [],
    excludeKeywords: [],
    minRating: 0,
    hideAdult: false,
  },
  sidebar: [
    { id: 'home', hidden: false, order: 0 },
    { id: 'discover', hidden: false, order: 1 },
    { id: 'genres', hidden: false, order: 2 },
    { id: 'decades', hidden: false, order: 3 },
    { id: 'search', hidden: false, order: 4 },
    { id: 'lists', hidden: false, order: 5 },
    { id: 'history', hidden: false, order: 6 },
    { id: 'addons', hidden: false, order: 7 },
    { id: 'settings', hidden: false, order: 8 },
  ],
  device: {
    maxHeight: 1080,
    maxFrameRate: 60,
    supportsHdr: false,
    supportsDolbyVision: false,
    preferredCodecs: ['h264', 'hevc', 'av1'],
  },
};

export const DEFAULT_PROFILE: Omit<Profile, 'id' | 'createdAt'> = {
  name: 'Perfil principal',
  avatar: '👤',
  color: '#5b8cff',
  autoplay: true,
  autoplayFirstStream: false,
  audioLanguage: 'es',
  subtitleLanguage: 'es',
};

/**
 * Completa los campos que falten tras cargar un fichero de datos antiguo.
 *
 * El store hace un merge superficial: si el JSON guardado no tiene `settings`
 * nuevo (por ejemplo un `builtInMetadata` que no existia), se perderia.
 */
export function normalizeData(data: AppData): AppData {
  const settings = data.settings ?? ({} as AppSettings);
  data.settings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    debrid: {
      ...DEFAULT_SETTINGS.debrid,
      ...(settings.debrid ?? {}),
    },
    device: {
      ...DEFAULT_SETTINGS.device,
      ...(settings.device ?? {}),
    },
    opensubtitles: {
      ...DEFAULT_SETTINGS.opensubtitles,
      ...(settings.opensubtitles ?? {}),
    },
    skipIntro: {
      ...DEFAULT_SETTINGS.skipIntro,
      ...(settings.skipIntro ?? {}),
    },
    filters: {
      ...DEFAULT_SETTINGS.filters,
      ...(settings.filters ?? {}),
    },
    scrapers: {
      ...DEFAULT_SETTINGS.scrapers,
      ...(settings.scrapers ?? {}),
      providers: settings.scrapers?.providers ?? DEFAULT_SETTINGS.scrapers.providers,
      configs: Array.isArray(settings.scrapers?.configs) ? settings.scrapers.configs : [],
    },
    sidebar: settings.sidebar?.length ? settings.sidebar : DEFAULT_SETTINGS.sidebar,
  };
  data.addons ??= [];
  data.profiles ??= [];
  data.watchlists ??= {};
  data.history ??= {};
  data.progress ??= {};
  data.ratings ??= {};
  data.devices ??= [];
  data.pairings ??= [];
  data.catalogPreferences ??= [];
  data.searchHistory ??= {};
  if (!data.activeProfileId) data.activeProfileId = data.profiles[0]?.id ?? '';
  return data;
}

export function emptyData(): AppData {
  return {
    version: 1,
    addons: [],
    profiles: [],
    activeProfileId: '',
    watchlists: {},
    history: {},
    progress: {},
    ratings: {},
    devices: [],
    pairings: [],
    catalogPreferences: [],
    searchHistory: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Convierte una meta de Stremio en un item de watchlist. */
export function toWatchlistItem(meta: MetaPreview, episodeId?: string): WatchlistItem {
  return {
    id: meta.id,
    type: meta.type ?? 'movie',
    name: meta.name ?? meta.id,
    poster: meta.poster,
    episodeId,
    addedAt: Date.now(),
  };
}
