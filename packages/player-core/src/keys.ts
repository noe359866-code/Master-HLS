/**
 * Atajos de teclado / mando del reproductor.
 *
 * Se alinean con Stremio (mismas teclas para lo mismo, para no romper la
 * memoria muscular de quien viene de alli): `G`/`H` ajustan el desfase de
 * subtitulos, `S` abre el menu de subtitulos, `A` el de audio, `I` informacion,
 * `Space` reproduce o pausa. Las teclas de Stremio salen de
 * `stremio-translations` (`SETTINGS_SHORTCUT_*`).
 *
 * El mapa es una funcion pura: recibe un evento simplificado y devuelve la
 * accion, sin tocar el DOM. Asi se puede testear y reutilizar.
 */

/** Evento de teclado minimo (compatible con `KeyboardEvent`). */
export interface KeyLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  /** true si el foco esta en un campo de texto o un slider. */
  inField?: boolean;
}

/** Acciones que puede ejecutar el reproductor. */
export type PlayerAction =
  | { type: 'togglePlay' }
  | { type: 'seek'; deltaSeconds: number }
  | { type: 'seekPercent'; percent: number }
  | { type: 'frameStep'; deltaFrames: number }
  | { type: 'volume'; delta: number }
  | { type: 'toggleMute' }
  | { type: 'toggleFullscreen' }
  | { type: 'togglePiP' }
  | { type: 'cycleVideoScale' }
  | { type: 'speed'; direction: 1 | -1 }
  | { type: 'speedReset' }
  | { type: 'subtitleDelay'; deltaMs: number }
  | { type: 'subtitleSize'; direction: 1 | -1 }
  | { type: 'toggleSubtitles' }
  | { type: 'menu'; menu: 'subtitles' | 'audio' | 'quality' | 'speed' | 'info' | 'stats' | 'episodes' }
  | { type: 'nextEpisode' }
  | { type: 'previousEpisode' }
  | { type: 'skipIntro' }
  | { type: 'back' }
  | { type: 'showControls' }
  | { type: 'shortcuts' };

/** Paso del volumen con las flechas (0-1). */
export const VOLUME_STEP = 0.05;
/** Paso largo del volumen (con Shift). */
export const VOLUME_STEP_LONG = 0.2;
/** Fotogramas por salto de frame-step (asumiendo 24 fps → ~0.04 s). */
export const FRAME_STEP_SECONDS = 1 / 24;
/** Desfase de subtitulos por pulsacion (ms). */
export const SUBTITLE_DELAY_STEP = 250;

/**
 * Traduce una pulsacion a una accion del reproductor.
 * Devuelve `undefined` si la tecla no es del reproductor.
 */
export function playerAction(event: KeyLike): PlayerAction | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey) return undefined;
  if (event.inField) return undefined;

  const shift = Boolean(event.shiftKey);
  // Se compara en minusculas: en TV el mando no distingue mayusculas y el
  // teclado fisico las produce con Shift, que ya se usa para los pasos largos.
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  // Numeros: salto directo al 10 %, 20 %... 90 % y al final (0).
  if (/^[0-9]$/.test(key)) {
    const digit = Number(key);
    return { type: 'seekPercent', percent: digit === 0 ? 100 : digit * 10 };
  }

  switch (key) {
    case ' ':
    case 'Spacebar':
    case 'k':
    case 'MediaPlayPause':
    case 'Enter':
    case 'MediaPlay':
      return { type: 'togglePlay' };

    case 'ArrowLeft':
      return { type: 'seek', deltaSeconds: shift ? -60 : -10 };
    case 'ArrowRight':
      return { type: 'seek', deltaSeconds: shift ? 60 : 10 };
    case 'j':
      return { type: 'seek', deltaSeconds: -10 };
    case 'l':
      return { type: 'seek', deltaSeconds: 10 };
    case 'MediaTrackPrevious':
    case 'MediaRewind':
      return { type: 'previousEpisode' };
    case 'MediaTrackNext':
    case 'MediaFastForward':
      return { type: 'nextEpisode' };

    case ',':
      return { type: 'frameStep', deltaFrames: -1 };
    case '.':
      return { type: 'frameStep', deltaFrames: 1 };

    case 'ArrowUp':
      return { type: 'volume', delta: shift ? VOLUME_STEP_LONG : VOLUME_STEP };
    case 'ArrowDown':
      return { type: 'volume', delta: shift ? -VOLUME_STEP_LONG : -VOLUME_STEP };
    case 'm':
      return { type: 'toggleMute' };

    case 'f':
    case 'F11':
      return { type: 'toggleFullscreen' };
    case 'p':
      return { type: 'togglePiP' };
    case 'c':
      return { type: 'cycleVideoScale' };

    case '[':
      return { type: 'speed', direction: -1 };
    case ']':
      return { type: 'speed', direction: 1 };
    case '\\':
      return { type: 'speedReset' };

    // Stremio: G/H ajustan el desfase de subtitulos.
    case 'g':
      return { type: 'subtitleDelay', deltaMs: -SUBTITLE_DELAY_STEP };
    case 'h':
      return { type: 'subtitleDelay', deltaMs: SUBTITLE_DELAY_STEP };
    case '+':
    case '=':
      return { type: 'subtitleSize', direction: 1 };
    case '-':
    case '_':
      return { type: 'subtitleSize', direction: -1 };

    // S: menu de subtitulos; Shift+S: activar o desactivar directamente.
    case 's':
      return shift ? { type: 'toggleSubtitles' } : { type: 'menu', menu: 'subtitles' };
    case 'a':
      return { type: 'menu', menu: 'audio' };
    case 'q':
      return { type: 'menu', menu: 'quality' };
    case 'i':
      return { type: 'menu', menu: 'info' };
    case 't':
      return { type: 'menu', menu: 'stats' };
    case 'e':
      return { type: 'menu', menu: 'episodes' };
    case 'v':
      return { type: 'menu', menu: 'speed' };

    case 'n':
      return { type: 'nextEpisode' };
    case 'b':
      return { type: 'previousEpisode' };

    case 'x':
      return { type: 'skipIntro' };

    case 'Escape':
    case 'Backspace':
    case 'Back':
      return { type: 'back' };
    case '?':
      return { type: 'shortcuts' };
    default:
      return undefined;
  }
}

