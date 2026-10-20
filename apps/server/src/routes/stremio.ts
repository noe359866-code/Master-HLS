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
 *   GET /manifest.json                       manifiesto
 *   GET /configure                           pagina de configuracion (SDK)
 *   GET /{config}/manifest.json              manifiesto configurado
 *   GET /catalog/{type}/{id}[/{extra}].json  catalogo
 *   GET /meta/{type}/{id}.json               ficha
 *   GET /stream/{type}/{id}.json             fuentes
 *   GET /subtitles/{type}/{id}.json          subtitulos
 *   GET /{config}/<recurso>                  lo mismo, con la configuracion
 *                                            del addon en la ruta
 *
 * Detalles del SDK que se respetan aqui y que suelen olvidarse:
 *  - **CORS `*` en todas las rutas**, incluido `/manifest.json`.
 *  - `resources` en forma de objeto (`{name, types, idPrefixes}`), que es la
 *    unica forma en la que el cliente sabe que tipos sirve cada recurso.
 *  - `catalogs[].extra` como `[{name, isRequired, options, optionsLimit}]`:
 *    sin `options` el cliente no puede pintar el selector de generos.
 *  - `Cache-Control` con `max-age` / `stale-while-revalidate` / `stale-if-error`
 *    segun lo que pida el addon de origen (fusionado por el minimo).
 *  - `meta.links` con deep links `stremio:///search?...` para el reparto.
 *  - `behaviorHints.defaultVideoId` para retomar la serie en el episodio visto.
 *  - `behaviorHints.configurable` + `manifest.config` + `/{config}/manifest.json`
 *    para configurar el addon sin cuenta ni acceso al servidor.
 */

import type { IncomingMessage } from 'node:http';

import {
  findPersonFilmography,
  findSimilarTitles,
  type AddonRegistry,
  type CacheDirective,
  type CatalogDescriptor,
  type DebridService,
  type MetaDetail,
  type MetaLink,
  type MetaPreview,
  type ResourceDescriptor,
} from '@vibeflix/addon-engine';
import { NATIVE_SCRAPERS_ID, parseEpisodeId } from '@vibeflix/scrapers';
import type { Router, RouteContext } from '../http/router.js';
import {
  DEFAULT_CACHE_POLICIES,
  resolveCachePolicy,
  sendJson,
  sendText,
  type CachePolicy,
} from '../http/router.js';
import type { AppData } from '../model.js';
import { applyContentFilters } from '../library/filters.js';
import {
  applyParentalFilters,
  parentalBlockReason,
  parentalPinLockRemaining,
  verifyParentalPin,
} from '../library/parental.js';
import { presentStreams, streamDisplayName } from '../library/stream-labels.js';
import {
  addonConfigFields,
  applyConfigToStreams,
  configSuffix,
  decodeAddonConfig,
  type AddonConfig,
} from '../library/addon-config.js';
import { configurePageHtml } from '../library/configure-page.js';

