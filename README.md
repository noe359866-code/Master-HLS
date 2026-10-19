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
npm test             # 76 tests (addon-engine, hls-master, server)
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
- [x] Núcleo HLS master (parser, selección, proxy)
- [x] Servidor: addon Stremio local + API de biblioteca + proxy HLS
- [x] Cliente web TV (React + hls.js, navegación D-pad)
- [x] Shell Android TV (Kotlin, Compose for TV, Media3)
- [ ] Sincronización multi-dispositivo (servidor ↔ TV ↔ móvil)
- [ ] Integración de debrid nativa (RealDebrid/AllDebrid/TorBox)
- [ ] Plugins estilo Nuvio (CloudStream, repos de plugins)
- [ ] Watch parties y Chromecast

Ver [docs/architecture.md](docs/architecture.md) para el detalle interno y
[docs/roadmap.md](docs/roadmap.md) para el plan.

## Licencia

[CC0-1.0](LICENSE).
