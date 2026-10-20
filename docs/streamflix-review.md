# StreamFlix Reborn vs Vibe Flix — Revisión profunda y mejoras aplicadas

**Fecha:** 2026-10-20 · Rama: `arena/feb0a423-master-hls`
**Fuente:** https://git.gay/streamflix-reborn2/streamflix (Kotlin/Android, Apache-2.0, 2746 commits, 21 MiB, `main@f4aca867` 19 oct 2026) — leída vía Forgejo API (Forgejo 17.0.0-dotgay)
**Objetivo:** Leer StreamFlix a fondo — en especial su **addon nativo / scraper** (providers + extractors + embeds) — comparar con Vibe Flix (Master-HLS) y mejorar Vibe Flix sin regressions.

> Complementa `docs/wuplay-v093-review.md` (WuPlay, producto) y `docs/nuvio-review.md` (NuvioTV, arquitectura Android TV). StreamFlix es la referencia de **scraping real** de sitios VOD.

---

## 1. Qué se leyó de StreamFlix

| Área | Artefacto | Takeaway |
|---|---|---|
| Providers | `app/src/main/java/com/streamflixreborn/streamflix/providers/` — ~40+ VOD registrados + 15 IPTV + 20+ referencias no registradas. Cada `Provider.kt` trae `name`, `defaultPortalUrl`/`portalUrl`, `defaultBaseUrl`/`baseUrl`, `language`, `logo`, `changeUrlMutex`, `Provider`+`ProviderPortalUrl`/`ProviderConfigUrl`. Flujo: `getHome()->List<Category>`, `search()`, `getMovies/TvShows`, `getGenre`, `getMovie/getTvShow/getEpisodes`, `loadLinks()->List<Video>` → extractors. |
| Extractors | `app/src/main/java/com/streamflixreborn/streamflix/extractors/` — 80+ `*Extractor.kt` (AfterDarkExtractor 7.9k, ChillxExtractor 3.1k + subclasses Jean/Moviesapi, AmazonDrive, BigWarp, Closeload 7.5k, etc.). Patrón: `open class Extractor { name, mainUrl, extract(link: String): Video }` → `Video(source, subtitles, headers)`. |
| Embeds/utils | `utils/AesHelper.kt` (AES/CBC/PKCS5PADDING + MD5 KDF, port de CloudStream, usa `CryptoJS`-style JSON `{ct,iv,s}`), `utils/AADecoder.java` (AAEncode), `retrofit-jsoup-converter/`, `utils/DnsResolver` (DoH), `utils/Keys` (NDK XOR obfuscation via `native-lib.cpp.template` con `XorString<Size,__COUNTER__>` + 4 JNI `nativeGetUprot*`), `utils/TMDb3` |
| Nativo C++ | `app/src/main/cpp/native-lib.cpp.template` — `PRNG<N>::seed=(1013904223+N*1664525)^0x5A5A5A5A`, `XorString._key=PRNG::value==0?0xAB:value`, `toJString()` alloca, XOR decode, `NewStringUTF`, `memset` clear. |
| App | `StreamFlixApp.kt`, `activities/`, `adapters/`, `database/` (Room), `backup/`, `sync/` (Supabase, `SUPABASE_PROFILE_MERGE_GUIDE.md`), `models/` (Category/Movie/TvShow/Season/Episode/Video/People/Genre), `fragments/`, `ui/`, `mobile/`/`tv/` |
| Inventario | `packages/scrapers/src/providers/upstream-catalog.ts` ya reflejaba StreamFlix hasta `6dca4ea4` (14 oct 2026); ahora actualizado a `f4aca867` (19 oct 2026). |

**Proveedores leídos en detalle:** `AfterDarkProvider.kt` (TMDB discovery + AfterDark API, featured carousels, TMDB proxies), `ChillxExtractor.kt` (HTML `'encrypted'`, `AesHelper.cryptoAESHandler(content, key)` → `file`/`subtitles`), `PelisplustoProvider.kt` (TioPlus/`tioplus.app`, DnsResolver.doh, Retrofit Jsoup, Category Featured + Movies/Series/Animes + genres), `native-lib.cpp.template` (NDK XOR), `AesHelper.kt` (MD5 EVPKDF).

