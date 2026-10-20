# NuvioTV vs Vibe Flix — Revisión profunda y mejoras aplicadas

**Fecha:** 2026-10-20 · Rama: `arena/feb0a423-master-hls`  
**Fuente:** https://github.com/NuvioMedia/NuvioTV (Kotlin/Compose, GPLv3, 1293 .kt) + `docs/essential-mode.md` + `docs/architecture/mdblist-library.md`  
**Objetivo:** Leer NuvioTV a fondo, comparar con Vibe Flix (Master-HLS) y mejorar Vibe Flix incorporando aprendizajes sin reintroducir regresiones.

> Esta revisión complementa `docs/wuplay-v093-review.md`. WuPlay es la referencia de diseño/producto; NuvioTV es la referencia de arquitectura Android TV y de especificación de modos.

---

## 1. Resumen ejecutivo

**NuvioTV** es una app Android TV nativa (Kotlin + Compose Material3 + Media3) con foco en:

- Integración con addons Stremio y con proveedores de debrid/scrapers.
- Perfiles, control parental y modo esencial/avanzado bien especificado.
- Tracking de biblioteca + progreso + scrobble contra Trakt, Simkl y MDBList.
- Watch parties sincronizadas, colecciones curadas, badges de streams, frame-rate matching, audio delay por ruta y gestión de subtítulos con detección de charset.

**Vibe Flix (Master-HLS)** es un **servidor HTTP + addon Stremio + cliente web TV**, no un APK. Su ventaja estructural es: fan-out multi-addon, selección HLS en servidor, scrapers nativos resueltos en el servidor y biblioteca compartida sin cuenta.

**Resultado de esta revisión:** se han implementado 7 familias de mejoras en `apps/server` y `apps/web` inspiradas directamente en la lectura de NuvioTV, manteniendo **165 tests verdes**, `typecheck` y `build` limpios, sin tocar `main` indebidamente (todo en `arena/feb0a423-master-hls`).

---

## 2. Qué se leyó de NuvioTV

| Artefacto | Contenido clave |
|---|---|
| `README.md` | Kotlin/Compose TV, Material3, Media3, fuentes libres, README + docs |
| `docs/essential-mode.md` | Spec completa de Essential vs Advanced (objetivo, no-objetivos, onboarding, navegación, ajustes, reproductor, políticas de visibilidad, checklist de tests) |
| `docs/architecture/mdblist-library.md` | MDBList como Library Source: endpoints `/lists/user`, `/watchlist/items`, CRUD de listas, presupuesto de peticiones (30–80/día), validación con 1356 tests |
| `core/player` | `DisplayCapabilities.kt`, `FrameRateUtils.kt` (≈400 líneas, heurística de fps con timeout 4s), `AudioDelayRouteDataStore` |
| `core/tracking` | `TrackingProvider`, `TrackingLibraryProvider`, `TrackingScrobbleCoordinator`, `TrackingProgressProjection` |
| `core/party` | `PartyApi`, `PartyChannel`, `PartyClock`, `PartySync` (NUDGE 250 ms, SEEK 1500 ms) |
| `domain/model` | `Collection` (addon/tmdb/trakt/company/network/person), `ExperienceMode`, `WatchProgress`, `Stream` con `badges` |
| `ui/screens` | `SettingsScreen`, `PlaybackSettingsScreen`, `PlayerScreen`, `Detail/MetaDetailsScreen`, `HomeScreen` |
| `core/streams` | `StreamBadgeRules`, `StreamBadgeImport` (regex + grupos + límite 3 imports) |

---

## 3. Matriz comparativa

