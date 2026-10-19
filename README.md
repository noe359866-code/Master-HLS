# Master-HLS

**App basada en Stremio** construida sobre dos bases reales:

| Base | Qué aporta | Qué se ha reutilizado |
| --- | --- | --- |
| [WuPlay](https://github.com/wuplayapp/wuplay-releases) | Cliente Android TV, privado, sin registro, con perfiles, watchlists, historial y configurador web de addons | Modelo de perfiles/watchlists/historial, auto-update de addons, orden y visibilidad de catálogos, privacidad (sin cuentas ni telemetría) |
| [NuvioTV](https://github.com/NuvioMedia/NuvioTV) | Cliente Android TV open source (Kotlin, Compose, Media3) con debrid, plugins y watch parties | Arquitectura Kotlin/Compose for TV + Media3, tolerancia ante DTOs inconsistentes de addons, `behaviorHints`, soporte de vídeo advanced (DV/HDR) |

Master-HLS se diferencia por el **núcleo HLS master**: el motor de agregación de
addons Stremio y la selección de variantes HLS viven en el servidor, de modo que
**todos los clientes** (web TV, Android TV, o el propio Stremio/WuPlay/Nuvio)
consumen exactamente la misma lógica.

---

## Arquitectura

```
┌──────────────┐    ┌────────────────────────┐    ┌──────────────────────────┐
│  Cliente TV  │    │   Servidor Master-HLS  │    │  Addons Stremio externos │
│  web / APK   │───▶│  (Node + TypeScript)   │───▶│  Cinemeta, Torrentio,    │
│  React/hls.js│    │                        │    │  AIOStreams, Kometa…     │
│  Compose/M3  │    │  · @master-hls/addon-  │    └──────────────────────────┘
└──────────────┘    │    engine (agregación)  │
                    │  · @master-hls/hls-     │    ┌──────────────────────────┐
                    │    master (variantes)    │───▶│  Stremio / WuPlay / Nuvio│
                    │  · API biblioteca       │    │  (instalando Master-HLS  │
                    │  · Proxy HLS            │    │   como addon)            │
                    └────────────────────────┘    └──────────────────────────┘
```

### Paquetes

| Paquete | Descripción |
| --- | --- |
| `@master-hls/addon-engine` | Cliente del protocolo de addons Stremio: manifest, `catalog`/`meta`/`stream`/`subtitles`, **fan-out paralelo** con aislamiento de fallos por addon, caché TTL + single-flight, normalización tolerante de respuestas, y heurística de calidad para ordenar streams. |
| `@master-hls/hls-master` | Núcleo HLS: parser de master playlist (variantes, pistas de audio/subtítulos, `CODECS`, `VIDEO-RANGE`), política de selección por capacidades del dispositivo, y reescritura de playlists para hacerlas pasar por el proxy. |
| `@master-hls/server` | Servidor: expone Master-HLS **como addon Stremio** (`/manifest.json`, `/catalog/…`, `/meta/…`, `/stream/…`, `/subtitles/…`), API de biblioteca/perfiles, proxy HLS y hosting del cliente web. |
| `@master-hls/web` | Cliente de TV en React + Vite + hls.js: navegación espacial con D-pad, inicio, descubrir, búsqueda, detalle, reproductor, listas, historial, addons, ajustes y perfiles. |
| `android/` | Shell Android TV (Kotlin, Compose for TV, Media3, Hilt, Retrofit/Moshi) que consume los mismos motores a través del servidor. |

---

## Arranque rápido

```bash
npm install
npm run build          # compila los dos paquetes y el servidor
npm run build:web      # compila el cliente web
npm start              # servidor en http://localhost:8181
```

Para probarlo **sin Internet** (addon de demostración con catálogo, metadatos,
streams HLS y subtítulos reales):

```bash
node scripts/demo-addon.mjs 8182       # addon Stremio de demo en :8182
curl -X POST http://localhost:8181/api/addons \
  -H 'content-type: application/json' \
  -d '{"manifestUrl":"http://127.0.0.1:8182/manifest.json"}'
```

Y abre <http://localhost:8181>.

### Desarrollo

```bash
npm run dev          # servidor con recarga (tsx watch) en :8181
npm run dev -w @master-hls/web   # cliente Vite en :5173 (proxy al servidor)
npm test             # 119 tests (addon-engine, hls-master, server)
npm run typecheck    # TypeScript estricto en modo estricto
```

---

## Uso como addon Stremio

Master-HLS se instala en **Stremio, WuPlay o Nuvio** usando su manifest:

```
http://<tu-servidor>:8181/manifest.json
```

A partir de ahí, el addon expone la **unión de todos los addons instalados en el
servidor**: un solo addon da acceso a todos los catálogos, metadatos, streams y
subtítulos. Instalar más addons en el servidor amplía el addon remoto sin
tocar el cliente.

### API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/manifest.json` | Manifest del addon (catálogos agregados) |
| `GET` | `/catalog/{type}/{id}[/{extra}].json` | Catálogo fusionado de todos los addons |
| `GET` | `/meta/{type}/{id}.json` | Metadatos fusionados (cast, episodios, pósters) |
| `GET` | `/stream/{type}/{id}.json` | Streams de todos los addons, ordenados por calidad |
| `GET` | `/subtitles/{type}/{id}.json` | Subtítulos agregados |
| `GET` | `/api/search?q=` | Búsqueda global en todos los catálogos con `search` |
| `GET` | `/api/person?name=` | Ficha de persona con su filmografía (cast & crew) |
| `GET` | `/api/similar?id=&type=` | Títulos similares (por género compartido) |
| `GET` | `/api/recommended` | Recomendaciones según las valoraciones del perfil |
| `GET`/`POST` | `/api/ratings` | Valoraciones «Me gusta» / «No para mí» |
| `GET`/`POST` | `/api/debrid` · `/api/debrid/test` | Estado y comprobación del proveedor de debrid |
| `GET`/`POST`/`DELETE` | `/api/devices` · `/api/pairing` · `/api/pairing/claim` | Vinculación de dispositivos (biblioteca compartida) |
| `GET` | `/api/addons` · `POST` · `DELETE` · `/api/addons/refresh` | Gestión de addons |
| `GET`/`POST`/`PUT`/`DELETE` | `/api/profiles`, `/api/lists`, `/api/history`, `/api/progress`, `/api/settings` | Biblioteca y perfiles |
| `GET` | `/hls/master?url=` | Analiza un master playlist y devuelve variantes + selección |
| `GET` | `/hls/select?url=` | Devuelve la mejor variante según el dispositivo |
| `GET` | `/hls/proxy?url=` | Proxy HLS (reproduce cabeceras y reescribe las playlists) |

---

## Núcleo HLS master

Es la pieza que da nombre al proyecto. Un master playlist de debrid suele traer
10-20 variantes (4K, 1080p, 720p, audio 5.1/2.0, Dolby Vision…) y elegir a
ciegas es lo que hace que un TV ue un 4K HDR en un dispositivo que no lo
soporta.

- **Parsing** de `#EXT-X-STREAM-INF` y `#EXT-X-MEDIA` (audio, subtítulos,
  vídeo, closed captions) con `RESOLUTION`, `BANDWIDTH`, `AVERAGE-BANDWIDTH`,
  `CODECS`, `FRAME-RATE` y `VIDEO-RANGE`.
- **Selección** según capacidades declaradas del dispositivo: altura máxima,
  HDR/Dolby Vision, codecs preferidos, tasa de cuadros y ancho de banda.
  Las variantes HDR se **descartan** si el dispositivo no las soporta.
- **Pistas**: selección de audio y subtítulos por idioma del perfil (con
  alias `spa`→`es`), con los tracks Dolby Vision/Atmos etiquetados.
- **Proxy** que reproduce las cabeceras `Referer`/`User-Agent`/`Cookie` que
  exigen muchos CDN y **reescribe** el playlist para que segmentos, claves
  AES e init segments pasen también por el proxy.

---

## Debrid nativo

NuvioTV integra debrid (RealDebrid, Premiumize, TorBox); WuPlay lo delega en
los addons. Master-HLS lo resuelve **en el servidor**, una sola vez, y cachea el
enlace: el cliente web, el shell Android TV y el propio addon Stremio (es
decir, también WuPlay y NuvioTV) reciben el mismo enlace directo.

- Proveedores: **Real-Debrid**, **AllDebrid**, **TorBox** y **Premiumize**.
- Resuelve magnet (`infoHash`) y enlaces de hoster premium (`externalUrl`),
  eligiendo siempre el archivo de vídeo más grande del release.
- Cache TTL de 2 h (los enlaces caducan) y concurrencia limitada: no se
  satura la API del proveedor.
- Si la resolución falla, **el stream original se conserva** y el error queda
  visible en `GET /api/debrid` (`lastError`).
- Se activa en *Ajustes → Debrid nativo* (proveedor + API key) y se puede
  comprobar la conexión con «Probar conexión».
- Se mantiene la decisión de diseño *solo HTTP*: un enlace resuelto por debrid
  es HTTP, así que el proxy HLS sigue funcionando sin casos especiales.

---

## PWA instalable

El cliente web es una **PWA**: se instala como una app en Android TV, Fire TV
o cualquier navegador con «Instalar aplicación» (sin APK, sin tienda) y sigue
funcionando con la red intermitente.

- `manifest.webmanifest` con iconos propios (192, 512 y *maskable*), modo
  `standalone` y orientación horizontal.
- Service worker (`sw.js`): shell en caché, *stale-while-revalidate* para
  catálogos y metadatos, y red directa para streams, subtítulos y proxy HLS
  (nunca se cachean).
- Botón «Instalar app» en *Ajustes*, con aviso cuando el navegador no expone
  `beforeinstallprompt`.

---

## Sincronización multi-dispositivo

La biblioteca (favoritos, historial, progreso y valoraciones) vive en el
servidor, así que compartirla entre la TV y el móvil no necesita cuentas:

1. En el dispositivo A, *Ajustes → Vincular dispositivos → Generar código*.
2. En el dispositivo B, se introduce el código de 6 caracteres.
3. Ambos quedan vinculados y comparten la biblioteca.

Desde ese momento el servidor exige un token (`X-Master-Hls-Token`) en las
rutas de biblioteca. Si no hay ningún dispositivo vinculado, la app sigue
funcionando en «modo local», sin autenticación.

---

## Android TV

```bash
cd android
./gradlew :app:assembleDebug
```

- Compose for TV + Media3 (ExoPlayer) + Hilt + Retrofit/Moshi + DataStore.
- La app **no implementa el protocolo de addons**: consume el servidor como si
  fuera un addon Stremio, igual que harían Stremio, WuPlay o Nuvio.
- `BuildConfig.DEFAULT_SERVER_URL` apunta a `http://10.0.2.2:8181` (emulador);
  en un dispositivo real, a la IP LAN del servidor.
- Antes de compilar hay que exportar el artefacto `hilt.compiler` en el catálogo
  de versiones (ver `android/gradle/libs.versions.toml`).

### Reproductor Media3 (HLS optimizado)

El reproductor de la app de TV es **AndroidX Media3 (ExoPlayer 1.8.0)** con una
capa propia encima (`data/player/`):

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| `PlayerEngine` | `data/player/PlayerEngine.kt` | Envuelve el `ExoPlayer`: buffer, pista, velocidad, volumen y estado (`StateFlow`). |
| `PlaybackCache` | `data/player/PlaybackCache.kt` | `SimpleCache` (LRU 512 MB) + `StandaloneDatabaseProvider` para que la cache sobreviva a reinicios. |
| `HlsCacheKeys` | `data/player/HlsCacheKeys.kt` | Claves de cache: los segmentos son inmutables; los playlists rotan por ventana de 60 s. |
| `PlayerControls` | `ui/screens/player/PlayerControls.kt` | Barra de controles de TV: velocidad, audio, subtítulos, variantes y volumen. |
| `PlayerScreen` | `ui/screens/player/PlayerScreen.kt` | Superficie de video (`PlayerView` sin controlador) + manejo del D-pad. |

**Optimización para HLS**

- `DefaultLoadControl` con buffers amplios (50 s mínimo, 120 s máximo, 2,5 s
  para arrancar y 5 s tras un rebobinado) y `prioritizeTimeOverSizeThresholds`
  activo: la red puede caer sin cortar la imagen.
- `HlsMediaSource.Factory` propio con `allowChunklessPreparation` desactivado:
  muchos CDN de addons no soportan la preparación sin chunks.
- La **variante** la elige el servidor (`/hls/master`) según la resolución
  máxima, el soporte HDR y el idioma de audio del dispositivo; en el cliente
  queda un techo de calidad (`setMaxVideoSize`) como red de seguridad.
- El playback parte de un master multivariant: el servidor devuelve la
  variante concreta y el cliente reproduce esa URL.

**Caché para evitar cortes**

- `CacheDataSource` con `FLAG_IGNORE_CACHE_ON_ERROR`: si el origen falla, se
  sirve el segmento cacheado en lugar de cortar.
- `CacheKeyFactory` propio: los segmentos y las claves AES se cachean por URI
  (inmutables) y los playlists incluyen una ventana temporal, de modo que un
  stream en directo no se queda congelado en el primer manifiesto.
- Cabeceras: las que pide el addon (`behaviorHints.proxyHeaders.request`) se
  transportan hasta el reproductor (base64 en la ruta de navegación) y se
  aplican a **todas** las peticiones, incluidas las de los segmentos.

**Velocidad y pistas**

- Velocidad: 0,5× · 0,75× · 1× · 1,25× · 1,5× · 2× (`setPlaybackSpeed`).
- Audio y subtítulos: se fija la pista exacta con `TrackSelectionOverride`
  (grupo + índice), no solo por idioma, para no confundir dos voces del mismo
  idioma. Los subtítulos se activan y desactivan sin perder el audio elegido.

**Control por D-pad (Android TV)**

| Tecla | Acción |
| --- | --- |
| ◀ / ▶ | Retroceder o avanzar 10 s |
| ▲ / ▼ | Desplegar la barra de controles y cederle el foco |
| OK / ENTER | Reproducir o pausar |
| BACK | Salir del reproductor (o devolver el foco al video) |
| VOLUME ± / teclas multimedia | Volumen, play-pausa, avance y retroceso |

La barra de controles se oculta sola a los 5 s de inactividad y vuelve a
aparecer con cualquier pulsación; cuando tiene el foco no se oculta.

---

## Decisiones de diseño

1. **El núcleo va en el servidor.** Agregación, caché, HLS master y biblioteca
   quedan en un único sitio, de modo que el cliente TV (web o APK) es delgado
   y todos los clientes se comportan igual.
2. **Tolerancia con el ecosistema real.** Ningún addon respeta el protocolo al
   100 %: `cast` llega como string o como array, `director` con uno o varios
   nombres, streams sin `url` pero con `externalUrl`. El motor normaliza todo
   en `normalize.ts`, igual que hacen los DTOs tolerantes de Nuvio.
3. **La query del manifest se hereda.** `https://host/manifest.json?apiKey=x`
   arrastra `apiKey=x` a **todas** las URLs de recurso: es la causa más común
   de addons que "instalan pero no cargan".
4. **Un addon caído no rompe la app.** El fan-out aísla los fallos por addon,
   con timeout por addon y reintentos con backoff; los errores se reportan en
   la respuesta en lugar de cortar el fan-out.
5. **Privacidad por defecto.** Sin cuentas, sin telemetría y sin rastreo de IP:
   el modelo de WuPlay.

---

## Estado

- [x] Motor de agregación de addons (fan-out, caché, normalización, calidad)
- [x] Metadata integrada (addon embebido): la app funciona sin instalar nada
- [x] Ficha de persona con filmografía y títulos similares
- [x] Núcleo HLS master (parser, selección, proxy)
- [x] Servidor: addon Stremio local + API de biblioteca + proxy HLS
- [x] Cliente web TV (React + hls.js, navegación D-pad)
- [x] Reproductor: pistas de audio y subtítulos (incluidos los externos del
      stream), continuar donde lo dejó y autoplay del siguiente episodio
- [x] PIN de perfil aplicado (servidor + cliente)
- [x] Trailers en la ficha de detalle
- [x] Shell Android TV (Kotlin, Compose for TV, Media3)
- [x] Reproductor Media3 en Android TV: HLS optimizado, caché de segmentos,
      velocidad, cambio de pistas de audio/subtítulos y control por D-pad
- [x] Debrid nativo en el servidor (Real-Debrid, AllDebrid, TorBox, Premiumize)
- [x] PWA instalable (manifest + service worker) para usar la web TV como app
- [x] Sincronización multi-dispositivo por código de vinculación
- [x] Valoraciones («Me gusta» / «No para mí») y recomendaciones personalizadas
- [x] Catálogos predefinidos (Populares, Mejor valorados, Estrenos)
- [ ] Plugins estilo Nuvio (CloudStream, repos de plugins)
- [ ] Watch parties y Chromecast

Ver [docs/architecture.md](docs/architecture.md) para el detalle interno y
[docs/roadmap.md](docs/roadmap.md) para el plan.

## Licencia

[CC0-1.0](LICENSE).
