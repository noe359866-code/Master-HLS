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
  label: string;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', route: { name: 'home' }, label: 'Inicio', description: 'Filas de novedades y recomendaciones' },
  { id: 'discover', route: { name: 'discover' }, label: 'Descubrir', description: 'Catálogo completo por género' },
  { id: 'genres', route: { name: 'genres' }, label: 'Géneros', description: 'Tarjetas de género' },
  { id: 'decades', route: { name: 'decades' }, label: 'Décadas', description: 'Clásicos por época' },
  { id: 'search', route: { name: 'search' }, label: 'Buscar', description: 'Buscador con teclado en pantalla' },
  { id: 'lists', route: { name: 'lists' }, label: 'Mis listas', description: 'Watchlists del perfil' },
  { id: 'history', route: { name: 'history' }, label: 'Historial', description: 'Lo que has visto' },
  { id: 'addons', route: { name: 'addons' }, label: 'Addons', description: 'Gestor de addons Stremio' },
  { id: 'settings', route: { name: 'settings' }, label: 'Ajustes', description: 'Ajustes de la app' },
];

/** Orden por defecto del menu (se usa si el servidor no trae ninguno). */
export const DEFAULT_NAV_ORDER = NAV_ITEMS.map((item, index) => ({
  id: item.id,
  hidden: false,
  order: index,
}));
