/**
 * Protocolo de los scrapers nativos.
 *
 * La idea (la de StreamFlix Reborn) es sencilla: en vez de depender de un
 * addon externo que resuelva los enlaces, el propio servidor "raspa" las
 * paginas de origen y devuelve streams reproducibles. Cada proveedor es una
 * pieza independiente que sabe buscar un titulo y extraer sus enlaces.
 *
 * Aqui el diseno es deliberately pequeno y extensible:
 *
 *   - `ScrapeProvider` es el contrato (un solo metodo).
 *   - `ProviderConfig` permite definir un proveedor **sin escribir codigo**:
 *     una plantilla de URL de busqueda y una lista de expresiones regulares
 *     para extraer el enlace. El usuario puede asi anadir sus propios
 *     proveedores desde los ajustes.
 *   - `ScrapeRegistry` consulta todos los proveedores en paralelo, aísla los
 *     fallos, deduplica y ordena por calidad.
 */

/** Tipos que un proveedor puede atender. Anime y dorama son categorías de película/serie. */
export type ScrapeType = 'movie' | 'series' | 'episode' | 'anime' | 'dorama';
export type ContentKind = 'movie' | 'series' | 'anime' | 'dorama';

/** Peticion de fuentes para un titulo. */
export interface ScrapeRequest {
  /** Tipo segun el protocolo Stremio. */
  type: string;
  /** Id del título/episodio (el que llega en la ruta del addon). */
  id: string;
  /** Categoría inferida de la metadata; no siempre coincide con el tipo Stremio. */
  kind?: ContentKind;
  /** Id de IMDb si se conoce (`tt1234567`). */
  imdbId?: string;
  /** Id del título sin el sufijo :temporada:episodio. */
  titleId?: string;
  /** Id de TMDB si se conoce. */
  tmdbId?: string;
  /** Titulo legible, necesario para buscar en paginas web. */
  title?: string;
  /** Ano de estreno, para desambiguar. */
  year?: number;
  /** Temporada (series). */
  season?: number;
  /** Episodio (series). */
  episode?: number;
  /** Idioma preferido del perfil. */
  language?: string;
}

/** Subtitulo encontrado junto a una fuente. */
export interface ScrapedSubtitle {
  /** Codigo ISO del idioma (es, en, fr...). */
  language: string;
  url: string;
  label?: string;
}

/** Fuente de video ya resuelta. */
export interface ScrapedSource {
  /** URL directa (http/https) o magnet. */
  url: string;
  /** Proveedor que la ha resuelto. */
  provider: string;
  /** Calidad detectada (1080p, 720p...). */
  quality?: string;
  /** Etiqueta visible en el cliente (p.ej. "Voe · 1080p"). */
  label?: string;
  /** Tamano en bytes, si el origen lo expone. */
  size?: number;
  /** Cabeceras necesarias para reproducir (algunos CDN las exigen). */
  headers?: Record<string, string>;
  /** Subtitulos asociados. */
  subtitles?: ScrapedSubtitle[];
  /** infoHash del torrent, si la fuente es un magnet. */
  infoHash?: string;
}

/** Contexto que se pasa a los proveedores (HTTP y cache). */
export interface ScrapeContext {
  /** Descarga una URL y devuelve el texto. */
  fetchText: (url: string, init?: { headers?: Record<string, string> }) => Promise<string>;
  /** Descarga una URL y devuelve el JSON. */
  fetchJson: <T>(url: string, init?: { headers?: Record<string, string> }) => Promise<T>;
  /** POST JSON para APIs GraphQL de proveedores que lo necesitan (opcional en mocks). */
  postJson?: <T>(url: string, body: unknown, init?: { headers?: Record<string, string> }) => Promise<T>;
  /** User-Agent por defecto (los sitios de peliculas rechazan los bots). */
  userAgent: string;
}

/**
 * Proveedor de fuentes.
 *
 * Un proveedor nunca lanza: si falla, devuelve un array vacio. Asi el
 * registro puede consultar varios en paralelo sin que uno rompa el resto.
 */
export interface ScrapeProvider {
  /** Id estable (se usa en los ajustes y en la configuracion). */
  id: string;
  /** Nombre visible en el cliente. */
  name: string;
  /** Tipos que admite. */
  types: ScrapeType[];
  /** Idiomas/variantes que cubre (p. ej. es, es-419, en); vacío = sin declarar. */
  languages?: string[];
  /** Region o descripcion corta (opcional). */
  region?: string;
  /**
   * Alcance real del port respecto al proveedor upstream:
   * `full` = mismo flujo (películas/series según `types`); `partial` = solo
   * una parte (p. ej. Zaluknij sin episodios ni WebView antibot).
   */
  coverage?: 'full' | 'partial';
  /** Limitaciones conocidas y visibles en la API de estado. */
  limitations?: string[];
  /** Resuelve las fuentes de un titulo. */
  fetchSources(request: ScrapeRequest, context: ScrapeContext): Promise<ScrapedSource[]>;
}

/**
 * Proveedor descrito por configuracion (sin codigo).
 *
 * Plantillas admitidas en las URLs:
 *   {title} {year} {season} {episode} {imdbId} {tmdbId} {id} {titleId}
 */
export interface ProviderConfig {
  id: string;
  name: string;
  types: ScrapeType[];
  languages?: string[];
  region?: string;
  /** URL de busqueda del sitio. */
  searchUrl?: string;
  /** Plantilla de la URL del item encontrado ({id} = lo capturado). */
  itemUrl?: string;
  /** Expresión regular: grupo 1 = id; grupo 2 opcional = título para verificar. */
  itemPattern?: string;
  /** URL del episodio: {id} es el id hallado en búsqueda; {season}/{episode} son números. */
  episodeUrl?: string;
  /** Patrón sobre la página del título que captura (grupo 1) la URL del episodio correcto. */
  episodePattern?: string;
  /** Expresiones regulares para extraer la URL del stream de la pagina. */
  streamPatterns?: string[];
  /** Cabeceras HTTP adicionales para las páginas; también se envían al reproductor. */
  headers?: Record<string, string>;
  /** Si es true, la pagina del item se resuelve con el extractor de embeds. */
  useEmbedResolver?: boolean;
  /** Calidad por defecto si no se puede detectar. */
  defaultQuality?: string;
}