export interface StremioRouteOptions {
  registry: AddonRegistry;
  getData: () => AppData;
  appVersion: string;
  /** Correo de contacto del addon (opcional; lo recomienda el SDK). */
  contactEmail?: string;
  /** URL publica configurada (se usa si `PUBLIC_URL` no esta en el entorno). */
  publicUrl?: () => string;
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

/**
 * Base publica del servidor.
 *
 * `PUBLIC_URL` manda (despliegues con dominio propio). Sin el, se deduce del
 * `Host` de la peticion: en una instalacion de salon el addon se instala desde
 * la TV apuntando a `http://192.168.x.x:8181/manifest.json`, y si el manifest
 * devolviera URLs con `localhost` el logo y el fondo no cargarian nunca.
 */
/** true si la URL configurada es utilizable (no un marcador de pruebas). */
function isUsableUrl(value: string | undefined): value is string {
  return Boolean(value) && !value!.endsWith(':0') && !value!.includes('localhost:0');
}

/** true si el host solo tiene sentido dentro de la propia maquina. */
function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Base publica con la que se construyen las URLs del manifest y del proxy.
 *
 * `PUBLIC_URL` manda cuando esta definido (es lo que el operador ha publicado)
 * y, si no, la URL configurada. La excepcion es un `localhost` configurado
 * viendo una peticion remota: una TV en la LAN recibiria `http://localhost`
 * (su propia TV) y el logo, el manifest o el proxy HLS no cargarian nunca. En
 * ese caso se usa el `Host` con el que llego la peticion.
 */
export function publicBase(req?: IncomingMessage, configuredUrl?: () => string): string {
  const host = req?.headers['host'];
  const proto =
    String(req?.headers['x-forwarded-proto'] ?? 'http').split(',')[0]?.trim() || 'http';
  const requestBase = host ? `${proto}://${host}` : '';
  const requestHostname = requestBase ? hostnameOf(requestBase) : null;
  const requestIsLocal = requestHostname ? isLoopbackHostname(requestHostname) : true;

  for (const candidate of [process.env['PUBLIC_URL'], configuredUrl?.()]) {
    if (!isUsableUrl(candidate)) continue;
    const hostname = hostnameOf(candidate);
    if (hostname && isLoopbackHostname(hostname) && !requestIsLocal) continue;
    return candidate.replace(/\/$/, '');
  }
  if (requestBase) return requestBase;
  return `http://localhost:${process.env['PORT'] ?? 8181}`;
}

/**
 * `extra` del catalogo en el formato actual del SDK.
 *
 * Los addons antiguos mandan `extraSupported` (nombres) y `extraRequired`;
 * Stremio solo pinta el selector de generos cuando `extra[].options` existe,
 * asi que se normaliza y se anaden las opciones conocidas (generos, skip).
 */
const CATALOG_GENRES = [
  'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 'Romance',
  'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western',
];

export function catalogExtraOf(descriptor: CatalogDescriptor): CatalogDescriptor['extra'] {
  if (Array.isArray(descriptor.extra) && descriptor.extra.length) return descriptor.extra;

  const names = descriptor.extraSupported?.length
    ? descriptor.extraSupported
    : ['genre', 'skip', 'search'];
  const required = new Set(descriptor.extraRequired ?? []);
  return names.map((name) => {
    const options =
      name === 'genre' ? CATALOG_GENRES :
      name === 'skip' ? ['0', '20', '40', '60', '80'] :
      undefined;
    return {
      name,
      ...(options ? { options } : {}),
      ...(options ? { optionsLimit: options.length } : {}),
      isRequired: required.has(name),
    };
  });
}

/**
 * `resources` en forma de objeto.
 *
 * Es lo que el SDK documenta como formato completo: decirle al cliente que
 * tipos e idPrefixes sirve cada recurso evita que pida `/meta/channel/...`
 * a un addon que no tiene canales.
 */
export function resourceDescriptorsOf(types: string[], idPrefixes: string[]): ResourceDescriptor[] {
  const catalogTypes = types.filter((type) => type !== 'other');
  return [
    { name: 'catalog', types: catalogTypes, idPrefixes },
    { name: 'meta', types, idPrefixes },
    { name: 'stream', types, idPrefixes },
    { name: 'subtitles', types: ['movie', 'series', 'tv', 'channel', 'other'], idPrefixes },
  ];
}

/** Deep link de busqueda de Stremio para una persona o termino. */
function searchDeepLink(query: string): string {
  return `stremio:///search?search=${encodeURIComponent(query)}`;
}

/** Convierte `cast`/`director`/`writer` (string o lista) en `meta.links`. */
export function metaLinksOf(meta: MetaPreview, type: string, id: string): MetaLink[] {
  if (Array.isArray(meta.links) && meta.links.length) return meta.links;

  // Los addons mandan el reparto de formas distintas: lista de nombres, una
  // cadena separada por comas o una lista cuyos elementos traen varias personas.
  const split = (value: string | string[] | undefined): string[] => {
    if (!value) return [];
    const parts = Array.isArray(value) ? value.map((entry) => String(entry)) : [String(value)];
    return parts
      .flatMap((entry) => entry.split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);
  };

  const links: MetaLink[] = [
    ...split(meta.cast).map((name) => ({ name, category: 'actor', url: searchDeepLink(name) })),
    ...split(meta.director).map((name) => ({ name, category: 'director', url: searchDeepLink(name) })),
    ...split(meta.writer ?? meta.writers).map((name) => ({ name, category: 'writer', url: searchDeepLink(name) })),
  ];

  if (/^tt\d+$/.test(id)) {
    links.push({ name: 'IMDb', category: 'imdb', url: `https://www.imdb.com/title/${id}/` });
  }
  links.push({ name: 'Compartir', category: 'share', url: `stremio:///detail/${type}/${id}` });

  return links;
}

/**
 * `runtime` normalizado a `<N> min`.
 *
 * Los addons mandan de todo: `120`, `"120 min"`, `"2h"`, `"2h 15min"`. Stremio
 * y WuPlay lo pintan tal cual, asi que se deja en un formato unico y legible.
 */
export function normalizeRuntime(runtime: string | number | undefined): string | undefined {
  if (runtime === undefined || runtime === null || runtime === '') return undefined;
  const text = String(runtime).trim();
  const hours = Number(/(\d+)\s*h/i.exec(text)?.[1] ?? 0);
  const minutes = Number(/(\d+)\s*(?:m|min)/i.exec(text)?.[1] ?? (/^\d+$/.test(text) ? Number(text) : 0));
  const total = hours * 60 + minutes;
  if (!Number.isFinite(total) || total <= 0) return text || undefined;
  if (total >= 60 && hours) {
    const rest = total - hours * 60;
    return rest ? `${hours}h ${rest}min` : `${hours}h`;
  }
  return `${total} min`;
}

/** Episodio a retomar segun el progreso del perfil activo. */
function defaultVideoIdOf(data: AppData, type: string, id: string): string | undefined {
  const entries = data.progress[data.activeProfileId] ?? [];
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) return undefined;
  if (entry.mediaType === 'movie' || type === 'movie') return id;
  if (entry.season && entry.episode) return `${id}:${entry.season}:${entry.episode}`;
  return undefined;
}

