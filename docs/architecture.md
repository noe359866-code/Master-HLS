# Arquitectura

## 1. Por qué el núcleo vive en el servidor

WuPlay y NuvioTV resuelven el mismo problema en la propia app: cada cliente
implementa por su lado el consumo de addons, la reproducción y la biblioteca.
Eso duplica el trabajo y hace que dos dispositivos del mismo usuario se
comporten de forma distinta.

En Master-HLS la división es:

- **Servidor (`@master-hls/server`)** — entiende el protocolo de addons Stremio,
  agrega los addons instalados, normaliza sus respuestas, cachea, resuelve
  conflictos de calidad y aplica las políticas HLS. También guarda biblioteca y
  perfiles.
- **Cliente** — sólo presenta y reproduce. El cliente web y el shell Android
  consumen el mismo contrato (el protocolo Stremio + unas pocas rutas `/api`).

Consecuencia práctica: **Master-HLS instalado como addon en Stremio, WuPlay o
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

`@master-hls/hls-master` es una librería pura (sin I/O), lo que la hace
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
  profiles: Profile[]                  // nombre, avatar, PIN, idiomas, autoplay
  activeProfileId: string
  watchlists: Record<profileId, Watchlist[]>
  history:    Record<profileId, HistoryEntry[]>
  progress:   Record<profileId, ProgressEntry[]>
  ratings:    Record<profileId, RatingEntry[]>  // «me gusta» / «no para mí»
  devices:    PairedDevice[]              // dispositivos vinculados (token)
  pairings:   PairingCode[]               // códigos de vinculación pendientes
  catalogPreferences: CatalogPreference[]  // order + hidden por `type:id`
  settings: AppSettings                    // tema, device (maxHeight, hdr…), debrid
}
```

Persistencia en un único JSON (`data/master-hls.json`) con escritura atómica
(temporal + `rename`). Se evita una base de datos nativa para que el proyecto
sea `clone & run` sin compilación nativa.

## 5. Cliente web

- **Navegación espacial**: las flechas mueven el foco al elemento focusable más
  cercano en esa dirección usando los rectángulos reales (`navigation.ts`).
  Funciona con cualquier disposición sin describir la jerarquía.
- **Reproductor**: `hls.js` con `startLevel: -1` (adaptación automática) y
  cambio manual de calidad; el panel "Info HLS" muestra las variantes reales
  que el servidor ha analizado.
- **Estado**: un único `AppProvider` con los datos de la app y de la biblioteca.

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

## 5.2 PWA y vinculación

- `apps/web/public/sw.js`: service worker con tres estrategias (shell en caché,
  catálogos *stale-while-revalidate*, streams siempre por red).
- `apps/web/src/pwa.ts`: registro del service worker y captura del evento
  `beforeinstallprompt` para el botón «Instalar app».
- `apps/server/src/routes/devices.ts`: códigos de vinculación de 6 caracteres
  con caducidad de 10 minutos; el token viaja en `X-Master-Hls-Token` y, en
  cuanto existe un dispositivo vinculado, el servidor lo exige en las rutas de
  biblioteca (`app.ts`).

## 6. Shell Android TV

- Compose for TV + Media3 (ExoPlayer) + Hilt + Retrofit/Moshi + DataStore.
- `PlayerViewModel` consulta `/hls/master` **antes** de reproducir y fija la
  variante elegida, en lugar de dejar que ExoPlayer elija a ciegas.
- El cliente Android habla con el servidor usando el protocolo Stremio, igual
  que cualquier otro cliente de addons.

### 6.1 Reproductor Media3 (`android/app/src/main/java/com/masterhls/tv/data/player/`)

```
url + cabeceras
   -> PlayerViewModel.prepare()      consulta /hls/master (variante + pistas)
   -> PlayerEngine.setMedia()        MediaItem con mimeType HLS
   -> MasterHlsMediaSourceFactory    HlsMediaSource (chunkless off) o default
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

## 7. Endurecimiento pendiente

- Límite de concurrencia global del fan-out (hoy es `Promise.allSettled` sin
  semáforo; con muchos addons puede saturar).
- Verificación de firmas `stremioAddonsConfig` de los addons oficiales.
- Cola de reintento con backoff para addons intermitentes.
