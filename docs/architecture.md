# Arquitectura

## 1. Por qué el núcleo vive en el servidor

WuPlay y NuvioTV resuelven el mismo problema en la propia app: cada cliente
implementa por su lado el consumo de addons, la reproducción y la biblioteca.
Eso duplica el trabajo y hace que dos dispositivos del mismo usuario se
comporten de forma distinta.

En Vibe Flix la división es:

- **Servidor (`@vibe-flix/server`)** — entiende el protocolo de addons Stremio,
  agrega los addons instalados, normaliza sus respuestas, cachea, resuelve
  conflictos de calidad y aplica las políticas HLS. También guarda biblioteca y
  perfiles.
- **Cliente** — sólo presenta y reproduce. El cliente web y el shell Android
  consumen el mismo contrato (el protocolo Stremio + unas pocas rutas `/api`).

Consecuencia práctica: **Vibe Flix instalado como addon en Stremio, WuPlay o
Nuvio da exactamente los mismos resultados que la app nativa**, porque ambos
consumen el mismo agregador.

## 2. Flujo de una petición de catálogo

```
Cliente                     Servidor                         Addons
  │ GET /catalog/movie/top.json                              │
  ├────────────────────────▶│                                │
  │                         │ 1. registry.catalogs() → qué addons      │
  │                         │    publican movie/top                    │
  │                         │ 2. fan-out en paralelo ───────────────────▶│
  │                         │    (timeout por addon, fallos aislados)  │
  │                         │ 3. normaliza cada respuesta              │
  │                         │ 4. deduplica por id y fusiona campos     │
  │                         │ 5. cachea 3 min (single-flight)           │
  │◀────────────────────────┤ { metas: [...] }                         │
```

Detalles del motor (`packages/addon-engine`):

- `url.ts` — construcción de URLs de recurso **heredando la query del
  manifest** (`apiKey`, `token`…), codificación de ids (`tt123:1:2`) y
  serialización del `extra` de catálogos.
- `http.ts` — timeouts, reintentos con backoff exponencial, reintento solo en
  errores 5xx/429 y límite de tamaño de respuesta.
- `cache.ts` — caché TTL con evicción LRU y `SingleFlight` para que N
  peticiones simultáneas del mismo catálogo disparen **una** llamada.
- `normalize.ts` — tolerancia con la inconsistencia real de los addons.
- `client.ts` — cliente de un addon: manifest cacheado, recursos, y helpers
  `supportsResource` / `matchesIdPrefix` / `supportsType`.
- `registry.ts` — el agregador: instalación, auto-update, catálogo unificado,
  fan-out con aislamiento de errores y orden de streams por calidad.
- `streamQuality.ts` — heurística de calidad (resolución, codec, HDR, Dolby
  Vision, Atmos, cacheado) usada para ordenar los streams de forma estable.

### 2.1 Contenido por género, década y búsqueda (`apps/server/src/library/`, `routes/browse.ts`)

La Fase 3/4 añade una capa de descubrimiento **propia**, calculada sobre los
catálogos que ya están agregados:

- **`library/genres.ts`** — 21 géneros (es → EN) con emoji y color, alias de
  normalización (`normalizeGenre`), las décadas 1950–2020 (`DECADES`) y
  `decadeOf()`.
- **`library/filters.ts`** — `ContentFilters` (géneros incluidos/excluidos,
  palabras clave excluidas, puntuación mínima, ocultar adultos) y
  `applyContentFilters()`, que normaliza título, géneros y descripción antes
  de comparar (`normalizeText` quita acentos y signos).
- **`routes/browse.ts`** — `GET /api/genres`, `GET /api/browse` (por `genre`
  usando el extra real del catálogo, por `decade` filtrando por año de
  estreno, o por `q`), `GET/POST/DELETE /api/search-history` y
  `PUT /api/sidebar`.
- Los filtros se aplican **en el servidor**, de modo que la búsqueda, los
  géneros y las décadas quedan limpios a la vez, en todos los clientes.
- `PUT /api/settings` **fusiona** `filters` (igual que `debrid`,
  `opensubtitles` y `skipIntro`): un guardado parcial nunca borra el resto de
  los ajustes.
