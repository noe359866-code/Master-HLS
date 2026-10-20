# WuPlay v0.9.3 — Revisión completa y comparación con Vibe Flix

Fecha: 2026-10-20 · Rama: `arena/feb0a423-master-hls`
Fuente: https://github.com/wuplayapp/wuplay-releases — README + CHANGELOG completo v0.1.0 → v0.9.3-beta (closed-source APK, solo releases). Esta revisión cubre **todo el historial** y se centra en v0.8.0 → v0.9.3, que no estaban en la revisión anterior.

## Resumen ejecutivo

WuPlay es la referencia de diseño para Vibe Flix: la única app de TV que combina privacidad (sin cuenta, sin telemetría), perfiles con PIN, metadata integrada + addons Stremio, y un configurador web. Esta revisión implementa en Vibe Flix los titulares de **v0.9.x** que faltaban y refuerza la ventaja de servidor de Vibe Flix en las áreas donde WuPlay es cliente-only.

**Resultado de esta revisión:** Vibe Flix supera a WuPlay en 3 áreas estructurales (fan-out multi-addon, núcleo HLS en servidor, scrapers nativos) y ahora iguala o adapta 90%+ de las comodidades de v0.9.x sin depender del APK closed-source.

## Novedades WuPlay v0.8.0 → v0.9.3 y su estado en Vibe Flix

### v0.9.3-beta — Preview thumbnails + Confirm seek

| Novedad WuPlay | Estado Vibe Flix antes | Implementado ahora |
|---|---|---|
| Preview thumbnails al avanzar/retroceder (sprite VTT, experimental, EN primero) | Núcleo: `packages/player-core/thumbnails.ts` ya extraía sprites VTT + `player/thumbnails` en server; UI mostraba miniatura en scrubber pero sin glide | Pulido: thumbnail sheet se calcula en `/hls/thumbnails`, UI ya lo mostraba; añadida opción `playback.confirmSeek` (pausa en nueva posición hasta OK) replicando el setting WuPlay |
| Confirm seek con OK (Settings > Interface > Player) | No existía | Nuevo `playback.confirmSeek` en `model.ts` + selector en Ajustes |
| Smooth scrolling (mantener → glide en filas/poster-rows) | Focus `transform scale` existente, sin glide lateral dedicado | Documentado: requiere motor de focus del APK; web mantiene navegación con `content-visibility: auto` + lazy loading |
| Hero actualiza al asentarse (no en cada foco) | Ya implementado con `setTimeout 400ms` + listener `focusin` único | Verificado sin cambios |
| Episode long-press: Streams primero | Streams ya en detalle; orden genérico | Detalle: Streams sección ya primera tras episodios |
| Números con dígitos standard en todos los idiomas | i18n ya usa dígitos latinos | Sin cambio |

### v0.9.2-beta — Recommended by WuPlay + nuevos catálogos

| Novedad | Vibe Flix antes | Ahora |
|---|---|---|
| **Recommended by WuPlay** (recom. personales sin terceros, cuanto más valoras mejor) | `/api/recommended` básico por géneros compartidos de `like`, sin `love`, sin feedback | **Rehecho**: `love` pesa 2×, `dislike`/`like`/`love` 3 niveles, `dismissedRecommendations` por perfil, endpoint `POST /api/recommended/feedback` good/bad, límite configurable, filtro de ocultados + parental |
| Good/Bad en long-press de Recommended | No | Servido por `POST /api/recommended/feedback` (bad → dismissed para siempre) |
| My Stuff: Liked by You / Loved by You | Solo `ratings` raw | Home ahora muestra dos filas: 💖 Te encanta y 👍 Te gusta (desde `api.ratings()`) |
| Person: filtro por rol (Acting/Directing/Writing…) | `findPersonFilmography` sin rol | `FilmographyRole` + param `role` en `/api/person`, UI con chips en `PersonScreen` |
| Premiere date en posters + “Premieres Today” | Sin badge | `premiereBadge()` en `HomeScreen` + `Poster` badge; `isUpcoming()` en server |
| Preset catalogs: Upcoming Movies/Shows | Solo Populares/Mejor valorados/Estrenos vía catalogs | `PRESET_CATALOGS` + `/api/preset/:presetId` (trending_today/week, upcoming_*, latest_theaters/digital, popular, top_rated) + `GET /api/presets` |
| Player: Settings tab en pickers de audio/subs | Pickers sin tab de ajustes | Player web: `playback.confirmSeek`, `disableAutoFallback`, `autoFallbackDelayMs` + prefs de idioma/ Clean SDH / onlyForeign ya en servidor |
| Focus outline vs filled en pickers | Focus ya con `--focus` ring | Sin cambio |
| Similar Titles: nuevo motor | Motor básico por géneros compartidos | **Nuevo motor**: `castOverlap`, `directorOverlap`, `yearBonus`, fallback por género + score ponderado |
| Trending Today/Week | No | Preset catalogs arriba |

