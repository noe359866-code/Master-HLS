/**
 * Locales de la interfaz.
 *
 * La lista reproduce los **51 locales que publica stremio-translations**, para
 * que el selector de idioma de Vibe Flix ofrezca exactamente los mismos y para
 * que anadir una traduccion nueva sea copiar el fichero correspondiente del
 * proyecto upstream (mismas claves) sin tocar nada mas.
 *
 * `translated` marca los locales que hoy tienen diccionario propio en
 * `@vibeflix/i18n`; el resto se resuelven por reserva (`es` → `en`) y se
 * listan como disponibles para el **idioma del contenido**, que si afecta a los
 * addons y a las fuentes nativas.
 */

export interface LocaleInfo {
  /** Etiqueta tal y como la usa stremio-translations (`es-ES`). */
  tag: string;
  /** Subetiqueta de idioma (`es`). */
  language: string;
  /** Nombre nativo. */
  nativeName: string;
  /** Nombre en ingles (para el selector bilingue). */
  englishName: string;
  /** Escritura de derecha a izquierda. */
  rtl: boolean;
  /** true si hay diccionario de interfaz completo. */
  translated: boolean;
}

export const LOCALES: LocaleInfo[] = [
  { tag: 'ar-AR', language: 'ar', nativeName: 'العربية', englishName: 'Arabic', rtl: true, translated: false },
  { tag: 'be-BY', language: 'be', nativeName: 'Беларуская', englishName: 'Belarusian', rtl: false, translated: false },
  { tag: 'bg-BG', language: 'bg', nativeName: 'Български', englishName: 'Bulgarian', rtl: false, translated: false },
  { tag: 'bn-BD', language: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', rtl: false, translated: false },
  { tag: 'ca-ES', language: 'ca', nativeName: 'Català', englishName: 'Catalan', rtl: false, translated: false },
  { tag: 'cs-CZ', language: 'cs', nativeName: 'Čeština', englishName: 'Czech', rtl: false, translated: false },
  { tag: 'da-DK', language: 'da', nativeName: 'Dansk', englishName: 'Danish', rtl: false, translated: false },
  { tag: 'de-DE', language: 'de', nativeName: 'Deutsch', englishName: 'German', rtl: false, translated: false },
  { tag: 'el-GR', language: 'el', nativeName: 'Ελληνικά', englishName: 'Greek', rtl: false, translated: false },
  { tag: 'en-US', language: 'en', nativeName: 'English', englishName: 'English', rtl: false, translated: true },
  { tag: 'eo-EO', language: 'eo', nativeName: 'Esperanto', englishName: 'Esperanto', rtl: false, translated: false },
  { tag: 'es-ES', language: 'es', nativeName: 'Español', englishName: 'Spanish', rtl: false, translated: true },
  { tag: 'et-EE', language: 'et', nativeName: 'Eesti', englishName: 'Estonian', rtl: false, translated: false },
  { tag: 'eu-ES', language: 'eu', nativeName: 'Euskara', englishName: 'Basque', rtl: false, translated: false },
  { tag: 'fa-IR', language: 'fa', nativeName: 'فارسی', englishName: 'Persian', rtl: true, translated: false },
  { tag: 'fi-FI', language: 'fi', nativeName: 'Suomi', englishName: 'Finnish', rtl: false, translated: false },
  { tag: 'fr-FR', language: 'fr', nativeName: 'Français', englishName: 'French', rtl: false, translated: false },
  { tag: 'he-IL', language: 'he', nativeName: 'עברית', englishName: 'Hebrew', rtl: true, translated: false },
  { tag: 'hi-IN', language: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', rtl: false, translated: false },
  { tag: 'hr-HR', language: 'hr', nativeName: 'Hrvatski', englishName: 'Croatian', rtl: false, translated: false },
  { tag: 'hu-HU', language: 'hu', nativeName: 'Magyar', englishName: 'Hungarian', rtl: false, translated: false },
  { tag: 'id-ID', language: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian', rtl: false, translated: false },
  { tag: 'it-IT', language: 'it', nativeName: 'Italiano', englishName: 'Italian', rtl: false, translated: false },
  { tag: 'ja-JP', language: 'ja', nativeName: '日本語', englishName: 'Japanese', rtl: false, translated: false },
  { tag: 'ko-KR', language: 'ko', nativeName: '한국어', englishName: 'Korean', rtl: false, translated: false },
  { tag: 'lt-LT', language: 'lt', nativeName: 'Lietuvių', englishName: 'Lithuanian', rtl: false, translated: false },
  { tag: 'mk-MK', language: 'mk', nativeName: 'Македонски', englishName: 'Macedonian', rtl: false, translated: false },
  { tag: 'my-BM', language: 'my', nativeName: 'ဗမာစာ', englishName: 'Burmese', rtl: false, translated: false },
  { tag: 'nb-NO', language: 'nb', nativeName: 'Norsk bokmål', englishName: 'Norwegian Bokmål', rtl: false, translated: false },
  { tag: 'ne-NP', language: 'ne', nativeName: 'नेपाली', englishName: 'Nepali', rtl: false, translated: false },
  { tag: 'nl-NL', language: 'nl', nativeName: 'Nederlands', englishName: 'Dutch', rtl: false, translated: false },
  { tag: 'nn-NO', language: 'nn', nativeName: 'Norsk nynorsk', englishName: 'Norwegian Nynorsk', rtl: false, translated: false },
  { tag: 'pa-IN', language: 'pa', nativeName: 'ਪੰਜਾਬੀ', englishName: 'Punjabi', rtl: false, translated: false },
  { tag: 'pl-PL', language: 'pl', nativeName: 'Polski', englishName: 'Polish', rtl: false, translated: false },
  { tag: 'pt-BR', language: 'pt', nativeName: 'Português (Brasil)', englishName: 'Portuguese (Brazil)', rtl: false, translated: false },
  { tag: 'pt-PT', language: 'pt', nativeName: 'Português', englishName: 'Portuguese', rtl: false, translated: false },
  { tag: 'ro-RO', language: 'ro', nativeName: 'Română', englishName: 'Romanian', rtl: false, translated: false },
  { tag: 'ru-RU', language: 'ru', nativeName: 'Русский', englishName: 'Russian', rtl: false, translated: false },
  { tag: 'sk-SK', language: 'sk', nativeName: 'Slovenčina', englishName: 'Slovak', rtl: false, translated: false },
  { tag: 'sl-SL', language: 'sl', nativeName: 'Slovenščina', englishName: 'Slovenian', rtl: false, translated: false },
  { tag: 'sr-RS', language: 'sr', nativeName: 'Српски', englishName: 'Serbian', rtl: false, translated: false },
  { tag: 'sv-SE', language: 'sv', nativeName: 'Svenska', englishName: 'Swedish', rtl: false, translated: false },
  { tag: 'ta-IN', language: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil', rtl: false, translated: false },
  { tag: 'te-IN', language: 'te', nativeName: 'తెలుగు', englishName: 'Telugu', rtl: false, translated: false },
  { tag: 'tr-TR', language: 'tr', nativeName: 'Türkçe', englishName: 'Turkish', rtl: false, translated: false },
  { tag: 'uk-UA', language: 'uk', nativeName: 'Українська', englishName: 'Ukrainian', rtl: false, translated: false },
  { tag: 'ur-PK', language: 'ur', nativeName: 'اردو', englishName: 'Urdu', rtl: true, translated: false },
  { tag: 'vi-VN', language: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese', rtl: false, translated: false },
  { tag: 'zh-CN', language: 'zh', nativeName: '简体中文', englishName: 'Chinese (Simplified)', rtl: false, translated: false },
  { tag: 'zh-HK', language: 'zh', nativeName: '繁體中文 (香港)', englishName: 'Chinese (Hong Kong)', rtl: false, translated: false },
  { tag: 'zh-TW', language: 'zh', nativeName: '繁體中文', englishName: 'Chinese (Traditional)', rtl: false, translated: false },
];

/** Idioma por defecto de la interfaz. */
export const DEFAULT_LOCALE = 'es';

/** Idioma de reserva cuando falta una clave. */
export const FALLBACK_LOCALE = 'en';

/** Locales con diccionario completo. */
export const TRANSLATED_LOCALES = LOCALES.filter((locale) => locale.translated).map(
  (locale) => locale.language,
);

/** Busca la informacion de un locale por etiqueta o por idioma. */
export function localeInfo(tagOrLanguage?: string): LocaleInfo | undefined {
  const value = (tagOrLanguage ?? '').trim();
  if (!value) return undefined;
  const lower = value.toLowerCase().replace('_', '-');
  return (
    LOCALES.find((locale) => locale.tag.toLowerCase() === lower) ??
    LOCALES.find((locale) => locale.language === lower.split('-')[0])
  );
}

/** Nombre nativo para el selector de idioma. */
export function localeLabel(tagOrLanguage?: string): string {
  return localeInfo(tagOrLanguage)?.nativeName ?? (tagOrLanguage ?? '');
}

/** true si el locale se escribe de derecha a izquierda. */
export function isRtl(tagOrLanguage?: string): boolean {
  return Boolean(localeInfo(tagOrLanguage)?.rtl);
}

/** Todos los idiomas que entienden los addons (para el idioma del contenido). */
export function contentLanguages(): Array<{ code: string; label: string }> {
  const seen = new Set<string>();
  const result: Array<{ code: string; label: string }> = [];
  for (const locale of LOCALES) {
    if (seen.has(locale.language)) continue;
    seen.add(locale.language);
    result.push({ code: locale.language, label: locale.nativeName });
  }
  return result;
}