/** `posterShape` segun el tipo (el SDK define `poster|square|landscape`). */
function posterShapeOf(meta: MetaPreview, type: string): string {
  if (typeof meta.posterShape === 'string' && meta.posterShape) return meta.posterShape;
  if (type === 'movie' || type === 'series') return 'poster';
  if (type === 'channel' || type === 'tv') return 'landscape';
  return 'square';
}

/** Resultado agregado del registro (lo que devuelven `catalog`/`meta`/...). */
interface Aggregated<T extends { cache?: CacheDirective }> {
  value: T;
  stale?: boolean;
  ageSeconds?: number;
}

/**
 * Opciones de envio de un recurso: politica de cacheo del SDK y edad.
 *
 * `Age` es la forma estandar de decir "estos datos llevan N segundos en cache";
 * `X-Vibe-Flix-Stale` avisa a la web de que lo que pinta puede estar
 * desactualizado mientras el servidor refresca en segundo plano.
 */
function resourceSendOptions<T extends { cache?: CacheDirective }>(
  req: IncomingMessage,
  fallback: CachePolicy,
  result: Aggregated<T>,
): Parameters<typeof sendJson>[3] {
  const headers: Record<string, string> = {};
  if (result.stale && result.ageSeconds) headers['age'] = String(Math.round(result.ageSeconds));
  if (result.stale) headers['x-vibeflix-stale'] = '1';
  return {
    req,
    cache: resolveCachePolicy(fallback, result.value.cache),
    ...(Object.keys(headers).length ? { headers } : {}),
  };
}