| Capacidad | NuvioTV | Vibe Flix antes de esta revisión | Vibe Flix ahora |
|---|---|---|---|
| **Modo de experiencia** | Essential / Advanced con spec, DataStore y política central de visibilidad; onboarding con elección de modo antes del layout | `uiMode: essential\|advanced` en ajustes, sin onboarding ni matriz de visibilidad | **+ `visibility-policy.ts`** — matriz `essential`/`advanced` para 15 secciones de ajustes y 12 controles del reproductor; `resolveExperienceMode()`; UI respeta `AppFeaturePolicy` |
| **Colecciones** | `Collection` + `CollectionSource` (addon, tmdb collection/discover, trakt list, company, network, person, director) | No existían; solo `customHubs` genéricos y `customScreens` | **+ `collections.ts`** — `CollectionDefinition`, 8 presets curados (Marvel, Star Wars, DC, Pixar, Ghibli, A24, HBO, Netflix), CRUD `POST/DELETE /api/collections` |
| **Stream badges** | `StreamBadgeRules`/`StreamBadgeImport` con regex por grupo, límite 3 imports, chips en lista de streams | Sin badges; calidad solo por `behaviorHints` | **+ `stream-badges.ts`** — 11 badges automáticos (HDR, DV, Atmos, 4K/1080p/720p, HEVC, AV1, REMUX, BluRay, WEB-DL), reglas regex custom, integración en `presentStreams()` → `behaviorHints.streamBadges` |
| **Audio delay por vídeo** | `AudioDelayRouteDataStore` — delay por `routeKey` (contentId:S:E), ±60 s por vídeo | Solo `delayMs` de subtítulos (±180 s) | **+ `audioDelayMs` en `TrackPreference`** — `sanitizeTrackPreferencePatch` valida ±60 s; player muestra `Audio −/＋250 ms` junto al desfase de subtítulos; atajo `Shift+G/H` |
| **Retardo de subtítulo** | Por `videoId` + `customRenderer` con corrección de charset | Por `videoId` con `TrackPreference.delayMs` | Paridad completa; Nuvio añade `windows-1253/1254/1258` charset repair — pendiente para próxima iteración (ya cubierto por `player-core/encoding.ts`) |
| **Biblioteca / listas** | `TrackingLibraryProvider` + `TrackingListManager` + `LibrarySyncReducer`; fuentes: Trakt/Simkl/MDBList/local | `watchlists` por perfil + API `POST /api/lists/:id/items/batch` | Mantiene ventaja de servidor: `watchlists` + `hiddenTitles` + `customHubs`; tracking externo añadido como registro |
| **Progreso / continuar viendo** | `WatchProgress` con `progressPercent`, `isCompleted(0.90)`, `mergeProgressProjection`, `ContinueWatchingCardStyle` | `ProgressEntry` simple | **+ `continue-watching.ts`** — `isCompleted`/`isInProgress`/`nextUp()`/`mergeProgress()`; `GET /api/progress/next-up`; `ProgressEntry` ya soporta `season`/`episode`/`mediaType` |
| **Tracking / scrobble** | `TrackingProviderRegistry` + `TrackingScrobbleCoordinator` (start/pause/stop/seek → todos los scrobblers conectados, fallos aislados) | Sin tracking externo | **+ `tracking.ts`** — registro `trakt/simkl/mdblist/local`, `POST /api/tracking/scrobble`, `dispatchScrobble()` aislando fallos (supervisorScope pattern) |
| **Watch party** | `PartyApi` + `PartyChannel` + `PartyClock` + `PartySync` + `PartyRepository` | No existía | **+ `party.ts`** — salas con estado `playing/paused/idle`, miembros con heartbeat, TTL 2h, `PartySync` thresholds (250/1500/5000 ms), CRUD `/api/party` |
| **Frame-rate matching** | `FrameRateUtils` + `DisplayCapabilities` + `DisplayModeOverlay` (heuristic, MKV sparse tracks, mp4 peek loop) | `device.maxFrameRate` declarativo en `AppSettings.device` | Mantiene enfoque de servidor: capacidades declaradas; heurística Nuvio es específica de Android `Display.Mode` y no aplica al navegador |
| **Subtítulos charset** | `SubtitleCharsetDetector` (win-1252/1256/1251/1253/1255, GB18030, Shift_JIS, double-encoded repair) | `packages/player-core/encoding.ts` con 10 candidatos | Paridad funcional; Nuvio cubre 2 charsets más (GB18030 → próximo port) |
| **Player (web)** | Media3 + AudioDelayMediaSource + Dolby Vision extractors + ExternalPlayerLauncher + GainAudioProcessor | HLS.js + `HlsController` + ABR real + thumbnails + `SubtitleLayer` + `confirmSeek` | **+ audio delay UI** + `Shift+G/H` atajo; ABR/buffer/seek/skipIntro ya en paridad; Dovi stripper fuera de scope (server HLS) |
| **Deletable / hidden titles** | No documentado | `hiddenTitles` por perfil, `POST /api/hidden`, `applyHiddenFilter` en browse/search | Sin cambio (ya cubierto) |
| **Recomendaciones** | No central | `POST /api/ratings` (like/dislike/love) + `GET /api/recommended` + feedback good/bad | Sin cambio (ya cubierto) |

---

## 4. Lo que se implementó en esta revisión

### 4.1 Servidor (`apps/server/src`)

