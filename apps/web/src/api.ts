import type {
  AppSettings,
  Catalog,
  DebridStatus,
  Decade,
  Genre,
  OpenSubtitleEntry,
  SearchHistoryEntry,
  SidebarItem,
  SkipIntroResult,
  HistoryEntry,
  InstalledAddon,
  Manifest,
  MasterInfo,
  Meta,
  ProgressEntry,
  Profile,
  Rating,
  Stream,
  Subtitle,
  Watchlist,
  WatchlistItem,
} from './types';
import { getDeviceToken, setDeviceToken } from './session';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getDeviceToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      // Token del dispositivo (biblioteca compartida entre dispositivos).
      ...(token ? { 'x-vibe-flix-token': token } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  // ------------------------------------------------------------- addon Stremio
  async manifest(): Promise<Manifest> {
    return request<Manifest>('/manifest.json');
  },

  async catalog(
    type: string,
    id: string,
    extra: Record<string, string | number> = {},
  ): Promise<{ metas: Meta[] }> {
    const suffix = Object.keys(extra).length
      ? `/${Object.entries(extra)
          .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
          .join('&')}`
      : '';
    return request<{ metas: Meta[] }>(`/catalog/${type}/${id}${suffix}.json`);
  },

  async meta(type: string, id: string): Promise<{ meta: Meta }> {
    return request<{ meta: Meta }>(`/meta/${type}/${encodeURIComponent(id)}.json`);
  },

  async streams(type: string, id: string): Promise<{ streams: Stream[] }> {
    return request<{ streams: Stream[] }>(`/stream/${type}/${encodeURIComponent(id)}.json`);
  },

  async subtitles(type: string, id: string): Promise<{ subtitles: Subtitle[] }> {
    return request<{ subtitles: Subtitle[] }>(`/subtitles/${type}/${encodeURIComponent(id)}.json`);
  },

  async search(term: string): Promise<{ metas: Meta[] }> {
    return request<{ metas: Meta[] }>(`/api/search${query({ q: term })}`);
  },

  // ----------------------------------------------------------------- addons
  async addons(): Promise<{
    addons: InstalledAddon[];
    catalogs: Catalog[];
    preferences: Array<{ key: string; order: number; hidden: boolean }>;
  }> {
    return request('/api/addons');
  },

  async installAddon(manifestUrl: string, config?: Record<string, string>): Promise<InstalledAddon> {
    const body = await request<{ addon: InstalledAddon }>('/api/addons', {
      method: 'POST',
      body: JSON.stringify({ manifestUrl, config }),
    });
    return body.addon;
  },

  async removeAddon(id: string): Promise<void> {
    await request(`/api/addons/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async refreshAddons(): Promise<InstalledAddon[]> {
    const body = await request<{ addons: InstalledAddon[] }>('/api/addons/refresh', { method: 'POST' });
    return body.addons;
  },

  async saveCatalogPreferences(
    preferences: Array<{ key: string; order?: number; hidden?: boolean }>,
  ): Promise<void> {
    await request('/api/catalogs', {
      method: 'PUT',
      body: JSON.stringify({ preferences }),
    });
  },

  // --------------------------------------------------------------- perfiles
  async profiles(): Promise<{ profiles: Profile[]; activeProfileId: string }> {
    return request('/api/profiles');
  },

  async createProfile(profile: Partial<Profile>): Promise<Profile> {
    const body = await request<{ profile: Profile }>('/api/profiles', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
    return body.profile;
  },

  async updateProfile(id: string, patch: Partial<Profile>): Promise<Profile> {
    const body = await request<{ profile: Profile }>(`/api/profiles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    return body.profile;
  },

  async deleteProfile(id: string): Promise<void> {
    await request(`/api/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async activateProfile(id: string, pin?: string): Promise<string> {
    const body = await request<{ activeProfileId: string }>(
      `/api/profiles/${encodeURIComponent(id)}/activate`,
      { method: 'POST', body: JSON.stringify({ pin }) },
    );
    return body.activeProfileId;
  },

  /** Ficha de persona con su filmografia (cast & crew). */
  async person(name: string): Promise<{ name: string; titles: Meta[] }> {
    return request<{ name: string; titles: Meta[] }>(`/api/person${query({ name })}`);
  },

  /** Titulos similares a partir de un id. */
  async similar(id: string, type: string): Promise<{ titles: Meta[] }> {
    return request<{ titles: Meta[] }>(`/api/similar${query({ id, type })}`);
  },

  // -------------------------------------------------------------- watchlists
  async lists(profileId?: string): Promise<Watchlist[]> {
    const body = await request<{ lists: Watchlist[] }>(`/api/lists${query({ profileId })}`);
    return body.lists;
  },

  async createList(name: string, profileId?: string): Promise<Watchlist> {
    const body = await request<{ list: Watchlist }>(`/api/lists${query({ profileId })}`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return body.list;
  },

  async deleteList(id: string, profileId?: string): Promise<void> {
    await request(`/api/lists/${encodeURIComponent(id)}${query({ profileId })}`, {
      method: 'DELETE',
    });
  },

  /** Anade varios titulos a una lista de una vez (guardar resultados). */
  async addListItems(listId: string, items: WatchlistItem[]): Promise<{ list: Watchlist }> {
    return request<{ list: Watchlist }>(`/api/lists/${listId}/items/batch`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  async toggleListItem(
    listId: string,
    item: WatchlistItem,
    profileId?: string,
  ): Promise<Watchlist | undefined> {
    const body = await request<{ list?: Watchlist }>(
      `/api/lists/${encodeURIComponent(listId)}/items${query({ profileId })}`,
      { method: 'POST', body: JSON.stringify({ item }) },
    );
    return body.list;
  },

  // ------------------------------------------------------- historial/progreso
  async history(profileId?: string): Promise<HistoryEntry[]> {
    const body = await request<{ history: HistoryEntry[] }>(`/api/history${query({ profileId })}`);
    return body.history;
  },

  async pushHistory(
    entry: { id: string; type: string; name: string; poster?: string; streamName?: string },
    profileId?: string,
  ): Promise<void> {
    await request(`/api/history${query({ profileId })}`, {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  },

  async clearHistory(profileId?: string): Promise<void> {
    await request(`/api/history${query({ profileId })}`, { method: 'DELETE' });
  },

  async progress(profileId?: string): Promise<ProgressEntry[]> {
    const body = await request<{ progress: ProgressEntry[] }>(`/api/progress${query({ profileId })}`);
    return body.progress;
  },

  async saveProgress(entry: Partial<ProgressEntry> & { id: string }, profileId?: string): Promise<void> {
    await request(`/api/progress${query({ profileId })}`, {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  },

  // ------------------------------------------------------------------ ajustes
  async settings(): Promise<AppSettings> {
    const body = await request<{ settings: AppSettings }>('/api/settings');
    return body.settings;
  },

  async saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const body = await request<{ settings: AppSettings }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    return body.settings;
  },

  // ------------------------------------------------------------- dispositivos

  /** Estado de vinculacion del dispositivo. */
  async session(): Promise<{
    pairingRequired: boolean;
    authenticated: boolean;
    device: { id: string; name: string } | null;
  }> {
    return request('/api/session');
  },

  /** Dispositivos vinculados al servidor. */
  async devices(): Promise<{
    pairingRequired: boolean;
    device: { id: string; name: string; createdAt: number } | null;
    devices: Array<{
      id: string;
      name: string;
      createdAt: number;
      lastSeenAt: number;
      current: boolean;
    }>;
  }> {
    return request('/api/devices');
  },

  /** Crea un codigo de vinculacion y vincula este dispositivo. */
  async createPairing(name: string): Promise<{ code: string; expiresAt: number; token: string }> {
    const body = await request<{ code: string; expiresAt: number; token: string }>('/api/pairing', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    setDeviceToken(body.token);
    return body;
  },

  /** Canjea un codigo de vinculacion por el token de este dispositivo. */
  async claimPairing(code: string, name: string): Promise<{ token: string }> {
    const body = await request<{ token: string }>('/api/pairing/claim', {
      method: 'POST',
      body: JSON.stringify({ code, name }),
    });
    setDeviceToken(body.token);
    return body;
  },

  /** Desvincula un dispositivo. */
  async unlinkDevice(id: string): Promise<void> {
    await request(`/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  /** Valoraciones del perfil activo. */
  async ratings(): Promise<Rating[]> {
    const body = await request<{ ratings: Rating[] }>('/api/ratings');
    return body.ratings;
  },

  /** Guarda (o quita con `rating: ''`) la valoracion de un titulo. */
  async rate(entry: {
    id: string;
    type: string;
    name: string;
    poster?: string;
    rating: 'like' | 'dislike' | '';
    genres?: string[];
  }): Promise<Rating[]> {
    const body = await request<{ ratings: Rating[] }>('/api/ratings', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
    return body.ratings;
  },

  /** Recomendaciones personalizadas segun las valoraciones. */
  async recommended(): Promise<Meta[]> {
    const body = await request<{ titles: Meta[] }>('/api/recommended');
    return body.titles;
  },

  /** Estado del proveedor de debrid configurado en el servidor. */
  async debridStatus(): Promise<DebridStatus> {
    const body = await request<{ debrid: DebridStatus }>('/api/debrid');
    return body.debrid;
  },

  /** Comprueba las credenciales del proveedor de debrid. */
  async testDebrid(): Promise<{ ok: boolean; message: string }> {
    return request<{ ok: boolean; message: string }>('/api/debrid/test', { method: 'POST' });
  },

  // ------------------------------------------------- subtitulos y omitir intro

  /** Segmento saltable (intro/recap) detectado por el servidor. */
  async skipIntro(params: {
    type?: string;
    id?: string;
    imdbId?: string;
    season?: number;
    episode?: number;
    duration?: number;
  }): Promise<SkipIntroResult> {
    return request<SkipIntroResult>(`/api/skip-intro${query({ ...params })}`);
  },

  /** Busca subtitulos en OpenSubtitles (nativo, sin addon). */
  async openSubtitles(params: {
    imdbId?: string;
    season?: number;
    episode?: number;
    lang?: string;
    q?: string;
  }): Promise<{ enabled: boolean; subtitles: OpenSubtitleEntry[] }> {
    return request<{ enabled: boolean; subtitles: OpenSubtitleEntry[] }>(
      `/api/opensubtitles${query({ ...params })}`,
    );
  },

  /** Descarga un subtitulo y devuelve su URL en WebVTT. */
  async downloadOpenSubtitle(fileId: number): Promise<{ path: string; url: string }> {
    return request<{ path: string; url: string }>(
      `/api/opensubtitles/download${query({ fileId })}`,
    );
  },

  // ------------------------------------------------- generos, decadas y menu

  /** Generos y decadas de las pantallas de contenido. */
  async genres(): Promise<{ genres: Genre[]; decades: Decade[] }> {
    return request<{ genres: Genre[]; decades: Decade[] }>('/api/genres');
  },

  /**
   * Contenido por genero, decada o texto.
   *
   * El servidor aplica los filtros de contenido configurados.
   */
  async browse(params: {
    type?: string;
    genre?: string;
    decade?: string;
    q?: string;
    skip?: number;
  }): Promise<{ metas: Meta[]; source: string; total?: number }> {
    return request<{ metas: Meta[]; source: string; total?: number }>(
      `/api/browse${query({ ...params })}`,
    );
  },

  /** Historial de busquedas del perfil. */
  async searchHistory(): Promise<{ history: SearchHistoryEntry[] }> {
    return request<{ history: SearchHistoryEntry[] }>('/api/search-history');
  },

  /** Anade una busqueda al historial. */
  async addSearchHistory(term: string): Promise<{ history: SearchHistoryEntry[] }> {
    return request<{ history: SearchHistoryEntry[] }>('/api/search-history', {
      method: 'POST',
      body: JSON.stringify({ term }),
    });
  },

  /** Vacia el historial de busquedas. */
  async clearSearchHistory(): Promise<{ history: SearchHistoryEntry[] }> {
    return request<{ history: SearchHistoryEntry[] }>('/api/search-history', {
      method: 'DELETE',
    });
  },

  /** Personalizacion del menu de navegacion. */
  async saveSidebar(items: SidebarItem[]): Promise<{ items: SidebarItem[] }> {
    return request<{ items: SidebarItem[] }>('/api/sidebar', {
      method: 'PUT',
      body: JSON.stringify({ items }),
    });
  },

  // --------------------------------------------------------------------- HLS
  async masterInfo(
    url: string,
    options: { headers?: Record<string, string>; maxHeight?: number; audioLang?: string } = {},
  ): Promise<MasterInfo> {
    const encodedHeaders = options.headers
      ? btoa(unescape(encodeURIComponent(JSON.stringify(options.headers))))
      : undefined;
    return request<MasterInfo>(
      `/hls/master${query({
        url,
        h: encodedHeaders,
        maxHeight: options.maxHeight,
        audioLang: options.audioLang,
      })}`,
    );
  },
};
