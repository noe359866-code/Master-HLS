# Vibe Flix

**App basada en Stremio** construida sobre dos bases reales:

| Base | Qué aporta | Qué se ha reutilizado |
| --- | --- | --- |
| [WuPlay](https://github.com/wuplayapp/wuplay-releases) | Cliente Android TV, privado, sin registro, con perfiles, watchlists, historial y configurador web de addons | Modelo de perfiles/watchlists/historial, auto-update de addons, orden y visibilidad de catálogos, privacidad (sin cuentas ni telemetría) |
| [NuvioTV](https://github.com/NuvioMedia/NuvioTV) | Cliente Android TV open source (Kotlin, Compose, Media3) con debrid, plugins y watch parties | Arquitectura Kotlin/Compose for TV + Media3, tolerancia ante DTOs inconsistentes de addons, `behaviorHints`, soporte de vídeo advanced (DV/HDR) |

Vibe Flix se diferencia por el **núcleo HLS master**: el motor de agregación de
addons Stremio y la selección de variantes HLS viven en el servidor, de modo que
**todos los clientes** (web TV, Android TV, o el propio Stremio/WuPlay/Nuvio)
consumen exactamente la misma lógica.

---

## Arquitectura

```
┌──────────────┐    ┌────────────────────────┐    ┌──────────────────────────┐
│  Cliente TV  │    │   Servidor Vibe Flix  │    │  Addons Stremio externos │
│  web / APK   │───▶│  (Node + TypeScript)   │───▶│  Cinemeta, Torrentio,    │
│  React/hls.js│    │                        │    │  AIOStreams, Kometa…     │
│  Compose/M3  │    │  · @vibe-flix/addon-  │    └──────────────────────────┘
└──────────────┘    │    engine (agregación)  │
                    │  · @vibe-flix/hls-     │    ┌──────────────────────────┐
                    │    master (variantes)    │───▶│  Stremio / WuPlay / Nuvio│
                    │  · API biblioteca       │    │  (instalando Vibe Flix  │
                    │  · Proxy HLS            │    │   como addon)            │
                    └────────────────────────┘    └──────────────────────────┘
```

### Paquetes

| Paquete | Descripción |
| --- | --- |
| `@vibeflix/addon-engine` | Cliente del protocolo de addons Stremio: manifest, `catalog`/`meta`/`stream`/`subtitles`, **fan-out paralelo** con aislamiento de fallos por addon, caché TTL + single-flight, normalización tolerante de respuestas, y heurística de calidad para ordenar streams. |
| `@vibeflix/hls-master` | Núcleo HLS: parser de master playlist (variantes, pistas de audio/subtítulos, `CODECS`, `VIDEO-RANGE`), política de selección por capacidades del dispositivo, y reescritura de playlists para hacerlas pasar por el proxy. |
| `@vibeflix/skip-intro` | Núcleo de **omitir intro**: parser de subtítulos (SRT/WebVTT), detección de intro y de «anteriormente en…» sobre los propios subtítulos, conversión entre formatos y valor por defecto configurable. Sin servicios externos. |
| `@vibeflix/scrapers` | **Scrapers nativos**: addon de streams que resuelve el título en el servidor con varios proveedores en paralelo (patrón de extractores/embeds de StreamFlix Reborn), desempaquetador de JavaScript, resolutor de embeds y proveedores extensibles **por configuración JSON**, sin escribir código. |
| `@vibeflix/server` | Servidor: expone Vibe Flix **como addon Stremio** (`/manifest.json`, `/catalog/…`, `/meta/…`, `/stream/…`, `/subtitles/…`), API de biblioteca/perfiles, proxy HLS y hosting del cliente web. |
| `@vibeflix/web` | Cliente de TV en React + Vite + hls.js: navegación espacial con D-pad, rail lateral, portada, descubrir, búsqueda con teclado, detalle, reproductor, listas, historial, addons, ajustes y perfiles. |
| `android/` | Shell Android TV (Kotlin, Compose for TV, Media3, Hilt, Retrofit/Moshi) que consume los mismos motores a través del servidor. |

---

## Arranque rápido

```bash
npm install
npm run build          # compila los paquetes, el servidor y la web
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
npm run dev -w @vibe-flix/web   # cliente Vite en :5173 (proxy al servidor)
npm test             # suites de addon-engine, HLS, skip-intro, scrapers y servidor
npm run typecheck    # TypeScript estricto en modo estricto
```

---

## Uso como addon Stremio

Vibe Flix se instala en **Stremio, WuPlay o Nuvio** usando su manifest:

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
| `GET` | `/stream/{type}/{id}.json` | Streams: fuente nativa del idioma preferida, resto como alternativa; etiqueta solo con título y, si aplica, temporada/episodio |
| `GET` | `/subtitles/{type}/{id}.json` | Subtítulos agregados |
| `GET` | `/api/search?q=` | Búsqueda global en todos los catálogos con `search` |
| `GET` | `/api/person?name=` | Ficha de persona con su filmografía (cast & crew) |
| `GET` | `/api/similar?id=&type=` | Títulos similares (por género compartido) |
| `GET` | `/api/recommended` | Recomendaciones según las valoraciones del perfil |
| `GET`/`POST` | `/api/ratings` | Valoraciones «Me gusta» / «No para mí» |
| `GET`/`POST` | `/api/debrid` · `/api/debrid/test` | Estado y comprobación del proveedor de debrid |
| `GET`/`PUT` | `/api/scrapers` | Estado y adaptadores realmente implementados/activos; `liveVerified: false` no implica disponibilidad |
| `GET` | `/api/scrapers/upstream` | Inventario de referencia por idioma: VOD registrado, IPTV y archivos no registrados; **no** fuentes instaladas |
| `POST` | `/api/scrapers/test` | Prueba avanzada de un proveedor activo (`providerId`, título, tipo, ID TMDb, temporada/episodio) |
| `GET`/`POST`/`DELETE` | `/api/devices` · `/api/pairing` · `/api/pairing/claim` | Vinculación de dispositivos (biblioteca compartida) |
| `GET` | `/api/addons` · `POST` · `DELETE` · `/api/addons/refresh` | Gestión de addons |
| `GET`/`POST`/`PUT`/`DELETE` | `/api/profiles`, `/api/lists`, `/api/history`, `/api/progress`, `/api/settings` | Biblioteca y perfiles (nombre e idioma `contentLanguage` persistidos) |
| `GET` | `/api/genres` | Catálogo de géneros (21) y décadas (1950–2020) para las pantallas de contenido |
| `GET` | `/api/browse?genre=&decade=&q=&type=` | Contenido por género, por década o por texto (aplica los filtros de contenido) |
| `GET`/`POST`/`DELETE` | `/api/search-history` | Historial de búsquedas del perfil (chips de «búsquedas recientes») |
| `PUT` | `/api/sidebar` | Personalización del menú: qué secciones se ven y en qué orden |
| `POST` | `/api/lists/{id}/items/batch` | Guarda varios títulos en una lista de golpe (resultados de una búsqueda) |
| `GET` | `/api/skip-intro?type=&id=&season=&episode=` | Detecta el final de la intro (o del «anteriormente en…») con los subtítulos y devuelve el punto de salto |
| `GET` | `/api/opensubtitles?imdbId=&season=&episode=` | Busca subtítulos en OpenSubtitles (API oficial, con la API key de los ajustes) |
| `GET` | `/api/opensubtitles/download?fileId=` | Descarga un subtítulo y lo sirve convertido a WebVTT |
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
los addons. Vibe Flix lo resuelve **en el servidor**, una sola vez, y cachea el
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

## Scrapers nativos (addon de streams)

Además de los addons que instales, Vibe Flix puede **resolver las fuentes por su
propia cuenta**: es un addon de streams más, nativo del servidor, con el patrón
de extractores y embeds de **StreamFlix Reborn** (proveedores por sitio, capa de
embeds y ejecución en paralelo) pero implementado desde cero en TypeScript.

- **Fan-out en paralelo** con aislamiento de fallos: cada proveedor tiene su
  propio timeout; si uno se cae, el resto del resultado se entrega igual.
- **Selección por perfil**, como en la organización de StreamFlix Reborn: se
  pregunta el nombre e idioma al entrar por primera vez (web o Android TV),
  se guarda `contentLanguage` en el perfil y se eligen proveedores compatibles
  con la región (`es-419`, `es-ES`, `en`, etc.) y el tipo (`movie`, `series`,
  `anime`, `dorama`). Primero se usan fuentes exactas, después el idioma base
  y por último fuentes sin idioma declarado. Las series usan el episodio real
  `id:temporada:episodio`, no la ficha general de la serie.
- **Un solo camino de streams**: si hay una fuente nativa para el idioma del
  perfil, se prioriza sobre los addons externos. Dentro de cada grupo se
  mantiene la ordenación por calidad, el proxy HLS y la resolución de debrid.
  Los addons externos no anuncian siempre su idioma: quedan como alternativa
  y no se filtran por una suposición sobre su audio.
- **Nombres discretos en reproducción**: el addon se llama **Vibe Flix** y
  `name`/`title` de cada stream público solo muestran el título de la obra y,
  si corresponde, `T2 E4`. Se suprimen descripción, nombre de servidor,
  release y pistas de origen; la URL/cabeceras de reproducción se conservan
  porque son necesarias para el vídeo (esto no anonimiza la conexión).
- **Resolutor de embeds**: extrae la URL directa de un player (`hls`, `file`,
  `sources[]`, `<video>`, `$.get(...)`) y **desempaqueta** el JavaScript
  empaquetado de Dean Edwards (decodificado, nunca ejecutado).
- **Proveedores por configuración**: se añaden desde *Ajustes → Fuentes
  nativas → Opciones avanzadas* con un JSON (idiomas y categorías, URL de
  búsqueda, URL/patrón de episodio y patrón de stream) **sin tocar el código**.
  `POST /api/scrapers/test` sirve para diagnosticar un proveedor; los nombres
  y URLs devueltos por esa API avanzada no son las etiquetas de reproducción.
- **Adaptadores incluidos**: puertos TypeScript de **CineHax**, **Fanpelis**,
  **Doramasflix** y **TioAnime** (`es`: películas, series, doramas y anime), y
  **Frembed** (`fr`: películas/series), **Ridomovies** (`en`: películas/series),
  **MStream** (`de`: películas/series), **GuardaFlix** (`it`: películas) y
  **Zaluknij** (`pl`: solo películas en este port, sin WebView antibot);
  además **Internet Archive** como respaldo de dominio público con audio
  **no declarado**. El inventario completo del upstream (51 archivos VOD registrados, 15 IPTV y 10 sin
  registrar) está en [docs/streamflix-reborn-inventory.md](docs/streamflix-reborn-inventory.md)
  y `GET /api/scrapers/upstream`. **El inventario no activa esos proveedores**:
  solo los nueve puertos y Archive están en `DEFAULT_PROVIDERS`; IPTV no
  se confunde con capítulos. **42 VOD registrados aún no están portados.**
- Caché de resultados por título **e idioma del perfil** (5 min), invalidada
  al cambiar el proveedor o editar/cambiar el perfil. Listas, historial,
  progreso y preferencia persisten en `DATA_DIR/vibe-flix.json` (por defecto
  `data/vibe-flix.json`). Los PIN existentes se migran a un hash y la API solo
  indica que existe PIN; el archivo de datos se escribe con permisos `0600`.
- **Disponibilidad real**: los nueve puertos tienen pruebas **con mocks**, no
  una comprobación de reproducción real. El idioma del catálogo no garantiza
  el audio; italiano y polaco solo tienen películas y Zaluknij puede requerir
  WebView para superar el antibot. Un stream puede estar vacío aun cuando
  exista un archivo upstream. Usa solo fuentes que tengas derecho a reproducir.

```json
{
  "id": "mi-sitio",
  "name": "Mi sitio",
  "types": ["anime"],
  "languages": ["es-419"],
  "searchUrl": "https://sitio.example/buscar?q={title}",
  "itemPattern": "href=\"/serie/([^\"/]+)\"[^>]*>([^<]+)",
  "itemUrl": "https://sitio.example/serie/{id}",
  "episodeUrl": "https://sitio.example/serie/{id}/{season}/{episode}",
  "streamPatterns": ["src=\"(https?://[^\" ]+\\.m3u8)\""]
}
```

> Los adaptadores integrados se inspiran en código Apache-2.0 de terceros;
> **no** certifican derechos de emisión ni disponibilidad de los vídeos.
> Verifica la autorización de cada fuente y las condiciones de sus sitios
> antes de usarla o configurarla en tu servidor.

**Primer inicio:** entra en la web o abre la APK conectada al servidor, elige
un perfil, escribe tu nombre y selecciona el idioma. En la web puedes cambiarlo
en *Perfiles → Editar nombre e idioma*; en Android TV, *Cambiar perfil e idioma*.
El servidor comparte el **perfil activo** con los clientes que usan ese mismo
servidor, también al instalar su manifest en Stremio: cambiarlo en un
dispositivo afecta a los demás. Cada perfil conserva sus preferencias, listas,
historial y progreso. Para uso simultáneo con perfiles independientes, utiliza
instancias separadas del servidor por ahora.

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

Desde ese momento el servidor exige un token (`X-Vibe-Flix-Token`) en las
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
- La pantalla inicial de perfiles guarda nombre e idioma en el servidor antes
  de entrar; desde Inicio se puede reabrir para cambiar de perfil/idioma.
- Este repositorio no trae `android/gradlew`; se necesita una instalación de
  Gradle/Android SDK para compilar la APK. Esa compilación **no se ha podido
  verificar** aquí.
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

## Omitir intro, autoplay y OpenSubtitles

Las tres funciones que hacen que la app se sienta como una app y no como un
reproductor de URLs.

### Omitir intro (nativo, sin servicios externos)

No dependemos de IntroDB, AniSkip ni de ningún análisis de audio: el
reproductor ya tiene los subtítulos, y ahí está la señal.

1. El servidor reúne los subtítulos del título (los del addon y, si no hay,
   los de OpenSubtitles) y los normaliza con `@vibe-flix/skip-intro`.
2. Se ignoran los carteles (título, capítulo, créditos) y se busca la
   **primera frase de diálogo real**: ahí termina la intro. El salto es 1,5 s
   antes del primer diálogo, con un mínimo de 20 s y un máximo de 6 min.
3. Si aparece un «Anteriormente en…» / «Previously on…», se detecta el
   *recap* y también se puede saltar.
4. Si no hay subtítulos o no se puede detectar nada, se usa el valor por
   defecto (90 s, o el 8 % de la duración), que el usuario puede ajustar.

El reproductor muestra un botón «Saltar intro» mientras la intro sigue en
curso; al pulsarlo, salta al punto detectado. En la web el botón flota
encima de la barra de controles; en Android TV, en la esquina inferior
derecha.

### Autoplay

Al terminar un episodio aparece una tarjeta con el siguiente y una cuenta
atrás de 5 s («Reproducir ahora» / «Cancelar»). El siguiente episodio se
busca en la ficha de la serie y su stream se resuelve por el mismo camino que
el resto, de modo que funciona igual en la web y en Android TV.

### OpenSubtitles nativo

Busca y descarga subtítulos de la API oficial de OpenSubtitles **sin instalar
el addon de subtítulos**:

- La API key se guarda en los ajustes del servidor (`settings.opensubtitles`),
  nunca en el cliente: web y TV comparten el mismo servidor.
- El servidor descomprime el `.gz`, normaliza a WebVTT y lo sirve en
  `/api/opensubtitles/file/:name`; así el reproductor recibe siempre un
  formato que entiende sin transformaciones.
- En la web, el `<track>` nativo carga el WebVTT; en Android TV, Media3 lo
  monta como *side-loaded subtitle* del propio medio.

---

## Diseño de la interfaz (híbrido WuPlay + NuvioTV)

La interfaz de TV es un **híbrido**: toma de WuPlay la navegación lateral por
secciones y las tarjetas de género, y de NuvioTV la portada con fondo, las
filas horizontales y el foco grande; pero se simplifica para que sea **fácil**
de recorrer con el mando, **rápida** de pintar y **moderna** de ver.

| Pieza | De dónde viene | Qué aporta |
| --- | --- | --- |
| **Rail lateral** | WuPlay | Menú fijo de 92 px con icono + etiqueta: la sección activa se marca con una barra de gradiente. Deja todo el ancho a la contenido y sustituye a la barra superior (que duplicaba la navegación). |
| **Portada (hero)** | NuvioTV | Fondo de la película, título grande, año/puntuación/géneros, sinopsis y dos acciones. Responde «¿qué veo?» sin hacer scroll. |
| **Acciones rápidas** | — | Buscar · Géneros · Décadas · Mis listas · Addons: las cinco acciones de siempre a un clic. |
| **Encabezado de página** | — | Todas las pantallas empiezan igual (título, subtítulo y acciones): nunca se pregunta dónde se está. |
| **Foco de TV** | ambas | Anillo de luz + escala 1,05 con transición suave: el elemento enfocado siempre se ve de un vistazo a tres metros. |

### Moderno

- **Paleta**: fondo azul-noche (`#06080f`), superficies de cristal
  (`backdrop-filter`), y una marca con degradado azul → violeta → turquesa que
  se repite en botones,_carteles y en el propio logo.
- **Aura de fondo**: dos manchas de luz muy lentas, animadas sólo con
  `transform` (sin repintados) y desactivadas con `prefers-reduced-motion`.
- **Iconos SVG en línea**: sin fuentes de iconos ni peticiones extra.
- **Esqueletos de carga**: la pantalla de inicio se dibuja con la forma del
  contenido final mientras llegan los catálogos, sin spinners ni saltos.

### Rápido

- Cero dependencias nuevas: el diseño es CSS puro.
- `content-visibility: auto` en las filas: el navegador no pinta lo que está
  fuera de pantalla.
- Imágenes con `loading="lazy"` y `decoding="async"`.
- Animaciones sólo de `transform` y `opacity` (60 fps en un TV de gama media).
- Los catálogos se piden en paralelo y con caché en el servidor.

---

## Teclado, buscador, géneros, décadas y personalización (estilo WuPlay)

La Fase 3/4 replica el diseño de WuPlay (v0.7.0 → v0.7.4 de su CHANGELOG) en
las cinco piezas que faltaban, **sin ningún servicio externo de pago**: todo se
calcula con los catálogos que ya están agregados en el servidor.

### Teclado en pantalla

En una TV no hay teclado, así que la búsqueda se escribe con el mando. El
teclado (`Keyboard.tsx` en la web, `OnScreenKeyboard.kt` en Android) dibuja
letras, números, símbolos y la **ñ**, y cada tecla es un botón enfocable: el
D-pad recorre el teclado con la navegación espacial (web) o con el sistema de
foco de Compose for TV (Android), sin código de navegación propio.

- **Borrar** quita un carácter; **mantener pulsado** (web) o **pulsar dos
  veces** (Android) borra la consulta entera, como en WuPlay.
- **Mayús** alterna mayúsculas/minúsculas y **123/ABC** cambia a números y
  símbolos.

### Buscador nativo

`SearchScreen` (web) y `SearchScreen` (Android) sustituyen al campo de
búsqueda clásico:

- **Historial en chips**: las búsquedas recientes se guardan en el servidor
  (`/api/search-history`, por perfil, máximo 12) y aparecen como chips
  pulsables; se pueden limpiar.
- **Guardar los resultados en una lista**: un botón envía todos los resultados
  a una watchlist (`POST /api/lists/{id}/items/batch`).
- La búsqueda la hace el servidor sobre **todos** los catálogos que soportan
  `search`, ya filtrados por los filtros de contenido.

### Géneros y décadas

- **Géneros**: 21 géneros (accion, comedia, drama, ciencia ficción, terror,
  animación, documental, reality, anime…) con emoji y color. La pantalla usa
  el extra `genre` real de los catálogos (`extraSupported: ['genre']`), de
  modo que el resultado es el que da el addon, no una clasificación inventada.
- **Décadas**: de los años 50 a los 2020. El servidor recorre los catálogos
  filtrando por el año de estreno (`releaseInfo`) y ordena por puntuación.

### Filtros de contenido y personalización

- **Content Filters**: se pueden excluir géneros y palabras clave, poner una
  puntuación mínima y ocultar el contenido para adultos. Se aplican en el
  servidor, así que limpian a la vez la búsqueda, los géneros y las décadas.
- **Menú personalizable**: cada sección (Inicio, Descubrir, Géneros, Décadas,
  Buscar, Mis listas, Historial, Addons, Ajustes) se puede ocultar o reordenar
  desde *Ajustes → Personalización del menú*. El orden guardado en el servidor
  es el mismo en la web y en Android TV.

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
- [x] Rebranding a **Vibe Flix** (manifest, paquete npm, Android, PWA, docs)
- [x] **Omitir intro** nativo por análisis de subtítulos (intro y «anteriormente
      en…»), con botón en el reproductor y salto configurable
- [x] **Autoplay** con tarjeta de cuenta atrás y cancelación
- [x] **OpenSubtitles nativo** (API oficial con API key en los ajustes del
      servidor) con descarga y conversión a WebVTT
- [x] Reproductor rediseñado en la web: barra de control propia, selector de
      calidad/audio/subtítulos, tamaño de subtítulos y atajos de teclado
- [x] **Teclado en pantalla** para la búsqueda (letras, números, símbolos, ñ,
      mayús y borrado con pulsación larga), navegable con el D-pad
- [x] **Buscador nativo** estilo WuPlay: historial en chips, resultados
      guardables en una lista y búsqueda sobre todos los catálogos
- [x] **Pantalla de géneros** (21 géneros con emoji y color, extra `genre`
      real de los catálogos) y **pantalla de décadas** (1950–2020)
- [x] **Filtros de contenido** (géneros y palabras clave excluidos, puntuación
      mínima, ocultar adultos) aplicados en el servidor
- [x] **Personalización del menú**: mostrar, ocultar y reordenar las secciones
      desde los ajustes, con el mismo orden en todos los dispositivos
- [x] **Diseño de interfaz híbrido** (WuPlay + NuvioTV): rail lateral, portada
      con fondo, acciones rápidas, encabezados de página, foco de TV con
      anillo de luz, paleta de cristal y degradado de marca, iconos SVG
      propios y esqueletos de carga
- [x] **Scrapers nativos**: addon de streams del servidor con proveedores en
      paralelo, resolutor de embeds, desempaquetador de JavaScript y
      proveedores extensibles por configuración (patrón StreamFlix Reborn)
- [ ] Plugins estilo Nuvio (CloudStream, repos de plugins)
- [ ] Watch parties y Chromecast

Ver [docs/architecture.md](docs/architecture.md) para el detalle interno y
[docs/roadmap.md](docs/roadmap.md) para el plan.

## Licencia

[CC0-1.0](LICENSE).
