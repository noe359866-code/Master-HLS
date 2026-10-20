# WuPlay — revisión y comparación

Fecha: 2026-10-19 · Rama: `arena/54959a75-master-hls` · PR: [#6](https://github.com/noe359866-code/Master-HLS/pull/6)

Fuente: [wuplayapp/wuplay-releases](https://github.com/wuplayapp/wuplay-releases) — **solo README y CHANGELOG** (la app es closed source; el repositorio publica APKs, capturas y el registro de versiones v0.1.0 → v0.9.3-beta). Toda la evidencia de esta revisión sale de esos dos ficheros.

## 1. Qué es WuPlay

Aplicación para **Android TV** (y Android móvil en «modo no optimizado») que se presenta como alternativa a Stremio con foco en **privacidad**. Comunidad activa (Discord/Reddit), addons compatibles con el ecosistema Stremio y un modelo «tú alojas el contenido» (torrents/DDL vía Real-Debrid y similares). Teléfonos: `v0.6.3+` con navegación inferior.

Rasgos de producto (README): addons compatibles con Stremio, catálogos nativos (TMDB), «My Stuff» (watchlists, listas por addon), perfiles, Android TV / Fire TV / Google TV, Chrome cast, Google Home, subir subtítulos, Random Episode, restricciones por edad, reproducción de la red local, menús contextuales, banear calidad/resolución, playback rápido, maratón con countdown y salto de intros (créditos del TMDB-BD).

**Privacidad** (README, apartado propio): sin telemetría, sin cuentas, autoalojado, sin compartir IP con terceros salvo tu fuente/descarga, controles locales por dispositivo (salvo la sincronización interna de la app entre tus dispositivos).

## 2. Qué ya teníamos equivalente en Vibe Flix

| WuPlay | Vibe Flix |
| --- | --- |
| Age restrictions + PIN de perfil (v0.4.2) | Control parental NuvioTV + PIN de perfil (PR #6) |
| Búsqueda nativa (v0.6.2) | `ScreenSearch` nativa (PR #6) |
| Géneros, décadas, países, resolución en filtros | Chips de filtros + UI de categorías |
| Títulos similares (v0.7.3) | `similar.ts` + `TmdbService.similar` + tests |
| Autoplay + maratón con countdown (v0.3.1) | Countdown configurable + binge del catalog-server |
| Trailers (v0.7.3) | TMDB de la biblioteca + `MediaModal` con vídeo |
| Reordenar/separar catálogos (v0.3.1) | `Catalogs.tsx` con orden personalizado |
| Clean-up de SDH (v0.2.2) | `subtitle-clean.ts` (24/24) con etiquetas de hablante |
| Stream info: calidad, codec, HDR, tamaño, idioma (v0.3.1) | `stats`/`labels` del player-core + overlay |
| Banear calidad/resolución (v0.7.0) | `device.maxHeight` + `settings.maxBitrateMbps` (v0.4.1 equivalente) |
| Preferencia de pista por episodio (v0.6.4) | `/api/track-prefs` + `persistTrackPref` (commit `e447238`) |
| Idioma de audio/subs por perfil (v0.4.2) | `Profile.audioLanguage`/`subtitleLanguage` (commit `e447238`) |

## 3. Huecos cerrados en esta revisión (implementados)

Todas las celdas con evidencia del CHANGELOG de WuPlay; implementación propia, sin código suyo.

| Hueco (WuPlay) | Evidencia | Implementación en Vibe Flix |
| --- | --- | --- |
| **Subtítulo offset hasta ±180 s** | v0.5.0 «Increased maximum subtitle offset from 10 seconds to 180 seconds» | Clamp ±15 s → ±180 s en `Player.changeSubtitleDelay`, `track-prefs.sanitize` y el selector de Ajustes (±250 ms…±180 s) |
| **Tamaño mínimo de subtítulo 25 %** | v0.6.5 «Subtitle min. size reduced from 50% to 25%» | `normalizeSubtitleStyle` clamp 0.5→0.25; escala `XXS` añadida; chips del reproductor 0.25–2.5 |
| **Posición vertical hasta 95 %** | v0.6.5 «Subtitle max. offset increased from 30% to 95%» | `verticalPosition` clamp 0-40→0-95 + slider de Ajustes `max={95}` |
| **Subtítulos forzados por defecto** | v0.4.2 «Forced subtitles are now shown by default if available» | Detección `forced` (nombre de pista/track), activación por defecto aunque los subs completos no se usen, marcador `· Forzados` en el selector |
| **«Are You Still Watching?» (3 episodios)** | v0.6.5 «Are You Still Watching? (new setting, default 3 episodes)» | Ajuste `playback.stillWatchingAfter` (0-20, 0 = nunca, por defecto 3); el autoplay se congela con tarjeta «¿Sigues viendo?» tras N episodios seguidos |
| **Orden de pistas: idioma preferido → interfaz → alfabético** | v0.8.0 «Subtitle tracks are now sorted by preferred subtitle languages first, app language second, and alpha for the remaining» | `sortSubtitleTracks` en player-core (test unitario) aplicado a las pistas nativas y externas del reproductor |
| **Exportar datos / Privacy & Data** | README + v0.6.5 «Export option» + tab Privacy & Data de la config web | `GET /api/export` (descarga JSON con `content-disposition`) + panel «Datos y privacidad» en Ajustes; PIN y claves de API salen como `••••` |

Detalle de API nueva:

- `GET /api/export` → `{ app, exportedAt, profiles, lists, history, progress, ratings, trackPreferences, settings, ... }` como descarga `vibeflix-export-AAAA-MM-DD.json`. Los perfiles usan `publicProfile` (PIN → `••••`) y los ajustes `publicSettings` (claves → `••••`); el fichero es apto para adjuntar en soporte.
- `playback.stillWatchingAfter`: entero 0-20. En PUT fuera de rango cae al por defecto (3); también se normaliza al cargar. El contador de episodios automáticos vive a nivel de módulo en el reproductor y se reinicia con cualquier confirmación manual.

## 4. No aplica a Vibe Flix (documentado, no implementado)

| WuPlay | Por qué no |
| --- | --- |
| Frame-rate matching (v0.8.3), `refreshrate.txt` | Control de la tasa del panel = API nativa de Android TV; somos web/PWA |
| Tunneled playback / HDR «zero-copy» / cambio de códec en caliente (v0.8.3) | Idem: decodificación del navegador |
| Google Home y «Play on TV» (v0.4.0) | Protocolo de Google; el Chrome cast del navegador queda en el backlog |
| DD/AC3 transcode (v0.8.3) | Servidor de streaming remoto; el navegador no decodifica AC3 en MSE |
| Navegación por voz (v0.8.4) | Mandos nativos de Android TV |
| Streaming desde el móvil al televisor (v0.2.2) | App nativa; nuestro «Instalar en la TV» + URL de red cubren el caso de uso |
| Contenido de red local / ficheros personales (v0.9.3-beta) | Fuera del alcance actual (no somos reproductor de ficheros) |
| Sharing entre dispositivos con PIN (v0.4.0) | Lo cubre la vinculación de dispositivos que ya tenemos |

## 5. Backlog común (WuPlay + NuvioTV)

Sin cambios respecto a `nuviotv-review.md` §5: delay de audio, Trakt/MDBList/Simkl, resync de subtítulos manual con red, frame-rate matching (N/A web), watch parties.

### Añadido por la revisión WuPlay (no implementado aún)

- **Random Episode** (v0.5.4): botón «aleatorio» en series; requiere decidir si va al Detail o al player (riesgo UX en mando).
- **Menú contextual con remoto largo** (v0.4.2) y **«Hide Everywhere»** por título (v0.6.5): útiles en TV con mando; a medio camino entre el esencial y un uso real de sofá.
- **Perfil instantáneo sin PIN hasta 2 min** (v0.6.5): atajo de conveniencia sobre el PIN de perfil.
- **Fallback de streams con temporizador de error** (v0.6.4, configurable): nuestro autoplay-first ya cubre el caso feliz; el temporizador de error necesita diseño (cuándo rendirse vs reintentar).
- **Pestaña «Privacy & Data» con borrado selectivo** (borrar historial por título/caché): el export ya existe; el borrado selectivo del historial va con la limpieza de datos.

## 6. Veredicto

WuPlay valida de forma independiente tres apuestas de Vibe Flix (catálogos nativos estilo Stremio, perfiles con PIN, maratón con countdown) y su CHANGELOG marca los estándares de comodidad de subtítulos que ahora igualamos (±180 s, 25 %, 95 %, forzados por defecto, orden por idioma). La capa de Android TV (frame-rate, tunneled playback, Google Home) queda fuera del alcance web y documentada como N/A. Suite completa en verde (**504 tests**) tras los cambios.