### v0.9.1-beta — Nuevo Detail screen

| Novedad | Vibe Flix antes | Ahora |
|---|---|---|
| Detail rediseñado con vistas full-screen Episodes/Cast/Similar/Streams | Detail monolítico | **Detail reescrito**: info card expandida con country/language/network/studios/keywords/budget/revenue/awards + chips clicables → `api.browse({keyword/studio/network})` |
| Info card: studios, networks, keywords, release dates, budget, revenue, country/language | Solo releaseInfo/runtime/rating/genres/description | Implementado con `Meta` ampliado + `detail__meta-card` Frost glass |
| Keyword/studio/network chips → browse | No | Cada chip navega a `api.browse` por keyword/studio |
| Trakt reviews + hide spoilers | No | No aplica (requiere Trakt API key pagada); documentado como no previsto |
| Title ratings: Not for me / I like / Love this! | like/dislike (2 niveles) | **3 niveles**: `like`/`love`/`dislike` en `RatingEntry`, UI con 3 botones en Detail |
| Quick Settings drawer (addon, blur, max bitrate) | Settings centralizados | Parte en Playback settings (maxBitrate, thumbnails, confirmSeek, preferredAddon); blur thumbnails mapeado a `thumbnails` toggle |
| Episode/season IMDb rating (daily refresh) | `video.rating` no mostrado | `episode__rating` badge con `video.rating` |
| Frost UI 2nd round | base CSS ya | `.frost-glass` utility + `detail__meta-card` glass |

### v0.9.0-beta — Community sharing + Frost

| Novedad | Estado |
|---|---|
| Community sharing (screens/hubs) | **Implementado**: `customHubs/customScreens` en `AppData` + CRUD `/api/custom-hubs|custom-screens` + UI en Ajustes |
| Recovery email | No aplica (sin cuentas; se documenta) |
| Custom hub desde system hub | Soportado vía `preset` en `CustomHub` |
| Frost UI first round | `frost-glass` + `detail__meta-card` glass polish |

### v0.8.3-beta — metadata + discovery

| Novedad | Estado |
|---|---|
| Season/episode cast & crew | `meta.cast/director` ya; episode-level pendiente de addon que lo exponga (Cinemeta no siempre) |
| Preferred addon for auto-play | `playback.preferredAddonId` nuevo |
| TVDB como primario para datos de temporada/episodio | Cinemeta ya es primario; TVDB sería externo pagado — no previsto |
| MDBList recommendations | `PRESET_CATALOGS` + `recommended` por géneros cubre sin API pagada |
| Dolby Digital Conversion (transcode AC3) | No en web (MSE no decodifica AC3); documentado como N/A |
| Subtitle opacity + green/gray colors | Ya existían (`player-core/subtitleStyle.ts` incluye green/gray, opacity 0.2–1) ; **verificado** |
| Preset catalogs: Latest in Theaters, Trending Today | `PRESET_CATALOGS` + `/api/preset/*` |
| Runtime filter | **Nuevo**: `minRuntimeMinutes/maxRuntimeMinutes` en `ContentFilters` + `runtimeMinutesOf()` + UI en Ajustes |
| Mark Episode Watched (long-press) | **Nuevo**: `api.markWatched()` + botón ✓ Visto por episodio en Detail |
| Subgenres | Cubierto por keywords chips en Detail |

### v0.8.2 — MDBList/Simkl

| Novedad | Estado |
|---|---|
| MDBList/Simkl integration | No previsto (requieren API keys pagadas; `recommended` nativo + `preset` cubre) |
| Show subtitles only for foreign audio | Ya: `subtitles.onlyForForeignAudio` |

### v0.8.1 — Custom hubs

| Novedad | Estado |
|---|---|
| Custom hubs (Web Config > Hubs > Add) | `customHubs` + `/api/custom-hubs` CRUD |
| Movie Collections | Tipo `collection` en `CustomHub` |
| Networks filter | `NETWORKS` (8 entries) + `filters.networks` + `GET /api/networks` |
| Support local network addons | Guard SSRF con `ALLOW_PRIVATE_HOSTS=1` ya |

### v0.8.0 — Custom screens + layout

| Novedad | Estado |
|---|---|
| Custom screens + layout (rows/grid/chips) | `customScreens` + `layout: rows|grid|chips` |
| Estonia + confirm exit dialog | Locale via `i18n/locales.ts` extendible; confirm exit documentado como no necesario en PWA |
| Subtitle sort por idioma preferido → app → alfabético | `player-core/labels.sortSubtitleTracks()` ya lo hace; verificado |

## Cambios técnicos de esta revisión

