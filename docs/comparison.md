# Comparativa: WuPlay y NuvioTV vs. Vibe Flix

Revisión hecha contra el código real de las dos bases:

- **WuPlay** — repositorio público `wuplayapp/wuplay-releases` (solo releases;
  el APK es cerrado) + `README.md` y `CHANGELOG.md` completos (v0.8.1 → v0.9.3).
- **NuvioTV** — `NuvioMedia/NuvioTV`, se han revisado `app/src/main/java/com/nuvio/tv/**`,
  `docs/essential-mode.md` y `docs/architecture/mdblist-library.md`. El detalle
  módulo a módulo y las conclusiones de la última revisión están en
  [nuviotv-review.md](nuviotv-review.md).

---

## 1. Resumen ejecutivo

| | WuPlay | NuvioTV | **Vibe Flix** |
| --- | --- | --- | --- |
| Plataforma | Android TV (APK cerrado) | Android TV + móvil (Kotlin, GPLv3) | **Servidor + web TV + shell Android TV** |
| Addons Stremio | Uno a la vez | Uno a la vez | **Fan-out agregado a todos** |
| Metadata | Integrada + addons | Addons + TMDB/Trakt/MDBList | **Integrada (Cinemeta) + addons** |
| Núcleo HLS | Delega en el reproductor | Media3 + libmpv + motor DV | **Selección de variante en el servidor** |
| Biblioteca | Perfiles, listas, historial, sync | Colecciones, Trakt, sync Supabase | Perfiles, listas, historial, progreso |
| Multi-dispositivo | Sí (sync proprietary) | Sí (Supabase) | Sí (código de vinculación) |
| Búsqueda / géneros / décadas | Nativas (cliente) | ⚠️ addons | ✅ **En el servidor** (web + TV + addon) |
| Scrapers de streams | ❌ (solo addons) | ⚠️ plugins externos | ✅ **Nativos en el servidor** (patrón StreamFlix Reborn) |

**Conclusión**: Vibe Flix no es un clon de ninguna de las dos, es la
convergencia de ambas con un núcleo que las dos tienen duplicado en cliente
(agregación + HLS) movido a un servidor único. Su ventaja comparativa real
está en la **agregación**, el **núcleo HLS** y en que el resultado es
instalable como addon en las tres apps existentes.

---

## 2. Funcionalidad por bloques

### 2.1 Agregación de addons — *ventaja de Vibe Flix*

| Capacidad | WuPlay | NuvioTV | Vibe Flix |
| --- | --- | --- | --- |
| Añadir addon por URL de manifest | ✅ | ✅ | ✅ |
| Manifest con querystring (api key) | ✅ (corregido en v0.8.2) | ✅ | ✅ (hereda la query a **todos** los recursos) |
| Auto-update de addons | ✅ | parcial | ✅ (`POST /api/addons/refresh`) |
| **Fan-out a varios addons en paralelo** | ❌ | ❌ | ✅ |
| **Deduplicación y fusión de respuestas** | ❌ | ❌ | ✅ (por id, con fusión de campos) |
| **Aislamiento de fallos por addon** | ❌ | ❌ | ✅ (timeout + errores por addon, el resto sigue) |
| Caché de catálogos/metas | ❌ | parcial | ✅ (TTL + LRU + single-flight) |
| Normalización de DTOs inconsistentes | interna | ✅ (DTOs tolerantes) | ✅ (`normalize.ts`) |
| Orden de streams por calidad | ❌ | ❌ | ✅ (resolución, codec, HDR, Atmos, cacheado) |
| Exponer la app como addon Stremio | ❌ | ❌ | ✅ (`/manifest.json` con la unión de catálogos) |

### 2.2 Metadata y descubrimiento