- `app.handle` envuelve cada ruta en un `try/catch`: un error devuelve un
  `500` JSON en vez de dejar la petición colgada.

## 3. Flujo de reproducción (núcleo HLS master)

```
Cliente                     Servidor                         CDN
  │ GET /hls/master?url=…                                         │
  ├────────────────────────▶│                                   │
  │                         │ fetch master ─────────────────────▶│
  │                         │◀── #EXTM3U + EXT-X-STREAM-INF ────│
  │                         │ parsePlaylist()                    │
  │                         │ selectBest(capacidades, perfil)    │
  │◀── { variants, selected }                                    │
  │                                                           │
  │ GET /hls/proxy?url=… (playlist + segmentos)                 │
  ├────────────────────────▶│ reproduce cabeceras ─────────────▶│
  │                         │◀── playlist ───────────────────────│
  │                         │ rewritePlaylist() → URLs al proxy  │
  │◀── playlist reescrita ─────────────────────────────────────┘
```

`@vibe-flix/hls-master` es una librería pura (sin I/O), lo que la hace
fácilmente testeable y reutilizable desde el shell Android si en el futuro se
quiere parsear en el dispositivo.

### Criterios de selección

| Criterio | Efecto |
| --- | --- |
| `maxHeight` | Descarta variantes por encima de la resolución del dispositivo |
| `supportsHdr` | Si es `false`, las variantes `PQ`/`HLG` se eliminan (no solo se penalizan) |
| `preferredCodecs` | Orden de preferencia AV1 → HEVC → H.264 (mejor compresión a igual bitrate) |
| `maxFrameRate` | Penaliza variantes por encima del refresco del panel |
| `maxBandwidthMbps` | Penaliza variantes que exceden la red |
| Idioma del perfil | Selecciona la pista de audio y la de subtítulos (alias `spa`→`es`) |

## 4. Modelo de datos

```ts
AppData {
  addons: InstalledAddonRecord[]      // manifestUrl + config por addon
  profiles: Profile[]                  // nombre, avatar, PIN, contentLanguage, audio/subtítulos, autoplay
  activeProfileId: string
  watchlists: Record<profileId, Watchlist[]>
  history:    Record<profileId, HistoryEntry[]>
  progress:   Record<profileId, ProgressEntry[]>
  ratings:    Record<profileId, RatingEntry[]>  // «me gusta» / «no para mí»
  devices:    PairedDevice[]              // dispositivos vinculados (token)
  pairings:   PairingCode[]               // códigos de vinculación pendientes
  catalogPreferences: CatalogPreference[]  // order + hidden por `type:id`
  searchHistory:  Record<profileId, SearchHistoryEntry[]>  // búsquedas recientes
  settings: AppSettings                    // tema, device (maxHeight, hdr…), debrid,
                                            // filters (content filters) y sidebar (menú)
}
```

Persistencia en un único JSON (`data/vibe-flix.json`, o `DATA_DIR/vibe-flix.json`)
con escritura atómica (temporal + `rename`) y permisos de fichero `0600` en
POSIX. Los PIN se guardan con `scrypt` y sal aleatoria; los datos antiguos con
PIN en claro se migran al arrancar. Las respuestas de perfiles solo devuelven
un indicador de PIN, no el hash. Se evita una base de datos nativa para que el
proyecto sea `clone & run` sin compilación nativa. El servidor mantiene un
**perfil activo global**: otros clientes del mismo servidor ven el cambio.

## 5. Cliente web

- **Navegación espacial**: las flechas mueven el foco al elemento focusable más
  cercano en esa dirección usando los rectángulos reales (`navigation.ts`).
  Funciona con cualquier disposición sin describir la jerarquía.
- **Reproductor**: `hls.js` con `startLevel: -1` (adaptación automática) y
  cambio manual de calidad; el panel "Info HLS" muestra las variantes reales
  que el servidor ha analizado.
- **Estado**: un único `AppProvider` con los datos de la app y de la biblioteca.
  `ProfilePreferences` solicita nombre e idioma en el primer uso del perfil y
  permite editarlos después; la fuente de verdad es `/api/profiles/:id`.

## 5.1 Debrid nativo (`packages/addon-engine/src/debrid/`)

El servidor es el único que resuelve los enlaces premium, y lo hace una vez:

