/**
 * Configuracion del addon (`manifest.behaviorHints.configurable`).
 *
 * El SDK de Stremio define como se configura un addon sin cuenta ni servidor
 * propio: el manifest declara `config` (campos) y `behaviorHints.configurable`,
 * el cliente muestra un boton «Configure» que apunta a `/configure`, y la URL
 * del addon configurado pasa a ser `https://host/{config}/manifest.json`, donde
 * `{config}` es el JSON de valores codificado en la propia ruta. Los recursos
 * se piden entonces como `/{config}/catalog/...`, `/{config}/stream/...`.
 *
 * Aqui se implementa ese convenio para Vibe Flix, de modo que un usuario de
 * Stremio, WuPlay o Nuvio pueda limitar la calidad, elegir idioma o activar
 * Clean SDH **sin tocar el servidor**: la configuracion viaja en la URL.
 */

import type { Stream } from '@vibeflix/addon-engine';

/** Valores de configuracion reconocidos. */
export interface AddonConfig {
  /** Idioma preferido (audio y fuentes nativas). */
  language?: string;
  /** Techo de altura en pixeles (2160, 1080, 720...). */
  maxHeight?: number;
  /** Techo de bitrate en Mbps. */
  maxBitrateMbps?: number;
  /** Clean SDH en los subtitulos servidos. */
  cleanSdh?: boolean;
  /** Subtitulos solo cuando el audio es extranjero. */
  subtitlesOnlyForeign?: boolean;
  /** Ocultar el contenido para adultos. */
  hideAdult?: boolean;
  /** Orden de catalogos preferido (ids separados por comas). */
  catalogOrder?: string;
}

/** Campo de configuracion tal y como lo describe el manifest (formato SDK). */
export interface ConfigField {
  key: string;
  type: 'text' | 'number' | 'password' | 'checkbox' | 'select';
  title: string;
  default?: string;
  options?: string[];
  required?: boolean;
}

/** Idiomas ofrecidos en el configurador (los que entienden las fuentes nativas). */
export const CONFIG_LANGUAGES = ['es', 'en', 'pt', 'fr', 'de', 'it', 'pl', 'ar', 'hi', 'ja', 'ko', 'zh'];

/** Alturas ofrecidas en el configurador. */
export const CONFIG_HEIGHTS = ['2160', '1440', '1080', '720', '576', '480'];

/** Campos del manifest (`manifest.config`). */
export function addonConfigFields(): ConfigField[] {
  return [
    {
      key: 'language',
      type: 'select',
      title: 'Idioma preferido / Preferred language',
      options: CONFIG_LANGUAGES,
      default: 'es',
    },
    {
      key: 'maxHeight',
      type: 'select',
      title: 'Calidad maxima / Maximum quality',
      options: CONFIG_HEIGHTS,
      default: '1080',
    },
    {
      key: 'maxBitrateMbps',
      type: 'number',
      title: 'Bitrate maximo (Mbps, 0 = sin limite)',
      default: '0',
    },
    { key: 'cleanSdh', type: 'checkbox', title: 'Clean SDH (quitar hablantes y anotaciones)' },
    { key: 'subtitlesOnlyForeign', type: 'checkbox', title: 'Subtitulos solo para audio extranjero' },
    { key: 'hideAdult', type: 'checkbox', title: 'Ocultar contenido adulto' },
  ];
}

/** Codifica la configuracion en la ruta (convencion del SDK: JSON en la URL). */
export function encodeAddonConfig(config: AddonConfig): string {
  const clean = pruneConfig(config);
  if (!Object.keys(clean).length) return '';
  return encodeURIComponent(JSON.stringify(clean));
}

/** Quita los valores por defecto para que la URL sea corta. */
export function pruneConfig(config: AddonConfig): AddonConfig {
  const result: AddonConfig = {};
  if (config.language && config.language !== 'es') result.language = config.language;
  if (config.maxHeight && config.maxHeight !== 1080) result.maxHeight = config.maxHeight;
  if (config.maxBitrateMbps && config.maxBitrateMbps > 0) result.maxBitrateMbps = config.maxBitrateMbps;
  if (config.cleanSdh) result.cleanSdh = true;
  if (config.subtitlesOnlyForeign) result.subtitlesOnlyForeign = true;
  if (config.hideAdult) result.hideAdult = true;
  if (config.catalogOrder) result.catalogOrder = config.catalogOrder;
  return result;
}

