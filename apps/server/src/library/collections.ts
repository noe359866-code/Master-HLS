/**
 * Colecciones (NuvioTV: `Collection` / `CollectionSource`).
 *
 * NuvioTV tiene colecciones curadas: franquicias (Star Wars, Marvel), catálogos
 * por productora (A24), por cadena (HBO) o por persona (director). Cada
 * colección es un catálogo derivado de una fuente y aparece como un hub más
 * en el Home.
 *
 * Aquí se replica el concepto como datos persistidos: cada colección es una
 * definición ligera (tipo + filtros) que el servidor resuelve consultando los
 * catálogos ya instalados o la metadata integrada. No requieren un proveedor
 * nuevo.
 */

export type CollectionSourceType =
  | 'addon-catalog'
  | 'tmdb-collection'
  | 'tmdb-discover'
  | 'trakt-list'
  | 'company'
  | 'network'
  | 'person'
  | 'genre-preset'
  | 'keyword';

export type CollectionMediaType = 'movie' | 'tv' | 'all';

export interface CollectionDefinition {
  id: string;
  /** Nombre visible (ej. «Universo Marvel»). */
  title: string;
  /** Descripción opcional. */
  description?: string;
  /** Tipo de fuente. */
  sourceType: CollectionSourceType;
  /** Tipo de medio. */
  mediaType: CollectionMediaType;
  /** Orden en el Home (menor = antes). */
  order: number;
  /** Si está oculta (como un hub desactivado). */
  hidden: boolean;
  createdAt: number;
  updatedAt: number;
  // Campos específicos por tipo de fuente (solo uno relevante a la vez):
  /** Para addon-catalog: addon + catálogo + extra. */
  catalogRef?: { addonId: string; type: string; catalogId: string; genre?: string };
  /** Para tmdb-discover / trakt-list / company / network / person / keyword. */
  sourceId?: string;
  /** Título original de la lista externa (Trakt). */
  sourceTitle?: string;
  /** Criterio de ordenación del catálogo externo. */
  sortBy?: string;
  /** Filtros serializados (ej. año, idioma). */
  filters?: Record<string, string>;
  /** Emoji de la tarjeta. */
  emoji?: string;
  /** Color de la tarjeta. */
  color?: string;
}

/** Catálogos preset que se ofrecen como colecciones de un clic (como en NuvioTV). */
export const COLLECTION_PRESETS: Array<Pick<CollectionDefinition, 'title' | 'sourceType' | 'sourceId' | 'mediaType' | 'emoji' | 'color' | 'description'>> = [
  { title: 'Universo Marvel', sourceType: 'keyword', sourceId: 'marvel', mediaType: 'movie', emoji: '🦸', color: '#ed1d24', description: 'Películas del MCU' },
  { title: 'Star Wars', sourceType: 'keyword', sourceId: 'star wars', mediaType: 'movie', emoji: '⭐', color: '#ffe81f', description: 'La saga galáctica' },
  { title: 'DC Universe', sourceType: 'keyword', sourceId: 'dc comics', mediaType: 'movie', emoji: '🦇', color: '#0476f2', description: 'Películas de DC' },
  { title: 'Pixar', sourceType: 'company', sourceId: 'pixar', mediaType: 'movie', emoji: '🏰', color: '#1ba0e1', description: 'Películas de Pixar' },
  { title: 'Studio Ghibli', sourceType: 'company', sourceId: 'ghibli', mediaType: 'movie', emoji: '🌸', color: '#6ec6a0', description: 'Obras de Miyazaki' },
  { title: 'A24', sourceType: 'company', sourceId: 'a24', mediaType: 'movie', emoji: '🎬', color: '#111', description: 'Catálogo A24' },
  { title: 'HBO Originals', sourceType: 'network', sourceId: 'hbo', mediaType: 'tv', emoji: '📺', color: '#6b21a8', description: 'Series de HBO' },
  { title: 'Netflix Originals', sourceType: 'network', sourceId: 'netflix', mediaType: 'tv', emoji: '🔴', color: '#e50914', description: 'Originales de Netflix' },
];

const MAX_COLLECTIONS = 64;

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

/** Valida y normaliza una colección que llega del cliente. */
export function sanitizeCollection(input: unknown, existing: CollectionDefinition[]): CollectionDefinition | null {
  const raw = (input ?? {}) as Record<string, unknown>;
  const title = typeof raw['title'] === 'string' ? raw['title'].trim().slice(0, 80) : '';
  if (!title) return null;
  const validTypes: CollectionSourceType[] = ['addon-catalog', 'tmdb-collection', 'tmdb-discover', 'trakt-list', 'company', 'network', 'person', 'genre-preset', 'keyword'];
  const sourceType = validTypes.includes(raw['sourceType'] as CollectionSourceType)
    ? (raw['sourceType'] as CollectionSourceType)
    : 'keyword';
  const validMedia: CollectionMediaType[] = ['movie', 'tv', 'all'];
  const mediaType = validMedia.includes(raw['mediaType'] as CollectionMediaType)
    ? (raw['mediaType'] as CollectionMediaType)
    : 'all';
  const id = typeof raw['id'] === 'string' && raw['id'].trim()
    ? raw['id'].trim().slice(0, 64)
    : `${slugify(title)}-${Date.now().toString(36)}`;
  if (existing.length >= MAX_COLLECTIONS && !existing.some((c) => c.id === id)) return null;
  return {
    id,
    title,
    description: typeof raw['description'] === 'string' ? raw['description'].trim().slice(0, 280) : undefined,
    sourceType,
    mediaType,
    order: typeof raw['order'] === 'number' && Number.isFinite(raw['order']) ? Math.round(raw['order']) : existing.length,
    hidden: Boolean(raw['hidden']),
    createdAt: typeof raw['createdAt'] === 'number' ? raw['createdAt'] : Date.now(),
    updatedAt: Date.now(),
    catalogRef: raw['catalogRef'] && typeof raw['catalogRef'] === 'object' ? raw['catalogRef'] as CollectionDefinition['catalogRef'] : undefined,
    sourceId: typeof raw['sourceId'] === 'string' ? raw['sourceId'].trim().slice(0, 128) : undefined,
    sourceTitle: typeof raw['sourceTitle'] === 'string' ? raw['sourceTitle'].trim().slice(0, 80) : undefined,
    sortBy: typeof raw['sortBy'] === 'string' ? raw['sortBy'].trim().slice(0, 32) : undefined,
    filters: raw['filters'] && typeof raw['filters'] === 'object' ? raw['filters'] as Record<string, string> : undefined,
    emoji: typeof raw['emoji'] === 'string' ? raw['emoji'].trim().slice(0, 8) : undefined,
    color: typeof raw['color'] === 'string' ? raw['color'].trim().slice(0, 16) : undefined,
  };
}
