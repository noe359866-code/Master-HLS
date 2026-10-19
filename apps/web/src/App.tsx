import { useEffect, useState } from 'react';

import { api } from './api';
import { useSpatialNavigation } from './navigation';
import { useApp, type Route } from './store';
import { ErrorState, Loader } from './components/ui';
import { HomeScreen } from './screens/Home';
import { DetailScreen } from './screens/Detail';
import { PlayerScreen } from './screens/Player';
import { DiscoverScreen, SearchScreen } from './screens/Discover';
import { HistoryScreen, ListsScreen } from './screens/Library';
import { AddonsScreen, SettingsScreen } from './screens/Addons';
import { ProfilesScreen } from './screens/Profiles';
import { PersonScreen } from './screens/Person';
import { DevicesScreen } from './screens/Devices';

const TABS: Array<{ route: Route; label: string }> = [
  { route: { name: 'home' }, label: 'Inicio' },
  { route: { name: 'discover' }, label: 'Descubrir' },
  { route: { name: 'search' }, label: 'Buscar' },
  { route: { name: 'lists' }, label: 'Mis listas' },
  { route: { name: 'history' }, label: 'Historial' },
  { route: { name: 'addons' }, label: 'Addons' },
  { route: { name: 'settings' }, label: 'Ajustes' },
];

interface SessionState {
  pairingRequired: boolean;
  authenticated: boolean;
}

export function App() {
  const { route, navigate, loading, error, activeProfile, refreshAll } = useApp();
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
            <span className="topbar__name">Master-HLS</span>
          </div>

          <nav className="topbar__nav">
            {TABS.map((tab) => (
              <button
                key={tab.label}
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
        {loading && !isPlayer ? <Loader label="Arrancando Master-HLS…" /> : null}
        {error ? <ErrorState message={error} onRetry={() => void refreshAll()} /> : null}

        {!loading && !error ? (
          <>
            {route.name === 'home' ? <HomeScreen /> : null}
            {route.name === 'discover' ? <DiscoverScreen /> : null}
            {route.name === 'search' ? <SearchScreen /> : null}
            {route.name === 'detail' ? <DetailScreen id={route.id} type={route.type} /> : null}
            {route.name === 'player' ? (
              <PlayerScreen
                id={route.id}
                type={route.type}
                streamUrl={route.streamUrl}
                streamName={route.streamName}
                title={route.title}
                poster={route.poster}
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
