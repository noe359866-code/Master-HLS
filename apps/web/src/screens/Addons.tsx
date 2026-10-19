import { useEffect, useMemo, useState } from 'react';

import { useApp } from '../store';
import { PageHeader } from '../components/PageHeader';
import { NAV_ITEMS, DEFAULT_NAV_ORDER } from '../navigation-items';
import { canInstall, isInstalled, onInstallChange, promptInstall } from '../pwa';
import { getAdminToken, setAdminToken } from '../session';
import { api } from '../api';
import { Button, EmptyState, ErrorState, Loader } from '../components/ui';
import { useI18n } from '../i18n';
import { deviceEnvironment } from '../player/environment';
import {
  SUBTITLE_COLORS,
  SUBTITLE_EDGES,
  SUBTITLE_SIZES,
  detectCapabilities,
  formatDelay,
  isLowEndDevice,
  videoScaleLabel,
} from '@vibeflix/player-core';
import type { AppSettings, Genre, ProviderConfig, ScraperStatus } from '../types';

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
  const { settings, activeProfile, saveSettings, navigate } = useApp();
  // Modo esencial (NuvioTV: «Essential / Advanced»): solo cambia la visibilidad.
  const essential = settings?.uiMode === 'essential';
  const { t, locale, locales, change } = useI18n();
  const [detectedSummary, setDetectedSummary] = useState('');
  const [debridMessage, setDebridMessage] = useState<string | null>(null);
  const [debridError, setDebridError] = useState<string | null>(null);
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [scraperStatus, setScraperStatus] = useState<ScraperStatus | null>(null);
  const [scraperConfigs, setScraperConfigs] = useState('');
  const [scraperMessage, setScraperMessage] = useState<string | null>(null);
  const [scraperError, setScraperError] = useState<string | null>(null);
  const [adminRequired, setAdminRequired] = useState(false);
  const [adminTokenInput, setAdminTokenInput] = useState(getAdminToken() ?? '');
  const [debridKey, setDebridKey] = useState('');
  const [openSubtitlesKey, setOpenSubtitlesKey] = useState('');
  const [openSubtitlesMessage, setOpenSubtitlesMessage] = useState<string | null>(null);
  const [openSubtitlesError, setOpenSubtitlesError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setInstallable(canInstall());
      setInstalled(isInstalled());
    };
    sync();
    return onInstallChange(sync);
  }, []);

  // El servidor puede exigir ADMIN_TOKEN para la configuración.
  useEffect(() => {
    void api
      .session()
      .then((result) => setAdminRequired(result.adminRequired))
      .catch(() => setAdminRequired(false));
  }, []);

  // Generos para los filtros de contenido.
  useEffect(() => {
    void api
      .genres()
      .then((result) => setGenres(result.genres))
      .catch(() => setGenres([]));
  }, []);

  // Estado de los scrapers nativos (addon de streams del servidor).
  useEffect(() => {
    void api
      .scrapers()
      .then((status) => {
        setScraperStatus(status);
        setScraperConfigs(JSON.stringify(status.configs ?? [], null, 2));
      })
      .catch(() => setScraperStatus(null));
  }, []);

  if (!settings) return <Loader />;

  /**
   * Rellena las capacidades del dispositivo con lo que detecta el navegador
   * (pantalla, HDR, codecs, memoria y CPU). Es el mismo `detectCapabilities()`
   * que usa el reproductor al arrancar: sirve para corregir a mano lo que la
   * deteccion automatica no puede saber (por ejemplo un tope de bitrate).
   */
  const detectDevice = (): void => {
    const environment = deviceEnvironment();
    const detected = detectCapabilities(environment);
    setDetectedSummary(
      [
        `${environment.screenWidth ?? '?'}x${environment.screenHeight ?? '?'} @ ${
          environment.devicePixelRatio ?? 1
        }x`,
        `techo ${detected.maxHeight ?? '?'}p`,
        `HDR ${detected.supportsHdr ? 'si' : 'no'}`,
        `Dolby Vision ${detected.supportsDolbyVision ? 'si' : 'no'}`,
        `codecs ${detected.preferredCodecs.join(', ') || '-'}`,
        `${environment.hardwareConcurrency ?? '?'} CPU / ${environment.deviceMemory ?? '?'} GB`,
        detected.maxBandwidthMbps ? `red ~${Math.round(detected.maxBandwidthMbps)} Mbps` : 'red ?',
        isLowEndDevice(environment) ? 'gama baja' : 'gama normal',
      ].join(' · '),
    );
    void saveSettings({
      device: {
        ...settings.device,
        maxHeight: Math.min(settings.device.maxHeight || 4096, detected.maxHeight ?? 4096),
        supportsHdr: Boolean(detected.supportsHdr),
        supportsDolbyVision: Boolean(detected.supportsDolbyVision),
      },
    });
  };


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

  /** Guarda la configuracion de los scrapers nativos. */
  const saveScrapers = async (patch: {
    enabled?: boolean;
    providers?: string[];
    configs?: ProviderConfig[];
  }) => {
    setScraperError(null);
    try {
      const current = scraperStatus;
      await api.saveScrapers({
        enabled: patch.enabled ?? current?.enabled ?? true,
        providers: patch.providers ?? current?.selected ?? [],
        configs: patch.configs ?? current?.configs ?? [],
      });
      const status = await api.scrapers();
      setScraperStatus(status);
      setScraperConfigs(JSON.stringify(status.configs ?? [], null, 2));
      setScraperMessage('Scrapers nativos actualizados.');
    } catch (cause) {
      setScraperError((cause as Error).message);
    }
  };

  /** Prueba la configuracion de proveedores escrita por el usuario. */
  const testScrapers = async () => {
    setScraperError(null);
    setScraperMessage(null);
    let configs: ProviderConfig[] = [];
    try {
      const parsed = JSON.parse(scraperConfigs || '[]');
      configs = Array.isArray(parsed) ? (parsed as ProviderConfig[]) : [];
    } catch (cause) {
      setScraperError(`JSON invalido: ${(cause as Error).message}`);
      return;
    }
    const config = configs[0];
    if (!config) {
      setScraperError('Escribe al menos un proveedor en JSON para probarlo.');
      return;
    }
    try {
      const result = await api.testScraper({ config, title: 'El viaje' });
      if (result.error) {
        setScraperError(result.error);
      } else {
        setScraperMessage(`${result.sources.length} fuente(s) encontrada(s).`);
      }
    } catch (cause) {
      setScraperError((cause as Error).message);
    }
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
      {adminRequired ? (
        <section className="panel">
          <h2>Token de administración</h2>
          <p className="panel__hint">
            Este servidor exige un token para cambiar la configuración, probar fuentes y emitir
            vínculos de dispositivos. Pégalo aquí: se guarda solo en este navegador y se envía en
            cada petición como <code>X-Vibe-Flix-Admin-Token</code>.
          </p>
          <div className="addons__install">
            <input
              className="addons__input"
              type="password"
              autoComplete="off"
              value={adminTokenInput}
              placeholder="ADMIN_TOKEN del servidor"
              onChange={(event) => setAdminTokenInput(event.target.value)}
            />
            <Button
              onClick={() => {
                setAdminToken(adminTokenInput.trim() || undefined);
                window.location.reload();
              }}
            >
              Guardar token
            </Button>
          </div>
        </section>
      ) : null}
      <section className="panel">
        <h2>{t('SETTINGS_EXPERIENCE')}</h2>
        <label className="setting">
          <span>{t('SETTINGS_UI_MODE')}</span>
          <select
            data-focusable="true"
            value={settings.uiMode ?? 'advanced'}
            onChange={(event) =>
              void saveSettings({ uiMode: event.target.value as 'essential' | 'advanced' })
            }
          >
            <option value="essential">{t('SETTINGS_UI_MODE_ESSENTIAL')}</option>
            <option value="advanced">{t('SETTINGS_UI_MODE_ADVANCED')}</option>
          </select>
        </label>
        <p className="panel__hint">{t('SETTINGS_UI_MODE_HELP')}</p>
      </section>

      {!essential ? (
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
      ) : null}

      <section className="panel">
        <h2>{t('SETTINGS_INTERFACE')}</h2>
        <label className="setting">
          <span>{t('LANGUAGE')}</span>
          <select
            data-focusable="true"
            value={locale}
            onChange={(event) => change(event.target.value)}
          >
            {locales.map((info) => (
              <option key={info.tag} value={info.tag}>
                {info.label}
                {info.translated ? '' : ' ·'}
              </option>
            ))}
          </select>
        </label>
        <p className="panel__hint">{t('SETTINGS_INTERFACE_HELP')}</p>
      </section>

      <section className="panel">
        <h2>{t('SETTINGS_PLAYBACK')}</h2>
        <label className="setting">
          <span>{t('AUTO_PLAY')}</span>
          <input
            type="checkbox"
            data-focusable="true"
            checked={settings.autoplayTrailers}
            onChange={(event) => void saveSettings({ autoplayTrailers: event.target.checked })}
          />
        </label>
        <label className="setting">
          <span>{t('SETTINGS_AUTOPLAY_COUNTDOWN')}</span>
          <select
            data-focusable="true"
            value={settings.playback?.autoplayCountdown ?? 5}
            onChange={(event) =>
              void saveSettings({
                playback: { ...settings.playback, autoplayCountdown: Number(event.target.value) },
              })
            }
          >
            {[0, 3, 5, 10, 15].map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds === 0 ? t('OFF') : `${seconds} s`}
              </option>
            ))}
          </select>
        </label>
        {!essential ? (
          <>
        <label className="setting">
          <span>{t('SETTINGS_MAX_BITRATE')}</span>
          <select
            data-focusable="true"
            value={settings.playback?.maxBitrateMbps ?? 0}
            onChange={(event) =>
              void saveSettings({
                playback: { ...settings.playback, maxBitrateMbps: Number(event.target.value) },
              })
            }
          >
            {[0, 2, 4, 6, 8, 12, 16, 25, 40].map((mbps) => (
              <option key={mbps} value={mbps}>
                {mbps === 0 ? `${t('AUTO')} / ${t('OFF')}` : `${mbps} Mbps`}
              </option>
            ))}
          </select>
        </label>
        <p className="panel__hint">{t('SETTINGS_MAX_BITRATE_HELP')}</p>
        <label className="setting">
          <span>{t('SETTINGS_BUFFER_SECONDS')}</span>
          <select
            data-focusable="true"
            value={settings.playback?.bufferSeconds ?? 0}
            onChange={(event) =>
              void saveSettings({
                playback: { ...settings.playback, bufferSeconds: Number(event.target.value) },
              })
            }
          >
            {[0, 15, 30, 45, 60, 90].map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds === 0 ? t('AUTO') : `${seconds} s`}
              </option>
            ))}
          </select>
        </label>
          </>
        ) : null}
        <label className="setting">
          <span>{t('CONTINUE_WATCHING')}</span>
          <input
            type="checkbox"
            data-focusable="true"
            checked={settings.playback?.resume !== false}
            onChange={(event) =>
              void saveSettings({ playback: { ...settings.playback, resume: event.target.checked } })
            }
          />
        </label>
        {!essential ? (
          <>
        <label className="setting">
          <span>{t('PLAYER_THUMBNAILS')}</span>
          <input
            type="checkbox"
            data-focusable="true"
            checked={settings.playback?.thumbnails !== false}
            onChange={(event) =>
              void saveSettings({ playback: { ...settings.playback, thumbnails: event.target.checked } })
            }
          />
        </label>
        <label className="setting">
          <span>{t('PLAYER_VIDEO_SCALE')}</span>
          <select
            data-focusable="true"
            value={settings.playback?.videoScale ?? 'contain'}
            onChange={(event) =>
              void saveSettings({
                playback: {
                  ...settings.playback,
                  videoScale: event.target.value as 'contain' | 'cover' | 'fill' | 'zoom',
                },
              })
            }
          >
            {(['contain', 'cover', 'fill', 'zoom'] as const).map((scale) => (
              <option key={scale} value={scale}>
                {videoScaleLabel(scale)}
              </option>
            ))}
          </select>
        </label>
        <p className="panel__hint">
          Los streams se muestran con el título y, si corresponde, la temporada y el episodio.
          No se muestran nombres de proveedores ni enlaces en las fichas.
        </p>
          </>
        ) : null}
      </section>

      <section className="panel">
        <h2>{t('SETTINGS_SUBTITLES')}</h2>
        <label className="setting">
          <span>{t('SUBTITLES')}</span>
          <input
            type="checkbox"
            data-focusable="true"
            checked={settings.subtitles?.enabled !== false}
            onChange={(event) =>
              void saveSettings({ subtitles: { ...settings.subtitles, enabled: event.target.checked } })
            }
          />
        </label>
        <label className="setting">
          <span>{t('PLAYER_SUBTITLES_SIZE')}</span>
          <select
            data-focusable="true"
            value={settings.subtitles?.size ?? 1}
            onChange={(event) =>
              void saveSettings({ subtitles: { ...settings.subtitles, size: Number(event.target.value) } })
            }
          >
            {SUBTITLE_SIZES.map((size) => (
              <option key={size.id} value={size.scale}>
                {size.label}
              </option>
            ))}
          </select>
        </label>
        <label className="setting">
          <span>{t('SETTINGS_SUBTITLES_COLOR')}</span>
          <select
            data-focusable="true"
            value={settings.subtitles?.color ?? 'white'}
            onChange={(event) =>
              void saveSettings({ subtitles: { ...settings.subtitles, color: event.target.value } })
            }
          >
            {SUBTITLE_COLORS.map((color) => (
              <option key={color.id} value={color.id}>
                {color.label}
              </option>
            ))}
          </select>
        </label>
        {!essential ? (
          <>
        <label className="setting">
          <span>{t('SETTINGS_SUBTITLES_OPACITY')}</span>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            data-focusable="true"
            value={settings.subtitles?.opacity ?? 1}
            onChange={(event) =>
              void saveSettings({ subtitles: { ...settings.subtitles, opacity: Number(event.target.value) } })
            }
          />
        </label>
        <label className="setting">
          <span>{t('SETTINGS_SUBTITLES_BACKGROUND')}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            data-focusable="true"
            value={settings.subtitles?.backgroundOpacity ?? 0.35}
            onChange={(event) =>
              void saveSettings({
                subtitles: { ...settings.subtitles, backgroundOpacity: Number(event.target.value) },
              })
            }
          />
        </label>
        <label className="setting">
          <span>{t('SETTINGS_SUBTITLES_EDGE')}</span>
          <select
            data-focusable="true"
            value={settings.subtitles?.edge ?? 'outline'}
            onChange={(event) =>
              void saveSettings({
                subtitles: {
                  ...settings.subtitles,
                  edge: event.target.value as 'none' | 'outline' | 'shadow' | 'raised',
                },
              })
            }
          >
            {SUBTITLE_EDGES.map((edge) => (
              <option key={edge} value={edge}>
                {edge}
              </option>
            ))}
          </select>
        </label>
        <label className="setting">
          <span>{t('SETTINGS_SUBTITLES_POSITION')}</span>
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            data-focusable="true"
            value={settings.subtitles?.verticalPosition ?? 8}
            onChange={(event) =>
              void saveSettings({
                subtitles: { ...settings.subtitles, verticalPosition: Number(event.target.value) },
              })
            }
          />
        </label>
        <label className="setting">
          <span>{t('SETTINGS_SUBTITLES_BOLD')}</span>
          <input
            type="checkbox"
            data-focusable="true"
            checked={Boolean(settings.subtitles?.bold)}
            onChange={(event) =>
              void saveSettings({ subtitles: { ...settings.subtitles, bold: event.target.checked } })
            }
          />
        </label>
          </>
        ) : null}
        <label className="setting">
          <span>{t('SETTINGS_CLEAN_SDH')}</span>
          <input
            type="checkbox"
            data-focusable="true"
            checked={Boolean(settings.subtitles?.cleanSdh)}
            onChange={(event) =>
              void saveSettings({ subtitles: { ...settings.subtitles, cleanSdh: event.target.checked } })
            }
          />
        </label>
        <p className="panel__hint">{t('SETTINGS_CLEAN_SDH_HELP')}</p>
        <label className="setting">
          <span>{t('SETTINGS_SUBTITLES_ONLY_FOREIGN')}</span>
          <input
            type="checkbox"
            data-focusable="true"
            checked={Boolean(settings.subtitles?.onlyForForeignAudio)}
            onChange={(event) =>
              void saveSettings({
                subtitles: { ...settings.subtitles, onlyForForeignAudio: event.target.checked },
              })
            }
          />
        </label>
        <label className="setting">
          <span>{t('PLAYER_SUBTITLES_DELAY')}</span>
          <select
            data-focusable="true"
            value={settings.subtitles?.delayMs ?? 0}
            onChange={(event) =>
              void saveSettings({ subtitles: { ...settings.subtitles, delayMs: Number(event.target.value) } })
            }
          >
            {[-2000, -1000, -500, -250, 0, 250, 500, 1000, 2000].map((ms) => (
              <option key={ms} value={ms}>
                {formatDelay(ms)}
              </option>
            ))}
          </select>
        </label>
      </section>

      {!essential ? (
        <>
      <section className="panel">
        <h2>{t('SETTINGS_DEVICE')}</h2>
        <p className="panel__hint">
          Determinan qué variante HLS se elige automáticamente en el reproductor.
        </p>
        <div className="setting">
          <span>{t('SETTINGS_DETECT_DEVICE')}</span>
          <Button variant="ghost" onClick={detectDevice}>
            {t('SETTINGS_DETECT_DEVICE')}
          </Button>
        </div>
        <p className="panel__hint">{detectedSummary}</p>
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
        <h2>Vibe Flix · fuentes nativas</h2>
        <p className="panel__hint">
          Vibe Flix consulta automáticamente las fuentes compatibles con el idioma de cada perfil.
          Incluye adaptadores nativos para películas, series, anime y doramas, además de Internet Archive como
          último recurso (audio no declarado). Las pruebas son simuladas: no se ha verificado la
          reproducción real ni se garantiza disponibilidad para todos los idiomas o títulos. Los
          canales IPTV del proyecto de referencia no se confunden con episodios.
        </p>
        {scraperStatus?.coverage ? (
          <p className="panel__hint">
            Cobertura upstream: <strong>{scraperStatus.coverage.ported}/{scraperStatus.coverage.upstreamVod}</strong>{' '}
            adaptadores VOD portados; {scraperStatus.coverage.pending} pendientes
            {scraperStatus.coverage.partial.length
              ? ` · parcial: ${scraperStatus.coverage.partial.join(', ')}`
              : ''}
            {' '}· {scraperStatus.coverage.liveVerified} verificados en vivo.
          </p>
        ) : null}
        <label className="setting">
          <span>Buscar fuentes automáticamente</span>
          <input
            type="checkbox"
            data-focusable="true"
            checked={scraperStatus?.enabled ?? settings.scrapers?.enabled ?? true}
            onChange={(event) => void saveScrapers({ enabled: event.target.checked })}
          />
        </label>
        <details className="scrapers-advanced">
          <summary data-focusable="true">Configuración avanzada de fuentes</summary>
          <p className="panel__hint">Solo se pueden activar los adaptadores portados aquí, no todos
            los archivos de StreamFlix Reborn. Ningún enlace se considera verificado en vivo.
            Puedes añadir fuentes propias que tengas derecho a usar, declarando su idioma y tipo.
          </p>
          {(scraperStatus?.available ?? []).map((provider) => {
            const selected = scraperStatus?.selected ?? [];
            const active = selected.length === 0 || selected.includes(provider.id);
            return (
              <label className="setting" key={provider.id}>
                <span title={(provider.limitations ?? []).join(' ')}>
                  {provider.name}{provider.region ? ` · ${provider.region}` : ''} ·
                  {provider.verification === 'mock-tested' ? ' adaptador probado con mocks' : ' sin pruebas'}
                  {provider.coverage === 'partial' ? ' · port parcial' : ''}
                </span>
                <input
                  type="checkbox"
                  data-focusable="true"
                  checked={active}
                  onChange={(event) => {
                    const explicit = selected.length ? selected :
                      (scraperStatus?.available ?? []).map((entry) => entry.id);
                    const next = event.target.checked
                      ? [...explicit.filter((id) => id !== provider.id), provider.id]
                      : explicit.filter((id) => id !== provider.id);
                    void saveScrapers({ providers: next, enabled: next.length > 0 });
                  }}
                />
              </label>
            );
          })}
          <label className="setting setting--stack">
            <span>Fuentes propias (JSON)</span>
            <textarea
              data-focusable="true"
              rows={6}
              spellCheck={false}
              value={scraperConfigs}
              placeholder='[{"id":"mio","name":"Mi fuente","types":["anime"],"languages":["es-419"],"searchUrl":"https://sitio/buscar?q={title}","itemPattern":"href=\"\\/serie\\/(\\w+)\"","episodeUrl":"https://sitio/serie/{id}/{season}/{episode}","streamPatterns":["src=\"(https?:\\/\\/[^\"]+\\.mp4)\""]}]'
              onChange={(event) => setScraperConfigs(event.target.value)}
            />
          </label>
          <div className="addons__install">
            <Button variant="ghost" onClick={() => void testScrapers()}>Probar fuente</Button>
            <Button
              variant="ghost"
              onClick={() => {
                try {
                  const parsed = JSON.parse(scraperConfigs || '[]');
                  void saveScrapers({
                    configs: Array.isArray(parsed) ? (parsed as ProviderConfig[]) : [],
                  });
                } catch (cause) {
                  setScraperError(`JSON inválido: ${(cause as Error).message}`);
                }
              }}
            >
              Guardar fuentes
            </Button>
          </div>
        </details>
        {scraperMessage ? <p className="panel__ok">{scraperMessage}</p> : null}
        {scraperError ? <ErrorState message={scraperError} /> : null}
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
            autoComplete="off"
            value={debridKey}
            placeholder={settings.debrid.apiKey ? 'Clave guardada (escribe otra para cambiarla)' : 'Clave del proveedor'}
            onChange={(event) => setDebridKey(event.target.value)}
          />
        </label>
        <div className="addons__install">
          <Button
            variant="ghost"
            disabled={!debridKey.trim()}
            onClick={() => {
              if (!debridKey.trim()) return;
              void saveSettings({ debrid: { ...settings.debrid, apiKey: debridKey } })
                .then(() => {
                  setDebridKey('');
                  setDebridMessage('Clave guardada');
                })
                .catch((cause: Error) => setDebridError(cause.message));
            }}
          >
            Guardar clave
          </Button>
          {settings.debrid.apiKey ? (
            <Button
              variant="ghost"
              onClick={() => {
                void saveSettings({ debrid: { ...settings.debrid, apiKey: '' } })
                  .then(() => setDebridMessage('Clave borrada'))
                  .catch((cause: Error) => setDebridError(cause.message));
              }}
            >
              Borrar clave
            </Button>
          ) : null}
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
            autoComplete="off"
            value={openSubtitlesKey}
            placeholder={settings.opensubtitles?.apiKey ? 'Clave guardada (escribe otra para cambiarla)' : 'Clave de OpenSubtitles'}
            onChange={(event) => setOpenSubtitlesKey(event.target.value)}
          />
        </label>
        <div className="addons__install">
          <Button
            variant="ghost"
            disabled={!openSubtitlesKey.trim()}
            onClick={() => {
              if (!openSubtitlesKey.trim()) return;
              void saveSettings({ opensubtitles: { apiKey: openSubtitlesKey } })
                .then(() => {
                  setOpenSubtitlesKey('');
                  setOpenSubtitlesMessage('Clave guardada');
                  setOpenSubtitlesError(null);
                })
                .catch((cause: Error) => setOpenSubtitlesError(cause.message));
            }}
          >
            Guardar clave
          </Button>
          {settings.opensubtitles?.apiKey ? (
            <Button
              variant="ghost"
              onClick={() => {
                void saveSettings({ opensubtitles: { apiKey: '' } })
                  .then(() => setOpenSubtitlesMessage('Clave borrada'))
                  .catch((cause: Error) => setOpenSubtitlesError(cause.message));
              }}
            >
              Borrar clave
            </Button>
          ) : null}
        </div>
        {openSubtitlesMessage ? <p className="panel__ok">{openSubtitlesMessage}</p> : null}
        {openSubtitlesError ? <ErrorState message={openSubtitlesError} /> : null}
      </section>
        </>
      ) : null}

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

      {!essential ? (
        <>
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
        </>
      ) : null}

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
        <h2>Perfil</h2>
        <p className="panel__hint">
          {activeProfile?.name ?? 'Sin perfil'} · idioma de fuentes: {activeProfile?.contentLanguage ?? 'sin elegir'}.
          Cambia el nombre o idioma en Perfiles; se conserva junto a tus listas y progreso.
        </p>
        <Button variant="ghost" onClick={() => navigate({ name: 'profiles' })}>
          Cambiar perfil o idioma
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
