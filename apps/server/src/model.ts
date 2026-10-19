/**
 * Modelo de datos de la app (lo que se persiste en disco).
 *
 * inspired en las dos bases:
 *  - WuPlay: perfiles con ajustes por perfil, watchlists, historial y progreso,
 *    configurador de addons, orden/visibilidad de catalogos, idioma preferido.
 *  - Nuvio: colecciones/listas, "continuar viendo", repeticiones, atajos.
 */

import type { DebridProviderId, MetaPreview } from '@master-hls/addon-engine';

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
  /** Token que el cliente envia en `X-Master-Hls-Token`. */
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
  /** Mostrar el prefijo del addon en el nombre del stream. */
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
  settings: AppSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'es',
  builtInMetadata: true,
  builtInMetadataUrl: 'https://v3-cinemeta.strem.io',
  theme: 'dark',
  autoplayTrailers: true,
  itemsPerRow: 8,
  showAddonPrefix: true,
  preferredStreamAddons: [],
  debrid: { provider: '', apiKey: '' },
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
