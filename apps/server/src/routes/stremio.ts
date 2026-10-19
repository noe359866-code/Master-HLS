/**
 * Endpoints del addon Stremio local.
 *
 * Master-HLS se puede instalar como addon en Stremio, WuPlay o Nuvio:
 * la URL `http://<host>:<puerto>/manifest.json` es la que se pega en el
 * configurador. A partir de ahi, el addon agrega *todos* los addons que el
 * usuario tenga instalados en el servidor, de modo que un unico addon da
 * acceso a todo el ecosistema.
 *
 * Rutas (protocolo Stremio):
 *   GET /manifest.json
 *   GET /catalog/{type}/{id}[/{extra}].json
 *   GET /meta/{type}/{id}.json
 *   GET /stream/{type}/{id}.json
 *   GET /subtitles/{type}/{id}.json
 */

import { findPersonFilmography, findSimilarTitles, type AddonRegistry } from '@master-hls/addon-engine';
import type { Router, RouteContext } from '../http/router.js';
import { sendJson } from '../http/router.js';
import type { AppData } from '../model.js';

export interface StremioRouteOptions {
  registry: AddonRegistry;
  getData: () => AppData;
  appVersion: string;
}

/** Quita el sufijo `.json` de un segmento de ruta. */
function stripJson(segment: string): string {
  return segment.endsWith('.json') ? segment.slice(0, -'.json'.length) : segment;
}

/** Parsea el extra de un catalogo: `genre=Action&skip=20` (o base64/urlencoded). */
function parseExtra(raw?: string): Record<string, string> {
  if (!raw) return {};
  const extra: Record<string, string> = {};
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  for (const pair of decoded.split('&')) {
    if (!pair) continue;
    const index = pair.indexOf('=');
    if (index === -1) {
      extra[pair] = '';
      continue;
    }
    extra[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return extra;
}

export function registerStremioRoutes(router: Router, options: StremioRouteOptions): void {
  const { registry, getData, appVersion } = options;

  router.get('/manifest.json', ({ res }) => {
    const data = getData();
    const catalogs = registry.catalogs();
    const preferences = new Map(data.catalogPreferences.map((pref) => [pref.key, pref]));

    const visible = catalogs
      .filter((catalog) => !preferences.get(`${catalog.type}:${catalog.id}`)?.hidden)
      .sort((a, b) => {
        const orderA = preferences.get(`${a.type}:${a.id}`)?.order ?? 999;
        const orderB = preferences.get(`${b.type}:${b.id}`)?.order ?? 999;
        return orderA - orderB || a.name.localeCompare(b.name);
      });

    const types = new Set<string>(['movie', 'series']);
    for (const catalog of visible) types.add(catalog.type);
    for (const manifest of registry.list()) {
      for (const type of manifest.manifest.types ?? []) types.add(type);
    }

    const idPrefixes = new Set<string>(['tt', 'kitsu', 'mal', 'tvdb', 'imdb']);

    sendJson(res, 200, {
      id: 'com.masterhls.app',
      name: 'Master-HLS',
      version: appVersion,
      description:
        'Agregador de addons Stremio con nucleo HLS master: catalogo, metadata, streams y subtitulos de todos tus addons en uno.',
      logo: `${publicBase()}/logo.png`,
      background: `${publicBase()}/background.jpg`,
      types: [...types],
      idPrefixes: [...idPrefixes],
      resources: ['catalog', 'meta', 'stream', 'subtitles'],
      catalogs: visible.map((catalog) => ({
        type: catalog.type,
        id: catalog.id,
        name: catalog.name,
        extra: catalog.extra,
        extraSupported: catalog.extraSupported,
        extraRequired: catalog.extraRequired,
        pageSize: catalog.pageSize,
        showInHome: catalog.showInHome !== false,
      })),
      behaviorHints: {
        configurable: true,
        configurationRequired: false,
        newEpisodeNotifications: false,
      },
    });
  });

  router.get('/catalog/:type/:id', async ({ res, params, query }) => {
    const type = stripJson(params['type'] ?? '');
    const id = stripJson(params['id'] ?? '');
    const extra = { ...parseExtra(params['*']), ...Object.fromEntries(query.entries()) };
    const result = await registry.catalog({ type, id, extra });
    sendJson(res, 200, { metas: result.value.metas });
  });

  router.get('/catalog/:type/:id/:extra', async ({ res, params }) => {
    const type = stripJson(params['type'] ?? '');
    const id = stripJson(params['id'] ?? '');
    const extra = parseExtra(stripJson(params['extra'] ?? ''));
    const result = await registry.catalog({ type, id, extra });
    sendJson(res, 200, { metas: result.value.metas });
  });

  router.get('/meta/:type/:id', async ({ res, params }) => {
    const type = stripJson(params['type'] ?? '');
    const id = stripJson(params['id'] ?? '');
    const result = await registry.meta({ type, id });
    sendJson(res, 200, { meta: result.value.meta ?? {} });
  });

  router.get('/stream/:type/:id', async ({ res, params }) => {
    const type = stripJson(params['type'] ?? '');
    const id = stripJson(params['id'] ?? '');
    const result = await registry.streams({ type, id });
    sendJson(res, 200, { streams: result.value.streams });
  });

  router.get('/subtitles/:type/:id', async ({ res, params }) => {
    const type = stripJson(params['type'] ?? '');
    const id = stripJson(params['id'] ?? '');
    const result = await registry.subtitles({ type, id });
    sendJson(res, 200, { subtitles: result.value.subtitles });
  });

  /**
   * Busqueda global: consulta en paralelo todos los catalogos que soportan el
   * extra `search` (WuPlay: buscar y guardar el resultado en una watchlist).
   */
  router.get('/api/search', async ({ res, query }) => {
    const term = (query.get('q') ?? '').trim();
    if (!term) {
      sendJson(res, 200, { metas: [] });
      return;
    }
    const result = await registry.search(term, { type: query.get('type') ?? undefined });
    sendJson(res, 200, { metas: result.value.metas });
  });

  /**
   * Ficha de persona: filmografia completa (WuPlay: "Cast & crew" con ficha
   * de persona). Se busca por nombre y se filtran los titulos en los que
   * aparece.
   */
  router.get('/api/person', async ({ res, query }) => {
    const name = (query.get('name') ?? '').trim();
    if (!name) {
      sendJson(res, 400, { error: 'Falta name' });
      return;
    }
    const result = await findPersonFilmography(registry, name, {
      type: query.get('type') ?? undefined,
    });
    sendJson(res, 200, { name: result.name, titles: result.titles, sources: result.sources });
  });

  /**
   * Titulos similares (WuPlay: "Similar Titles" desde la ficha de detalle).
   */
  router.get('/api/similar', async ({ res, query }) => {
    const id = (query.get('id') ?? '').trim();
    const type = query.get('type') ?? 'movie';
    if (!id) {
      sendJson(res, 400, { error: 'Falta id' });
      return;
    }
    const metaResult = await registry.meta({ type, id });
    const meta = metaResult.value.meta;
    if (!meta) {
      sendJson(res, 200, { titles: [] });
      return;
    }
    const titles = await findSimilarTitles(registry, meta, {
      type: query.get('filterType') ?? type,
    });
    sendJson(res, 200, { titles });
  });
}

/** Base publica usada para construir URLs absolutas en el manifest. */
function publicBase(): string {
  return process.env['PUBLIC_URL'] ?? `http://localhost:${process.env['PORT'] ?? 8181}`;
}