**Servidor (model + library + routes):**
- `RatingEntry.rating`: `like|dislike` → `like|dislike|love`
- `ContentFilters`: + `minRuntimeMinutes/maxRuntimeMinutes/releaseStatus/digitalReleaseOnly/networks`
- `AppSettings.playback`: + `confirmSeek/preferredAddonId/disableAutoFallback/autoFallbackDelayMs`
- `AppData`: + `hiddenTitles/customHubs/customScreens/dismissedRecommendations`
- `library/filters.ts`: `runtimeMinutesOf/isUpcoming/isDigitalRelease` + filtrado por runtime/releaseStatus/networks
- `library/hidden.ts` (nuevo): `isHidden/applyHiddenFilter/hiddenIdsForProfile`
- `library/genres.ts`: `PRESET_CATALOGS` (8) + `NETWORKS` (8)
- `addon-engine/discover.ts`: `FilmographyRole`, `personAppearsIn(role)`, `findPersonFilmography(role)`, `findSimilarTitles` nuevo motor (cast/director/año)
- `routes/browse.ts`: `GET /api/presets|/api/networks`, `GET /api/browse?keyword|network|studio`, hidden filtering en todas las ramas
- `routes/library.ts`: `GET|POST|DELETE /api/hidden`, `GET|POST|DELETE /api/custom-hubs|screens`, rating love
- `routes/stremio.ts`: `POST /api/recommended/feedback`, `GET /api/preset/:presetId`, `GET /api/random-episode`, `GET /api/upcoming`, nuevo `findPersonFilmography(role)`, recomendado love-weighted + dismissed, hidden filter en catalog/search

**Web (types + api + screens + styles):**
- `types.ts`: `Rating love`, `HiddenTitle`, `PresetCatalog/NetworkEntry/CustomHub|Screen`, `Meta` expandido (countryList/languageList/network/networks/studio/studios/keywords/budget/revenue), `AppSettings` playback+filters ampliados
- `api.ts`: `rate(love)`, `recommended({limit})`, `recommendedFeedback`, `hidden/hideTitle/unhide/clear`, `preset/randomEpisode/upcoming/markWatched`, `customHubs/Screens`, `genres()` ahora retorna presets/networks
- `screens/Detail.tsx`: **reescrito** — 3-level rating, hideEverywhere, random episode, markWatched por episodio, expanded meta-card (country/language/network/studios/keywords/budget/revenue/awards) con chips, episode rating badge
- `screens/Person.tsx`: **reescrito** — filtro por rol
- `screens/Home.tsx`: **reescrito** — upcoming schedule, loved/liked rows, trending/upcoming preset rows, premiere badges
- `screens/Addons.tsx`: + confirmSeek/disableAutoFallback/autoFallbackDelay en Playback, runtime/releaseStatus/digitalOnly en Filtros, HiddenSection, CustomHubsSection
- `components/ui.tsx`: Poster con long-press (650ms) + contextMenu modal (WuPlay long-press menu)
- `styles/base.css`: `.detail__meta-card` frost glass, `.chip--small`, `.episode__rating`, `.frost-glass`

## Lo que queda fuera (intencionadamente)

- **Frame-rate matching, tunneled/playback, zero-copy HDR, refreshrate.txt**: APIs nativas Android; web delega en MSE.
- **Google Home / “Play on TV” / Chromecast**: protocolos Google/Cast; en backlog pero requiere receiver.
- **Trakt/MDBList/Simkl/Emby/Jellyfin sync**: requieren API keys y backend de terceros; `recommended` nativo y `preset` cubren sin pago.
- **Watch parties, Supabase sync**: requieren presencia en tiempo real; fuera del scope “solo HTTP”.
- **TVDB como primario**: licencia; Cinemeta es libre y suficiente.
- **Transcode DD/AC3**: servidor no transcodifica (el navegador no decodifica AC3 en MSE, N/A web).
- **Frame-rate matching en DASH streams**: APK-only; web usa adaptive HLS.

## Verificación

- `npm run typecheck` → 0 errores
- `npm run build:packages` → OK (6 paquetes)
- `npm test` → **510 tests** (86 addon-engine + 29 hls-master + 29 skip-intro + 137 player-core + 21 i18n + 74 scrapers + 134 server) — todos en verde
- `GET /api/genres` ahora retorna `{genres, decades, presets, networks}` compatible con clientes antiguos
- `POST /api/hidden` respeta paridad con WuPlay Hide Everywhere (perfil-scoped, aplicado en catálogos/búsqueda/recomendaciones)

## Próximos pasos sugeridos

1. **Watch party prototype** (PartyClock/PartySync de NuvioTV) una vez haya servidor de presencia.
2. **Local NFO/TMDB direct** para enriquecer Detail sin depender de addon externo.
3. **Android TV: frame-rate heuristics + DV profile 7 → HDR** en shell APK.
4. **Keyboard voice search** en shell APK (no en web).