| Capacidad | WuPlay | NuvioTV | Vibe Flix |
| --- | --- | --- | --- |
| Metadata integrada sin addons | ✅ | parcial (TMDB) | ✅ (Cinemeta embebido, conmutable) |
| Catálogos de terceros | ✅ | ✅ | ✅ |
| Ordenar/ocultar catálogos | ✅ | ✅ | ✅ |
| Búsqueda global | ✅ | ✅ | ✅ (`/api/search`) |
| Catálogos predefinidos (Trending, Upcoming) | ✅ | ✅ | ✅ (Populares, Mejor valorados, Estrenos) |
| **Cast & crew con ficha de persona** | ✅ (filmografía completa) | ✅ | ✅ (`/api/person`) |
| **Títulos similares** | ✅ (motor propio) | ✅ (Trakt related) | ✅ (`/api/similar`, exige género compartido) |
| Trailers | ✅ | ✅ (YouTube) | ✅ (modal con YouTube) |
| Valoraciones (Me gusta / No para mí) | ✅ | parcial | ✅ (`/api/ratings`) |
| Recomendaciones personalizadas | ✅ ("Recommended by Wuplay") | ❌ | ✅ (`/api/recommended`) |
| Trakt / MDBList / Simkl | ✅ | ✅ | ❌ **pendiente** |
| Control parental | ❌ | ✅ | ✅ **por perfil, en el servidor** (madurez + PIN) |
| **Skip intro / Skip recap** | ❌ | ✅ (IntroDB/AniSkip + Simkl) | ✅ **nativo** (análisis de los subtítulos, sin servicios externos) |
| **OpenSubtitles nativo** | ✅ (addon) | ✅ (hash de archivo + API) | ✅ **nativo** (API oficial v1 desde el servidor) |

### 2.3 Reproducción y HLS — *ventaja de Vibe Flix*

| Capacidad | WuPlay | NuvioTV | Vibe Flix |
| --- | --- | --- | --- |
| Reproducción HLS | Media3 | Media3 + libmpv | hls.js (web) + Media3 (APK) |
| **Análisis del master playlist** | ❌ | parcial | ✅ (variantes + pistas) |
| **Selección de variante por capacidades** | ❌ | ❌ | ✅ (altura, HDR, codec, fps, ancho de banda) |
| **Proxy con cabeceras (Referer/UA/Cookie)** | ❌ | ❌ | ✅ |
| **Reescritura de playlists (segmentos, claves AES)** | ❌ | ❌ | ✅ |
| Pistas de audio y subtítulos seleccionables | ✅ | ✅ | ✅ (hls.js + `<track>` externo) |
| **Recordar pistas/desfase por episodio** | ✅ | ✅ | ✅ (`/api/track-prefs`, por videoId) |
| Subtítulos solo para audio extranjero | ✅ | ✅ | ✅ (`onlyForForeignAudio`) |
| Subtítulos SDH limpios / opacidad / colores | ✅ | ✅ | ✅ (Clean SDH + estilo completo) |
| Subtítulo offset amplio | ✅ (±180 s, v0.5.0) | ✅ | ✅ (±180 s, en reproductor y track-prefs) |
| Tamaño de subtítulo mínimo / posición vertical | ✅ (25 %, 95 %, v0.6.5) | ✅ | ✅ (25-250 %, 0-95 %) |
| **Subtítulos forzados por defecto** | ✅ (v0.4.2) | ✅ | ✅ (detección `forced` en pistas y externos) |
| **Orden de pistas: idioma preferido → interfaz → alfa** | ✅ (v0.8.0) | ✅ | ✅ (`sortSubtitleTracks`) |
| **«¿Sigues viendo?» tras N episodios** | ✅ (v0.6.5, default 3) | ❌ | ✅ (`playback.stillWatchingAfter`, 0 = nunca) |
| **Reproducción automática (siguiente episodio)** | ✅ | ✅ | ✅ (tarjeta con cuenta atrás y cancelación) |
| Continuar donde lo dejaste | ✅ | ✅ | ✅ |
| Preview thumbnails en scrubbing | ✅ | ❌ | ❌ **no aplica (web)** |
| Dolby Digital conversion | ✅ | ✅ | ❌ **pendiente** |
| Match de frame-rate / aspect ratio | ❌ | ✅ | ❌ **pendiente** |

