/**
 * Pantallas de contenido: generos, decadas, historial de busqueda y
 * personalizacion del menu.
 *
 * Todo es nativo: no hay servicios externos. Los generos usan el extra
 * `genre` de los catalogos que lo soporten y las decadas se calculan
 * filtrando los metadatos por su ano de estreno.
 *
 * Rutas:
 *   GET    /api/genres            lista de generos (estilo WuPlay)
 *   GET    /api/decades           lista de decadas
 *   GET    /api/browse            contenido por genero, decada o texto
 *   GET    /api/search-history    historial de busquedas del perfil
 *   POST   /api/search-history    anade una busqueda al historial
 *   DELETE /api/search-history    vacia el historial
 *   PUT    /api/sidebar           personalizacion del menu (mostrar/ocultar/ordenar)
 */

import type { AddonRegistry, MetaPreview } from '@vibeflix/addon-engine';

import type { Router } from '../http/router.js';
import { sendJson } from '../http/router.js';
import type { AppData } from '../model.js';
import { DECADES, GENRES } from '../library/genres.js';
import { applyContentFilters, ratingOf, yearOf } from '../library/filters.js';
import { applyParentalFilters } from '../library/parental.js';

export interface BrowseRouteOptions {
  registry: AddonRegistry;
  getData: () => AppData;
  save: (mutate: (data: AppData) => void) => Promise<void>;
}

/** Numero maximo de catalogos que se consultan al filtrar por decada. */
const DECADE_CATALOG_LIMIT = 6;

/** Paginas de cada catalogo que se leen al filtrar por decada. */
const DECADE_PAGES = 2;

/** Maximo de titulos devueltos por la pantalla de contenido. */
const BROWSE_LIMIT = 120;

/** Entrada del historial de busquedas. */
export interface SearchHistoryEntry {
  term: string;
  at: number;
}

/** Elemento personalizable del menu de navegacion. */
export interface SidebarItem {
  id: string;
  hidden: boolean;
  order: number;
}

/** Menu de navegacion por defecto (WuPlay: "manage sidebar items"). */
export const DEFAULT_SIDEBAR: SidebarItem[] = [
  { id: 'home', hidden: false, order: 0 },
  { id: 'discover', hidden: false, order: 1 },
  { id: 'genres', hidden: false, order: 2 },
  { id: 'decades', hidden: false, order: 3 },
  { id: 'search', hidden: false, order: 4 },
  { id: 'lists', hidden: false, order: 5 },
  { id: 'history', hidden: false, order: 6 },
  { id: 'addons', hidden: false, order: 7 },
  { id: 'settings', hidden: false, order: 8 },
];