---

## 2. Matriz comparativa — scrapers / addon nativo

| Capacidad | StreamFlix | Vibe Flix antes | Vibe Flix ahora |
|---|---|---|---|
| **Arquitectura** | Kotlin providers (client-side) + extractors + Retrofit/Jsoup/OkHttp/Cronet + Room + Supabase sync | `packages/scrapers`: declarativo + `ScraperRegistry` + `NativeScrapersAddon` como `AddonSource` (mismo fan-out que addons), SSRF-guard, cache, `ProviderConfig` configurable sin código | **Paridad estructural mantenida; añadida capa de overrides de URLs + helpers cripto** |
| **Providers código** | 40+ VOD registrados (ES: Fanpelis/Cuevana/CineHax/Poseidon/Cine24h/CineCalidad/SeriesFlix/LaCartoons/AnimeFlv/JKAnime/TioAnime/AnimeAv1/SoloLatino/Pelisplusto; EN: Sflix/Mkissa/Ridomovies/Anikoto; DE: AniWorld/SerienStream/MStream/FilmPalast/KinoGer/HDFilme; FR: Wiflix/FrenchStream/Frembed/Kidraz; IT: AnimeWorld/Altadefinizione01/CB01/GuardaFlix/AnimeUnity/GuardaSerie; PL: FilmyOnlineCc/Zaluknij) + IPTV (CableVision/IptvOrg/PlutoTv* variants) | 10 nativos: `archive`, `cinehax`, `fanpelis`, `doramasflix`, `tioanime`, `frembed`, `ridomovies`, `mstream`, `guardaflix`, `zaluknij` | **10 + capacidad de mirrors vía overrides; inventario upstream actualizado a `f4aca867`; gap documentado como intencional (fragilidad upstream, no reproducir IPTV)** |
| **Extractores / embeds** | 80+ host extractors; reutilizan `scrapers/embeds/*` pattern: explicit player objects (`hls/file/url/source`), packer `eval(function(p,a,c,k,e,d))`, `<video>`/m3u8/mp4 literals | `packages/scrapers/src/embed.ts`: 9 `EXPLICIT_PATTERNS`, `unpackPacker()` (Dean Edwards, never execute), `unbase()` base-62, `extractStreams()` + `resolveEmbed()` | **+ `extractSubtitlesFromJson()` + `EmbedResult` con `subtitles`; documentado que AES-encrypted embeds pasan por nuevo `crypto.ts`** |
| **Cifrado** | `AesHelper.kt`: AES/CBC/PKCS5PADDING, MD5 KDF `generateKeyAndIv(pass,salt,ivLen,saltLen)`, JSON `{ct:base64, iv:hex, s:hex}`, `Keys` via NDK XOR (4 Uprot keys) | Sin soporte AES; sólo regex/packer | **+ `packages/scrapers/src/crypto.ts`**: port fiel de `AesHelper.cryptoAESHandler` + `generateKeyAndIv` + `hexToBytes` con Node `crypto` (createHash/createCipheriv), `decryptChillxPayload()` helper |
| **Overrides de URLs** | `ProviderPortalUrl`/`ProviderConfigUrl` + `changeUrlMutex` + `UserPreferences.getProviderCache()` → mirrors sin redeploy | URLs hardcodeadas en cada provider | **+ `packages/scrapers/src/provider-urls.ts` (`resolveProviderUrls`/`sanitizeProviderUrlEntry`) + `AppData.providerUrls` + `GET/PUT /api/scrapers/provider-urls` + live `ScrapeContext.providerUrls` sync en `app.ts`** |
| **Idioma/región** | Cada provider declara `language` (es/en/de/fr/it/pl + tags `es-MX` etc.), `Provider.languages`; `Category` sin implicar audio | `packages/scrapers/src/language.ts`: `normalizeLanguage()`, `languagePriority(exact 4 > base 3 > same-family 2 > none 1 > mismatch -1)`; `ScraperRegistry` ordena por `language*10+kind` y preserva fallbacks | **Sin cambio (ya superior: no excluye, reordena; mantiene alternativas para `swapAudioCodec`/`autoFallback`)** |
| **Paralelo + timeout** | Providers en `coroutineScope { async {}` } con per-provider try/catch | `ScraperRegistry.resolve()`: todos en paralelo, `withTimeout(12s)`, `Promise.allSettled`-style, `mergeSources()` dedup por URL + `QUALITY_RANK` | **Sin cambio** |
| **Calidad / subtítulos** | Provider-specific; extractors a veces devuelven `Video.Subtitle` junto a `source` | `ScrapedSource{url,provider,quality,label,size,headers,subtitles,infoHash}` → `toStremioStream()` | **Extendido: `embed.ts` ahora expone `EmbedSubtitle`/`EmbedResult` para que providers que desencripten puedan poblar `subtitles`** |
| **Inventario / transparencia** | Repo público en git.gay, 2746 commits, `LICENSE` Apache-2.0 | `STREAMFLIX_PROVIDER_CATALOG` (vod/iptv/unregistered con `nativeId` solo si port existe), `GET /api/scrapers/upstream` con commit + counts + note | **Commit actualizado a `f4aca867` (19 oct 2026); `/api/scrapers/upstream` ya expone nota \"Idioma del catálogo, no garantía de audio\"** |
| **DNS / SSRF** | `DnsResolver` (DoH) para bypass bloqueos; `OkHttp` con custom DNS | `packages/scrapers/src/ssrf.ts`: `createGuardedFetch()` (bloquea loopback/privadas/CGNAT/link-local/multicast/reservadas, DNS multi-IP check, redirect chain limit) | **Sin cambio (ya más estricto que StreamFlix; `allowPrivate` opt-in para LAN de confianza)** |
| **NDK secrets** | `native-lib.cpp.template` XOR obfuscation para 4 Uprot keys, `memset` tras `NewStringUTF` | No aplica (server-side secrets via env `OPENSUBTITLES_API_KEY`, `CONTACT_EMAIL`, `PUBLIC_URL`, `adminToken`) | **Sin cambio (server no necesita ofuscar; secretos en env)** |

