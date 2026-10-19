/**
 * Apariencia de los subtitulos y modo de video.
 *
 * WuPlay expone en Ajustes > Reproduccion el tamano, los **colores** (v0.8.3
 * anadio verde y gris), la **opacidad** (v0.8.3) y el estilo «Clean SDH»;
 * Stremio tiene posicion vertical y tamano. Aqui se modelan como datos puros y
 * se traducen a variables CSS, de modo que el mismo estilo se pueda aplicar en
 * la web, en el APK y en el proxy de subtitulos del servidor.
 */

/** Colores de subtitulos disponibles (identificador estable + valor CSS). */
export const SUBTITLE_COLORS = [
  { id: 'white', label: 'Blanco', value: '#ffffff' },
  { id: 'yellow', label: 'Amarillo', value: '#ffe27a' },
  { id: 'cyan', label: 'Cian', value: '#8ef0ff' },
  { id: 'green', label: 'Verde', value: '#9dff9d' },
  { id: 'gray', label: 'Gris', value: '#c9ced8' },
  { id: 'orange', label: 'Naranja', value: '#ffb26b' },
] as const;

export type SubtitleColorId = (typeof SUBTITLE_COLORS)[number]['id'];

/** Escalas de tamano (multiplicador sobre el tamano base). */
export const SUBTITLE_SIZES = [
  { id: 'xxs', label: 'XXS', scale: 0.25 },
  { id: 'xs', label: 'XS', scale: 0.5 },
  { id: 'small', label: 'S', scale: 0.85 },
  { id: 'normal', label: 'M', scale: 1 },
  { id: 'large', label: 'L', scale: 1.25 },
  { id: 'xl', label: 'XL', scale: 1.5 },
] as const;

export type SubtitleSizeId = (typeof SUBTITLE_SIZES)[number]['id'];

/** Contorno/sombra del texto. */
export const SUBTITLE_EDGES = ['none', 'outline', 'shadow', 'raised'] as const;
export type SubtitleEdge = (typeof SUBTITLE_EDGES)[number];

/** Modo de encuadre del video (Stremio: «Cycle Video Scale»). */
export const VIDEO_SCALES = ['contain', 'cover', 'fill', 'zoom'] as const;
export type VideoScale = (typeof VIDEO_SCALES)[number];