export function registerStremioRoutes(router: Router, options: StremioRouteOptions): void {
  const { registry, getData, appVersion, debrid, contactEmail, publicUrl } = options;

  /** Reglas parentales del perfil activo (catálogos, búsqueda y streams). */
  const activeParental = () => {
    const data = getData();
    return data.profiles.find((entry) => entry.id === data.activeProfileId)?.parental;
  };

  /** Manifiesto completo del addon, con la configuracion de la URL aplicada. */
  const buildManifest = (ctx: RouteContext, config?: AddonConfig) => {
    const data = getData();
    const catalogs = registry.catalogs();
    const preferences = new Map(data.catalogPreferences.map((pref) => [pref.key, pref]));
    const base = publicBase(ctx.req, publicUrl);

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
    const typeList = [...types];
    const prefixList = [...idPrefixes];
    const hideAdult = config?.hideAdult ?? data.settings.filters?.hideAdult ?? false;

    return {
      id: 'com.vibeflix.app',
      name: `Vibe Flix${configSuffix(config)}`,
      version: appVersion,
      description:
        'Vibe Flix: agregador de addons Stremio con nucleo HLS master, omitir intro, OpenSubtitles y autoplay nativo.',
      logo: `${base}/logo.png`,
      background: `${base}/background.png`,
      types: typeList,
      idPrefixes: prefixList,
      // Forma de objeto: le dice al cliente que tipos sirve cada recurso.
      resources: resourceDescriptorsOf(typeList, prefixList),
      catalogs: visible.map((catalog) => ({
        type: catalog.type,
        id: catalog.id,
        name: catalog.name,
        extra: catalogExtraOf(catalog),
        ...(catalog.pageSize ? { pageSize: catalog.pageSize } : {}),
        showInHome: catalog.showInHome !== false,
      })),
      // Idioma del contenido servido (el SDK lo usa para ordenar catalogos).
      language: config?.language ?? data.settings.language,
      ...(contactEmail ? { contactEmail } : {}),
      behaviorHints: {
        configurable: true,
        // Con `config` presente el SDK muestra el boton «Configure» y genera
        // la pagina; `configurationRequired` se omite porque el addon funciona
        // sin configurar nada.
        configurationRequired: false,
        newEpisodeNotifications: false,
        adult: !hideAdult,
        // El agregador puede servir torrents a traves de los addons de origen.
        p2p: true,
      },
      config: addonConfigFields(),
    };
  };

  const handleManifest = (ctx: RouteContext, config?: AddonConfig) => {
    const manifest = buildManifest(ctx, config);
    // El manifest se cachea poco: refleja los addons instalados en el momento.
    sendJson(ctx.res, 200, manifest, {
      req: ctx.req,
      cache: { maxAge: 3600, staleWhileRevalidate: 86_400 },
    });
  };

  router.get('/manifest.json', (ctx) => handleManifest(ctx, decodeAddonConfig(ctx.query.get('config'))));
  router.get('/:config/manifest.json', (ctx) => handleManifest(ctx, decodeAddonConfig(ctx.params['config'])));

  /**
   * Pagina de configuracion (`/configure`).
   *
   * El SDK genera una pagina equivalente con `landingTemplate`; aqui se sirve
   * una propia, con el aspecto de la app y sin depender del navegador de la TV.
   */
  router.get('/configure', (ctx) => {
    const base = publicBase(ctx.req, publicUrl);
    const manifest = buildManifest(ctx);
    sendText(
      ctx.res,
      200,
      configurePageHtml({
        name: manifest.name,
        description: manifest.description,
        version: manifest.version,
        logo: manifest.logo,
        background: manifest.background,
        baseUrl: base,
      }),
      'text/html',
      { req: ctx.req, cache: { maxAge: 0, revalidate: true } },
    );
  });

  /** Catalogo: filtros de contenido + configuracion de la URL + cacheo SDK. */
  const handleCatalog = async (ctx: RouteContext, extra: Record<string, string>, config?: AddonConfig) => {
    const type = stripJson(ctx.params['type'] ?? '');
    const id = stripJson(ctx.params['id'] ?? '');
    const data = getData();
    const language = config?.language ?? extra['language'] ?? undefined;
    // `language` viaja como extra del catalogo (el SDK lo define asi); el
    // registro no tiene parametro de idioma propio.
    const result = await registry.catalog({
      type,
      id,
      extra: { ...extra, ...(language ? { language } : {}) },
    });
    let metas = applyContentFilters(result.value.metas, data.settings.filters);
    metas = applyParentalFilters(metas, activeParental());
    if (config?.hideAdult) {
      metas = applyContentFilters(metas, { ...data.settings.filters, hideAdult: true });
    }
    sendJson(ctx.res, 200, { metas }, resourceSendOptions(ctx.req, DEFAULT_CACHE_POLICIES.catalog, result));
  };

  router.get('/catalog/:type/:id', (ctx) =>
    handleCatalog(ctx, { ...parseExtra(ctx.params['*']), ...Object.fromEntries(ctx.query.entries()) }, decodeAddonConfig(ctx.query.get('config'))));
  router.get('/catalog/:type/:id/:extra', (ctx) =>
    handleCatalog(ctx, parseExtra(stripJson(ctx.params['extra'] ?? ''))));
  router.get('/:config/catalog/:type/:id', (ctx) =>
    handleCatalog(ctx, Object.fromEntries(ctx.query.entries()), decodeAddonConfig(ctx.params['config'])));
  router.get('/:config/catalog/:type/:id/:extra', (ctx) =>
    handleCatalog(ctx, parseExtra(stripJson(ctx.params['extra'] ?? '')), decodeAddonConfig(ctx.params['config'])));

  /** Ficha: se enriquece con los campos del SDK que los clientes si pintan. */
  const handleMeta = async (ctx: RouteContext) => {
    const type = stripJson(ctx.params['type'] ?? '');
    const id = stripJson(ctx.params['id'] ?? '');
    const result = await registry.meta({ type, id });
    const source = result.value.meta;
    const meta = enrichMeta(source, type, id, getData());
    sendJson(ctx.res, 200, { meta: meta ?? {} }, resourceSendOptions(ctx.req, DEFAULT_CACHE_POLICIES.meta, result));
  };

  router.get('/meta/:type/:id', handleMeta);
  router.get('/:config/meta/:type/:id', handleMeta);

  /** Fuentes: debrid, etiquetado publico y techos de la configuracion. */
  const handleStream = async (ctx: RouteContext, config?: AddonConfig) => {
    const type = stripJson(ctx.params['type'] ?? '');
    const id = stripJson(ctx.params['id'] ?? '');
    const { titleId } = parseEpisodeId(type, id);
    const data = getData();
    const profile = data.profiles.find((entry) => entry.id === data.activeProfileId);
    const language = config?.language ?? profile?.contentLanguage ?? profile?.audioLanguage ?? data.settings.language;
    const cacheScope = `${profile?.id ?? ''}:${language}`;
    // Se consulta la ficha del título (no la del id S:E) en paralelo con las
    // fuentes; el scraper nativo comparte esta petición gracias a single-flight.
    const [result, metadata] = await Promise.all([
      registry.streams({
        type,
        id,
        cacheScope,
        preferredAddonIds: data.settings.scrapers?.enabled ? [NATIVE_SCRAPERS_ID] : [],
      }),
      registry.meta({ type: type === 'episode' ? 'series' : type, id: titleId }),
    ]);
    // Control parental (NuvioTV: `ParentalGuide`): el título bloqueado no
    // resuelve streams salvo que el perfil lo desbloque con su PIN.
    const titleMeta = metadata.value.meta;
    const blockReason = titleMeta ? parentalBlockReason(titleMeta, profile?.parental) : null;
    if (blockReason) {
      const canUnlock = Boolean(profile?.pin && profile?.parental?.requirePin);
      const given = String(ctx.req?.headers['x-vibe-flix-parental-pin'] ?? '');
      const unlocked = canUnlock && Boolean(given) && verifyParentalPin(profile!.id, profile!.pin!, given);
      if (!unlocked) {
        const wait = parentalPinLockRemaining(profile?.id ?? '');
        sendJson(ctx.res, wait ? 429 : 403, {
          error: wait
            ? `Demasiados intentos de PIN. Espera ${wait} s.`
            : `Bloqueado por el control parental: ${blockReason}`,
          code: 'parental_blocked',
          requiresPin: canUnlock,
          ...(wait ? { retryAfterSeconds: wait } : {}),
        });
        return;
      }
    }
    // Debrid antes de enmascarar: la ordenación y el desbloqueo usan la
    // información original del stream; el cliente solo verá título + T/E.
    const resolved = debrid?.enabled
      ? await debrid.resolveStreams(result.value.streams)
      : result.value.streams;
    const capped = applyConfigToStreams(resolved, config);
    sendJson(ctx.res, 200, {
      streams: presentStreams(capped, streamDisplayName(type, id, metadata.value.meta), 'vibeflix'),
    }, resourceSendOptions(ctx.req, DEFAULT_CACHE_POLICIES.stream, result));
  };

  router.get('/stream/:type/:id', (ctx) => handleStream(ctx, decodeAddonConfig(ctx.query.get('config'))));
  router.get('/:config/stream/:type/:id', (ctx) => handleStream(ctx, decodeAddonConfig(ctx.params['config'])));

  /** Estado del debrid configurado. */
  router.get('/api/debrid', ({ res, req }) => {
    sendJson(res, 200, { debrid: debrid?.status() ?? { enabled: false } }, { req, cache: DEFAULT_CACHE_POLICIES.api });
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

  /** Subtitulos del addon agregado. */
  const handleSubtitles = async (ctx: RouteContext) => {
    const type = stripJson(ctx.params['type'] ?? '');
    const id = stripJson(ctx.params['id'] ?? '');
    const result = await registry.subtitles({ type, id });
    sendJson(ctx.res, 200, { subtitles: result.value.subtitles },
      resourceSendOptions(ctx.req, DEFAULT_CACHE_POLICIES.subtitles, result));
  };

  router.get('/subtitles/:type/:id', handleSubtitles);
  router.get('/:config/subtitles/:type/:id', handleSubtitles);

  /**
   * Busqueda global: consulta en paralelo todos los catalogos que soportan el
   * extra `search` (WuPlay: buscar y guardar el resultado en una watchlist).
   */
  router.get('/api/search', async ({ res, req, query }) => {
    const term = (query.get('q') ?? '').trim();
    if (!term) {
      sendJson(res, 200, { metas: [] }, { req, cache: DEFAULT_CACHE_POLICIES.search });
      return;
    }
    const result = await registry.search(term, { type: query.get('type') ?? undefined });
    // Los filtros de contenido se aplican tambien a la busqueda (WuPlay los
    // aplica a todas las pantallas de catalogo).
    const metas = applyParentalFilters(
      applyContentFilters(result.value.metas, getData().settings.filters),
      activeParental(),
    );
    sendJson(res, 200, { metas }, resourceSendOptions(req, DEFAULT_CACHE_POLICIES.search, result));
  });

  /**
   * Ficha de persona: filmografia completa (WuPlay: "Cast & crew" con ficha
   * de persona). Se busca por nombre y se filtran los titulos en los que
   * aparece.
   */
  router.get('/api/person', async ({ res, req, query }) => {
    const name = (query.get('name') ?? '').trim();
    if (!name) {
      sendJson(res, 400, { error: 'Falta name' });
      return;
    }
    const result = await findPersonFilmography(registry, name, {
      type: query.get('type') ?? undefined,
    });
    sendJson(res, 200, { name: result.name, titles: result.titles, sources: result.sources }, {
      req,
      cache: DEFAULT_CACHE_POLICIES.meta,
    });
  });

  /**
   * Recomendaciones personalizadas (WuPlay: "Recommended by Wuplay").
   *
   * Se calculan con los generos de los titulos valorados como "Me gusta":
   * se recorren los catalogos del registro y se puntua cada meta por generos
   * compartidos, descartando lo que ya se ha valorado.
   */
  router.get('/api/recommended', async ({ res, req, query }) => {
    const data = getData();
    const profileId = query.get('profileId') ?? data.activeProfileId;
    const ratings = data.ratings?.[profileId] ?? [];
    const likes = ratings.filter((entry) => entry.rating === 'like');
    if (!likes.length) {
      sendJson(res, 200, { titles: [] }, { req, cache: DEFAULT_CACHE_POLICIES.api });
      return;
    }

    const weights = new Map<string, number>();
    for (const entry of likes) {
      for (const genre of entry.genres ?? []) {
        weights.set(genre.toLowerCase(), (weights.get(genre.toLowerCase()) ?? 0) + 1);
      }
    }
    if (!weights.size) {
      sendJson(res, 200, { titles: [] }, { req, cache: DEFAULT_CACHE_POLICIES.api });
      return;
    }

    const excluded = new Set(ratings.map((entry) => entry.id));
    const catalogs = registry
      .catalogs()
      .filter((catalog) => catalog.type === 'movie' || catalog.type === 'series');

    const scored = new Map<string, { meta: MetaPreview; score: number }>();
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

    const titles = applyParentalFilters(
      applyContentFilters(
        [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 20).map((entry) => entry.meta),
        data.settings.filters,
      ),
      data.profiles.find((entry) => entry.id === profileId)?.parental,
    );
    sendJson(res, 200, { titles }, { req, cache: DEFAULT_CACHE_POLICIES.api });
  });

  /**
   * Titulos similares (WuPlay: "Similar Titles" desde la ficha de detalle).
   */
  router.get('/api/similar', async ({ res, req, query }) => {
    const id = (query.get('id') ?? '').trim();
    const type = query.get('type') ?? 'movie';
    if (!id) {
      sendJson(res, 400, { error: 'Falta id' });
      return;
    }
    const metaResult = await registry.meta({ type, id });
    const meta = metaResult.value.meta;
    if (!meta) {
      sendJson(res, 200, { titles: [] }, { req, cache: DEFAULT_CACHE_POLICIES.api });
      return;
    }
    const titles = await findSimilarTitles(registry, meta, {
      type: query.get('filterType') ?? type,
    });
    sendJson(res, 200, {
      titles: applyParentalFilters(
        applyContentFilters(titles, getData().settings.filters),
        activeParental(),
      ),
    }, {
      req,
      cache: DEFAULT_CACHE_POLICIES.meta,
    });
  });
}

/**
 * Enriquece la ficha con los campos del SDK que los clientes si representan.
 *
 * Sin esto, Stremio/WuPlay muestran fichas sin reparto navegable, sin forma de
 * poster (y por tanto con recortes raros) y sin retomar el episodio visto.
 */
export function enrichMeta(
  source: MetaDetail | null,
  type: string,
  id: string,
  data: AppData,
): MetaDetail | null {
  if (!source) return null;
  const meta: MetaDetail = { ...source };

  meta.posterShape = posterShapeOf(meta, type);
  const runtime = normalizeRuntime(meta.runtime);
  if (runtime) meta.runtime = runtime;
  const links = metaLinksOf(meta, type, id);
  if (links.length) meta.links = links;

  const hints = { ...(meta.behaviorHints ?? {}) };
  const defaultVideoId = defaultVideoIdOf(data, type, id);
  if (defaultVideoId && hints['defaultVideoId'] === undefined) {
    hints['defaultVideoId'] = defaultVideoId;
  }
  if ((meta.videos?.length ?? 0) > 0 && hints['hasScheduledVideos'] === undefined) {
    hints['hasScheduledVideos'] = false;
  }
  if (Object.keys(hints).length) meta.behaviorHints = hints;

  return meta;
}
