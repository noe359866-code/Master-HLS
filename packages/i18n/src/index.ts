/**
 * `@vibeflix/i18n` — traduccion de la interfaz.
 *
 * Diseno:
 *  - Las claves y los textos base vienen de **stremio-translations** (mismos
 *    nombres, mismas traducciones) para que la app hable el idioma de Stremio y
 *    para poder importar mas locales del proyecto upstream sin renombrar nada.
 *  - Un diccionario es un objeto plano `clave → texto`: barato de cargar, sin
 *    dependencias y serializable (se puede enviar al cliente o al APK).
 *  - Reserva por clave: si falta una traduccion se usa el ingles y, si tampoco,
 *    la propia clave. Asi una traduccion a medias nunca deja huecos en blanco
 *    (el fallo que WuPlay corrigio en v0.9.2: «Newer screens and settings are
 *    now translated in every supported language»).
 *  - Interpolacion compatible con los dos formatos de Stremio: `%s`/`%d`
 *    (posicional) y `{{nombre}}` (con nombre).
 */

import { DICTIONARIES, EN, type TranslationKey } from './strings.js';
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  isRtl,
  localeInfo,
  LOCALES,
  TRANSLATED_LOCALES,
  type LocaleInfo,
} from './locales.js';

export type { LocaleInfo, TranslationKey };
export {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LOCALES,
  TRANSLATED_LOCALES,
  localeInfo,
  isRtl,
  DICTIONARIES,
};
export { localeLabel, contentLanguages } from './locales.js';

export type Dictionary = Record<TranslationKey, string>;

/** Parametros de interpolacion: lista posicional o mapa con nombre. */
export type TranslationParams = Record<string, string | number> | Array<string | number>;

/** Normaliza una etiqueta (`es_ES`, `ES-es`, `es`) al idioma del diccionario. */
export function resolveLocale(tag?: string | null): string {
  const value = (tag ?? '').trim();
  if (!value) return DEFAULT_LOCALE;
  const lower = value.toLowerCase().replace('_', '-');
  const primary = lower.split('-')[0] ?? '';
  if (DICTIONARIES[primary]) return primary;
  if (DICTIONARIES[lower]) return lower;
  return DEFAULT_LOCALE;
}

/**
 * true si el locale tiene diccionario propio (sin aplicar la reserva).
 *
 * Sirve para saber si un idioma esta realmente traducido: `resolveLocale`
 * siempre devuelve uno valido, asi que no vale para esta comprobacion.
 */
export function hasDictionary(locale?: string | null): boolean {
  const value = (locale ?? '').trim().toLowerCase().replace('_', '-');
  const primary = value.split('-')[0] ?? '';
  return Boolean(DICTIONARIES[primary] ?? DICTIONARIES[value]);
}

/**
 * Interpola una plantilla.
 *
 * Soporta `%s`/`%d` posicionales (lo que usa stremio-translations, p.ej.
 * `PLAYER_CLOCK_ENDS_AT = "Ends at %s"`) y `{{nombre}}` (usado por las cadenas
 * mas modernas del mismo proyecto).
 */
export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;

  if (Array.isArray(params)) {
    let index = 0;
    return template.replace(/%[sd]/g, () => {
      const value = params[index];
      index += 1;
      return value === undefined ? '' : String(value);
    });
  }

  const values = Object.values(params);
  let position = 0;
  return template
    .replace(/%[sd]/g, () => {
      const value = values[position];
      position += 1;
      return value === undefined ? '' : String(value);
    })
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
      const value = params[key];
      return value === undefined ? '' : String(value);
    });
}

export interface Translator {
  /** Idioma resuelto (el del diccionario que se usa). */
  locale: string;
  /** Idioma pedido originalmente (puede no tener diccionario). */
  requested: string;
  /** Etiqueta completa (`es-ES`). */
  tag: string;
  /** Direccion de escritura. */
  dir: 'ltr' | 'rtl';
  /** Traduce una clave. */
  t: (key: TranslationKey | string, params?: TranslationParams) => string;
  /** true si la clave existe en el diccionario activo. */
  has: (key: string) => boolean;
  /** Diccionario completo (util para volcar o depurar). */
  dictionary: Dictionary;
}

/** Busca una clave en el diccionario con reserva al ingles. */
function lookup(locale: string, key: string): string | undefined {
  const table = DICTIONARIES[locale] as Record<string, string> | undefined;
  if (table && Object.prototype.hasOwnProperty.call(table, key)) return table[key];
  if (locale !== FALLBACK_LOCALE) {
    const fallback = DICTIONARIES[FALLBACK_LOCALE] as Record<string, string>;
    if (Object.prototype.hasOwnProperty.call(fallback, key)) return fallback[key];
  }
  return undefined;
}

/**
 * Crea un traductor para un locale concreto.
 *
 * `dir` sigue al locale **resuelto**, no al pedido: si un idioma no tiene
 * diccionario se reserva al espanol y seria un error pintar texto en espanol
 * con layout de derecha a izquierda. `isRtl()` si responde por el idioma
 * pedido, para el dia en que se anada el diccionario.
 */
export function createTranslator(tag?: string | null): Translator {
  const locale = resolveLocale(tag);
  const info = localeInfo(locale) ?? localeInfo(DEFAULT_LOCALE);
  const dictionary = (DICTIONARIES[locale] ?? EN) as Dictionary;

  const t = (key: TranslationKey | string, params?: TranslationParams): string => {
    const template = lookup(locale, key);
    if (template === undefined) return interpolate(String(key), params);
    return interpolate(template, params);
  };

  return {
    locale,
    requested: (tag ?? DEFAULT_LOCALE).toString(),
    tag: info?.tag ?? locale,
    dir: isRtl(info?.language ?? locale) ? 'rtl' : 'ltr',
    t,
    has: (key: string) => lookup(locale, key) !== undefined,
    dictionary,
  };
}

// ------------------------------------------------------- instancia por defecto

let active: Translator = createTranslator(DEFAULT_LOCALE);
const listeners = new Set<(translator: Translator) => void>();

/** Cambia el idioma activo y avisa a los suscriptores. */
export function setLocale(tag?: string | null): Translator {
  active = createTranslator(tag);
  for (const listener of listeners) listener(active);
  return active;
}

/** Traductor activo. */
export function getTranslator(): Translator {
  return active;
}

/** Idioma activo. */
export function getLocale(): string {
  return active.locale;
}

/** Traduce con el traductor activo. */
export function t(key: TranslationKey | string, params?: TranslationParams): string {
  return active.t(key, params);
}

/** Se suscribe a los cambios de idioma. */
export function onLocaleChange(listener: (translator: Translator) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Localizacion de numeros con digitos estandar (evita sorpresas en TV). */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(active.tag, { numberingSystem: 'latn', ...options }).format(value);
  } catch {
    return String(value);
  }
}

/** Localizacion de fechas y horas. */
export function formatDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(active.tag, { numberingSystem: 'latn', ...options }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Nombre del tipo de contenido (`movie` → «Película»). */
export function typeLabel(type: string, plural = false): string {
  const key = `TYPE_${type}` as TranslationKey;
  const value = lookup(active.locale, key);
  if (!value) return type;
  if (!plural) return value;
  const pluralKey = `${key}_PL` as TranslationKey;
  return lookup(active.locale, pluralKey) ?? value;
}
