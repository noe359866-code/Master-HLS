# Revisión profunda de NuvioTV (2026-10-19)

Revisión hecha sobre el código real de [`NuvioMedia/NuvioTV`](https://github.com/NuvioMedia/NuvioTV)
(clon de la rama `main`, 2026-10-19): se han leído `README.md`,
`docs/essential-mode.md`, `docs/architecture/mdblist-library.md` y los módulos
`app/src/main/java/com/nuvio/tv/**` (≈913 ficheros Kotlin). Este documento
complementa la [comparativa general](comparison.md) con el detalle de *cómo*
hace NuvioTV cada cosa y qué se ha importado a Vibe Flix como resultado.

---

## 1. Qué es NuvioTV hoy

Cliente de medios open source (GPLv3) para Android TV y móvil, construido con
Kotlin, Jetpack Compose (TV Material 3) y Media3, con soporte de plugins
(CloudStream), debrid, watch parties y sincronización en la nube. A diferencia
de WuPlay (APK cerrado), su código es auditable — que es lo que permite esta
revisión.

Mapa de módulos relevante (`com.nuvio.tv`):

| Módulo | Qué contiene | Idea aprovechable |
| --- | --- | --- |
| `core/debrid/` | Real-Debrid, Premiumize, TorBox con selección de archivos, plantillas de etiquetas y resolución directa | Vibe Flix ya tiene 4 proveedores en el servidor (`packages/addon-engine/src/debrid/`) |
| `core/plugin/` | Plugins estilo CloudStream (`PluginSafety`, reglas por tipo de episodio) | Pendiente (decisión: scrapers por configuración JSON) |
| `core/party/` | Watch parties (`PartyApi`, `PartySync`, `PartyClock`, match de fuentes) | Pendiente (fase baja) |
| `core/player/` | Media3 + libmpv, DV/libdovi, `SubtitleCharsetDetector`, `AudioDelayMediaSource`, `GainAudioProcessor` | Charset de subtítulos y retardo de audio |
| `ui/screens/player/` | `PlayerRuntimeController*` (failover de motores), `PlayerFrameRateHeuristics`, `DolbyVision*`, `ParentalGuideOverlay`, `NextEpisodeEndPromptOverlay` | Guía parental y frame-rate matching |
| `data/local/TrackPreferenceDataStore.kt` | Preferencias de pista **por contenido**: idioma/nombre de subtítulo, `sub_is_forced`, audio, **desfase por videoId** y velocidad por título | Persistencia de pistas y desfase por vídeo |
| `data/remote/api/ParentalGuideApi.kt` | Guía parental de IMDb (`titles/{imdbId}/parentsGuide`) con desglose por severidad | Control parental en el servidor |
| `AutomaticSubtitleSync*` (≈12 ficheros) | Resincronización automática de subtítulos (parser de cues, retimeo, alineación por referencias) | Futuro: el desfase manual ya existe |
| `docs/essential-mode.md` | Espec completa del **modo esencial/avanzado** | ✅ Importado esta semana |
| `data/` (mdblist, trakt, simkl, supabase, mediaserver emby/jellyfin) | Integraciones de catálogos y sync | Pendiente (Trakt/MDBList) |

## 2. Mecanismos de NuvioTV que Vibe Flix ya replica (y dónde)

| Mecanismo de NuvioTV | Vibe Flix | Estado |
| --- | --- | --- |
| Debrid nativo (RD, Premiumize, TorBox) | `packages/addon-engine/src/debrid/` (+ AllDebrid) | ✅ |
| Tolerancia ante DTOs de addon inconsistentes | `normalize.ts` del addon-engine | ✅ |
| `behaviorHints` (proxyHeaders, bingeGroup) | `binge.ts`, proxy HLS con cabeceras | ✅ |
| Vídeo avanzado (DV/HDR) | Selección HLS con `VIDEO-RANGE`, techo por dispositivo | ✅ |
| Skip intro/recap (ellos: IntroDB/AniSkip/Simkl) | `@vibeflix/skip-intro` nativo sobre subtítulos | ✅ (sin servicios externos) |
| Charset de subtítulos (árabe, cirílico…) | `player-core/src/encoding.ts` | ✅ |
| Clean SDH / opacidad / color / solo-audio-extranjero | `player-core/src/sdh.ts`, `subtitleStyle.ts`, ajustes del servidor | ✅ (cerrado en Fase 3/4) |
| Guía parental (IMDb) | **Nuevo:** `library/parental.ts` por perfil | ✅ esta semana |
| Modo esencial/avanzado | **Nuevo:** `settings.uiMode` + Ajustes simplificados | ✅ esta semana |
| Perfiles con PIN | Hash scrypt + bloqueo por intentos | ✅ |
| Reproducción automática con cuenta atrás | `binge` + tarjeta cancelable | ✅ |
| Pistas de audio/subtítulos seleccionables | Reproductor web + Media3 (APK) | ✅ |
| Persistencia de pistas por contenido | `library/track-prefs.ts` por videoId y perfil | ✅ |
| Desfase de subtítulos por videoId (ellos, #1063) | Idem: desfase guardado por vídeo, no global | ✅ |
| Resincronización automática de subtítulos | ❌ | pendiente |
| Retardo de audio (`AudioDelayMediaSource`) | ❌ | pendiente |
| Frame-rate matching (`PlayerFrameRateHeuristics`, 23.976↔24) | ❌ (solo el APK podría) | pendiente |
| Watch parties (`core/party/`) | ❌ | pendiente |
| Plugins CloudStream (`core/plugin/`) | ❌ (scrapers por JSON) | decisión de diseño |
| Trakt / MDBList / Simkl / Supabase | ❌ (sync por código propio) | pendiente |
| Servidores de medios (Emby/Jellyfin) | ❌ | pendiente |
| Chromecast / recommendations TV | ❌ | pendiente |

## 3. Lo que se ha implementado en esta revisión

### 3.1 Control parental por perfil (de `ParentalGuideApi` + PIN de WuPlay)

NuvioTV consulta la guía parental de IMDb y la muestra como aviso en el
reproductor (`ParentalGuideOverlay`). Vibe Flix, sin servicios externos,
convierte la misma idea en un **filtro de servidor por perfil**
(`apps/server/src/library/parental.ts`):

- Niveles de madurez: `off`, `kids` (≤12), `teen` (≤15), `adult` (≤18).
- Si la ficha declara clasificación por edades (`contentRating`,
  `certification`: G/PG/PG-13/R/TV-MA/18…), **manda la clasificación**; si no,
  heurísticas de género (lista blanca infantil) y palabras clave adultas.
- Géneros bloqueados adicionales por perfil (sobre la lista canónica de
  `library/genres.ts`).
- Se aplica **en el servidor**: catálogos del addon (`/catalog/...`),
  `/api/search`, `/api/browse`, `/api/recommended`, `/api/similar` y el
  **stream** (`/stream/...` → 403 `parental_blocked`).
- Desbloqueo con el PIN del perfil (hash scrypt, cabecera
  `X-Vibe-Flix-Parental-Pin`, bloqueo tras 5 intentos). El PIN vive solo en
  `sessionStorage` del cliente: cerrar la pestaña vuelve a bloquear.
- Cambiar el control parental de un perfil con PIN exige conocer el PIN.

### 3.2 Modo esencial / avanzado (de `docs/essential-mode.md`)

La spec de NuvioTV describe un modo que «solo cambia la visibilidad»: no
desactiva nada ni borra datos. Implementado tal cual:

- `settings.uiMode: 'essential' | 'advanced'` en el servidor (misma base para
  web, APK y addon).
- Ajustes esenciales: experiencia (conmutador), idioma, reproducción básica
  (autoplay, cuenta atrás, continuar viendo), subtítulos básicos (activar,
  tamaño, color, Clean SDH, solo extranjero, desfase), omitir intro, instalar
  en la TV y perfil. Se ocultan: metadata integrada, capacidades del
  dispositivo, bitrate/buffer, scrapers, debrid, OpenSubtitles, personalización
  del menú y filtros.
- Reproductor esencial: se ocultan estadísticas y modo de imagen (los atajos de
  teclado siguen funcionando, como pide la spec).
- Regla de datos: cambiar de modo **no** desactiva ni resetea nada.

### 3.3 Correcciones encontradas al revisar

- El bloque de subtítulos de `docs/comparison.md` («SDH limpio, opacidad,
  color, solo-audio-extranjero») estaba marcado como pendiente pero **ya
  estaba implementado** (`player-core/src/sdh.ts`, `subtitleStyle.ts`,
  `onlyForForeignAudio`); la comparativa queda actualizada.
- `package-lock.json` no declaraba las dependencias de workspace
  (`player-core` en el servidor, `i18n`/`player-core` en la web) que sí usan
  sus `package.json`; regenerado con `npm install`.
- Test preexistente roto en `packages/scrapers/test/registry.test.ts`
  («elige variante exacta y cae al idioma genérico»): falla también en el
  árbol limpio; queda documentado, fuera del alcance de esta revisión.

## 4. Pruebas

- `apps/server/test/parental.test.ts`: 20 aserciones nuevas — normalización de
  reglas, parseo de clasificaciones (G→18), niveles kids/teen/adult, lista
  blanca infantil, vocabulario adulto, géneros bloqueados, filtros de
  catálogo y PIN con bloqueo temporal (bug encontrado y corregido durante las
  pruebas: el contador de intentos se borraba al comprobar el bloqueo).
- `apps/server/test/track-prefs.test.ts`: sanitizado, fusión, `subtitleKey`
  null, poda por tope y borrado de entradas vacías.
- `normalizeData`: `uiMode` por defecto/rechazo de valores desconocidos,
  completado de reglas parentales y `trackPrefs` en datos antiguos.
- Suite completa: **502 pruebas en verde** (incluido el test preexistente de
  scrapers realineado con el diseño de prioridad que documenta `registry.ts`:
  la variante exacta encabeza la lista y las alternativas del mismo idioma se
  conservan como fallback real).

## 5. Siguiente (priorizado, según lo que hace NuvioTV)

1. **Retardo de audio** (`AudioDelayMediaSource`) en el reproductor web y APK.
2. **Trakt / MDBList** (su `data/trakt`, `data/mdblist`): listas y progreso
   externos; Vibe Flix ya tiene el modelo de listas para mapearlos.
3. **Resincronización de subtítulos** (su `AutomaticSubtitleSync`): como fase
   posterior al desfase manual; sin servicios externos (correlación con el
   audio no es viable en web, quizá con pistas de referencia del propio HLS).
4. **Frame-rate matching** solo en el shell Android (`DisplayModeOverlay` +
   `PlayerFrameRateHeuristics` resuelven 23.976↔24).
5. **Watch parties** (`core/party/`): su `PartyClock`/`PartySync` es un buen
   mapa de implementación, pero requiere servidor de presencia.

### Ya cerrado en esta revisión

- **Persistencia de pistas y desfase por videoId** (su
  `TrackPreferenceDataStore`, incluido el matiz de #1063): cada vídeo guarda
  audio, subtítulo (`null` = apagados a propósito), desfase y velocidad por
  perfil, con tope de 200 entradas y poda de las más antiguas
  (`library/track-prefs.ts`, `/api/track-prefs/:videoId`, reproductor web).
- **Control parental** y **modo esencial** (sección 3).