### 2.4 Biblioteca, perfiles y sincronización

| Capacidad | WuPlay | NuvioTV | Vibe Flix |
| --- | --- | --- | --- |
| Perfiles sin registro | ✅ | ⚠️ cuenta Supabase | ✅ |
| **PIN por perfil** | ✅ | ✅ | ✅ (401/403 en el servidor + diálogo en el cliente) |
| Ajustes por perfil (idiomas, autoplay) | ✅ | ✅ | ✅ |
| Watchlists | ✅ | ✅ (colecciones) | ✅ |
| Historial y progreso | ✅ | ✅ | ✅ |
| **Sincronización multi-dispositivo** | ✅ | ✅ | ✅ (código de vinculación, sin cuenta) |
| Configurador web | ✅ (profile key) | ❌ | ✅ (API + panel web) |
| **Exportar datos (Privacy & Data)** | ✅ (v0.6.5 + tab web) | ❌ | ✅ (`GET /api/export`, secretos marcados) |
| Privacidad / sin telemetría | ✅ | ❌ (Sentry) | ✅ |

### 2.5 Descubrimiento: teclado, buscador, géneros, décadas y personalización

Comparado con el CHANGELOG de WuPlay v0.7.0 → v0.7.4 (búsqueda nativa, historial
en chips, "save search results to list", "long press on backspace clears entire
search query", pantalla de géneros, pantalla de décadas y "manage sidebar items
in web configurator"):

| Capacidad | WuPlay | NuvioTV | Vibe Flix |
| --- | --- | --- | --- |
| **Teclado en pantalla** para buscar | ✅ (nativo) | ❌ | ✅ (web + Android TV, con `ñ`, números y símbolos) |
| **Borrado de la consulta completa** (pulsación larga) | ✅ | ❌ | ✅ (web: mantener pulsado; Android: dos pulsaciones) |
| **Búsqueda nativa** (no depende de addons) | ✅ | ⚠️ (búsqueda de addons) | ✅ (sobre los catálogos agregados, en el servidor) |
| **Historial de búsquedas en chips** | ✅ | ❌ | ✅ (por perfil, máximo 12, se puede limpiar) |
| **Guardar los resultados en una lista** | ✅ | ❌ | ✅ (`/api/lists/{id}/items/batch`) |
| **Pantalla de géneros** | ✅ (v0.7.3, con reality y anime) | ❌ | ✅ (21 géneros con emoji y color, extra `genre` real) |
| **Pantalla de décadas** (+ hub) | ✅ (v0.7.4) | ❌ | ✅ (1950–2020, por año de estreno) |
| **Content Filters** (excluir keywords/géneros) | ✅ | ❌ | ✅ (+ puntuación mínima y ocultar adultos) |
| **Personalizar el menú** (mostrar/ocultar/ordenar) | ✅ (configurador web) | ❌ | ✅ (misma opción en web y Android TV, guardada en el servidor) |
| Filtros aplicados en el **servidor** (todos los clientes) | ❌ | ❌ | ✅ |

### 2.6 Interfaz y navegación (TV)

| Capacidad | WuPlay | NuvioTV | Vibe Flix |
| --- | --- | --- | --- |
| Navegación lateral por secciones | ✅ | ❌ (barra superior) | ✅ **rail fijo con icono + etiqueta** |
| Portada con fondo del título | ✅ | ✅ | ✅ (fondo + año + puntuación + sinopsis) |
| Foco grande para el mando | ✅ | ✅ | ✅ (anillo de luz + escala 1,05) |
| Tarjetas de género con color | ✅ | ❌ | ✅ (21 con emoji y degradado) |
| Pantalla de décadas | ✅ | ❌ | ✅ |
| Esqueletos de carga (sin spinners) | ❌ | ❌ | ✅ |
| Iconos propios sin dependencias | ❌ (APK) | ✅ | ✅ (SVG en línea) |
| Tamaño de la interfaz configurable | parcial | ✅ | ⚠️ tipografía y espaciado fijos |

### 2.7 Extras de plataforma

| Capacidad | WuPlay | NuvioTV | Vibe Flix |
| --- | --- | --- | --- |
| Plugins / repos de scrapers | ❌ | ✅ | ⚠️ **scrapers nativos** (por configuración, no plugins) |
| Watch parties | ❌ | ✅ | ❌ **pendiente** |
| Chromecast | ❌ | ✅ | ❌ **pendiente** |
| Debrid nativo | ⚠️ (solo HTTP) | ✅ (RD, Premiumize, TorBox) | ✅ (RD, AllDebrid, TorBox, Premiumize) |
| Modo esencial / avanzado | ❌ | ✅ | ✅ (`settings.uiMode`, solo visibilidad) |
| Custom screens / hubs | ✅ | ✅ | ❌ **pendiente** |
| P2P / torrent / usenet | ❌ | ✅ | ❌ (decisión de diseño: solo HTTP) |
| Compartir en comunidad | ✅ | ❌ | ❌ **pendiente** |
| Multi-idioma de interfaz | ✅ | ✅ | ✅ (EN/ES con i18n) |
| **PWA instalable (sin APK)** | ❌ | ❌ | ✅ (manifest + service worker) |

---

### 2.8 Scrapers nativos de streams — *ventaja de Vibe Flix*

| | WuPlay | NuvioTV | **Vibe Flix** |
| --- | --- | --- | --- |
| Origen de las fuentes | Solo addons Stremio | Addons + plugins/CloudStream | **Addons + scrapers nativos del servidor** |
| Dónde se ejecuta | — | En el cliente (o en un servicio externo) | **En el servidor**, junto al resto del motor |
| Coste | — | Servicio de terceros o plugin | **0 €**: código propio, sin servicio de pago |
| Extensible sin código | ❌ | ❌ (hay que escribir el plugin) | ✅ **JSON en los ajustes** |
| Aislamiento de fallos | — | Depende del plugin | ✅ **Timeout y captura de errores por proveedor** |
| Reparto con los addons | — | Manual | ✅ **Fan-out único**: todo se mezcla y ordena por calidad |

El modelo es el de **StreamFlix Reborn** (un proveedor por sitio, una capa de
embeds que extrae la URL directa y un desempaquetador de JavaScript), pero
implementado desde cero en TypeScript dentro de `packages/scrapers/`:

- `ScraperRegistry` consulta **todos los proveedores en paralelo**, cada uno
  con su propio timeout, y aísla los errores: un proveedor caído no rompe la
  respuesta.
- La capa de embeds extrae la URL real de un player (`hls`, `file`,
  `sources[]`, `<video>`, `$.get`) y **desempaqueta** el JavaScript empaquetado
  de Dean Edwards **decodificándolo, sin ejecutarlo**.
- Los proveedores se añaden **por configuración** (búsqueda + expresiones
  regulares del item y del stream) y se pueden probar antes de activarlos.
- Se incluye **Internet Archive** (respaldo de dominio público, audio no
  declarado) y nueve puertos VOD de StreamFlix Reborn para es/en/de/fr/it/pl,
  probados con mocks pero **sin reproducción verificada en vivo**. Los ports
  italiano y polaco se limitan a películas (el polaco no porta WebView). Para
  verificarlos contra los sitios reales está
  `npm run verify:scrapers -- --title "…" --year 2024` (consulta cada
  proveedor y sondea sus fuentes HLS/vídeo). Véase el
  [inventario VOD/IPTV](streamflix-reborn-inventory.md).
- El addon se registra en el mismo `AddonRegistry` que el resto: los streams
  resueltos se mezclan con los de los addons instalados, los magnets siguen
  pasando por debrid y el cliente no distingue de dónde salió cada fuente.
- El uso de fuentes de terceros depende de derechos y disponibilidad; un
  proveedor enumerado en el upstream no se considera instalado aquí.

## 3. Decisiones de diseño que difieren

1. **WuPlay no soporta P2P/torrent/usenet** (decisión legal deliberada: sólo
   HTTP). Nuvio sí. Vibe Flix ha seguido a WuPlay: el motor sólo consume
   streams HTTP/HLS, que además es lo que el proxy HLS necesita para poder
   reescribir cabeceras y playlists.

2. **Nuvio exige cuenta (Supabase)** para la sincronización; WuPlay no exige
   registro. Vibe Flix arranca **sin cuenta** y deja la sincronización para
   una fase posterior, con token por dispositivo en vez de login social.

3. **WuPlay es un APK cerrado**: no se puede construir encima. NuvioTV es
   GPLv3. Vibe Flix no es un fork de ninguno: es una implementación nueva
   que consume el *mismo contrato* (protocolo Stremio), por lo que convive
   con ambas sin conflicto de licencia.

4. **El «saltar intro» se hace con los subtítulos, no con servicios
   externos.** NuvioTV consulta IntroDB, AniSkip o AnimeSkip, y para el
   «previously on» usa Simkl. Vibe Flix analiza los subtítulos que ya trae
   el título: menos dependencias, sin claves de API de terceros y funciona
   con cualquier addon que sirva subtítulos. Cuando no hay subtítulos, se cae
   a un salto por defecto configurable (90 s o el 8 % de la duración).

4. **El núcleo en el servidor** es la diferencia de fondo: WuPlay y Nuvio
   duplican la agregación de addons en cada cliente. En Vibe Flix el
   servidor es la única implementación, y por eso el resultado puede
   instalarse como addon en Stremio, WuPlay y Nuvio con el mismo
   comportamiento.

---

## 4. Qué aporta la Fase 3 (cierre de gaps)

| Gap | Cómo se ha cerrado | Dónde |
| --- | --- | --- |
| Debrid nativo | Cuatro proveedores (Real-Debrid, AllDebrid, TorBox, Premiumize) resuelven magnet y hosters premium **en el servidor**, con caché de 2 h, concurrencia limitada y degradación elegante (si falla, el stream original se conserva) | `packages/addon-engine/src/debrid/` |
| PWA instalable | `manifest.webmanifest` + service worker (shell cacheado, catálogos *stale-while-revalidate*, streams nunca cacheados) e iconos generados sin dependencias | `apps/web/public/`, `apps/web/src/pwa.ts` |
| Sincronización multi-dispositivo | Código de vinculación de 6 caracteres; el servidor exige `X-Vibe-Flix-Token` en las rutas de biblioteca en cuanto hay un dispositivo vinculado, y sigue en modo local si no hay ninguno | `apps/server/src/routes/devices.ts` |
| Valoraciones y recomendaciones | «Me gusta» / «No para mí» por título y fila *Recomendado para ti* calculada por género compartido con lo valorado | `/api/ratings`, `/api/recommended` |
| Catálogos predefinidos | *Populares*, *Mejor valorados* y *Estrenos* calculados sobre el catálogo base del proveedor de metadata | `packages/addon-engine/src/builtin.ts` |
| Torrents sin enlace directo | Los streams que solo traen `infoHash` (los típicos de debrid) ya no se descartan en la normalización | `packages/addon-engine/src/normalize.ts` |

---

## 5. Qué aporta la Fase 3/4 (WuPlay: teclado, buscador, géneros, décadas y personalización)

| Gap | Cómo se ha cerrado | Dónde |
| --- | --- | --- |
| Teclado en pantalla | Teclado propio con letras, `ñ`, números, símbolos, mayús y borrado; cada tecla es un botón enfocable, así que el D-pad la recorre con la navegación espacial (web) o con el foco de Compose for TV (Android) | `apps/web/src/components/Keyboard.tsx`, `android/.../ui/components/OnScreenKeyboard.kt` |
| Buscador nativo | Historial en chips por perfil, resultados guardables en una lista y búsqueda sobre el fan-out de catálogos | `apps/web/src/screens/Search.tsx`, `android/.../ui/screens/search/`, `routes/browse.ts` |
| Pantalla de géneros | 21 géneros (es → EN) con emoji y color; usa el extra `genre` real de los catálogos, no una clasificación inventada | `apps/server/src/library/genres.ts`, `apps/web/src/screens/Browse.tsx` |
| Pantalla de décadas | Décadas 1950–2020 calculadas en el servidor a partir del año de estreno (`releaseInfo`) y ordenadas por puntuación | `library/genres.ts` (`DECADES`), `routes/browse.ts` |
| Content Filters | Géneros y palabras clave excluidos, puntuación mínima y ocultar adultos; se aplican en el servidor, así que limpian búsqueda, géneros y décadas a la vez | `apps/server/src/library/filters.ts` |
| Personalización del menú | Mostrar, ocultar y reordenar las secciones; el orden se guarda en el servidor y es el mismo en la web y en Android TV | `navigation-items.ts`, `PUT /api/sidebar`, `settings.sidebar` |
| Guardar resultados en una lista | Endpoint de lote que añade varios títulos a una watchlist sin alternar | `POST /api/lists/{id}/items/batch` |

**Diferencia de fondo**: en WuPlay estas funciones son del cliente Android
cerrado; en Vibe Flix el cálculo (géneros, décadas, filtros, historial) vive
en el **servidor**, así que el mismo resultado se ve en la web TV, en el shell
Android TV y en el propio addon instalado en Stremio, WuPlay o NuvioTV.

---

## 6. Pendientes priorizados

### Alta (impacto directo en el usuario)

- [x] Metadata integrada (Cinemeta) para arrancar sin instalar nada
- [x] Ficha de persona con filmografía y títulos similares
- [x] Reproductor: pistas de audio/subtítulos, continuar donde lo dejaste,
      autoplay de siguiente episodio
- [x] PIN de perfil aplicado
- [x] Trailers

### Media

- [x] Sincronización multi-dispositivo (token por dispositivo, sin cuenta)
- [x] Debrid nativo (RealDebrid / AllDebrid / TorBox / Premiumize)
- [x] Scrapers nativos en el servidor (patrón StreamFlix Reborn, proveedores
      por configuración)
- [ ] Plugins estilo Nuvio (CloudStream, repos de plugins)
- [x] Catálogos predefinidos (Populares, Mejor valorados, Estrenos)
- [x] Valoraciones y recomendaciones personalizadas
- [x] Teclado en pantalla, buscador nativo con historial, pantalla de géneros,
      pantalla de décadas y personalización del menú (estilo WuPlay)
- [x] Subtítulos: SDH limpio, opacidad, color, solo-audio-extranjero
- [x] PWA instalable (usar la web TV como app sin APK)
- [x] Control parental por perfil (madurez + PIN, en el servidor) — ver
      [revisión de NuvioTV](nuviotv-review.md)

### Baja / específicas de plataforma

- [ ] Watch parties y Chromecast
- [x] Modo esencial (versión simplificada para usuarios nuevos)
- [ ] Idiomas de interfaz adicionales
- [x] Skip intro (nativo, con `@vibeflix/skip-intro`)
- [ ] Frame-rate matching (solo aplica al shell Android)
- [ ] Resincronización de subtítulos y desfase de audio (Nuvio: `AutomaticSubtitleSync`)