export interface SubtitleStyle {
  /** Tamano (multiplicador). */
  size: number;
  /** Color del texto. */
  color: string;
  /** Opacidad del texto (0-1). */
  opacity: number;
  /** Color de fondo de la caja. */
  backgroundColor: string;
  /** Opacidad del fondo (0 = sin caja). */
  backgroundOpacity: number;
  /** Contorno del texto. */
  edge: SubtitleEdge;
  /** Posicion vertical en porcentaje desde abajo (Stremio: Vertical Position). */
  verticalPosition: number;
  /** Negrita. */
  bold: boolean;
  /** Familia tipografica. */
  fontFamily: string;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  size: 1,
  color: '#ffffff',
  opacity: 1,
  backgroundColor: '#000000',
  backgroundOpacity: 0.35,
  edge: 'outline',
  verticalPosition: 8,
  bold: false,
  fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/** Completa y limita un estilo parcial (lo que llega de los ajustes). */
export function normalizeSubtitleStyle(style?: Partial<SubtitleStyle> | null): SubtitleStyle {
  const base = { ...DEFAULT_SUBTITLE_STYLE, ...(style ?? {}) };
  return {
    ...base,
    // Los ajustes guardan el identificador estable (`white`, `green`); aqui se
    // resuelve al valor CSS para que el que pinta no tenga que saberlo.
    color: resolveSubtitleColor(base.color),
    // Rangos estilo WuPlay (v0.6.5: «Subtitle min. size reduced from 50% to
    // 25%», «max. offset increased from 30% to 95%»).
    size: clamp(base.size, 0.25, 2.5),
    opacity: clamp(base.opacity, 0.2, 1),
    backgroundOpacity: clamp(base.backgroundOpacity, 0, 1),
    verticalPosition: clamp(base.verticalPosition, 0, 95),
    edge: SUBTITLE_EDGES.includes(base.edge) ? base.edge : 'outline',
    bold: Boolean(base.bold),
  };
}

/** Convierte el estilo a variables CSS para el contenedor del reproductor. */
export function subtitleCssVars(style?: Partial<SubtitleStyle> | null): Record<string, string> {
  const resolved = normalizeSubtitleStyle(style);
  const textShadow =
    resolved.edge === 'outline'
      ? '0 0 4px rgba(0,0,0,0.95), 1px 1px 2px rgba(0,0,0,0.9)'
      : resolved.edge === 'shadow'
        ? '2px 3px 6px rgba(0,0,0,0.85)'
        : resolved.edge === 'raised'
          ? '0 1px 0 rgba(0,0,0,0.9), 0 2px 0 rgba(0,0,0,0.7)'
          : 'none';

  return {
    '--sub-scale': String(resolved.size),
    '--sub-color': resolved.color,
    '--sub-opacity': String(resolved.opacity),
    '--sub-bg': resolved.backgroundColor,
    '--sub-bg-opacity': String(resolved.backgroundOpacity),
    '--sub-shadow': textShadow,
    '--sub-bottom': `${resolved.verticalPosition}%`,
    '--sub-weight': resolved.bold ? '700' : '500',
    '--sub-font': resolved.fontFamily,
  };
}

/** `object-fit` y transform para cada modo de video. */
export function videoScaleCss(scale: VideoScale): { objectFit: string; transform: string } {
  switch (scale) {
    case 'cover':
      return { objectFit: 'cover', transform: 'none' };
    case 'fill':
      return { objectFit: 'fill', transform: 'none' };
    case 'zoom':
      return { objectFit: 'contain', transform: 'scale(1.15)' };
    case 'contain':
    default:
      return { objectFit: 'contain', transform: 'none' };
  }
}

/** Siguiente modo de video (ciclico). */
export function nextVideoScale(current: VideoScale): VideoScale {
  const index = VIDEO_SCALES.indexOf(current);
  return VIDEO_SCALES[(index + 1) % VIDEO_SCALES.length] ?? 'contain';
}

/** Etiqueta legible del modo de video. */
export function videoScaleLabel(scale: VideoScale): string {
  const labels: Record<VideoScale, string> = {
    contain: 'Normal',
    cover: 'Rellenar',
    fill: 'Estirar',
    zoom: 'Zoom',
  };
  return labels[scale];
}

/** Resuelve un color por identificador o devuelve el valor tal cual. */
export function resolveSubtitleColor(colorOrId: string): string {
  const found = SUBTITLE_COLORS.find((entry) => entry.id === colorOrId);
  return found ? found.value : colorOrId;
}

/**
 * true si los subtitulos deben activarse solos al empezar.
 *
 * WuPlay v0.8.2 anadio «Show subtitles only for foreign audio»: si el audio ya
 * esta en el idioma del usuario, los subtitulos no se activan; si es otro
 * idioma, si. Se aplica igual en la web y en el APK.
 */
export function shouldEnableSubtitles(options: {
  audioLanguage?: string;
  contentLanguage?: string;
  subtitleLanguage?: string;
  onlyForForeignAudio?: boolean;
  preferSubtitles?: boolean;
}): boolean {
  if (options.preferSubtitles === false) return false;
  if (!options.onlyForForeignAudio) return options.preferSubtitles ?? true;

  const audio = primary(options.audioLanguage);
  const mine = primary(options.contentLanguage ?? options.subtitleLanguage);
  if (!audio || !mine) return true;
  return !sameLanguage(audio, mine);
}

/** Aliases ISO 639-2 → 639-1 usados por los addons. */
const LANGUAGE_ALIASES: Record<string, string> = {
  spa: 'es', esp: 'es', esn: 'es',
  eng: 'en', enu: 'en',
  fre: 'fr', fra: 'fr',
  ger: 'de', deu: 'de',
  por: 'pt', ptb: 'pt',
  ita: 'it',
  jpn: 'ja',
  kor: 'ko',
  chi: 'zh', zho: 'zh',
  ara: 'ar',
  rus: 'ru',
  hin: 'hi',
  tur: 'tr',
};

function primary(language?: string): string {
  const value = (language ?? '').toLowerCase().replace('_', '-').split('-')[0] ?? '';
  return LANGUAGE_ALIASES[value] ?? value;
}

/** Compara dos idiomas tolerando aliases y variantes regionales. */
export function sameLanguage(a?: string, b?: string): boolean {
  const left = primary(a);
  const right = primary(b);
  if (!left || !right) return false;
  return left === right;
}

/** Idioma normalizado (para pintar en la interfaz). */
export function normalizeLanguage(language?: string): string {
  return primary(language);
}
