import type { Route } from './store';

/**
 * Menu de navegacion de la app (WuPlay: "manage sidebar items").
 *
 * El orden y la visibilidad se guardan en los ajustes del servidor, de modo
 * que la personalizacion es la misma en la web, en la TV y en el addon.
 */
export interface NavItem {
  id: string;
  route: Route;
  /** Etiqueta por defecto (español). */
  label: string;
  /** Clave del diccionario de traducciones; manda sobre `label`. */
  labelKey?: string;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', labelKey: 'HOME', route: { name: 'home' }, label: 'Inicio', description: 'Filas de novedades y recomendaciones' },
  { id: 'discover', labelKey: 'DISCOVER', route: { name: 'discover' }, label: 'Descubrir', description: 'Catálogo completo por género' },
  { id: 'genres', labelKey: 'GENRES', route: { name: 'genres' }, label: 'Géneros', description: 'Tarjetas de género' },
  { id: 'decades', labelKey: 'DECADES', route: { name: 'decades' }, label: 'Décadas', description: 'Clásicos por época' },
  { id: 'search', labelKey: 'SEARCH', route: { name: 'search' }, label: 'Buscar', description: 'Buscador con teclado en pantalla' },
  { id: 'lists', labelKey: 'LISTS', route: { name: 'lists' }, label: 'Mis listas', description: 'Watchlists del perfil' },
  { id: 'history', labelKey: 'HISTORY', route: { name: 'history' }, label: 'Historial', description: 'Lo que has visto' },
  { id: 'addons', labelKey: 'ADDONS', route: { name: 'addons' }, label: 'Addons', description: 'Gestor de addons Stremio' },
  { id: 'settings', labelKey: 'SETTINGS', route: { name: 'settings' }, label: 'Ajustes', description: 'Ajustes de la app' },
];

/** Orden por defecto del menu (se usa si el servidor no trae ninguno). */
export const DEFAULT_NAV_ORDER = NAV_ITEMS.map((item, index) => ({
  id: item.id,
  hidden: false,
  order: index,
}));