```
streams agregados  ->  candidatos (infoHash / externalUrl)
                   ->  DebridService (cache TTL 2 h, concurrencia 3)
                   ->  proveedor (RD | AllDebrid | TorBox | Premiumize)
                   ->  stream con url directa + etiqueta [RD]
```

- `types.ts`: contrato `DebridProvider` y extracción del enlace
  (`linkOf`) de cada stream.
- `realdebrid.ts`, `alldebrid.ts`, `torbox.ts`, `premiumize.ts`: un proveedor
  por fichero, cada uno con su flujo real (magnet instantáneo, subida y
  espera, unrestrict…).
- `service.ts`: caché, concurrencia, degradación elegante (si la resolución
  falla se conserva el stream original) y etiquetado `[RD]`/`[AL]`/`[TB]`/`[PM]`.

## 5.1 bis Scrapers nativos (`packages/scrapers/`)

Addon de streams **Vibe Flix** que vive dentro del servidor y se registra en
el mismo `AddonRegistry` que los addons instalados. Su selección por idioma y
tipo sigue el modelo de proveedores de
[StreamFlix Reborn](https://git.gay/streamflix-reborn2/streamflix/src/branch/main):
referencia de arquitectura (licencia Apache-2.0) y nueve adaptadores
TypeScript independientes basados en los flujos de sus proveedores. El
[inventario detallado](streamflix-reborn-inventory.md) distingue VOD, IPTV y
archivos sin instancia; no promete que los sitios estén disponibles.

```
petición /stream/series/tt0123456:2:4.json
   ->  perfil activo: idioma, ID y categoría desde la meta (anime/dorama/serie)
   ->  AddonRegistry.streams(cacheScope = perfil:idioma)  (fan-out paralelo)
        ->  addon remoto A          ->  streams (alternativas)
        ->  addon remoto B          ->  streams (alternativas)
        ->  NativeScrapersAddon     ->  ScraperRegistry.resolve()
                                       ->  proveedor del idioma y tipo preferidos
                                       ->  fallback idioma base/serie genérica
                                       ->  cada proveedor con timeout propio
                                   ->  fuentes nativas preferidas, calidad interna
   ->  debrid (magnets)  ->  presentStreams(título · T2 E4)
```

Piezas del paquete:

| Fichero | Responsabilidad |
| --- | --- |
| `src/types.ts` | Contrato: `ScrapeProvider`, `ScrapeRequest`, `ScrapeContext`, `ScrapedSource`, `ProviderConfig`. |
| `src/embed.ts` | Extractores de player (`hls`, `file`, `sources[]`, `<video>`, `$.get`), `resolveEmbed`, `detectQuality` y **desempaquetador de JavaScript** (`unpackPacker`/`unbase`, decodificado, nunca ejecutado). |
| `src/normalize.ts` | `normalizeTitle`/`titleMatches` (comparación con acentos y artículos), `qualityRank`, `toStremioStream` (convierte a stream Stremio con `behaviorHints` y subtítulos) y `mergeSources` (dedupe + orden). |
| `src/language.ts` | Idiomas `es-419`, `es-ES`, `en`…, preferencia exacta → idioma base → otra región → sin idioma declarado. |
| `src/providers/registry.ts` | `ScraperRegistry`: fan-out paralelo, **timeout por proveedor**, aislamiento de fallos y selección por idioma + categoría (`movie`/`series`/`anime`/`dorama`). |
| `src/providers/config.ts` | Proveedor descrito por configuración: `fillTemplate` (`{title}`, `{titleId}`, `{year}`, `{season}`, `{episode}`, `{imdbId}`, `{tmdbId}`, `{id}`) + `episodeUrl`/`episodePattern`, comprobación opcional del título y extracción con expresiones regulares. |
| `src/providers/archive.ts` | Respaldo Internet Archive (dominio público) con `advancedsearch` + `metadata` + elección del archivo mayor; idioma del audio no declarado. |
| `src/providers/{cinehax,fanpelis,doramasflix,tioanime,frembed,ridomovies,mstream,guardaflix,zaluknij}.ts` | Puertos nativos VOD de flujos concretos upstream (es/en/de/fr/it/pl); filtros de título/episodio/audio y retorno solo de URL multimedia o vacío. Probados con HTTP simulado, no en vivo. |
| `src/providers/site-tools.ts` | Comparación conservadora de títulos, extracción de arrays JSON y rechazo de IP privadas/loopback literales en embeds (no reemplaza aislamiento de red frente a DNS rebinding). |
| `src/providers/upstream-catalog.ts` | Inventario de 76 archivos Kotlin y sus estados: **referencia**, no se registra como fuentes activas. |
| `src/addon.ts` | `NativeScrapersAddon`: manifest sintético **Vibe Flix** (`com.vibeflix.native-scrapers`), separa `id:temporada:episodio` para resolver meta del título y episodio real, caché de 5 min por título/idioma, y conversión a streams Stremio. |

En el servidor (`apps/server/src/app.ts`) se crea el `ScraperRegistry`, se
resuelve el `NativeScrapersAddon` y se registra con
`registry.registerSource(...)`; `applyScrapers(data)` reconstruye los
proveedores según los ajustes (`enabled`, `providers`, `configs`) y invalida las
cachés. La API (`apps/server/src/routes/scrapers.ts`) expone el estado, la
configuración, el inventario upstream separado (`GET /api/scrapers/upstream`)
y una prueba de proveedor (`POST /api/scrapers/test`). En
`/stream/...`, `presentStreams` se ejecuta **después** de ordenar y debrid:
solo exporta el título (y temporada/episodio) en etiquetas, pero conserva
URLs y cabeceras de playback. La prioridad de fuentes nativas corresponde al
idioma del perfil; los addons externos siguen como alternativas sin un idioma
verificable. El cache compartido se particiona por ID de perfil e idioma.

Límite: nueve puertos de StreamFlix Reborn y Archive están integrados (42
archivos VOD registrados siguen sin portar; el port polaco es parcial), pero
ninguno tiene reproducción **verificada en vivo** en este entorno. Los demás
archivos del upstream (incluidos canales IPTV y clases no registradas) no son
fuentes activas en Vibe Flix. La selección se hace por idioma de catálogo y
etiquetas de audio cuando existen, no por una garantía de doblaje. Los
embeds no resolubles se descartan. El usuario puede añadir fuentes propias
que esté autorizado a reproducir; el proyecto no garantiza los derechos de
contenido de terceros. Consulta [el inventario](streamflix-reborn-inventory.md).

## 5.2 PWA y vinculación

- `apps/web/public/sw.js`: service worker con tres estrategias (shell en caché,
  catálogos *stale-while-revalidate*, streams siempre por red).
- `apps/web/src/pwa.ts`: registro del service worker y captura del evento
  `beforeinstallprompt` para el botón «Instalar app».
- `apps/server/src/routes/devices.ts`: códigos de vinculación de 6 caracteres
  con caducidad de 10 minutos; el token viaja en `X-Vibe-Flix-Token` y, en
  cuanto existe un dispositivo vinculado, el servidor lo exige en las rutas de
  biblioteca (`app.ts`).

### 5.3 Omitir intro y OpenSubtitles (web)

- `api.skipIntro()` y `api.openSubtitles()` / `api.downloadOpenSubtitle()`
  (`apps/web/src/api.ts`) consumen las nuevas rutas del servidor.
- `Player.tsx` es un reproductor propio (sin `controls` nativos): barra
  inferior con progreso, volumen, calidad, audio, subtítulos y tamaño de
  subtítulos; atajos de teclado (espacio/K, flechas, M, F, I) y auto-ocultado
  de la barra a los 3 s.
- El subtitulo externo se carga con `<track kind="subtitles">` (WebVTT), que
  es lo que hls.js v1 no puede hacer con pistas externas del propio stream.

### 5.4 Teclado, buscador, géneros, décadas y personalización (web)

- **`components/Keyboard.tsx`**: teclado en pantalla (letras, `ñ`, números,
  símbolos, mayús, espacio, borrar y «Buscar»). Cada tecla es un
  `button[data-focusable]`, de modo que la navegación espacial existente la
  recorre con el D-pad sin ningún código de foco nuevo. La pulsación larga
  sobre «⌫» limpia la consulta entera (`HOLD_TO_CLEAR_MS = 700`).
- **`screens/Search.tsx`**: buscador nativo. Con la consulta vacía muestra los
  chips del historial (`/api/search-history`); al buscar, guarda el término y
  ofrece «Guardar en una lista» (`/api/lists/{id}/items/batch`).
- **`screens/Browse.tsx`**: `GenresScreen` (tarjetas con emoji y color),
  `DecadesScreen` (1950–2020) y las fichas de género y década
  (`/api/browse`).
- **`navigation-items.ts`**: define las secciones del menú; `App.tsx` las
  ordena y filtra según `settings.sidebar`, y *Ajustes* permite subirlas,
  bajarlas u ocultarlas (`PUT /api/sidebar`).
- Los **filtros de contenido** se editan en *Ajustes* y se guardan en
  `settings.filters` (el servidor los fusiona, no los reemplaza).

## 6. Shell Android TV

- Compose for TV + Media3 (ExoPlayer) + Hilt + Retrofit/Moshi + DataStore.
- `PlayerViewModel` consulta `/hls/master` **antes** de reproducir y fija la
  variante elegida, en lugar de dejar que ExoPlayer elija a ciegas.
- El cliente Android habla con el servidor usando el protocolo Stremio, igual
  que cualquier otro cliente de addons.
- El arranque presenta `ProfilesScreen`: seleccionar/crear perfil, nombre,
  idioma y PIN si procede antes de entrar; desde Home se puede cambiar de
  perfil e idioma. El cambio se persiste mediante la API, y la preferencia
  local de audio en `SettingsStore` se sincroniza con el idioma elegido.
  **Compilación Android pendiente**: este entorno no tiene Gradle/`gradlew`.

### 6.1 Reproductor Media3 (`android/app/src/main/java/com/vibeflix/tv/data/player/`)

```
url + cabeceras
   -> PlayerViewModel.prepare()      consulta /hls/master (variante + pistas)
   -> PlayerEngine.setMedia()        MediaItem con mimeType HLS
   -> VibeFlixMediaSourceFactory    HlsMediaSource (chunkless off) o default
   -> CacheDataSource                SimpleCache (LRU 512 MB) + clave propia
   -> OkHttpDataSource               cabeceras del addon en cada peticion
```

- **Motor** (`PlayerEngine.kt`): `ExoPlayer` con `DefaultLoadControl`
  (50 s / 120 s / 2,5 s / 5 s), `DefaultTrackSelector` con techo por
  `setMaxVideoSize`, `AudioAttributes` con foco de audio y un `StateFlow`
  (`PlaybackState`) que la UI observa. Comandos: play/pausa, salto ±10 s,
  velocidad, volumen, elección exacta de pista y Subtítulos on/off.
- **Caché** (`PlaybackCache.kt`): `SimpleCache` con
  `LeastRecentlyUsedCacheEvictor` (512 MB) y `StandaloneDatabaseProvider`
  (índice en SQLite, sobrevive a reinicios). `CacheDataSource` con
  `FLAG_IGNORE_CACHE_ON_ERROR` para servir lo cacheado cuando el origen falla.
- **Claves** (`HlsCacheKeys.kt`): lógica pura y testeable en la JVM. Los
  segmentos y las claves AES se cachean por URI (inmutables); los playlists
  añaden un *bucket* temporal (`uri#playlist=<bucket>`) para que un directo no
  se quede congelado y, a la vez, se reutilice dentro de la ventana de 60 s.
- **Cabeceras**: `behaviorHints.proxyHeaders.request` viaja en la ruta de
  navegación (`h`, JSON en base64) y se aplica a todas las peticiones, así que
  los segmentos exigidos por el CDN también los reciben.

### 6.2 Integración con el D-pad (`ui/screens/player/PlayerScreen.kt`)

- `PlayerView` con `useController = false`: la superficie de video no captura
  el foco (`isFocusable = false`) y el control lo lleva la capa de Compose.
- `onPreviewKeyEvent` en la raíz: flechas, OK, BACK y teclas multimedia se
  gestionan antes que el foco de los hijos.
- La barra de controles (`PlayerControls`) es un contenedor *focusable*: al
  desplegarla se le cede el foco con un `FocusRequester`, y mientras lo tiene
  las flechas recorren los botones de forma nativa.
- Los controles se ocultan a los 5 s de inactividad, pero no mientras el
  usuario los está usando.

### 6.3 Omitir intro, autoplay y OpenSubtitles (Android TV)

El shell Android TV hereda las tres funciones del servidor, de modo que la
web y la TV se comportan igual:

- **`PlayerViewModel.prepare(url, headers, id, type)`** pide al servidor el
  segmento saltable (`/api/skip-intro`) y el episodio siguiente (ficha de la
  serie + streams) en paralelo al análisis del master playlist.
- **`PlayerEngine.setMedia(url, title, isHls, subtitleUrl)`** monta el
  subtitulo externo como *side-loaded subtitle* de Media3
  (`MediaItem.SubtitleConfiguration`), que es la vía que ofrece Media3 para
  WebVTT descargados de OpenSubtitles.
- **Botón «Saltar la intro»**: `Button` de Compose en la esquina inferior
  derecha, visible mientras `positionMs < segment.endMs`; al pulsarlo hace
  `engine.seekTo(segment.endMs)`.
- **Autoplay**: cuando `PlaybackState.isEnded` pasa a `true`, el
  `PlayerScreen` muestra la tarjeta del siguiente episodio con una cuenta
  atrás (`AUTOPLAY_COUNTDOWN = 5`); al llegar a cero se navega a la ruta del
  reproductor del episodio siguiente.

### 5.5 Sistema de diseño del cliente web

La hoja de estilos está troceada para que el cambio sea fácil de revisar:

| Fichero | Contenido |
| --- | --- |
| `styles/base.css` | Tokens (paleta, formas, sombras), reset, layout, rail, portada, filas, pósters, detalle, paneles, botones, chips, teclado, géneros y Utility classes |
| `styles/player.css` | Reproductor (barra de control, progreso, volumen, «saltar intro», autoplay). Va aparte porque es un bloque grande y autocontenido |
| `styles.css` | Sólo importa los dos anteriores y las utilidades transversales |

Piezas de React del diseño:

- **`components/SideRail.tsx`**: rail de navegación (marca, secciones y
  perfil). Lee `settings.sidebar` del servidor, así que la personalización del
  menú se respeta aquí.
- **`components/icons.tsx`**: set de iconos SVG en línea (`IconName`), sin
  dependencias ni peticiones extra.
- **`components/PageHeader.tsx`**: encabezado común de pantalla.
- **`components/ui.tsx`**: `Poster`, `Row`, `Button`, `Modal`, `Loader` y los
  nuevos `Skeleton` / `SkeletonRow` (carga sin spinners).

Decisiones de rendimiento:

- `content-visibility: auto` + `contain-intrinsic-size` en cada fila: el
  navegador no pinta las filas fuera de pantalla.
- Las animaciones sólo usan `transform` y `opacity`.
- `prefers-reduced-motion` desactiva el aura de fondo y las transiciones.
- Las imágenes usan `loading="lazy"` y `decoding="async"`.

### 6.4 Teclado, buscador, géneros y décadas (Android TV)

El shell Android TV replica el comportamiento de la web:

- **`ui/components/OnScreenKeyboard.kt`**: teclado de Compose for TV. Las
  teclas son `Button`, así que el foco de la TV las recorre con el D-pad. Dos
  pulsaciones seguidas sobre «⌫» borran la consulta completa.
- **`ui/screens/search/`** (`SearchViewModel` + `SearchScreen`): historial en
  chips, búsqueda contra `/api/browse?q=` y resultados en un `PosterRow`.
- **`ui/screens/browse/`** (`BrowseViewModel` + `BrowseScreen`): tarjetas de
  género y de década (`LazyVerticalGrid`) y ficha de contenido.
- **`HomeScreen`** muestra solo las secciones visibles según
  `settings.sidebar`, de modo que la personalización del menú es la misma en la
  TV y en la web.

## 7. Endurecimiento pendiente

- Límite de concurrencia global del fan-out (hoy es `Promise.allSettled` sin
  semáforo; con muchos addons puede saturar).
- Verificación de firmas `stremioAddonsConfig` de los addons oficiales.
- Cola de reintento con backoff para addons intermitentes.
