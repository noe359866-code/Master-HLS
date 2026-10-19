/**
 * Imagenes: tamano correcto para cada hueco de la interfaz.
 *
 * Los catalogos de Stremio devuelven posters de TMDb (y de otros proveedores)
 * con anchos fijos en la URL (`/t/p/w342`, `/t/p/original`). Pedir `original`
 * para una tarjeta de 160 px es el mayor desperdicio de red de una app de TV:
 * en una fila de 12 posters son decenas de megabytes.
 *
 * Aqui se reescribe la URL al ancho minimo suficiente segun el tamano real del
 * hueco y el `devicePixelRatio` del dispositivo, sin tocar el resto del enlace.
 */

/** Anchos que publica TMDb para posters. */
export const TMDB_POSTER_WIDTHS = [92, 154, 185, 342, 500, 780] as const;
/** Anchos que publica TMDb para fondos (backdrops). */
export const TMDB_BACKDROP_WIDTHS = [300, 780, 1280] as const;

/** true si la URL es de TMDb (o de un espejo con el mismo esquema `/t/p/`). */
export function isTmdbImage(url?: string | null): boolean {
  if (!url) return false;
  return /image\.tmdb\.org|themoviedb\.org|\/t\/p\//i.test(url);
}

/** Elige el ancho publicado mas pequeno que cubra el hueco necesario. */
export function pickWidth(needed: number, available: readonly number[]): number {
  const sorted = [...available].sort((a, b) => a - b);
  for (const width of sorted) {
    if (width >= needed) return width;
  }
  return sorted[sorted.length - 1] ?? needed;
}

/**
 * Reescribe una URL de TMDb al ancho pedido.
 *
 * Devuelve la URL original si no es de TMDb o si ya apunta a ese ancho: asi es
 * segura de usar en cualquier poster, venga del addon que venga.
 */
export function resizeTmdbImage(
  url: string | undefined | null,
  neededWidth: number,
  kind: 'poster' | 'backdrop' = 'poster',
): string | undefined {
  if (!url) return undefined;
  if (!isTmdbImage(url)) return url;
  const available = kind === 'poster' ? TMDB_POSTER_WIDTHS : TMDB_BACKDROP_WIDTHS;
  const width = pickWidth(Math.max(1, Math.round(neededWidth)), available);
  const replaced = url.replace(/\/t\/p\/(?:original|w\d+)\//i, `/t/p/w${width}/`);
  if (replaced !== url) return replaced;
  // URLs sin perfil (`/t/p/xxxx.jpg`): se anade el perfil elegido.
  return url.replace(/\/t\/p\//i, `/t/p/w${width}/`);
}

/** Ancho de poster necesario para un hueco dado (con `devicePixelRatio`). */
export function posterWidthFor(cssWidth: number, devicePixelRatio = 1): number {
  return Math.max(92, Math.round(cssWidth * Math.min(devicePixelRatio || 1, 2)));
}

/** Poster para una tarjeta de un ancho CSS dado. */
export function posterFor(url: string | undefined | null, cssWidth: number, dpr = 1): string | undefined {
  return resizeTmdbImage(url, posterWidthFor(cssWidth, dpr), 'poster');
}

/** Fondo para un hero de un ancho CSS dado. */
export function backdropFor(url: string | undefined | null, cssWidth: number, dpr = 1): string | undefined {
  return resizeTmdbImage(url, posterWidthFor(cssWidth, dpr), 'backdrop');
}

/**
 * URL de un poster a partir de una meta que puede traer `poster` o
 * `landscapePoster` (y `background` como ultimo recurso).
 */
export function bestImage(meta: {
  poster?: string;
  landscapePoster?: string;
  background?: string;
}, prefer: 'poster' | 'landscape' = 'poster'): string | undefined {
  if (prefer === 'landscape') {
    return meta.landscapePoster ?? meta.background ?? meta.poster;
  }
  return meta.poster ?? meta.landscapePoster ?? meta.background;
}