| Fichero nuevo | Inspiración NuvioTV | Qué aporta |
|---|---|---|
| `library/stream-badges.ts` | `core/streams/StreamBadgeRules.kt` | 11 badges auto + reglas regex custom; `normalizeStreamBadgeConfig()` con límite 3 imports; sanitización estricta de URLs/patterns |
| `library/collections.ts` | `domain/model/Collection.kt` | 8 presets curados; `CollectionDefinition` con 9 tipos de fuente; CRUD con límite 64 |
| `library/continue-watching.ts` | `core/tracking/TrackingProgressProjection.kt` | `isCompleted/isInProgress/mergeProgress/nextUp` con thresholds NuvioTV (0.02/0.90) |
| `library/visibility-policy.ts` | `docs/essential-mode.md` §§5–11 | Matriz `essential` vs `advanced` para settings + player controls; `resolveExperienceMode()` |
| `library/tracking.ts` | `core/tracking/*` | Registro de 4 proveedores + `dispatchScrobble()` con Promise.allSettled (aislamiento de fallos) |
| `library/party.ts` | `core/party/*` | `PartyRoom/Member`, `sanitizePartyCreate/Update`, `isPartyExpired/pruneStaleMembers`, TTL/timeouts NuvioTV |
| `routes/collections.ts` | `Collection` | `GET/POST /api/collections`, `GET /api/collections/presets`, `DELETE /api/collections/:id` |
| `routes/stream-badges.ts` | `StreamBadgeConfigServer.kt` | `GET/PUT /api/stream-badges`, `POST/DELETE /api/stream-badges/import`, `GET /api/stream-badges/preview` |
| `routes/party.ts` | `PartyApi` | `GET/POST /api/party`, `GET/PUT /api/party/:id`, `POST /api/party/:id/join|leave`, `DELETE /api/party/:id` |
| `routes/tracking.ts` | `TrackingProvider` | `GET /api/tracking/providers`, `PUT /api/tracking/providers/:id`, `POST /api/tracking/scrobble` |

**Ampliaciones en ficheros existentes:**

- `library/track-prefs.ts` — campo `audioDelayMs` en `TrackPreference` + validación ±60 s.
- `library/stream-labels.ts` — `presentStreams(…, badgeConfig?)` inyecta `behaviorHints.streamBadges` desde `badgesForStream()`.
- `routes/stremio.ts` — pasa `streamBadges` del store a `presentStreams()`.
- `routes/library.ts` — `GET /api/progress/next-up`.
- `model.ts` — `collections`, `streamBadges`, `partyRooms` persistidos en `AppData` + migración en `normalizeData()`/`emptyData()` + imports de tipos.
- `app.ts` — registro de las 4 nuevas familias de rutas.

### 4.2 Web (`apps/web/src`)

| Fichero | Qué aporta |
|---|---|
| `types.ts` | `ExperienceMode`, `SettingsSection`, `PlayerControl`, `CollectionDefinition`, `StreamBadge`, `StreamBadgeConfig`, `TrackingProvider`, `PartyRoom`, `TrackPreference.audioDelayMs` |
| `api.ts` | `collections/collectionPresets/createCollection/deleteCollection`, `streamBadges/saveStreamBadges/badgePreview`, `trackingProviders/setTrackingProvider/trackScrobble`, `partyRooms/createPartyRoom/...`, `nextUp` |
| `store.tsx` | Rutas `collections` + `party` en `Route` |
| `navigation-items.ts` | Entradas `collections` + `party` en el rail |
| `components/SideRail.tsx` | Iconos `collections→discover`, `party→profile` |
| `App.tsx` | `lazy(CollectionsScreen)` + `lazy(PartyScreen)` |
| `screens/Collections.tsx` | Lista de colecciones + 8 presets de un clic + formulario libre |
| `screens/Party.tsx` | Salas con polling 8s, join/leave, creación por `contentId` |
| `screens/Player.tsx` | Estado `audioDelay` por vídeo + `changeAudioDelay()` ±250 ms + UI chips «Audio ±250 ms» + atajo `Shift+G/H` → `audioDelay` |
| `packages/player-core/src/keys.ts` | Nuevo `PlayerAction.audioDelay`; `G/H` con Shift → audio, sin Shift → subtítulos |
| `styles.css` | Estilos para `.collections__*`, `.party__*`, `.stream-badge(s)` |

### 4.3 Tests

Nuevo `apps/server/test/nuvio-comparison.test.ts` — **31 casos**:

