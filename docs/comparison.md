# Comparativa: WuPlay y NuvioTV vs. Master-HLS

Revisión hecha contra el código real de las dos bases:

- **WuPlay** — repositorio público `wuplayapp/wuplay-releases` (solo releases;
  el APK es cerrado) + `README.md` y `CHANGELOG.md` completos (v0.8.1 → v0.9.3).
- **NuvioTV** — `NuvioMedia/NuvioTV` rama `dev`, 6.100 commits, 1.572 ficheros;
  se han revisado `app/src/main/java/com/nuvio/tv/**`, `docs/essential-mode.md`
  y `docs/architecture/mdblist-library.md`.

---

## 1. Resumen ejecutivo

| | WuPlay | NuvioTV | **Master-HLS** |
| --- | --- | --- | --- |
| Plataforma | Android TV (APK cerrado) | Android TV + móvil (Kotlin, GPLv3) | **Servidor + web TV + shell Android TV** |
| Addons Stremio | Uno a la vez | Uno a la vez | **Fan-out agregado a todos** |
| Metadata | Integrada + addons | Addons + TMDB/Trakt/MDBList | **Integrada (Cinemeta) + addons** |
| Núcleo HLS | Delega en el reproductor | Media3 + libmpv + motor DV | **Selección de variante en el servidor** |
| Biblioteca | Perfiles, listas, historial, sync | Colecciones, Trakt, sync Supabase | Perfiles, listas, historial, progreso |
| Multi-dispositivo | Sí (sync proprietary) | Sí (Supabase) | No (en roadmap) |

**Conclusión**: Master-HLS no es un clon de ninguna de las dos, es la
convergencia de ambas con un núcleo que las dos tienen duplicado en cliente
(agregación + HLS) movido a un servidor único. Su ventaja comparativa real
está en la **agregación**, el **núcleo HLS** y en que el resultado es
instalable como addon en las tres apps existentes.

---

## 2. Funcionalidad por bloques

### 2.1 Agregación de addons — *ventaja de Master-HLS*

| Capacidad | WuPlay | NuvioTV | Master-HLS |
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

| Capacidad | WuPlay | NuvioTV | Master-HLS |
| --- | --- | --- | --- |
| Metadata integrada sin addons | ✅ | parcial (TMDB) | ✅ (Cinemeta embebido, conmutable) |
| Catálogos de terceros | ✅ | ✅ | ✅ |
| Ordenar/ocultar catálogos | ✅ | ✅ | ✅ |
| Búsqueda global | ✅ | ✅ | ✅ (`/api/search`) |
| Catálogos predefinidos (Trending, Upcoming) | ✅ | ✅ | ❌ **pendiente** |
| **Cast & crew con ficha de persona** | ✅ (filmografía completa) | ✅ | ✅ (`/api/person`) |
| **Títulos similares** | ✅ (motor propio) | ✅ (Trakt related) | ✅ (`/api/similar`, exige género compartido) |
| Trailers | ✅ | ✅ (YouTube) | ✅ (modal con YouTube) |
| Valoraciones (Me gusta / No para mí) | ✅ | parcial | ❌ **pendiente** |
| Recomendaciones personalizadas | ✅ ("Recommended by Wuplay") | ❌ | ❌ **pendiente** |
| Trakt / MDBList / Simkl | ✅ | ✅ | ❌ **pendiente** |
| Control parental | ❌ | ✅ | ❌ **pendiente** |
| Skip intro / Skip credits | ❌ | ✅ | ❌ **pendiente** |

### 2.3 Reproducción y HLS — *ventaja de Master-HLS*

| Capacidad | WuPlay | NuvioTV | Master-HLS |
| --- | --- | --- | --- |
| Reproducción HLS | Media3 | Media3 + libmpv | hls.js (web) + Media3 (APK) |
| **Análisis del master playlist** | ❌ | parcial | ✅ (variantes + pistas) |
| **Selección de variante por capacidades** | ❌ | ❌ | ✅ (altura, HDR, codec, fps, ancho de banda) |
| **Proxy con cabeceras (Referer/UA/Cookie)** | ❌ | ❌ | ✅ |
| **Reescritura de playlists (segmentos, claves AES)** | ❌ | ❌ | ✅ |
| Pistas de audio y subtítulos seleccionables | ✅ | ✅ | ✅ (hls.js + `<track>` externo) |
| Subtítulos solo para audio extranjero | ✅ | ✅ | ❌ **pendiente** |
| Subtítulos SDH limpios / opacidad / colores | ✅ | ✅ | ❌ **pendiente** |
| Reproducción automática (siguiente episodio) | ✅ | ✅ | ✅ (busca el siguiente y encadena stream) |
| Continuar donde lo dejaste | ✅ | ✅ | ✅ |
| Preview thumbnails en scrubbing | ✅ | ❌ | ❌ **no aplica (web)** |
| Dolby Digital conversion | ✅ | ✅ | ❌ **pendiente** |
| Match de frame-rate / aspect ratio | ❌ | ✅ | ❌ **pendiente** |

