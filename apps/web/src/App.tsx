import { useEffect, useMemo, useState } from 'react';

import { api } from './api';
import { useSpatialNavigation } from './navigation';
import { useApp } from './store';
import { ErrorState, Loader } from './components/ui';
import { HomeScreen } from './screens/Home';
import { DetailScreen } from './screens/Detail';
import { PlayerScreen } from './screens/Player';
import { DiscoverScreen } from './screens/Discover';
import { SearchScreen } from './screens/Search';
import {
  DecadeScreen,
  DecadesScreen,
  GenreScreen,
  GenresScreen,
} from './screens/Browse';
import { HistoryScreen, ListsScreen } from './screens/Library';
import { AddonsScreen, SettingsScreen } from './screens/Addons';
import { ProfilesScreen } from './screens/Profiles';
import { PersonScreen } from './screens/Person';
import { DevicesScreen } from './screens/Devices';

import { NAV_ITEMS } from './navigation-items';

interface SessionState {
  pairingRequired: boolean;
  authenticated: boolean;
}

export function App() {
  const { route, navigate, loading, error, activeProfile, refreshAll, settings } = useApp();
  const [session, setSession] = useState<SessionState | null>(null);

  useSpatialNavigation();

  // Sincronizacion multi-dispositivo: si el servidor exige un dispositivo
  // vinculado, se muestra la pantalla de vinculacion.
  const checkSession = () => {
    void api
      .session()
      .then((result) => setSession({ pairingRequired: result.pairingRequired, authenticated: result.authenticated }))
      .catch(() => undefined);
  };

  useEffect(() => {
    checkSession();
  }, []);

  // Atajos de teclado (Utiles en escritorio, en TV llega el boton "menu").
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      const key = event.key.toLowerCase();
      if (key === 'home' || key === 'h') navigate({ name: 'home' });
      if (key === 's') navigate({ name: 'search' });
      if (key === 'l') navigate({ name: 'lists' });
      if (key === 'g') navigate({ name: 'discover' });
      if (key === 'a') navigate({ name: 'addons' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  // Menu visible: se respeta la personalizacion del servidor.
  const tabs = useMemo(() => {
    const preferences = settings?.sidebar ?? [];
    const byId = new Map(preferences.map((item) => [item.id, item]));
    return NAV_ITEMS.filter((item) => !byId.get(item.id)?.hidden).sort((a, b) => {
      const orderA = byId.get(a.id)?.order ?? NAV_ITEMS.indexOf(a);
      const orderB = byId.get(b.id)?.order ?? NAV_ITEMS.indexOf(b);
      return orderA - orderB;
    });
  }, [settings?.sidebar]);

  const isPlayer = route.name === 'player';
  const needsPairing = Boolean(session?.pairingRequired) && !session?.authenticated;

  if (needsPairing) {
    return (
      <div className="app">
        <main className="content">
          <DevicesScreen
            onLinked={() => {
              setSession({ pairingRequired: true, authenticated: true });
              void refreshAll();
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className={`app ${isPlayer ? 'app--player' : ''}`}>
      {!isPlayer ? (
        <header className="topbar">
          <div className="topbar__brand">
            <span className="topbar__logo">M</span>
            <span className="topbar__name">Vibe Flix</span>
          </div>

          <nav className="topbar__nav">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-focusable="true"
                className={`topbar__tab ${route.name === tab.route.name ? 'topbar__tab--active' : ''}`}
                onClick={() => navigate(tab.route)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            data-focusable="true"
            className="topbar__profile"
            onClick={() => navigate({ name: 'profiles' })}
          >
            <span className="topbar__avatar" style={{ background: activeProfile?.color ?? '#5b8cff' }}>
              {activeProfile?.avatar ?? '👤'}
            </span>
            <span>{activeProfile?.name ?? 'Perfil'}</span>
          </button>
        </header>
      ) : null}

      <main className="content">
        {loading && !isPlayer ? <Loader label="Arrancando Vibe Flix…" /> : null}
        {error ? <ErrorState message={error} onRetry={() => void refreshAll()} /> : null}

        {!loading && !error ? (
          <>
            {route.name === 'home' ? <HomeScreen /> : null}
            {route.name === 'discover' ? <DiscoverScreen /> : null}
            {route.name === 'search' ? <SearchScreen /> : null}
            {route.name === 'genres' ? <GenresScreen /> : null}
            {route.name === 'genre' ? (
              <GenreScreen genre={route.genre} label={route.label} />
            ) : null}
            {route.name === 'decades' ? <DecadesScreen /> : null}
            {route.name === 'decade' ? (
              <DecadeScreen decade={route.decade} label={route.label} />
            ) : null}
            {route.name === 'detail' ? <DetailScreen id={route.id} type={route.type} /> : null}
            {route.name === 'player' ? (
              <PlayerScreen
                id={route.id}
                type={route.type}
                streamUrl={route.streamUrl}
                streamName={route.streamName}
                title={route.title}
                poster={route.poster}
                subtitleUrl={route.subtitleUrl}
                subtitleLabel={route.subtitleLabel}
                nextId={route.nextId}
                nextTitle={route.nextTitle}
              />
            ) : null}
            {route.name === 'lists' ? <ListsScreen /> : null}
            {route.name === 'history' ? <HistoryScreen /> : null}
            {route.name === 'addons' ? <AddonsScreen /> : null}
            {route.name === 'settings' ? <SettingsScreen /> : null}
            {route.name === 'devices' ? <DevicesScreen /> : null}
            {route.name === 'profiles' ? <ProfilesScreen /> : null}
            {route.name === 'person' ? <PersonScreen person={route.person} /> : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