/** Lista de atajos para la ayuda en pantalla (clave + descripcion). */
export interface ShortcutEntry {
  keys: string;
  /** Clave de traduccion (`SETTINGS_SHORTCUT_*` de stremio-translations). */
  labelKey: string;
  action: PlayerAction['type'];
}

export const SHORTCUTS: ShortcutEntry[] = [
  { keys: 'Space / K', labelKey: 'SETTINGS_SHORTCUT_PLAY_PAUSE', action: 'togglePlay' },
  { keys: '← / →', labelKey: 'SETTINGS_SHORTCUT_SEEK_BACKWARD', action: 'seek' },
  { keys: 'Shift + ← / →', labelKey: 'SETTINGS_SHORTCUT_SEEK_FORWARD', action: 'seek' },
  { keys: '0-9', labelKey: 'SETTINGS_SHORTCUT_SEEK_NEXT', action: 'seekPercent' },
  { keys: ', / .', labelKey: 'SETTINGS_SHORTCUT_SEEK_PREV', action: 'frameStep' },
  { keys: '↑ / ↓', labelKey: 'SETTINGS_SHORTCUT_VOLUME', action: 'volume' },
  { keys: 'M', labelKey: 'SETTINGS_SHORTCUT_MUTE', action: 'toggleMute' },
  { keys: 'F', labelKey: 'SETTINGS_SHORTCUT_FULLSCREEN', action: 'toggleFullscreen' },
  { keys: 'P', labelKey: 'PLAYER_PIP', action: 'togglePiP' },
  { keys: 'C', labelKey: 'SETTINGS_SHORTCUT_VIDEO_SCALE', action: 'cycleVideoScale' },
  { keys: '[ / ]', labelKey: 'SETTINGS_SHORTCUT_PLAYBACK_SPEED', action: 'speed' },
  { keys: 'G / H', labelKey: 'SETTINGS_SHORTCUT_SUBTITLES_DELAY', action: 'subtitleDelay' },
  { keys: '+ / −', labelKey: 'SETTINGS_SHORTCUT_SUBTITLES_SIZE', action: 'subtitleSize' },
  { keys: 'S', labelKey: 'SETTINGS_SHORTCUT_MENU_SUBTITLES', action: 'menu' },
  { keys: 'A', labelKey: 'SETTINGS_SHORTCUT_MENU_AUDIO', action: 'menu' },
  { keys: 'Q', labelKey: 'SETTINGS_SHORTCUT_MENU_VIDEOS', action: 'menu' },
  { keys: 'I', labelKey: 'SETTINGS_SHORTCUT_MENU_INFO', action: 'menu' },
  { keys: 'T', labelKey: 'SETTINGS_SHORTCUT_MENU_STATISTICS', action: 'menu' },
  { keys: 'N / B', labelKey: 'SETTINGS_SHORTCUT_PLAY_NEXT', action: 'nextEpisode' },
  { keys: 'X', labelKey: 'SKIP_INTRO', action: 'skipIntro' },
  { keys: 'Esc', labelKey: 'SETTINGS_SHORTCUT_EXIT_BACK', action: 'back' },
];
