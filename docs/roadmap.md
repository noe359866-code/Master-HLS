# Roadmap

## Hecho

- [x] **Motor de agregación de addons Stremio** (`@vibe-flix/addon-engine`)
  - [x] Manifest con caché y validación
  - [x] Catálogos, metadatos, streams y subtítulos con fan-out paralelo
  - [x] Aislamiento de fallos por addon + timeout + reintentos
  - [x] Caché TTL con LRU y single-flight
  - [x] Normalización tolerante de respuestas inconsistentes
  - [x] Herencia de la query del manifest (api keys)
  - [x] Ordenación de streams por calidad
- [x] **Núcleo HLS master** (`@vibe-flix/hls-master`)
  - [x] Parser de master playlist (variantes + pistas)
  - [x] Selección por capacidades del dispositivo
  - [x] Selección de audio/subtítulos por idioma
  - [x] Reescritura de playlists para el proxy
- [x] **Servidor** (`@vibe-flix/server`)
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
- [x] **Rebranding a Vibe Flix**: manifest del addon (`com.vibeflix.app`),
      paquete npm (`vibe-flix`), paquetes internos (`@vibe-flix/*`), shell
      Android (`com.vibeflix.tv`), PWA, docs y datos (`vibe-flix.json` con
      migración del fichero antiguo)
- [x] **Omitir intro nativo** (`@vibe-flix/skip-intro`): análisis de los
      subtítulos del propio título (SRT/WebVTT) para detectar el final de la
      intro y el «anteriormente en…», sin IntroDB/AniSkip ni análisis de audio
- [x] **Autoplay** con tarjeta de cuenta atrás (5 s) y cancelación, tanto en
      la web como en Android TV
- [x] **OpenSubtitles nativo**: API REST oficial con API key en los ajustes
      del servidor, descarga `.gz` y conversión a WebVTT
- [x] **Reproductor web rediseñado**: barra de control propia, selección de
      calidad/audio/subtítulos, tamaño de subtítulos y atajos de teclado

- [x] **Teclado, buscador, géneros, décadas y personalización** (Fase 3/4,
      diseño de WuPlay v0.7.0 → v0.7.4)
  - [x] Teclado en pantalla (letras, `ñ`, números, símbolos, mayús) navegable
        con el D-pad, con borrado de la consulta completa
  - [x] Buscador nativo: historial en chips por perfil y guardado de los
        resultados en una lista
  - [x] Pantalla de géneros (21, con emoji y color) usando el extra `genre`
        real de los catálogos
  - [x] Pantalla de décadas (1950–2020) por año de estreno
  - [x] Filtros de contenido (géneros y palabras clave excluidos, puntuación
        mínima, ocultar adultos) aplicados en el servidor
  - [x] Menú personalizable (mostrar/ocultar/reordenar secciones) con el mismo
        orden en la web y en Android TV
  - [x] Endpoint `POST /api/lists/{id}/items/batch` para guardar resultados

- [x] **Scrapers nativos** (addon de streams del servidor, patrón StreamFlix
      Reborn)
  - [x] Registro de proveedores con fan-out paralelo, timeout por proveedor y
        aislamiento de fallos
  - [x] Capa de embeds: extractores de player, resolución de embeds y
        desempaquetador de JavaScript (decodificado, no ejecutado)
  - [x] Proveedores extensibles **por configuración** (JSON) desde los ajustes,
        con prueba antes de activarlos
  - [x] Proveedor de respaldo: Internet Archive (dominio público; audio no declarado)
  - [x] Inventario upstream con idioma/registro/capacidad: 51 archivos VOD,
        15 IPTV y 10 sin instancia; `GET /api/scrapers/upstream` es referencia,
        **no** adaptadores instalados
  - [x] Nueve adaptadores VOD basados en flujos upstream: CineHax,
        Fanpelis, Doramasflix, TioAnime (es), Frembed (fr), Ridomovies (en),
        MStream (de), GuardaFlix (it, solo películas) y Zaluknij (pl, port
        parcial de películas sin WebView antibot), probados con mocks
  - [x] Streams mezclados con los de los addons instalados y los magnets
        pasando por la resolución de debrid
  - [x] Selección por idioma/región y categoría (`movie`, `series`, `anime`,
        `dorama`) del perfil, con prioridad para fuentes nativas del idioma
  - [x] Resolución de episodios específicos y caché separada por perfil/idioma
  - [x] Manifest del addon **Vibe Flix** y etiquetas públicas solo con título,
        temporada y episodio (sin proveedores ni nombres de release)
  - [x] Onboarding/edición de nombre e idioma en web y pantalla de perfiles
        Android TV, persistidos en el JSON del servidor como las listas
  - [x] PIN de perfiles protegido con hash/sal y redacción en la API
  - [ ] Verificar compilación Android TV en un entorno con JDK 17 y Android
        SDK 36: el wrapper (`android/gradlew`, Gradle 8.14.3) ya está en el
        repositorio; el CI `.github/workflows/android.yml` la compila
  - [ ] Probar hosts, pistas de audio y reproducción end-to-end **en vivo**
        con autorización: los tests actuales solo simulan respuestas HTTP
  - [ ] Portar los **42** archivos VOD registrados que faltan y completar
        temporadas/episodios y protección antibot de Zaluknij (sin saltarse
        restricciones sin autorización). No registrar IPTV como episodios ni
        equiparar archivos de referencia con puertos implementados.

- [x] **Revisión de NuvioTV** ([docs/nuviotv-review.md](nuviotv-review.md)) con
      dos mejoras importadas de su diseño:
  - [x] **Control parental por perfil** (`library/parental.ts`): niveles de
        madurez (off/kids/teen/adult), clasificación por edades cuando la ficha
        la declara, géneros bloqueados y desbloqueo con el PIN del perfil;
        aplicado en el servidor (catálogos, búsqueda, recomendados, similares y
        streams con 403 `parental_blocked`).
  - [x] **Modo esencial / avanzado** (`settings.uiMode`, spec de
        `docs/essential-mode.md` de NuvioTV): ajustes simplificados y
        reproductor sin controles avanzados; solo cambia visibilidad.

## Siguiente

- [ ] **Persistencia de pistas y desfase por videoId** (Nuvio:
      `TrackPreferenceDataStore`): recordar audio/subtítulo/desfase por
      episodio, y retardo de audio (`AudioDelayMediaSource`).
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