---

## 3. Mejoras implementadas

### 3.1 Servidor (`packages/scrapers`, `apps/server`)

| Fichero | Inspiración StreamFlix | Qué aporta |
|---|---|---|
| `packages/scrapers/src/crypto.ts` *(nuevo)* | `utils/AesHelper.kt` + CloudStream AesHelper | `hexToBytes()`, `generateKeyAndIv()` (MD5 EVPKDF, 32-byte key + var iv), `cryptoAesHandler(data, pass, encrypt, padding)` con `node:crypto`, `decryptChillxPayload(html,key)` |
| `packages/scrapers/src/provider-urls.ts` *(nuevo)* | `ProviderPortalUrl`/`ProviderConfigUrl` + `changeUrlMutex` | `resolveProviderUrls(id, defaults, overrides)`, `sanitizeProviderUrlEntry()` |
| `packages/scrapers/src/types.ts` | `UserPreferences.getProviderCache` | `ScrapeContext.providerUrls?: Record<string,{portalUrl?,baseUrl?}>` |
| `packages/scrapers/src/embed.ts` | Extractors que devuelven `Video{subtitles}` | `EmbedSubtitle`, `EmbedResult`, `extractSubtitlesFromJson()` (captions regex) |
| `packages/scrapers/src/index.ts` | Barrel | Re-export `crypto` + `provider-urls` |
| `packages/scrapers/src/providers/upstream-catalog.ts` | `main@f4aca867` | Commit/note actualizados a 19 oct 2026 |
| `apps/server/src/model.ts` | `UserPreferences` cache | `AppData.providerUrls`, `normalizeData()`/`emptyData()` migration |
| `apps/server/src/app.ts` | `changeUrlMutex` live context | `scrapeContext` mutable + `syncScrapeContext()` en `applyScrapers()` + `bootstrap()` |
| `apps/server/src/routes/scrapers.ts` | PortalUrl overrides | `GET /api/scrapers/provider-urls` + `PUT /api/scrapers/provider-urls` (validación HTTPS, no localhost, max 32 entradas) |

### 3.2 Tests