export function registerBrowseRoutes(router: Router, options: BrowseRouteOptions): void {
  const { registry, getData, save } = options;

  // ---------------------------------------------------------------- generos
  router.get('/api/genres', ({ res }) => {
    sendJson(res, 200, { genres: GENRES, decades: DECADES });
  });

  router.get('/api/decades', ({ res }) => {
    sendJson(res, 200, { decades: DECADES });
  });

  // ------------------------------------------------------- contenido (browse)
  router.get('/api/browse', async ({ res, query }) => {
    const type = query.get('type') ?? '';
    const genre = query.get('genre') ?? '';
    const decadeId = query.get('decade') ?? '';
    const search = (query.get('q') ?? '').trim();
    const skip = Number(query.get('skip') ?? '0') || 0;

    const filters = getData().settings.filters;
    // El control parental del perfil activo se aplica además de los filtros
    // globales: así búsqueda, géneros y décadas devuelven lo mismo.
    const parental = getData().profiles.find(
      (entry) => entry.id === getData().activeProfileId,
    )?.parental;

    // 1) Busqueda por texto: los catalogos que soportan `search`.
    if (search) {
      const result = await registry.search(search, { type: type || undefined });
      const metas = applyParentalFilters(applyContentFilters(result.value.metas, filters), parental);
      sendJson(res, 200, { metas: metas.slice(0, BROWSE_LIMIT), source: 'search' });
      return;
    }

    // 2) Por genero: el extra `genre` de los catalogos que lo soporten.
    if (genre) {
      const catalogs = registry
        .catalogs()
        .filter((catalog) => !type || catalog.type === type)
        .filter((catalog) => catalog.extraSupported?.includes('genre'));
      if (!catalogs.length) {
        sendJson(res, 200, { metas: [], source: 'genre' });
        return;
      }
      const results = await Promise.all(
        catalogs.map((catalog) =>
          registry.catalog({
            type: catalog.type,
            id: catalog.id,
            extra: { genre },
          }),
        ),
      );
      const metas = dedupe(
        results.flatMap((result) => result.value.metas),
      );
      const filtered = applyParentalFilters(applyContentFilters(metas, filters), parental);
      sendJson(res, 200, {
        metas: filtered.slice(skip, skip + BROWSE_LIMIT),
        source: 'genre',
        total: filtered.length,
      });
      return;
    }

    // 3) Por decada: se leen varias paginas y se filtra por el ano.
    if (decadeId) {
      const decade = DECADES.find((entry) => entry.id === decadeId);
      if (!decade) {
        sendJson(res, 400, { error: 'Decada desconocida' });
        return;
      }
      const metas = await byDecade(registry, decade.from, decade.to, type);
      const filtered = applyParentalFilters(applyContentFilters(metas, filters), parental);
      sendJson(res, 200, {
        metas: filtered.slice(skip, skip + BROWSE_LIMIT),
        source: 'decade',
        total: filtered.length,
      });
      return;
    }

    sendJson(res, 400, { error: 'Falta genre, decade o q' });
  });

  // ------------------------------------------------------ historial de busqueda
  router.get('/api/search-history', ({ res, query }) => {
    const profileId = query.get('profileId') ?? getData().activeProfileId;
    sendJson(res, 200, { history: historyOf(getData(), profileId) });
  });

  router.post('/api/search-history', async ({ res, body }) => {
    const payload = (body ?? {}) as { term?: string; profileId?: string };
    const term = (payload.term ?? '').trim();
    if (!term) {
      sendJson(res, 400, { error: 'Falta term' });
      return;
    }
    const data = getData();
    const profileId = payload.profileId ?? data.activeProfileId;
    const current = historyOf(data, profileId);
    const entry: SearchHistoryEntry = { term: term.slice(0, 80), at: Date.now() };
    const next = [
      entry,
      ...current.filter((item) => item.term.toLowerCase() !== term.toLowerCase()),
    ].slice(0, 12);
    await save((mutable) => {
      mutable.searchHistory = { ...(mutable.searchHistory ?? {}), [profileId]: next };
    });
    sendJson(res, 200, { history: next });
  });

  router.delete('/api/search-history', async ({ res, query }) => {
    const data = getData();
    const profileId = query.get('profileId') ?? data.activeProfileId;
    await save((mutable) => {
      mutable.searchHistory = { ...(mutable.searchHistory ?? {}), [profileId]: [] };
    });
    sendJson(res, 200, { history: [] });
  });

  // ------------------------------------------------------------ personalizacion
  router.put('/api/sidebar', async ({ res, body }) => {
    const payload = (body ?? {}) as { items?: SidebarItem[] };
    const items = Array.isArray(payload.items) ? payload.items : [];
    const sanitized: SidebarItem[] = items
      .filter((item) => item && typeof item.id === 'string')
      .map((item, index) => ({
        id: item.id,
        hidden: Boolean(item.hidden),
        order: Number.isFinite(item.order) ? item.order : index,
      }));
    await save((mutable) => {
      mutable.settings.sidebar = sanitized;
    });
    sendJson(res, 200, { items: sanitized });
  });
}

/** Historial de busquedas de un perfil. */
function historyOf(data: AppData, profileId: string): SearchHistoryEntry[] {
  return data.searchHistory?.[profileId] ?? [];
}

/** Elimina titulos duplicados conservando el primero. */
function dedupe(metas: MetaPreview[]): MetaPreview[] {
  const seen = new Set<string>();
  const result: MetaPreview[] = [];
  for (const meta of metas) {
    if (!meta?.id || seen.has(meta.id)) continue;
    seen.add(meta.id);
    result.push(meta);
  }
  return result;
}

/**
 * Titulos de una decada.
 *
 * No hay un extra estandar para el ano, asi que se leen varias paginas de los
 * catalogos mas usados y se filtra por el ano de estreno de cada meta.
 */
async function byDecade(
  registry: AddonRegistry,
  from: number,
  to: number,
  type: string,
): Promise<MetaPreview[]> {
  const catalogs = registry
    .catalogs()
    .filter((catalog) => !type || catalog.type === type)
    .filter((catalog) => catalog.extraSupported?.includes('skip'))
    .slice(0, DECADE_CATALOG_LIMIT);

  if (!catalogs.length) return [];

  const pageSize = catalogs[0]?.pageSize ?? 100;
  const requests: Array<Promise<MetaPreview[]>> = [];
  for (const catalog of catalogs) {
    for (let page = 0; page < DECADE_PAGES; page += 1) {
      requests.push(
        registry
          .catalog({
            type: catalog.type,
            id: catalog.id,
            extra: { skip: String(page * pageSize) },
          })
          .then((result) => result.value.metas)
          .catch(() => [] as MetaPreview[]),
      );
    }
  }

  const results = await Promise.all(requests);
  const metas = dedupe(results.flat());
  const inRange = metas.filter((meta) => {
    const year = yearOf(meta);
    return year >= from && year <= to;
  });

  // Los mejor valorados primero (los metadatos con puntuacion).
  return inRange.sort((a, b) => ratingOf(b) - ratingOf(a));
}
