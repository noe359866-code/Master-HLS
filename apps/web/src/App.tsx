import { Suspense, lazy, useEffect, useMemo, useState } from 'react';

import { api } from './api';
import { useSpatialNavigation } from './navigation';
import { useApp } from './store';
import { ErrorState, Loader } from './components/ui';
import { I18nProvider, useI18n } from './i18n';
import { HomeScreen } from './screens/Home';
import { SideRail } from './components/SideRail';

/**
 * Pantallas bajo demanda.
 *
 * El bundle original metía las 16 pantallas y hls.js en un solo fichero de
 * ~830 KB: la TV descargaba y parseaba todo antes de pintar el inicio. Con
 * `React.lazy` cada pantalla es un chunk propio (el reproductor, que arrastra
 * hls.js, solo se descarga al entrar a reproducir) y el arranque queda en lo
 * imprescindible: shell + Home.
 */
const DetailScreen = lazy(() => import('./screens/Detail').then((m) => ({ default: m.DetailScreen })));
const PlayerScreen = lazy(() => import('./screens/Player').then((m) => ({ default: m.PlayerScreen })));
const DiscoverScreen = lazy(() => import('./screens/Discover').then((m) => ({ default: m.DiscoverScreen })));
const SearchScreen = lazy(() => import('./screens/Search').then((m) => ({ default: m.SearchScreen })));
// Varios exports por fichero: cada uno se envuelve, pero Vite los agrupa en el
// mismo chunk (el modulo es el mismo), asi que no se duplica nada.
const GenresScreen = lazy(() => import('./screens/Browse').then((m) => ({ default: m.GenresScreen })));
const GenreScreen = lazy(() => import('./screens/Browse').then((m) => ({ default: m.GenreScreen })));
const DecadesScreen = lazy(() => import('./screens/Browse').then((m) => ({ default: m.DecadesScreen })));
const DecadeScreen = lazy(() => import('./screens/Browse').then((m) => ({ default: m.DecadeScreen })));
const ListsScreen = lazy(() => import('./screens/Library').then((m) => ({ default: m.ListsScreen })));
const HistoryScreen = lazy(() => import('./screens/Library').then((m) => ({ default: m.HistoryScreen })));
const AddonsScreen = lazy(() => import('./screens/Addons').then((m) => ({ default: m.AddonsScreen })));
const SettingsScreen = lazy(() => import('./screens/Addons').then((m) => ({ default: m.SettingsScreen })));
const ProfilesScreen = lazy(() => import('./screens/Profiles').then((m) => ({ default: m.ProfilesScreen })));
const ProfilePreferences = lazy(() =>
  import('./screens/ProfilePreferences').then((m) => ({ default: m.ProfilePreferences })),
);
const PersonScreen = lazy(() => import('./screens/Person').then((m) => ({ default: m.PersonScreen })));
const DevicesScreen = lazy(() => import('./screens/Devices').then((m) => ({ default: m.DevicesScreen })));

interface SessionState {
  pairingRequired: boolean;
  authenticated: boolean;
}

/**
 * Envoltorio que fija el idioma de la interfaz desde los ajustes del servidor.
 *
 * Va dentro de `AppProvider` porque el idioma vive en `settings.language`, y
 * fuera de `App` para que cualquier pantalla pueda usar `useI18n()`.
 */
export function LocalizedApp() {
  const { settings, activeProfile } = useApp();
  const locale = settings?.language ?? activeProfile?.contentLanguage ?? undefined;
  return (
    <I18nProvider locale={locale}>
      <App />
    </I18nProvider>
  );
}

export function App() {
  const { route, navigate, loading, error, activeProfile, refreshAll } = useApp();
  const { t } = useI18n();
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

  // Se calienta el chunk del reproductor cuando el navegador esta ocioso: al
  // pulsar «Reproducir» ya no hay que descargar hls.js.
  useEffect(() => {
    const warm = () => {
      void import('./screens/Player');
    };
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1500));
    const handle = idle(warm);
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(handle as number);
    };
  }, []);

  const isPlayer = route.name === 'player';

  // Atajos de teclado globales (utiles en escritorio; en TV llega el boton
  // «menu»). Se desactivan con el reproductor abierto, que tiene los suyos, y
  // mientras se escribe en un campo.
  useEffect(() => {
    if (isPlayer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const routes: Record<string, Parameters<typeof navigate>[0]> = {
        home: { name: 'home' },
        h: { name: 'home' },
        s: { name: 'search' },
        l: { name: 'lists' },
        g: { name: 'discover' },
        a: { name: 'addons' },
      };
      const next = routes[key];
      if (next) navigate(next);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, isPlayer]);

  const needsPairing = Boolean(session?.pairingRequired) && !session?.authenticated;
  const needsWelcome =
    !loading &&
    !error &&
    Boolean(activeProfile) &&
    !activeProfile?.contentLanguage &&
    route.name !== 'profiles';

  const screen = useMemo(() => {
    switch (route.name) {
      case 'home':
        return <HomeScreen />;
      case 'discover':
        return <DiscoverScreen />;
      case 'search':
        return <SearchScreen />;
      case 'genres':
        return <GenresScreen />;
      case 'genre':
        return <GenreScreen genre={route.genre} label={route.label} />;
      case 'decades':
        return <DecadesScreen />;
      case 'decade':
        return <DecadeScreen decade={route.decade} label={route.label} />;
      case 'detail':
        return <DetailScreen id={route.id} type={route.type} />;
      case 'player':
        return (
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
        );
      case 'lists':
        return <ListsScreen />;
      case 'history':
        return <HistoryScreen />;
      case 'addons':
        return <AddonsScreen />;
      case 'settings':
        return <SettingsScreen />;
      case 'devices':
        return <DevicesScreen />;
      case 'profiles':
        return <ProfilesScreen />;
      case 'person':
        return <PersonScreen person={route.person} />;
      default:
        return null;
    }
  }, [route]);

  if (needsPairing) {
    return (
      <div className="app app--norail">
        <main className="content">
          <Suspense fallback={<Loader label={t('LOADING')} />}>
            <DevicesScreen
              onLinked={() => {
                setSession({ pairingRequired: true, authenticated: true });
                void refreshAll();
              }}
            />
          </Suspense>
        </main>
      </div>
    );
  }

  // El primer acceso a un perfil (tambien uno antiguo migrado) pide nombre e
  // idioma. Tras guardarlos no vuelve a preguntar; se pueden editar en Perfiles.
  if (needsWelcome && activeProfile) {
    return (
      <div className="app app--norail app--welcome">
        <main className="content">
          <Suspense fallback={<Loader label={t('LOADING')} />}>
            <ProfilePreferences
              key={activeProfile.id}
              profile={activeProfile}
              welcome
              onSaved={() => navigate({ name: 'home' })}
              onCancel={() => navigate({ name: 'profiles' })}
            />
          </Suspense>
        </main>
      </div>
    );
  }

  return (
    <div className={`app ${isPlayer ? 'app--player' : ''}`}>
      {/* Navegacion: rail lateral fijo (estilo WuPlay) con la marca, las
          secciones y el perfil. El contenido usa todo el ancho restante. */}
      {!isPlayer ? <SideRail /> : null}

      <main className="content">
        {loading && !isPlayer ? <Loader label={t('APP_STARTING')} /> : null}
        {error ? <ErrorState message={error} onRetry={() => void refreshAll()} /> : null}

        {!loading && !error ? (
          <Suspense fallback={<Loader label={t('LOADING')} />}>{screen}</Suspense>
        ) : null}
      </main>
    </div>
  );
}
