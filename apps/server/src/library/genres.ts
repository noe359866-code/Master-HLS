/**
 * Generos y decadas (pantallas de contenido de estilo WuPlay).
 *
 * WuPlay tiene una pantalla de **Generos** (con tarjetas estilizadas) y otra
 * de **Decadas**. Aqui se reproducen con los datos que ya traverse la app:
 *
 *  - **Por genero**: se usa el extra `genre` de los catalogos que lo
 *    soporten (Cinemeta lo soporta), de modo que el contenido lo trae el
 *    addon de metadata, no un servicio externo.
 *  - **Por decada**: no hay un extra estandar para el ano, asi que el
 *    servidor agrega varias paginas de los catalogos y filtra por el ano de
 *   -estreno. Es un filtro nativo sobre los metadatos que ya tenemos.
 *
 * Los nombres se muestran traducidos (la app es en español) pero al addon se
 * le manda el valor canonico en ingles, que es el que espera.
 */

/** Generos de la pantalla de generos (WuPlay: accion, aventura, ...). */
export interface GenreEntry {
  /** Id estable para la personalizacion y las rutas. */
  id: string;
  /** Nombre visible (traducido). */
  name: string;
  /** Valor canonico que entiende el extra `genre` de los addons. */
  catalog: string;
  /** Emoji de la tarjeta. */
  emoji: string;
  /** Color de la tarjeta (gradiente). */
  color: string;
}

/** Generos disponibles, en el orden en que se muestran. */
export const GENRES: GenreEntry[] = [
  { id: 'action', name: 'Acción', catalog: 'Action', emoji: '💥', color: '#ff5f6d' },
  { id: 'adventure', name: 'Aventura', catalog: 'Adventure', emoji: '🗺️', color: '#f7971e' },
  { id: 'animation', name: 'Animación', catalog: 'Animation', emoji: '🎨', color: '#56ccf2' },
  { id: 'anime', name: 'Anime', catalog: 'Anime', emoji: '🌸', color: '#f857a6' },
  { id: 'biography', name: 'Biografía', catalog: 'Biography', emoji: '📖', color: '#c471ed' },
  { id: 'comedy', name: 'Comedia', catalog: 'Comedy', emoji: '😂', color: '#ffd93d' },
  { id: 'crime', name: 'Crimen', catalog: 'Crime', emoji: '🕵️', color: '#434343' },
  { id: 'documentary', name: 'Documentales', catalog: 'Documentary', emoji: '🎥', color: '#4facfe' },
  { id: 'drama', name: 'Drama', catalog: 'Drama', emoji: '🎭', color: '#8e9eab' },
  { id: 'family', name: 'Familiar', catalog: 'Family', emoji: '👨‍👩‍👧', color: '#43e97b' },
  { id: 'fantasy', name: 'Fantasía', catalog: 'Fantasy', emoji: '🧙', color: '#a18cd1' },
  { id: 'history', name: 'Historia', catalog: 'History', emoji: '🏛️', color: '#b79891' },
  { id: 'horror', name: 'Terror', catalog: 'Horror', emoji: '👻', color: '#232526' },
  { id: 'mystery', name: 'Misterio', catalog: 'Mystery', emoji: '🕵️‍♂️', color: '#373b44' },
  { id: 'music', name: 'Musical', catalog: 'Music', emoji: '🎵', color: '#f953c6' },
  { id: 'reality', name: 'Realidad', catalog: 'Reality', emoji: '📺', color: '#22d1ee' },
  { id: 'romance', name: 'Romance', catalog: 'Romance', emoji: '💘', color: '#ee9ca7' },
  { id: 'sci-fi', name: 'Ciencia ficción', catalog: 'Sci-Fi', emoji: '🛸', color: '#00c6fb' },
  { id: 'thriller', name: 'Thriller', catalog: 'Thriller', emoji: '🔪', color: '#485563' },
  { id: 'war', name: 'Bélico', catalog: 'War', emoji: '🎖️', color: '#6b6b6b' },
  { id: 'western', name: 'Western', catalog: 'Western', emoji: '🤠', color: '#c79081' },
];

/** Decadas disponibles (WuPlay: pantalla de decadas). */
export const DECADES = [
  { id: '1950s', label: 'Años 50', from: 1950, to: 1959 },
  { id: '1960s', label: 'Años 60', from: 1960, to: 1969 },
  { id: '1970s', label: 'Años 70', from: 1970, to: 1979 },
  { id: '1980s', label: 'Años 80', from: 1980, to: 1989 },
  { id: '1990s', label: 'Años 90', from: 1990, to: 1999 },
  { id: '2000s', label: 'Años 2000', from: 2000, to: 2009 },
  { id: '2010s', label: 'Años 2010', from: 2010, to: 2019 },
  { id: '2020s', label: 'Años 2020', from: 2020, to: 2029 },
] as const;

/** Devuelve la decada de un ano (si esta en la lista). */
export function decadeOf(year: number): (typeof DECADES)[number] | undefined {
  return DECADES.find((decade) => year >= decade.from && year <= decade.to);
}

/**
 * Normaliza un texto para comparar generos o palabras clave.
 *
 * Quita acentos, pasa a minusculas y colapsa espacios: asi "Ciencia ficción",
 * "ciencia ficcion" y "SCI-FI" se pueden comparar de forma estable.
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Sinonimos de generos: la misma etiqueta con distinto nombre. */
const GENRE_ALIASES: Record<string, string> = {
  scifi: 'sci fi',
  'science fiction': 'sci fi',
  cienciaficcion: 'sci fi',
  'ciencia ficcion': 'sci fi',
  terror: 'horror',
  miedo: 'horror',
  misterio: 'mystery',
  aventura: 'adventure',
  accion: 'action',
  animacion: 'animation',
  anime: 'anime',
  biografia: 'biography',
  comedia: 'comedy',
  crimen: 'crime',
  documental: 'documentary',
  documentales: 'documentary',
  drama: 'drama',
  familiar: 'family',
  familia: 'family',
  fantasia: 'fantasy',
  historia: 'history',
  musical: 'music',
  musica: 'music',
  realidad: 'reality',
  romance: 'romance',
  romantico: 'romance',
  guerra: 'war',
  western: 'western',
};

/** Normaliza el nombre de un genero para compararlo con los filtros. */
export function normalizeGenre(value: string): string {
  const base = normalizeText(value);
  return GENRE_ALIASES[base] ?? base;
}
