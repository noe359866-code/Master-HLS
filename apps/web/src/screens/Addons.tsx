import { useEffect, useState } from 'react';

import { useApp } from '../store';
import { canInstall, isInstalled, onInstallChange, promptInstall } from '../pwa';
import { api } from '../api';
import { Button, EmptyState, ErrorState, Loader } from '../components/ui';
import type { AppSettings } from '../types';

/** Gestor de addons: instalar, actualizar y quitar. */
export function AddonsScreen() {
  const { addons, catalogs, installAddon, removeAddon, refreshAddons, toggleCatalog, moveCatalog } =
    useApp();
  const [manifestUrl, setManifestUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const install = async () => {
    const url = manifestUrl.trim();
    if (!url) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await installAddon(url);
      setManifestUrl('');
      setMessage('Addon instalado correctamente.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const update = async () => {
    setBusy(true);
    setError(null);
    try {
      await refreshAddons();
      setMessage('Addons actualizados.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen addons">
      <section className="panel">
        <h2>Instalar addon</h2>
        <p className="panel__hint">
          Pega la URL del manifest de un addon Stremio (por ejemplo{' '}
          <code>https://v3-cinemeta.strem.io/manifest.json</code>). Master-HLS agrega todos los addons
          instalados en sus catálogos, metadatos, streams y subtítulos.
        </p>
        <div className="addons__install">
          <input
            className="addons__input"
            type="text"
            value={manifestUrl}
            placeholder="https://…/manifest.json"
            onChange={(event) => setManifestUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void install();
            }}
          />
          <Button onClick={() => void install()} disabled={busy}>
            {busy ? 'Instalando…' : 'Instalar'}
          </Button>
          <Button variant="ghost" onClick={() => void update()} disabled={busy}>
            Actualizar todos
          </Button>
        </div>
        {error ? <ErrorState message={error} /> : null}
        {message ? <p className="panel__ok">{message}</p> : null}
      </section>

      <section className="panel">
        <h2>Addons instalados ({addons.length})</h2>
        {addons.length === 0 ? (
          <EmptyState title="Sin addons" hint="Instala uno para empezar a ver contenido." />
        ) : null}
        <ul className="addon-list">
          {addons.map((addon) => (
            <li key={addon.id} className="addon">
              <div className="addon__info">
                <strong>{addon.name}</strong>
                <span className="addon__version">v{addon.version}</span>
                <span className="addon__url">{addon.manifestUrl}</span>
                <span className="addon__caps">
                  {[
                    addon.supports.catalog && 'catálogo',
                    addon.supports.meta && 'metadata',
                    addon.supports.stream && 'streams',
                    addon.supports.subtitles && 'subtítulos',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <Button variant="danger" onClick={() => void removeAddon(addon.id)}>
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Catálogos ({catalogs.length})</h2>
        <p className="panel__hint">Ordena y oculta las secciones de tu pantalla de inicio.</p>
        <ul className="catalog-list">
          {catalogs.map((catalog) => (
            <li key={`${catalog.type}:${catalog.id}`} className="catalog">
              <span className="catalog__name">
                {catalog.name} <em>{catalog.type}</em>
              </span>
              <span className="catalog__actions">
                <button
                  type="button"
                  data-focusable="true"
                  className="chip"
                  onClick={() => void moveCatalog(catalog, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  data-focusable="true"
                  className="chip"
                  onClick={() => void moveCatalog(catalog, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  data-focusable="true"
                  className={`chip ${catalog.hidden ? 'chip--active' : ''}`}
                  onClick={() => void toggleCatalog(catalog, !catalog.hidden)}
                >
                  {catalog.hidden ? 'Mostrar' : 'Ocultar'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function SettingsScreen() {
  const { settings, saveSettings, navigate } = useApp();
  const [debridMessage, setDebridMessage] = useState<string | null>(null);
  const [debridError, setDebridError] = useState<string | null>(null);
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const sync = () => {
      setInstallable(canInstall());
      setInstalled(isInstalled());
    };
    sync();
    return onInstallChange(sync);
  }, []);

  if (!settings) return <Loader />;

  const install = async () => {
    await promptInstall();
    setInstallable(canInstall());
    setInstalled(isInstalled());
  };

  const testDebrid = async () => {
    setDebridMessage(null);
    setDebridError(null);
    try {
      const result = await api.testDebrid();
      if (result.ok) {
        setDebridMessage(result.message);
      } else {
        setDebridError(result.message);
      }
    } catch (cause) {
      setDebridError((cause as Error).message);
    }
  };

  return (
    <div className="screen settings">
      <section className="panel">
        <h2>Metadata integrada</h2>
        <p className="panel__hint">
          Permite usar Master-HLS sin instalar ningún addon de metadatos (el «built-in metadata» de
          WuPlay). Se agrega a los addons que tengas instalados, no los sustituye.
        </p>
        <label className="setting">
          <span>Usar metadata integrada</span>
          <input
            type="checkbox"
            data-focusable="true"
            checked={settings.builtInMetadata}
            onChange={(event) => void saveSettings({ builtInMetadata: event.target.checked })}
          />
        </label>
      </section>

      <section className="panel">
        <h2>Reproducción</h2>
        <label className="setting">
          <span>Autoplay del siguiente episodio</span>
          <input
            type="checkbox"
            data-focusable="true"
            checked={settings.autoplayTrailers}
            onChange={(event) => void saveSettings({ autoplayTrailers: event.target.checked })}
          />
        </label>
        <label className="setting">
          <span>Mostrar el prefijo del addon en los streams</span>
          <input
            type="checkbox"
            data-focusable="true"
            checked={settings.showAddonPrefix}
            onChange={(event) => void saveSettings({ showAddonPrefix: event.target.checked })}
          />
        </label>
      </section>

      <section className="panel">
        <h2>Capacidades del dispositivo</h2>
        <p className="panel__hint">
          Determinan qué variante HLS se elige automáticamente en el reproductor.
        </p>
        <label className="setting">
          <span>Resolución máxima</span>
          <select
            data-focusable="true"
            value={settings.device.maxHeight}
            onChange={(event) =>
              void saveSettings({
                device: { ...settings.device, maxHeight: Number(event.target.value) },
              })
            }
          >
            {[2160, 1440, 1080, 720, 480].map((height) => (
              <option key={height} value={height}>
                {height}p
              </option>
            ))}
          </select>
        </label>
        <label className="setting">
          <span>Soporte HDR</span>
          <input
            type="checkbox"
            data-focusable="true"
            checked={settings.device.supportsHdr}
            onChange={(event) =>
              void saveSettings({
                device: { ...settings.device, supportsHdr: event.target.checked },
              })
            }
          />
        </label>
        <label className="setting">
          <span>Soporte Dolby Vision</span>
          <input
            type="checkbox"
            data-focusable="true"
            checked={settings.device.supportsDolbyVision}
            onChange={(event) =>
              void saveSettings({
                device: { ...settings.device, supportsDolbyVision: event.target.checked },
              })
            }
          />
        </label>
      </section>

      <section className="panel">
        <h2>Debrid nativo</h2>
        <p className="panel__hint">
          El servidor descarga en tu nombre los enlaces premium y los cachea, así que el cliente
          web, el shell Android TV y el addon Stremio reciben el mismo enlace directo. Sin
          debrid solo funcionan los streams HTTP.
        </p>
        <label className="setting">
          <span>Proveedor</span>
          <select
            data-focusable="true"
            value={settings.debrid.provider}
            onChange={(event) =>
              void saveSettings({
                debrid: {
                  ...settings.debrid,
                  provider: event.target.value as AppSettings['debrid']['provider'],
                },
              })
            }
          >
            <option value="">Desactivado</option>
            <option value="realdebrid">Real-Debrid</option>
            <option value="alldebrid">AllDebrid</option>
            <option value="torbox">TorBox</option>
            <option value="premiumize">Premiumize</option>
          </select>
        </label>
        <label className="setting">
          <span>API key</span>
          <input
            type="password"
            data-focusable="true"
            value={settings.debrid.apiKey}
            placeholder="Clave del proveedor"
            onChange={(event) =>
              void saveSettings({ debrid: { ...settings.debrid, apiKey: event.target.value } })
            }
          />
        </label>
        <div className="addons__install">
          <Button variant="ghost" onClick={() => void testDebrid()}>
            Probar conexión
          </Button>
        </div>
        {debridMessage ? <p className="panel__ok">{debridMessage}</p> : null}
        {debridError ? <ErrorState message={debridError} /> : null}
      </section>

      <section className="panel">
        <h2>Instalar en la TV</h2>
        <p className="panel__hint">
          Master-HLS es una PWA: se instala como una app (ventana propia, sin barra del navegador)
          y sigue funcionando con la red intermitente gracias al service worker.
        </p>
        <div className="addons__install">
          {installed ? (
            <p className="panel__ok">La app ya está instalada en este dispositivo.</p>
          ) : null}
          {!installed && installable ? (
            <Button onClick={() => void install()}>Instalar app</Button>
          ) : null}
          {!installed && !canInstall ? (
            <p className="panel__hint">
              Usa el menú del navegador («Instalar aplicación») o «Añadir a la pantalla de inicio»
              en Android TV.
            </p>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <h2>Cuenta</h2>
        <Button variant="ghost" onClick={() => navigate({ name: 'profiles' })}>
          Cambiar de perfil
        </Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'addons' })}>
          Gestionar addons
        </Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'devices' })}>
          Vincular dispositivos
        </Button>
      </section>
    </div>
  );
}