`packages/scrapers/test/crypto.test.ts` — 7 casos: `hexToBytes` (happy + odd-length error), `generateKeyAndIv` (deterministic + different-salt), `cryptoAesHandler` (invalid JSON + missing ct/iv/s), `resolveProviderUrls` (override vs default), `sanitizeProviderUrlEntry` (https ok / no-http reject).

Resultado: `85 pass` en `packages/scrapers` (incluye crypto), `165 pass` en `apps/server`, `typecheck` + `build` verdes.

---

## 4. Decisiones y no-objetivos

**Portado fiel:**

- AES helper es port línea a línea de Kotlin `generateKeyAndIv` (targetKeySize = keyLen+ivLen, digest loop con `iterations`, slicing) + `cryptoAesHandler` JSON parsing + `aes-256-cbc` via `node:crypto` (con fix de iv→16 bytes padding). Permite desencriptar payloads Chillx-style sin reimplementar cada provider.
- Provider URL overrides replica el flujo `defaultPortalUrl`→`portalUrl` getter que lee `UserPreferences` con fallback `field` — aquí `AppData.providerUrls[id]` con fallback a `defaults`.

**Adaptado:**

- StreamFlix's `NativeScrapersAddon` no existe: allí cada provider es client-side Kotlin con `Retrofit`+`Jsoup`+`OkHttp`; aquí `ScrapeProvider.fetchSources()` corre en Node con `HttpClient`+`createGuardedFetch`+`fetchText/json`. La semántica es la misma (search→item→episode→embed→direct links).
- IPTV providers (`CableVisionHD`, `PlutoTv*`, `Vavoo` etc.) **excluidos intencionalmente**: siempre `live`, no sirven VOD solicitado; `upstream-catalog.ts` los marca `registered-iptv` solo para transparencia.
- NDK XOR (`native-lib.cpp.template`) no portado: servidor no necesita ofuscar Uprot keys; secretos viven en `process.env` con `adminToken` gate.

**No modificado (y por qué):**

- No se añadieron providers nuevos con código: añadir `Pelisplusto`/`Cine24h`/etc. requiere reverse de WP AJAX nonce o DoH DNS + mocks estables; la vía recomendada para nuevos sitios es `ProviderConfig` (plantillas `searchUrl`/`itemUrl`/`episodeUrl` + `streamPatterns` + `useEmbedResolver`) ya documentada en `/api/scrapers` y testeada en `test/config.test.ts`. El inventario `STREAMFLIX_PROVIDER_CATALOG` expone `pendingProviders` para priorizar puertos futuros por `languages`/`media`.

---

## 5. Cómo probar

```bash
npm run typecheck                          # 0 errores
npm run build                              # packages + apps/server + apps/web
npm test -- --test-name-pattern="hex|provider|Provider" # server
npm run test -w @vibeflix/scrapers        # 85 pass (incl. crypto)
npm run test -w @vibeflix/server         # 165 pass
```

Manual:

1. `GET /api/scrapers/upstream` → `commit: f4aca8672cee…`, counts `vod/iptv/unregistered/native`.
2. `PUT /api/scrapers/provider-urls { urls: { cinehax: { baseUrl: "https://mirror.example.com" } } }` → `GET` refleja; nuevo `fetchSources` usa override.
3. AES: `cryptoAesHandler(json, Buffer.from(key))` desencripta payload `{ct,iv,s}` de Chillx (usado internamente por providers futuros).
4. `POST /api/scrapers/test { providerId: "cinehax", title: "El Padrino", year: 1972 }` usa context con overrides.

---

## 6. Próximos pasos sugeridos

- [ ] Portar 1–2 providers adicionales con mocks (e.g., `Pelisplusto` → `POST /api/scrapers/test` ya listo; añadir `providers/pelisplusto.ts` con DnsResolver.doh opt-in).
- [ ] Añadir `AADecoder.java` port para sitios AAEncode (paralelo a `crypto.ts`).
- [ ] Telemetría opcional de health por provider (último `runProvider` error/timestamp) expuesta en `GET /api/scrapers`→`describe().lastErrorAt` (hoy solo `coverage`/`limitations`).
