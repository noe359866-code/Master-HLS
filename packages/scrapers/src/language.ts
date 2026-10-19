/**
 * Idiomas de las fuentes. La selección es por perfil, nunca por el nombre de
 * la web que devolvió el enlace. Se acepta idioma ISO y una región BCP-47
 * (es-419, es-ES, pt-BR...). Las etiquetas sin idioma son el último recurso.
 */

import type { ScrapeProvider } from './types.js';

/** Devuelve una etiqueta canónica o undefined si no es un idioma válido. */
export function normalizeLanguage(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const tag = value.trim().replace(/_/g, '-');
  if (!/^[a-z]{2,3}(?:-(?:[a-z]{2}|\d{3}))?$/i.test(tag)) return undefined;
  const [language, region] = tag.split('-');
  return region ? `${language!.toLowerCase()}-${region.toUpperCase()}` : language!.toLowerCase();
}

/**
 * Exacto > idioma genérico > otra región del mismo idioma > sin declarar.
 * Un proveedor que anuncia otro idioma no debe aparecer en el perfil.
 */
export function languagePriority(provider: ScrapeProvider, preference?: string): number {
  const chosen = normalizeLanguage(preference);
  if (!chosen) return 0; // Sin preferencia: consulta todos los proveedores.
  if (!provider.languages?.length) return 1;

  const languages = provider.languages.map(normalizeLanguage).filter((tag): tag is string => !!tag);
  if (languages.some((tag) => tag.toLowerCase() === chosen.toLowerCase())) return 4;
  const base = chosen.split('-')[0]!;
  if (chosen.includes('-') && languages.includes(base)) return 3;
  if (languages.some((tag) => tag.split('-')[0] === base)) return 2;
  return -1;
}
