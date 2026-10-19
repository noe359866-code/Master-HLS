/**
 * Endpoints del addon Stremio local.
 *
 * Vibe Flix se puede instalar como addon en Stremio, WuPlay o Nuvio:
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

import {
  findPersonFilmography,
  findSimilarTitles,
  type AddonRegistry,
  type DebridService,
} from '@vibeflix/addon-engine';
import type { Router, RouteContext } from '../http/router.js';
import { sendJson } from '../http/router.js';
import type { AppData } from '../model.js';
import { applyContentFilters } from '../library/filters.js';

export interface StremioRouteOptions {
  registry: AddonRegistry;
  getData: () => AppData;
  appVersion: string;
  /** Servicio de debrid (opcional: si no hay proveedor, no se resuelve nada). */
  debrid?: DebridService;
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
  const { registry, getData, appVersion, debrid } = options;

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
      id: 'com.vibeflix.app',
      name: 'Vibe Flix',
      version: appVersion,
      description:
        'Vibe Flix: agregador de addons Stremio con nucleo HLS master, omitir intro, OpenSubtitles y autoplay nativo.',
      logo: `${publicBase()}/logo.png`,
      background: `${publicBase()}/background.png`,
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
    // Debrid nativo: los enlaces premium se resuelven en el servidor y se
    // cachean, de modo que Stremio, WuPlay, NuvioTV y el cliente web reciben
    // el mismo enlace directo (ver docs/comparison.md).
    const streams = debrid?.enabled
      ? await debrid.resolveStreams(result.value.streams)
      : result.value.streams;
    sendJson(res, 200, { streams });
  });

  /** Estado del debrid configurado. */
  router.get('/api/debrid', ({ res }) => {
    sendJson(res, 200, { debrid: debrid?.status() ?? { enabled: false } });
  });

  /** Comprueba las credenciales del proveedor de debrid. */
  router.post('/api/debrid/test', async ({ res }) => {
    if (!debrid) {
      sendJson(res, 400, { ok: false, message: 'Debrid no disponible' });
      return;
    }
    const result = await debrid.verify();
    sendJson(res, 200, result);
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
    // Los filtros de contenido se aplican tambien a la busqueda (WuPlay los
    // aplica a todas las pantallas de catalogo).
    const metas = applyContentFilters(result.value.metas, getData().settings.filters);
    sendJson(res, 200, { metas });
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
   * Recomendaciones personalizadas (WuPlay: "Recommended by Wuplay").
   *
   * Se calculan con los generos de los titulos valorados como "Me gusta":
   * se recorren los catalogos del registro y se puntua cada meta por generos
   * compartidos, descartando lo que ya se ha valorado.
   */
  router.get('/api/recommended', async ({ res, query }) => {
    const data = getData();
    const profileId = query.get('profileId') ?? data.activeProfileId;
    const ratings = data.ratings?.[profileId] ?? [];
    const likes = ratings.filter((entry) => entry.rating === 'like');
    if (!likes.length) {
      sendJson(res, 200, { titles: [] });
      return;
    }

    const weights = new Map<string, number>();
    for (const entry of likes) {
      for (const genre of entry.genres ?? []) {
        weights.set(genre.toLowerCase(), (weights.get(genre.toLowerCase()) ?? 0) + 1);
      }
    }
    if (!weights.size) {
      sendJson(res, 200, { titles: [] });
      return;
    }

    const excluded = new Set(ratings.map((entry) => entry.id));
    const catalogs = registry
      .catalogs()
      .filter((catalog) => catalog.type === 'movie' || catalog.type === 'series');

    const scored = new Map<string, { meta: (typeof catalogs)[number] extends never ? never : any; score: number }>();
    for (const catalog of catalogs) {
      const result = await registry.catalog({ type: catalog.type, id: catalog.id });
      for (const meta of result.value.metas) {
        if (excluded.has(meta.id)) continue;
        const genres = (meta.genres ?? []).map((genre) => genre.toLowerCase());
        let score = 0;
        for (const genre of genres) score += weights.get(genre) ?? 0;
        if (!score) continue;
        const rating = Number(meta.imdbRating ?? 0);
        const existing = scored.get(meta.id);
        if (!existing || score > existing.score) {
          scored.set(meta.id, { meta, score: score + rating / 100 });
        }
      }
    }

    const titles = [...scored.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((entry) => entry.meta);
    sendJson(res, 200, { titles });
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