/**
 * Descodifica la configuracion de la ruta o del query.
 *
 * Se aceptan las dos formas que aparecen en la practica: el JSON codificado
 * del SDK y pares `clave=valor` (utiles para pruebas y para clientes que no
 * implementan el convenio).
 */
export function decodeAddonConfig(raw?: string | null): AddonConfig | undefined {
  if (!raw) return undefined;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const text = decoded.trim();
  if (!text) return undefined;

  const source: Record<string, unknown> = {};
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      Object.assign(source, parsed);
    } catch {
      return undefined;
    }
  } else if (text.includes('=')) {
    for (const pair of text.split('&')) {
      const index = pair.indexOf('=');
      if (index === -1) continue;
      source[pair.slice(0, index)] = pair.slice(index + 1);
    }
  } else {
    return undefined;
  }

  const number = (value: unknown): number | undefined => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };
  const bool = (value: unknown): boolean => value === true || value === 'true' || value === '1' || value === 'on';

  const config: AddonConfig = {};
  if (typeof source['language'] === 'string' && source['language']) config.language = source['language'];
  const maxHeight = number(source['maxHeight'] ?? source['quality']);
  if (maxHeight) config.maxHeight = maxHeight;
  const maxBitrate = number(source['maxBitrateMbps'] ?? source['maxBitrate']);
  if (maxBitrate) config.maxBitrateMbps = maxBitrate;
  if (bool(source['cleanSdh'])) config.cleanSdh = true;
  if (bool(source['subtitlesOnlyForeign'])) config.subtitlesOnlyForeign = true;
  if (bool(source['hideAdult'])) config.hideAdult = true;
  if (typeof source['catalogOrder'] === 'string') config.catalogOrder = source['catalogOrder'];

  return Object.keys(config).length ? config : undefined;
}

/** Altura declarada en el nombre/descripcion de un stream (0 si no aparece). */
export function streamHeightOf(stream: Stream): number {
  const text = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename]
    .filter(Boolean)
    .join(' ');
  const match = /\b(2160|1440|1080|720|576|540|480|360)p\b|\b(4k|uhd)\b/i.exec(text);
  if (!match) return 0;
  const value = match[1] ?? (match[2] ? '2160' : '');
  const height = Number(value);
  return Number.isFinite(height) ? height : 0;
}

/** Bitrate declarado en el nombre del stream, en Mbps (0 si no aparece). */
export function streamBitrateOf(stream: Stream): number {
  const text = [stream.name, stream.title, stream.description].filter(Boolean).join(' ');
  const match = /(\d+(?:[.,]\d+)?)\s?(?:mbps|mb\/s|mbs)\b/i.exec(text);
  if (!match) return 0;
  const value = Number((match[1] ?? '0').replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Aplica los techos de la configuracion a la lista de streams.
 *
 * No se descartan los que no declaran calidad (seria tirar fuentes validas):
 * solo se filtran los que **declaran** pasar del limite, y si al final no queda
 * ninguno se devuelve la lista original.
 */
export function applyConfigToStreams(streams: Stream[], config?: AddonConfig): Stream[] {
  if (!config || (!config.maxHeight && !config.maxBitrateMbps)) return streams;

  const allowed = streams.filter((stream) => {
    const height = streamHeightOf(stream);
    if (config.maxHeight && height > config.maxHeight) return false;
    const bitrate = streamBitrateOf(stream);
    if (config.maxBitrateMbps && bitrate > config.maxBitrateMbps) return false;
    return true;
  });

  return allowed.length ? allowed : streams;
}

/** Sufijo legible para el nombre del addon configurado. */
export function configSuffix(config?: AddonConfig): string {
  if (!config) return '';
  const parts: string[] = [];
  if (config.language) parts.push(config.language.toUpperCase());
  if (config.maxHeight) parts.push(config.maxHeight >= 2160 ? '4K' : `${config.maxHeight}p`);
  if (config.maxBitrateMbps) parts.push(`${config.maxBitrateMbps}Mbps`);
  if (config.cleanSdh) parts.push('Clean SDH');
  return parts.length ? ` (${parts.join(' · ')})` : '';
}
