import { useEffect, useMemo, useState } from 'react';

import { useApp } from '../store';
import { PageHeader } from '../components/PageHeader';
import { NAV_ITEMS, DEFAULT_NAV_ORDER } from '../navigation-items';
import { canInstall, isInstalled, onInstallChange, promptInstall } from '../pwa';
import { api } from '../api';
import { Button, EmptyState, ErrorState, Loader } from '../components/ui';
import type { AppSettings, Genre } from '../types';

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
      <PageHeader
        title="Addons"
        hint="Instala, actualiza y organiza los addons Stremio que alimentan Vibe Flix."
      />
      <section className="panel">
        <h2>Instalar addon</h2>
        <p className="panel__hint">
          Pega la URL del manifest de un addon Stremio (por ejemplo{' '}
          <code>https://v3-cinemeta.strem.io/manifest.json</code>). Vibe Flix agrega todos los addons
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
  const [genres, setGenres] = useState<Genre[]>([]);

  useEffect(() => {
    const sync = () => {
      setInstallable(canInstall());
      setInstalled(isInstalled());
    };
    sync();
    return onInstallChange(sync);
  }, []);

  // Generos para los filtros de contenido.
  useEffect(() => {
    void api
      .genres()
      .then((result) => setGenres(result.genres))
      .catch(() => setGenres([]));
  }, []);

  if (!settings) return <Loader />;

  const filters = settings.filters ?? {
    includeGenres: [],
    excludeGenres: [],
    excludeKeywords: [],
    minRating: 0,
    hideAdult: false,
  };

  /** Menu de navegacion con el orden guardado en el servidor. */
  const navItems = useMemo(() => {
    const saved = settings.sidebar?.length ? settings.sidebar : DEFAULT_NAV_ORDER;
    const byId = new Map(saved.map((item) => [item.id, item]));
    return NAV_ITEMS.map((item, index) => ({
      ...item,
      hidden: byId.get(item.id)?.hidden ?? false,
      order: byId.get(item.id)?.order ?? index,
    })).sort((a, b) => a.order - b.order);
  }, [settings.sidebar]);

  /** Guarda el orden/visibilidad del menu. */
  const saveNav = async (items: Array<{ id: string; hidden: boolean; order: number }>) => {
    await api.saveSidebar(items);
    await saveSettings({ sidebar: items });
  };

  const toggleNav = async (id: string) => {
    const items = navItems.map((item) => ({
      id: item.id,
      hidden: item.id === id ? !item.hidden : item.hidden,
      order: item.order,
    }));
    await saveNav(items);
  };

  const moveNav = async (id: string, direction: -1 | 1) => {
    const ordered = [...navItems];
    const index = ordered.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved!);
    await saveNav(
      ordered.map((item, position) => ({
        id: item.id,
        hidden: item.hidden,
        order: position,
      })),
    );
  };

  /** Guarda los filtros de contenido (se fusionan en el servidor). */
  const saveFilters = async (patch: Partial<typeof filters>) => {
    await saveSettings({ filters: { ...filters, ...patch } });
  };

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
      <PageHeader title="Ajustes" hint="Preferencias del servidor: valen para todos tus dispositivos." />
      <section className="panel">
        <h2>Metadata integrada</h2>
        <p className="panel__hint">
          Permite usar Vibe Flix sin instalar ningún addon de metadatos (el «built-in metadata» de
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
        <h2>OpenSubtitles nativo</h2>
        <p className="panel__hint">
          Busca y descarga subtítulos directamente de OpenSubtitles, sin instalar el addon de
          subtítulos. La API key es gratuita (opensubtitles.com → My Account → API) y se guarda
          solo en el servidor.
        </p>
        <label className="setting">
          <span>API key</span>
          <input
            type="password"
            data-focusable="true"
            value={settings.opensubtitles?.apiKey ?? ''}
            placeholder="Clave de OpenSubtitles"
            onChange={(event) =>
              void saveSettings({
                opensubtitles: {
                  apiKey: event.target.value,
                },
              })
            }
          />
        </label>
      </section>

      <section className="panel">
        <h2>Omitir intro</h2>
        <p className="panel__hint">
          Detecta el final de la intro analizando los subtítulos del título (nativo, sin servicios
          externos). Si no puede detectarlo, salta el primer bloque de tiempo.
        </p>
        <label className="setting">
          <span>Mostrar el botón de saltar intro</span>
          <input
            type="checkbox"
            data-focusable="true"
            checked={settings.skipIntro?.enabled !== false}
            onChange={(event) =>
              void saveSettings({
                skipIntro: {
                  enabled: event.target.checked,
                  offsetSeconds: settings.skipIntro?.offsetSeconds ?? 90,
                },
              })
            }
          />
        </label>
        <label className="setting">
          <span>Salto por defecto (segundos)</span>
          <input
            type="number"
            min={5}
            max={600}
            data-focusable="true"
            value={settings.skipIntro?.offsetSeconds ?? 90}
            onChange={(event) =>
              void saveSettings({
                skipIntro: {
                  enabled: settings.skipIntro?.enabled !== false,
                  offsetSeconds: Number(event.target.value) || 90,
                },
              })
            }
          />
        </label>
      </section>

      <section className="panel">
        <h2>Personalización del menú</h2>
        <p className="panel__hint">
          Muestra, oculta y reordena las secciones de la app (WuPlay lo llama
          &laquo;manage sidebar items&raquo;). Se guarda en el servidor, así que la
          misma菜单 se aplica en la web, en la TV y en el addon.
        </p>
        <ul className="nav-custom">
          {navItems.map((item) => (
            <li key={item.id} className="nav-custom__row">
              <span className="nav-custom__label">
                <strong>{item.label}</strong>
                <em>{item.description}</em>
              </span>
              <span className="nav-custom__actions">
                <button
                  type="button"
                  data-focusable="true"
                  className="button button--ghost"
                  onClick={() => void moveNav(item.id, -1)}
                  aria-label={`Subir ${item.label}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  data-focusable="true"
                  className="button button--ghost"
                  onClick={() => void moveNav(item.id, 1)}
                  aria-label={`Bajar ${item.label}`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  data-focusable="true"
                  className="button button--ghost"
                  onClick={() => void toggleNav(item.id)}
                >
                  {item.hidden ? 'Mostrar' : 'Ocultar'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Filtros de contenido</h2>
        <p className="panel__hint">
          Limpian el catálogo de la búsqueda, los géneros y las décadas (WuPlay:
          &laquo;Content Filters&raquo;). Se aplican en el servidor, así que afectan a
          todos los dispositivos.
        </p>
        <label className="setting">
          <span>Puntuación mínima (IMDb)</span>
          <input
            type="number"
            min={0}
            max={10}
            step={0.1}
            data-focusable="true"
            value={filters.minRating}
            onChange={(event) =>
              void saveFilters({
                minRating: Number(event.target.value) || 0,
              })
            }
          />
        </label>
        <label className="setting">
          <span>Ocultar contenido para adultos</span>
          <input
            type="checkbox"
            data-focusable="true"
            checked={filters.hideAdult}
            onChange={(event) => void saveFilters({ hideAdult: event.target.checked })}
          />
        </label>
        <label className="setting">
          <span>Palabras clave excluidas (separadas por comas)</span>
          <input
            type="text"
            data-focusable="true"
            value={filters.excludeKeywords.join(', ')}
            placeholder="por ejemplo: terror, remake"
            onChange={(event) =>
              void saveFilters({
                excludeKeywords: event.target.value
                  .split(',')
                  .map((word) => word.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <p className="panel__hint">Géneros ocultos:</p>
        <div className="chip-row">
          {genres.map((genre) => {
            const active = filters.excludeGenres.includes(genre.catalog);
            return (
              <button
                key={genre.id}
                type="button"
                data-focusable="true"
                className={`chip ${active ? 'chip--active' : ''}`}
                onClick={() =>
                  void saveFilters({
                    excludeGenres: active
                      ? filters.excludeGenres.filter((value) => value !== genre.catalog)
                      : [...filters.excludeGenres, genre.catalog],
                  })
                }
              >
                {genre.emoji} {genre.name}
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Instalar en la TV</h2>
        <p className="panel__hint">
          Vibe Flix es una PWA: se instala como una app (ventana propia, sin barra del navegador)
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
