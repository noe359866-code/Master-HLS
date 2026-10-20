/**
 * Utilidades de URL del protocolo Stremio.
 *
 * Puntos delicados que resuelve este modulo:
 *  - El manifest puede traer query propia (`?apiKey=...`, `?token=...`) y TODAS
 *    las URLs de recurso deben heredarla. Es la causa mas comun de addons que
 *    "instalan pero no cargan".
 *  - Los ids de recurso se codifican con `encodeURIComponent` (`:`, `/` y `|`
 *    son legales en ids de Stremio, p.ej. `tt1234567:1:2` o `kitsu:1234`).
 *  - `extra` se serializa como `key=value&key2=value2` codificado.
 */

import { AddonError } from './types.js';

export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Normaliza un manifest URL: recorta, quita `configure=true` y slash final. */
export function normalizeManifestUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new AddonError('unknown', `URL de manifest invalida: ${input}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AddonError('unknown', `Protocolo no soportado en manifest: ${url.protocol}`);
  }
  url.searchParams.delete('configure');
  // Sin ruta, el addon expone el manifest en la raiz.
  if (url.pathname === '' || url.pathname === '/') url.pathname = '/manifest.json';
  return url.toString();
}

/** Query heredada del manifest (todo menos `configure`). */
export function manifestQuery(manifestUrl: string): Record<string, string> {
  const url = new URL(manifestUrl);
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  delete query['configure'];
  return query;
}

/**
 * Fusiona la query del manifest con parametros extra de configuracion.
 * Los parametros de configuracion tienen prioridad sobre los del manifest
 * (p.ej. un token rotado).
 */
export function mergeQuery(
  manifestUrl: string,
  config?: Record<string, string>,
): URLSearchParams {
  const params = new URLSearchParams(manifestQuery(manifestUrl));
  for (const [key, value] of Object.entries(config ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  return params;
}

/** Construye la URL base de un addon: `https://host/path` sin el manifest. */
export function addonBaseUrl(manifestUrl: string): string {
  const url = new URL(manifestUrl);
  url.pathname = url.pathname.replace(/\/manifest\.json$/i, '').replace(/\/$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export type ResourceKind = 'catalog' | 'meta' | 'stream' | 'subtitles' | 'other';

/**
 * Construye la URL de un recurso del addon preservando la query del manifest.
 *
 * `https://host/manifest.json?apiKey=1` + `catalog/movie/top` =>
 * `https://host/catalog/movie/top.json?apiKey=1`
 *
 * El `extra` de los catalogos va **en la ruta** (estilo canonico de Stremio:
 * `/catalog/movie/top/search=batman&skip=100.json`), no en la query: addons
 * como Cinemeta leen el extra de la ruta y descartan los query params.
 */
export function buildResourceUrl(
  manifestUrl: string,
  kind: ResourceKind,
  segments: string[],
  options?: {
    extra?: Record<string, string | number | undefined>;
    config?: Record<string, string>;
  },
): string {
  const base = addonBaseUrl(manifestUrl);
  const pathSegments = [kind, ...segments].map((segment) => encodeURIComponent(segment));
  const url = new URL(`${base}/${pathSegments.join('/')}.json`);

  const params = mergeQuery(manifestUrl, options?.config);
  url.search = params.toString();

  const extra = serializeExtra(options?.extra);
  if (extra) {
    // El extra va como ultimo segmento de la ruta: `.../top/search=x.json`.
    url.pathname = `${url.pathname.replace(/\.json$/, '')}/${extra}.json`;
  }

  return url.toString();
}

/** URL de configuracion de un addon (la que se abre en el navegador). */
export function buildConfigureUrl(manifestUrl: string): string {
  const url = new URL(manifestUrl);
  url.searchParams.set('configure', 'true');
  return url.toString();
}

/** Codifica el id de un recurso Stremio (p.ej. `tt123:1:2`). */
export function encodeContentId(id: string): string {
  return encodeURIComponent(id);
}

/** Decodifica un id de recurso. */
export function decodeContentId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

/**
 * `extra` serializado como query en estilo ruta: `genre=Action&skip=0`.
 * Los valores se codifican (un espacio debe ser `%20`), las claves no.
 */
export function serializeExtra(extra?: Record<string, string | number | undefined>): string {
  if (!extra) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${key}=${encodeURIComponent(String(value))}`);
  }
  return parts.join('&');
}
