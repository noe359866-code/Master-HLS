/**
 * Política de visibilidad por modo de experiencia (NuvioTV: `essential-mode.md`).
 *
 * NuvioTV define una matriz de visibilidad: qué ajustes, pantallas y controles
 * del reproductor se muestran en «Essential» vs «Advanced». El modo no
 * desactiva funciones: solo cambia la visibilidad; todo sigue disponible al
 * volver a Advanced.
 *
 * Aquí se centraliza esa política para el servidor y la web: qué secciones de
 * Ajustes, qué controles del reproductor y qué pantallas están visibles en
 * cada modo. Así el cliente no tiene que duplicar las reglas.
 */

export type ExperienceMode = 'essential' | 'advanced';

/** Sección de la pantalla de Ajustes. */
export type SettingsSection =
  | 'account'
  | 'profiles'
  | 'appearance'
  | 'layout'
  | 'plugins'
  | 'integration'
  | 'playback'
  | 'trakt'
  | 'debrid'
  | 'scrapers'
  | 'filters'
  | 'device'
  | 'about'
  | 'advanced'
  | 'debug';

/** Control del reproductor. */
export type PlayerControl =
  | 'playPause'
  | 'nextEpisode'
  | 'subtitles'
  | 'audio'
  | 'sources'
  | 'episodes'
  | 'engineSwitch'
  | 'speed'
  | 'aspectRatio'
  | 'externalPlayer'
  | 'streamInfo'
  | 'torrentStats';

/** Visibilidad por modo: true = visible. */
const SETTINGS_VISIBILITY: Record<ExperienceMode, Record<SettingsSection, boolean>> = {
  essential: {
    account: true,
    profiles: true,
    appearance: true,
    layout: false,
    plugins: false,
    integration: false,
    playback: true,
    trakt: false,
    debrid: false,
    scrapers: false,
    filters: false,
    device: false,
    about: true,
    advanced: false,
    debug: false,
  },
  advanced: {
    account: true,
    profiles: true,
    appearance: true,
    layout: true,
    plugins: true,
    integration: true,
    playback: true,
    trakt: true,
    debrid: true,
    scrapers: true,
    filters: true,
    device: true,
    about: true,
    advanced: true,
    debug: true,
  },
};

const PLAYER_VISIBILITY: Record<ExperienceMode, Record<PlayerControl, boolean>> = {
  essential: {
    playPause: true,
    nextEpisode: true,
    subtitles: true,
    audio: true,
    sources: true,
    episodes: true,
    engineSwitch: false,
    speed: false,
    aspectRatio: false,
    externalPlayer: false,
    streamInfo: false,
    torrentStats: false,
  },
  advanced: {
    playPause: true,
    nextEpisode: true,
    subtitles: true,
    audio: true,
    sources: true,
    episodes: true,
    engineSwitch: true,
    speed: true,
    aspectRatio: true,
    externalPlayer: true,
    streamInfo: true,
    torrentStats: true,
  },
};

/** true si la sección de Ajustes es visible en el modo dado. */
export function isSettingsSectionVisible(mode: ExperienceMode, section: SettingsSection): boolean {
  return SETTINGS_VISIBILITY[mode]?.[section] ?? false;
}

/** true si el control del reproductor es visible en el modo dado. */
export function isPlayerControlVisible(mode: ExperienceMode, control: PlayerControl): boolean {
  return PLAYER_VISIBILITY[mode]?.[control] ?? false;
}

/** Secciones visibles ordenadas para el modo dado. */
export function visibleSettingsSections(mode: ExperienceMode): SettingsSection[] {
  const map = SETTINGS_VISIBILITY[mode];
  return (Object.keys(map) as SettingsSection[]).filter((key) => map[key]);
}

/** Controles visibles para el modo dado. */
export function visiblePlayerControls(mode: ExperienceMode): PlayerControl[] {
  const map = PLAYER_VISIBILITY[mode];
  return (Object.keys(map) as PlayerControl[]).filter((key) => map[key]);
}

/** Resuelve el modo desde los ajustes (por defecto advanced para instalaciones existentes). */
export function resolveExperienceMode(uiMode: unknown): ExperienceMode {
  return uiMode === 'essential' ? 'essential' : 'advanced';
}
