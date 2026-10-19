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

## 7. Endurecimiento pendiente

- Límite de concurrencia global del fan-out (hoy es `Promise.allSettled` sin
  semáforo; con muchos addons puede saturar).
- Verificación de firmas `stremioAddonsConfig` de los addons oficiales.
- Cola de reintento con backoff para addons intermitentes.