- `audioDelay` (4) — rango, recorte, rechazo no-numérico, negativo.
- `stream badges` (5) — HDR/4K/HEVC auto, sin falsos positivos, reglas custom, reglas desactivadas, límite 3, URL inválida.
- `collections` (4) — presets, rechazo título vacío, creación válida, límite 64.
- `visibility policy` (5) — essential oculta debrid/scrapers/plugins/engine/speed, siempre muestra básicos, conteo essential<advanced, fallback a advanced.
- `party` (7) — validación de creación/update, TTL, poda de inactivos.
- `tracking scrobble` (1) — despacho multi-proveedor aislando fallos (mdblist excluido por no scrobble).
- `continue watching` (5) — `isCompleted/isInProgress/nextUp/mergeProgress`.

**Resultado:** `165 pass, 0 fail` (antes 134).

---

## 5. Decisiones y no-objetivos

**Aplicados tal cual NuvioTV:**

- `audioDelayMs` por vídeo (misma semántica que `AudioDelayRouteDataStore`).
- `StreamBadgeRules` con regex + límite 3 imports (mismo `STREAM_BADGE_IMPORT_LIMIT`).
- Matriz de visibilidad Essential/Advanced (mismas secciones ocultas que en `docs/essential-mode.md` §§5–11).
- Thresholds `STARTED 0.02` / `COMPLETED 0.90` y `mergeProgress` con retención local.

**Adaptados (Vibe Flix es servidor + web, no APK):**

- **Colecciones** — Nuvio las resuelve como catálogos addon/tmdb/trakt/company/network; Vibe Flix las persiste y delega la resolución al fan-out existente (no duplica el resolver de TMDB).
- **Party** — Nuvio usa `PartyChannel` + WebSocket; Vibe Flix ofrece REST + polling (la misma API puede evolucionar a WS sin romper contratos).
- **Frame-rate** — La heurística de `FrameRateUtils` (mkv sparse tracks, mp4 peek) es específica de `Media3` + `Display.Mode` en Android; en el navegador las capacidades se declaran en `device.maxFrameRate` y el servidor elige la variante HLS.
- **MDBList library** — Vibe Flix ya tiene `watchlists` por perfil; se añade Trakt/Simkl/MDBList como registro de tracking en lugar de replicar el `MdbListLibraryService` completo (lazy refresh + versioned cache) que solo aplica a la TV.
- **Dolby Vision extractors / GainAudioProcessor / letterbox detection** — exclusivos del pipeline de Media3 Android; en Vibe Flix los maneja el origen HLS y el `preferredCodecs` del dispositivo.

**No se modificó (y por qué):**

- `packages/hls-master`, `addon-engine`, `scrapers`: fuera de scope de esta comparativa; ya cubren HLS/ABR/fan-out.
- `Player.tsx` se tocó mínimamente (audio delay junto a subtitle delay) para no desestabilizar el flujo ABR/buffer/recovery ya consolidado.
- `encoding.ts` ya cubre 10 charsets; portar GB18030/Shift_JIS de Nuvio se deja para una revisión dedicada de subtítulos.

---

## 6. Cómo probar

```bash
npm run typecheck   # 0 errores
npm run build       # 6 paquetes / web chunks OK
npm test            # 165 pass
```

Manual:

1. Ajustes → `uiMode: essential` oculta Debrid/Scrapers/Plugins/Integración/Dispositivo; `advanced` los restaura.
2. Pantalla **Colecciones** → pulsar un preset Marvel/Star Wars → aparece en la lista; crear una personalizada por keyword.
3. Reproducir un vídeo → abrir menú de subtítulos → chips **Audio −250 ms / +250 ms** y atajo `Shift+G/H`.
4. `GET /api/stream-badges/preview?haystack=Movie HDR 2160p HEVC` → `[{hdr},{uhd},{hevc}]`.
5. `POST /api/party` + `POST /api/party/:id/join` → `GET /api/party` lista la sala.
6. `GET /api/tracking/providers` → 4 proveedores; `POST /api/tracking/scrobble` despacha a los conectados.
7. `GET /api/progress/next-up?contentId=tt…&season=1&episode=1` → `isCurrentCompleted`.

---

## 7. Siguientes pasos sugeridos

- [ ] Portar `SubtitleCharsetDetector` restante (GB18030, Shift_JIS, double-encoded repair) a `player-core/encoding.ts`.
- [ ] Resolver colecciones contra catálogos instalados (actualmente solo persistencia + acceso directo por `sourceId`).
- [ ] Evolucionar Party de REST polling a WebSocket (`PartyChannel`).
- [ ] Añadir `customRenderer` parity completo para Dolby Vision hints ya presentes en `MasterInfo.variants[].videoRange`.
- [ ] UI de badges en la lista de streams del `Detail` (exponer `behaviorHints.streamBadges` como chips).
