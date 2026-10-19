# Roadmap

## Hecho

- [x] **Motor de agregación de addons Stremio** (`@master-hls/addon-engine`)
  - [x] Manifest con caché y validación
  - [x] Catálogos, metadatos, streams y subtítulos con fan-out paralelo
  - [x] Aislamiento de fallos por addon + timeout + reintentos
  - [x] Caché TTL con LRU y single-flight
  - [x] Normalización tolerante de respuestas inconsistentes
  - [x] Herencia de la query del manifest (api keys)
  - [x] Ordenación de streams por calidad
- [x] **Núcleo HLS master** (`@master-hls/hls-master`)
  - [x] Parser de master playlist (variantes + pistas)
  - [x] Selección por capacidades del dispositivo
  - [x] Selección de audio/subtítulos por idioma
  - [x] Reescritura de playlists para el proxy
- [x] **Servidor** (`@master-hls/server`)
  - [x] Addon Stremio local instalable en Stremio/WuPlay/Nuvio
  - [x] API de perfiles, watchlists, historial y progreso
  - [x] Proxy HLS con reproducción de cabeceras
  - [x] Búsqueda global
- [x] **Cliente web TV** (React + Vite + hls.js)
  - [x] Navegación espacial con D-pad
  - [x] Inicio, descubrir, búsqueda, detalle, reproductor, listas, historial
  - [x] Gestor de addons y ajustes de dispositivo
- [x] **Shell Android TV** (Kotlin, Compose for TV, Media3)
- [x] Addon de demostración para trabajar sin conexión

## Siguiente

- [ ] **Sincronización multi-dispositivo** — la biblioteca ya está en el
      servidor; falta autenticación ligera (token por dispositivo) y push.
- [ ] **Debrid nativo** — RealDebrid / AllDebrid / TorBox / Premiumize con
      resolución de enlaces y caché en el motor de streams.
- [ ] **Plugins estilo Nuvio** — repositorios de plugins y CloudStream.
- [ ] **Watch parties** — sala sincronizada (Nuvio) sobre el servidor.
- [ ] **Chromecast / AirPlay** desde el cliente web.
- [ ] **Tomas de notas y listas por episodio**.
- [ ] **PWA instalable** (manifest + service worker) para usarlo como app en
      la TV sin pasar por el APK.
- [ ] **Semáforo de concurrencia** en el fan-out de addons.
- [ ] **Firmas `stremioAddonsConfig`** para addons oficiales verificados.

## Decisiones abiertas

- ¿Dónde vive la metadata por defecto? Hoy se delega en los addons del
  servidor; una metadata integrada (Cinemeta embebido) reduciría la dependencia
  de red del primer arranque.
- ¿Sincronización cifrada en el cliente o en el servidor? Privacidad (WuPlay)
  sugiere cliente-cifrado;/usabilidad sugiere servidor.
- ¿Plugin de debrid en el cliente Android o en el servidor? El servidor
  centralizado permite cachear enlaces para todos los dispositivos.
