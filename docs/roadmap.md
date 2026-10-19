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
  - [x] Reproductor Media3 (ExoPlayer 1.8) con HLS optimizado: buffer amplio,
        `HlsMediaSource` propio (chunkless desactivado) y techo de calidad
  - [x] Caché de reproducción: `SimpleCache` LRU de 512 MB con índice SQLite,
        `FLAG_IGNORE_CACHE_ON_ERROR` y claves con ventana temporal para los
        playlists (los segmentos se cachean por URI)
  - [x] Velocidad de reproducción y elección exacta de pista de audio y de
        subtítulos (`TrackSelectionOverride`)
  - [x] Control por D-pad: flechas para saltar y volumen, OK play/pausa, barra
        de controles con foco propio y auto-ocultado
  - [x] Cabeceras HTTP del addon (`behaviorHints.proxyHeaders.request`)
        propagadas a todas las peticiones del reproductor
- [x] Addon de demostración para trabajar sin conexión
- [x] **Metadata integrada** (addon embebido, conmutable desde Ajustes)
- [x] **Ficha de persona** con filmografía (`/api/person`)
- [x] **Títulos similares** (`/api/similar`)
- [x] **Reproductor**: pistas de audio y subtítulos (incluidos los externos del
      stream), continuar donde lo dejó y autoplay del siguiente episodio
- [x] **PIN de perfil** aplicado en servidor y cliente
- [x] **Trailers** en la ficha de detalle
- [x] `extra` de catálogo en estilo de ruta (estándar real de Stremio)
- [x] **Debrid nativo en el servidor** (Real-Debrid, AllDebrid, TorBox,
      Premiumize): resuelve magnet y hosters premium, cachea el enlace y
      degrada con elegancia si el proveedor falla
- [x] **PWA instalable** (manifest + service worker + iconos): la web TV se
      instala como app en Android TV sin depender del APK
- [x] **Sincronización multi-dispositivo** por código de vinculación (sin
      cuenta), con token por dispositivo
- [x] **Valoraciones** («Me gusta» / «No para mí») y **recomendaciones
      personalizadas** por género
- [x] **Catálogos predefinidos** en la metadata integrada (Populares, Mejor
      valorados, Estrenos)
- [x] Streams de torrent (`infoHash` sin URL) ya no se descartan

## Siguiente

- [ ] **Plugins estilo Nuvio** — repositorios de plugins y CloudStream.
- [ ] **Más proveedores de debrid** (Offcloud, debrid.link) y descarga en
      segundo plano con aviso de "listo" en la UI.
- [ ] **Notificaciones push** sobre el código de vinculación (por ejemplo,
      avisar al móvil cuando la TV empieza algo).
- [ ] **Watch parties** — sala sincronizada (Nuvio) sobre el servidor.
- [ ] **Chromecast / AirPlay** desde el cliente web (Remote Playback API).
- [ ] **Tomas de notas y listas por episodio**.
- [ ] **Semáforo de concurrencia** en el fan-out de addons.
- [ ] **Firmas `stremioAddonsConfig`** para addons oficiales verificados.

## Decisiones abiertas

- ¿Dónde vive la metadata por defecto? **Resuelto**: metadata integrada
  (Cinemeta embebido) activable/desactivable desde Ajustes, junto a los
  addons del usuario.
- ¿Sincronización cifrada en el cliente o en el servidor? **Resuelto por
  ahora**: el servidor es la fuente de verdad y el acceso se protege con un
  token por dispositivo (código de vinculación). La alternativa (cifrado en
  cliente) sigue siendo más privada, pero exige más complejidad en el cliente.
- ¿Plugin de debrid en el cliente Android o en el servidor? **Resuelto**: en
  el servidor, para que el enlace se cachee y lo usen todos los dispositivos
  (web, APK y el propio addon Stremio).
