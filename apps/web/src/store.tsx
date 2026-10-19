import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api } from './api';
import type {
  AppSettings,
  Catalog,
  HistoryEntry,
  InstalledAddon,
  Manifest,
  ProgressEntry,
  Profile,
  Watchlist,
} from './types';

export type Route =
  | { name: 'home' }
  | { name: 'discover' }
  | { name: 'search' }
  | { name: 'detail'; id: string; type: string }
  | { name: 'person'; person: string }
  | { name: 'player'; id: string; type: string; streamUrl?: string; streamName?: string; title?: string; poster?: string }
  | { name: 'lists' }
  | { name: 'history' }
  | { name: 'addons' }
  | { name: 'settings' }
  | { name: 'devices' }
  | { name: 'profiles' };

interface AppState {
  route: Route;
  navigate: (route: Route) => void;
  manifest: Manifest | null;
  catalogs: Catalog[];
  addons: InstalledAddon[];
  profiles: Profile[];
  activeProfile: Profile | null;
  activeProfileId: string;
  settings: AppSettings | null;
  lists: Watchlist[];
  history: HistoryEntry[];
  progress: ProgressEntry[];
  loading: boolean;
  error: string | null;
  refreshAll: () => Promise<void>;
  reloadLibrary: () => Promise<void>;
  setActiveProfile: (id: string, pin?: string) => Promise<void>;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  installAddon: (url: string) => Promise<void>;
  removeAddon: (id: string) => Promise<void>;
  refreshAddons: () => Promise<void>;
  toggleCatalog: (catalog: Catalog, hidden: boolean) => Promise<void>;
  moveCatalog: (catalog: Catalog, direction: -1 | 1) => Promise<void>;
  toggleWatchlistItem: (item: {
    id: string;
    type: string;
    name: string;
    poster?: string;
  }) => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [addons, setAddons] = useState<InstalledAddon[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState('');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reloadLibrary = useCallback(async () => {
    try {
      const [listsResult, historyResult, progressResult] = await Promise.all([
        api.lists(activeProfileId || undefined),
        api.history(activeProfileId || undefined),
        api.progress(activeProfileId || undefined),
      ]);
      setLists(listsResult);
      setHistory(historyResult);
      setProgress(progressResult);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, [activeProfileId]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [manifestResult, addonsResult, profilesResult, settingsResult] = await Promise.all([
        api.manifest(),
        api.addons(),
        api.profiles(),
        api.settings(),
      ]);
      setManifest(manifestResult);
      setCatalogs(addonsResult.catalogs);
      setAddons(addonsResult.addons);
      setProfiles(profilesResult.profiles);
      setActiveProfileId(profilesResult.activeProfileId);
      setSettings(settingsResult);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    void reloadLibrary();
  }, [reloadLibrary]);

  const setActiveProfile = useCallback(
    async (id: string, pin?: string) => {
      // El servidor responde 401/403 si el perfil esta protegido por PIN.
      await api.activateProfile(id, pin);
      setActiveProfileId(id);
    },
    [],
  );

  const saveSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const updated = await api.saveSettings(patch);
    setSettings(updated);
  }, []);

  const installAddon = useCallback(
    async (url: string) => {
      await api.installAddon(url);
      await refreshAll();
    },
    [refreshAll],
  );

  const removeAddon = useCallback(
    async (id: string) => {
      await api.removeAddon(id);
      await refreshAll();
    },
    [refreshAll],
  );

  const refreshAddons = useCallback(async () => {
    await api.refreshAddons();
    await refreshAll();
  }, [refreshAll]);

  const toggleCatalog = useCallback(
    async (catalog: Catalog, hidden: boolean) => {
      await api.saveCatalogPreferences([
        { key: `${catalog.type}:${catalog.id}`, hidden },
      ]);
      setCatalogs((current) =>
        current.map((entry) =>
          entry.type === catalog.type && entry.id === catalog.id ? { ...entry, hidden } : entry,
        ),
      );
    },
    [],
  );

  const moveCatalog = useCallback(
    async (catalog: Catalog, direction: -1 | 1) => {
      const ordered = [...catalogs].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      const index = ordered.findIndex(
        (entry) => entry.type === catalog.type && entry.id === catalog.id,
      );
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ordered.length) return;
      const swapped = ordered[target]!;
      await api.saveCatalogPreferences([
        { key: `${catalog.type}:${catalog.id}`, order: index },
        { key: `${swapped.type}:${swapped.id}`, order: target },
      ]);
      setCatalogs((current) =>
        current.map((entry) => {
          if (entry.type === catalog.type && entry.id === catalog.id) return { ...entry, order: index };
          if (entry.type === swapped.type && entry.id === swapped.id)
            return { ...entry, order: target };
          return entry;
        }),
      );
    },
    [catalogs],
  );

  const toggleWatchlistItem = useCallback(
    async (item: { id: string; type: string; name: string; poster?: string }) => {
      let list = lists[0];
      if (!list) {
        list = await api.createList('Favoritos', activeProfileId || undefined);
        setLists([list]);
      }
      await api.toggleListItem(
        list.id,
        { ...item, addedAt: Date.now() },
        activeProfileId || undefined,
      );
      await reloadLibrary();
    },
    [lists, activeProfileId, reloadLibrary],
  );

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [profiles, activeProfileId],
  );

  const value: AppState = {
    route,
    navigate: setRoute,
    manifest,
    catalogs,
    addons,
    profiles,
    activeProfile,
    activeProfileId,
    settings,
    lists,
    history,
    progress,
    loading,
    error,
    refreshAll,
    reloadLibrary,
    setActiveProfile,
    saveSettings,
    installAddon,
    removeAddon,
    refreshAddons,
    toggleCatalog,
    moveCatalog,
    toggleWatchlistItem,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp debe usarse dentro de AppProvider');
  return context;
}
