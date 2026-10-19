# Investigación de proveedores de StreamFlix Reborn → Vibe Flix

Corte del repositorio solicitado: [`streamflix-reborn2/streamflix` `main` @ `6dca4ea4ce77a817eb28c332a9c3cfd4d406c7e5`](https://git.gay/streamflix-reborn2/streamflix/commit/6dca4ea4ce77a817eb28c332a9c3cfd4d406c7e5) (14 de octubre de 2026). Fuentes primarias: [carpeta `providers/`](https://git.gay/streamflix-reborn2/streamflix/src/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers), [registro `Provider.kt`](https://git.gay/streamflix-reborn2/streamflix/raw/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/Provider.kt) y los archivos Kotlin individuales. El inventario estructurado, con URL de cada archivo, está en [`upstream-catalog.ts`](../packages/scrapers/src/providers/upstream-catalog.ts) y se puede consultar en `GET /api/scrapers/upstream`.

**Qué cuenta y qué no:** hay **76 archivos `*Provider.kt`**, más `Provider.kt` (interfaz/registro, no una fuente). **66 archivos** tienen instancia en el registro: **51 VOD** y **15 IPTV**; **10** archivos no tienen instancia registrada. El mapa registra **72 instancias** porque `StreamingCommunity` se instancia en **it/en** y `Vavoo` IPTV en **de/it/fr/es/pl/en**. La suma de filas por idioma repite estas instancias: no son 72 sitios distintos. `ProviderSupport(tvShows=true)` en un canal de IPTV *no significa* que sirva episodios VOD. `TmdbProvider.kt` es un auxiliar de catálogos/extractores, no una instancia propia del registro. Una carpeta o un fork no prueba disponibilidad en la app.

Los códigos describen el **idioma declarado por el catálogo Kotlin** o la región de su instancia, *no* la pista de audio ni los derechos del vídeo. En PlutoMx/Ar/Es el código Kotlin es `es`, y la región la aporta la playlist; en `Vavoo` y `StreamingCommunity` la instancia lleva su idioma. `es-419` y `es-ES` del perfil admiten fuentes declaradas `es`; los grupos de doblaje se discriminan cuando el sitio aporta etiquetas. Las lenguas del proyecto se concentran en **es, en, de, fr, it, pl**. `TmdbProvider` puede instanciarse con distintos idiomas, pero eso no lo convierte en una fuente VOD lista aquí.

Leyenda: **P** = películas, **S** = series/episodios, **A** = catálogo especializado en anime, **D** = doramas; **✓** = adaptador VOD portado a Vibe Flix y probado con respuestas simuladas (solo parte del flujo si lleva `*`), *no* reproducción verificada en vivo. Se muestran los nombres de los archivos Kotlin sin el sufijo `Provider.kt`; estas referencias son investigación/ajustes avanzados, **no** etiquetas visibles de los streams.

## VOD registrado upstream — 51 archivos, 52 instancias

| Idioma | Proveedores y alcance según `ProviderSupport` | Instancias |
| --- | --- | ---: |
| **Español (`es`)** | Fanpelis **P/S ✓**; PoseidonHD2 **P/S**; CuevanaEu **P/S**; Latanime **P/S/A**; Doramasflix **P/S/D ✓**; CineCalidad **P/S**; SeriesFlix **S**; SeriesTurcas **S** (series turcas, no doramas coreanos); FlixLatam **P/S**; LaCartoons **S** (animación, no necesariamente anime); Animefenix **S/A**; AnimeFlv **S/A**; JKAnime **P/S/A**; TioAnime **P/S/A ✓**; AnimeAv1 **S/A**; AnimeOnlineNinja **P/S/A**; SoloLatino **P/S**; Cine24h **P/S**; Pelisplusto **P/S**; PelisflixHd **P/S**; CineHax **P/S ✓** | 21 |
| **Inglés (`en`)** | Sflix **P/S**; StreamingCommunity **P/S** (instancia `en`); Mkissa **P/S/A**; Ridomovies **P/S ✓**; Anikoto **P/S/A**; NetPrime **P/S** (agrega extractores TMDb) | 6 |
| **Alemán (`de`)** | SerienStream **S**; AniWorld **S/A**; MStream **P/S ✓** (nombre visible del sitio: Moflix); FilmPalast **P/S**; Einschalten **P**; KellerKino **P**; KinoGer **P/S**; HDFilme **P/S**; MEGAKino **P/S** | 9 |
| **Francés (`fr`)** | Wiflix **P/S**; FrenchAnime **P/S/A**; FrenchStream **P/S**; Frembed **P/S ✓**; Kidraz **P**; FrenchManga **S/A** | 6 |
| **Italiano (`it`)** | StreamingCommunity **P/S** (instancia `it`, mismo archivo que arriba); AnimeWorld **P/S/A**; Altadefinizione01 **P/S**; GuardaFlix **P ✓**; CB01 **P/S**; AnimeUnity **P/S/A**; AnimeSaturn **S/A**; GuardaSerie **P/S** | 8 |
| **Polaco (`pl`)** | FilmyOnlineCc **P/S**; Zaluknij **P/S ✓*** | 2 |

`P/S` refleja las banderas del mapa Kotlin, no una prueba de que *todos* sus títulos o episodios carguen. La especialización A/D describe la temática del sitio; un anime o dorama de otro catálogo puede resolverse por un proveedor genérico solo si el título/episodio realmente coincide.

## IPTV registrado upstream — 15 archivos, 20 instancias **en vivo**

| Idioma/playlist | Archivos/instancias IPTV | Instancias |
| --- | --- | ---: |
| `es` | CableVisionHD, TvporinternetHD, IptvSpain, TvLibrefutbol, PelotaLibreTvHd, CineCity (MAGISTV), PlutoTvMx (`es-MX`), PlutoTvAr (`es-AR`), PlutoTvEs (`es-ES`), Vavoo (`es`) | 10 |
| `en` | IptvOrg (lista mundial), PlutoTvUs (`en-US`), Vavoo (`en`) | 3 |
| `de` | PlutoTvDe, Vavoo (`de`) | 2 |
| `fr` | PlutoTvFr, Vavoo (`fr`) | 2 |
| `it` | PlutoTvIt, Vavoo (`it`) | 2 |
| `pl` | Vavoo (`pl`) | 1 |

Todos son canales/señales, no fuentes de la temporada/episodio de una obra solicitada. **Ninguno** se registra en el addon VOD de Vibe Flix. En particular [`PlutoTvEsProvider.kt`](https://git.gay/streamflix-reborn2/streamflix/raw/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/PlutoTvEsProvider.kt), [`VavooProvider.kt`](https://git.gay/streamflix-reborn2/streamflix/raw/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/VavooProvider.kt) y [`IptvOrgProvider.kt`](https://git.gay/streamflix-reborn2/streamflix/raw/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/IptvOrgProvider.kt) usan el contrato `IptvProvider` y presentan *canales* como `TvShow` por compatibilidad de la interfaz Kotlin.

## Archivos sin instancia en `Provider.kt` — 10 referencias, **no activas**

| Idioma declarado | Archivos |
| --- | --- |
| `es` | AnimeBum (anime) |
| `en` | AnyMovie, HiAnime (anime), SuperStream |
| `fr` | AfterDark, Otakufr (anime), UnJourUnFilm (1Jour1Film) |
| `it` | StreamingIta |
| Múltiples | Tmdb (auxiliar de metadatos y extractores instanciado por otros); VavooVod (clase con variantes `de/it/fr/es/pl/en`, **no** figura en el mapa VOD activo) |

La ausencia en el registro no niega que el código exista; tampoco permite declarar esas fuentes disponibles en Vibe Flix. Los repositorios GitHub relacionados consultados durante el análisis contienen listas distintas: **no** se han fusionado sus proveedores con este inventario del repositorio solicitado.

## Estado **real** del addon nativo Vibe Flix

El addon se llama **Vibe Flix** (`com.vibeflix.native-scrapers`). `DEFAULT_PROVIDERS` registra **nueve** adaptadores VOD upstream (uno por cada idioma upstream; cuatro en español) y un proveedor propio de respaldo:

| Adaptador portado | Ruta de resolución | Restricción explícita |
| --- | --- | --- |
| [CineHax](https://git.gay/streamflix-reborn2/streamflix/raw/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/CineHaxProvider.kt) `es`, P/S | ID TMDb o búsqueda WP AJAX con nonce → `/f/embed/movie/{id}` o `/tv/{id}/{S}/{E}` → `finalizePlayer` → MP4 de remux o extracción de embed. Preferencia LAT para español latino, CAST para España. | Ignora grupo SUB como audio español; no promete que todos los hosters sirvan enlaces directos. |
| [Fanpelis](https://git.gay/streamflix-reborn2/streamflix/raw/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/FanpelisProvider.kt) `es`, P/S | REST `search` → ID numérico de publicación → `episodes` por S/E exactos → `player` → enlace directo o embed resoluble. | Filtro conservador de título/año y etiquetas de audio explícitas no españolas; audio sin etiqueta sigue sin garantía. |
| [Doramasflix](https://git.gay/streamflix-reborn2/streamflix/raw/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/DoramasflixProvider.kt) `es`, P/D | GraphQL `searchAll` → ficha `__NEXT_DATA__` → GraphQL `listEpisodes` de la temporada → slug del episodio → `links_online`; decodificación fkplayer cuando se puede. | CAST/LAT priorizados; SUB/POR/ENG descartados. Depende de API GraphQL, token/hoster y metadata que identifique el dorama. |
| [TioAnime](https://git.gay/streamflix-reborn2/streamflix/raw/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/TioAnimeProvider.kt) `es`, P/A | `/directorio` → ficha `/anime/{slug}` → lista `var episodes` → `/ver/{slug}-{n}` → `var videos`; solo enlaces extraíbles. | Un único bloque de episodios mapeado a temporada **1**; no inventa temporadas ni devuelve iframe como vídeo. |
| [Frembed](https://git.gay/streamflix-reborn2/streamflix/raw/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/FrembedProvider.kt) `fr`, P/S | `/api/domain` (dominio restringido) → ID TMDb o `/api/public/search` → `/api/films` o `/api/series` → links VF. | Excluye VO/VOSTFR como doblaje; no implementa todos los extractores/redirecciones especiales de Kotlin. |
| [Ridomovies](https://git.gay/streamflix-reborn2/streamflix/raw/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/RidomoviesProvider.kt) `en`, P/S | `/api/search` → ficha de película o episodio exacto → iframe escapado en `data-embed` → enlace multimedia extraíble. | Verifica título/año y enlace de episodio; hosters que requieran extractores JS ajenos al port devuelven cero fuentes. Audio inglés no garantizado. |
| [MStream](https://git.gay/streamflix-reborn2/streamflix/raw/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/MStreamProvider.kt) `de`, P/S | Estado `window.bootstrapData` de búsqueda → ID de título/vídeo → `/api/v1/watch` o temporada/episodio exactos → enlace directo/extraíble. | Omite premium; no resuelve toda la API de `playback_resolve_url`; audio alemán no garantizado. |
| [GuardaFlix](https://git.gay/streamflix-reborn2/streamflix/raw/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/GuardaFlixProvider.kt) `it`, P | Búsqueda `?s=` → ficha → `#aa-options` → iframe dentro del wrapper `.Video` → enlace multimedia. | Solo películas, como en upstream; no se usan los tráileres como fuentes. |
| [Zaluknij](https://git.gay/streamflix-reborn2/streamflix/raw/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers/ZaluknijProvider.kt) `pl`, P (port parcial) | `/wyszukiwarka` → ficha → `#link-list` → iframe base64 o enlace → vídeo extraíble. | **Solo películas** en este port: faltan temporadas/episodios y el WebView para superar antibot del upstream; en esos casos devuelve vacío. |
| Internet Archive (no es de StreamFlix) | API pública, búsqueda por título → metadatos → archivo de vídeo. | Respaldo sin idioma de audio declarado; archivo de dominio público no significa doblaje garantizado. |

La app pide nombre/idioma **al entrar a un perfil sin preferencia**, persiste `contentLanguage` con listas, historial y progreso en el JSON del servidor y filtra por idioma/tipo antes de consultar. Coincidencia exacta de idioma/región → base → otra región → fuente sin idioma; anime/dorama especializados antes del catálogo genérico cuando hay resultados. El nombre público de cada stream es **solo el título y, si aplica, `Tn Em`**. La caché agregada se separa por perfil e idioma y se invalida con los cambios. Los addons externos siguen siendo alternativas si no se puede verificar su idioma. **Elegir un idioma no crea contenido nuevo**: hay al menos un port específico para `es/en/de/fr/it/pl`, pero italiano y polaco solo tienen películas en esta versión; el port polaco no evita los desafíos antibot. Archive u otras fuentes añadidas pueden servir como respaldo, sin garantía de idioma de audio.

**Nivel de validación:** compilación TypeScript y pruebas unitarias/de integración con HTTP **simulado** (incluidos cambio de idioma, episodio exacto, doblaje filtrado y etiquetas sin proveedor). **42 de los 51 archivos VOD registrados aún no están portados; el port polaco también es parcial.** **No** se pudo hacer petición real a los hosters ni reproducir sus vídeos desde este entorno; dominios, antibots, derechos, CORS, enlaces caducados y compatibilidad del reproductor pueden impedir resultados. Tampoco se compiló la app Android aquí (no hay Gradle/`gradlew`). Cada adaptador puede devolver cero fuentes; no se declara cobertura universal ni equivalencia con todos los extractores de upstream. El código del proyecto de referencia está bajo [Apache-2.0](https://git.gay/streamflix-reborn2/streamflix/raw/branch/main/LICENSE); el contenido de terceros tiene licencias/derechos independientes y solo debe usarse cuando se tenga autorización.

Para comprobar en una instalación propia: `GET /api/scrapers` muestra **solo** adaptadores implementados y su campo `liveVerified: false`; `GET /api/scrapers/upstream` devuelve el inventario de referencia; `POST /api/scrapers/test` acepta `providerId`, `title`, `type`, `id`/`tmdbId`, `season`, `episode` y `language` para diagnosticar una fuente concreta. Los datos internos de esa API avanzada no se muestran como nombre de stream. Ejecuta `npm run typecheck && npm test && npm run build:web` antes de desplegar.