### 2.4 Biblioteca, perfiles y sincronización

| Capacidad | WuPlay | NuvioTV | Master-HLS |
| --- | --- | --- | --- |
| Perfiles sin registro | ✅ | ⚠️ cuenta Supabase | ✅ |
| **PIN por perfil** | ✅ | ✅ | ✅ (401/403 en el servidor + diálogo en el cliente) |
| Ajustes por perfil (idiomas, autoplay) | ✅ | ✅ | ✅ |
| Watchlists | ✅ | ✅ (colecciones) | ✅ |
| Historial y progreso | ✅ | ✅ | ✅ |
| **Sincronización multi-dispositivo** | ✅ | ✅ | ❌ **pendiente** (roadmap) |
| Configurador web | ✅ (profile key) | ❌ | ✅ (API + panel web) |
| Privacidad / sin telemetría | ✅ | ❌ (Sentry) | ✅ |

### 2.5 Extras de plataforma

| Capacidad | WuPlay | NuvioTV | Master-HLS |
| --- | --- | --- | --- |
| Plugins / repos de scrapers | ❌ | ✅ | ❌ **pendiente** |
| Watch parties | ❌ | ✅ | ❌ **pendiente** |
| Chromecast | ❌ | ✅ | ❌ **pendiente** |
| Debrid nativo | ⚠️ (solo HTTP) | ✅ (RD, Premiumize, TorBox) | ❌ **pendiente** |
| Modo esencial / avanzado | ❌ | ✅ | ⚠️ solo "avanzado" |
| Custom screens / hubs | ✅ | ✅ | ❌ **pendiente** |
| P2P / torrent / usenet | ❌ | ✅ | ❌ (decisión de diseño: solo HTTP) |
| Compartir en comunidad | ✅ | ❌ | ❌ **pendiente** |
| Multi-idioma de interfaz | ✅ | ✅ | ⚠️ solo español |

---

## 3. Decisiones de diseño que difieren

1. **WuPlay no soporta P2P/torrent/usenet** (decisión legal deliberada: sólo
   HTTP). Nuvio sí. Master-HLS ha seguido a WuPlay: el motor sólo consume
   streams HTTP/HLS, que además es lo que el proxy HLS necesita para poder
   reescribir cabeceras y playlists.

2. **Nuvio exige cuenta (Supabase)** para la sincronización; WuPlay no exige
   registro. Master-HLS arranca **sin cuenta** y deja la sincronización para
   una fase posterior, con token por dispositivo en vez de login social.

3. **WuPlay es un APK cerrado**: no se puede construir encima. NuvioTV es
   GPLv3. Master-HLS no es un fork de ninguno: es una implementación nueva
   que consume el *mismo contrato* (protocolo Stremio), por lo que convive
   con ambas sin conflicto de licencia.

4. **El núcleo en el servidor** es la diferencia de fondo: WuPlay y Nuvio
   duplican la agregación de addons en cada cliente. En Master-HLS el
   servidor es la única implementación, y por eso el resultado puede
   instalarse como addon en Stremio, WuPlay y Nuvio con el mismo
   comportamiento.

---

## 4. Pendientes priorizados

### Alta (impacto directo en el usuario)

- [x] Metadata integrada (Cinemeta) para arrancar sin instalar nada
- [x] Ficha de persona con filmografía y títulos similares
- [x] Reproductor: pistas de audio/subtítulos, continuar donde lo dejaste,
      autoplay de siguiente episodio
- [x] PIN de perfil aplicado
- [x] Trailers

### Media

- [ ] Sincronización multi-dispositivo (token por dispositivo, sin cuenta)
- [ ] Debrid nativo (RealDebrid / AllDebrid / TorBox / Premiumize)
- [ ] Plugins estilo Nuvio (CloudStream, repos de plugins)
- [ ] Catálogos predefinidos (Trending, Upcoming, por país)
- [ ] Valoraciones y recomendaciones personalizadas
- [ ] Subtítulos: SDH limpio, opacidad, color, solo-audio-extranjero
- [ ] PWA instalable (usar la web TV como app sin APK)

### Baja / específicas de plataforma

- [ ] Watch parties y Chromecast
- [ ] Modo esencial (versión simplificada para usuarios nuevos)
- [ ] Idiomas de interfaz adicionales
- [ ] Control parental, skip intro, frame-rate matching
