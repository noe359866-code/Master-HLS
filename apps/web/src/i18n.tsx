/**
 * Enlace entre React y `@vibeflix/i18n`.
 *
 * El paquete de idiomas es independiente de React (lo usan el servidor y el
 * APK de referencia); aqui se envuelve en un proveedor minimo para que las
 * pantallas se re-rendericen cuando cambia el idioma y para aplicar la
 * direccion del texto (`dir`) al documento.
 *
 * Las claves son las de `stremio-translations` (`PLAYER_PLAY`, `TYPE_movie`...),
 * de modo que añadir un idioma nuevo sea copiar un fichero de ese proyecto.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  LOCALES,
  createTranslator,
  getTranslator,
  localeLabel,
  onLocaleChange,
  setLocale,
  type TranslationKey,
  type Translator,
  type TranslationParams,
} from '@vibeflix/i18n';

interface I18nContextValue {
  /** Traductor activo. */
  translator: Translator;
  /** Etiqueta del idioma activo (`es`, `en`...). */
  locale: string;
  /** `ltr` o `rtl` segun el diccionario activo. */
  dir: 'ltr' | 'rtl';
  /** Traduce una clave. */
  t: (key: TranslationKey | string, params?: TranslationParams) => string;
  /** Cambia el idioma activo. */
  change: (tag: string) => void;
  /** Idiomas disponibles para el selector. */
  locales: Array<{ tag: string; label: string; translated: boolean }>;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  /** Idioma inicial (el de los ajustes del servidor). */
  locale?: string;
  children: ReactNode;
}

/** Provee el traductor activo a toda la app. */
export function I18nProvider({ locale, children }: I18nProviderProps) {
  const [translator, setTranslator] = useState<Translator>(() =>
    locale ? createTranslator(locale) : getTranslator(),
  );

  // El idioma puede cambiar desde otra pantalla o desde otro dispositivo
  // (los ajustes se sincronizan): se escucha el evento global del paquete.
  useEffect(() => onLocaleChange(setTranslator), []);

  useEffect(() => {
    if (locale && locale !== translator.requested) setTranslator(setLocale(locale));
  }, [locale, translator.requested]);

  // `dir` sigue al diccionario activo, no a la etiqueta pedida: un idioma sin
  // traduccion cae a español y el texto no puede pintarse en un layout RTL.
  useEffect(() => {
    document.documentElement.lang = translator.locale;
    document.documentElement.dir = translator.dir;
  }, [translator.locale, translator.dir]);

  const change = useCallback((tag: string) => {
    setTranslator(setLocale(tag));
  }, []);

  const t = useCallback(
    (key: TranslationKey | string, params?: TranslationParams) => translator.t(key, params),
    [translator],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      translator,
      locale: translator.locale,
      dir: translator.dir,
      t,
      change,
      locales: LOCALES.map((entry) => ({
        tag: entry.tag,
        label: localeLabel(entry.tag),
        translated: entry.translated,
      })),
    }),
    [translator, t, change],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Acceso al traductor activo. */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (context) return context;
  // Fuera del proveedor (tests, modulos sueltos): se usa el singleton.
  const translator = getTranslator();
  return {
    translator,
    locale: translator.locale,
    dir: translator.dir,
    t: (key, params) => translator.t(key, params),
    change: (tag) => setLocale(tag),
    locales: LOCALES.map((entry) => ({ tag: entry.tag, label: localeLabel(entry.tag), translated: entry.translated })),
  };
}

/** Solo la funcion de traducir (para no suscribirse al contexto entero). */
export function useT(): (key: TranslationKey | string, params?: TranslationParams) => string {
  return useI18n().t;
}
