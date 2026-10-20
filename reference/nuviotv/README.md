# NuvioTV reference material

Curated files copied from [NuvioMedia/NuvioTV](https://github.com/NuvioMedia/NuvioTV)
so they are available next to the WuPlay releases without pulling the whole
project (≈335 MB, including native libraries and APK/AAR binaries).

- **Upstream:** `NuvioMedia/NuvioTV`, branch `dev`
- **Commit:** `ffe16251565d92026fae22dc671b3cec3eea4a7a` (2026-10-19)
- **License:** GPL-3.0 — see [LICENSE-GPL-3.0.txt](LICENSE-GPL-3.0.txt) and
  [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md)

Nothing here is wired into a build. These are **reference snapshots** with their
original `com.nuvio.tv` package declarations, kept for reuse in an Android TV
streaming app.

## What was copied and why

### `updater/` — auto-update from GitHub Releases

WuPlay ships APKs through GitHub Releases, which is exactly what this module
consumes. It is the most directly reusable piece of NuvioTV.

| File | Role |
| --- | --- |
| `VersionUtils.kt` | Semver parsing/comparison (`0.9.3-beta` > `0.9.2-beta`) |
| `ReleaseSelector.kt` | Filters drafts, detects prereleases, sorts eligible releases |
| `UpdateChannel.kt` | Stable/Beta channel, default derived from the installed version |
| `UpdateBannerPolicy.kt` | When to show the update banner |
| `AbiSelector.kt` | Picks the right APK when a release ships split ABIs |
| `ApkDownloader.kt` | OkHttp download with progress callback |
| `ApkInstaller.kt` | `ACTION_VIEW` install intent + unknown-sources settings |
| `UpdatePreferences.kt` | DataStore for ignored tag, channel, last check |
| `AppUpdate.kt` | Result model |
| `GitHubReleaseApi.kt` / `GitHubReleaseDto.kt` | Retrofit + Moshi GitHub API layer |
| `test/*.kt` | Plain JVM unit tests for the selector/version/policy logic |

Deliberately left upstream: `UpdateRepository`, `UpdateViewModel` and the
Compose `ui/` banner. They depend on Hilt modules, `BuildConfig` fields and the
app theme; the logic above is what you would port. Expected dependencies:
Kotlin coroutines, OkHttp, Retrofit + Moshi, AndroidX DataStore, Hilt (only for
`UpdatePreferences`).

### `ffmpeg-decoder-downmix/` — complete Gradle module, unchanged

A Media3/ExoPlayer `FfmpegAudioRenderer` with Kodi-style downmix (center mix,
channel layout selection, normalization, peak limiting). Useful on Android TV
boxes that output stereo but receive AC-3/E-AC-3/DTS audio in an HLS or MKV
stream.

It is the only module copied as a whole, because it is self-contained:

- `build.gradle.kts` expects `rootProject.file("local.properties")`, the
  `media3.decoder`/`media3.common` version catalog entries and
  `../app/libs/lib-exoplayer-release.aar` (`compileOnly`).
- The JNI layer needs `FFMPEG_SOURCE_DIR` and `FFMPEG_BUILD_DIR`; see the module
  README and `build_ffmpeg.sh`.
- Read [`src/main/…/NOTICE.md`](ffmpeg-decoder-downmix/NOTICE.md) before reuse:
  the base is Apache-2.0 Media3, the downmix behavior is GPL-2.0-or-later Kodi
  code, and the module itself is distributed under GPL-3.0.

### `player/` — parallel range HTTP data source

`ParallelRangeDataSource.kt` (≈60 KB) is a Media3 `DataSource` that:

- issues multiple ranged HTTP requests in parallel with a chunked prefetch depth,
- hedges stalled connections (separate thresholds for "CDN" vs "USENET"),
- can allocate chunks in native memory instead of the Java heap,
- records a bootstrap cache so the next open reuses the first bytes.

This is the piece most relevant to an HLS-heavy project: it targets fast startup
and seek behavior on high-latency links.

Caveats for reuse:

- It depends on `com.nuvio.tv.data.local.PlayerSettings` for
  `DEFAULT_PARALLEL_CONNECTION_COUNT` and `DEFAULT_PARALLEL_CHUNK_SIZE_KB`
  (small constants — copy the values or replace them with your own settings),
  and on `androidx.media3.exoplayer.upstream.DefaultAllocatorNative` for native
  allocations (set `useNativeMemory = false` to avoid it).
- It is `internal` and annotated `@UnstableApi`; Media3 minor upgrades can change
  the interfaces around it.
- `test/ParallelRangeDataSourceTest.kt` covers the chunk/hedging math and is a
  good starting point for your own tests.

### `release_test_cases.csv` — release QA matrix

98 manual test cases (`folder,title,precondition,steps,expected_result,key`)
covering core playback, seeking, tracks, subtitles, buffering and resume
behavior. It is generic app QA, not WuPlay-specific, but it works well as a
pre-release smoke checklist and as a starting point for a WuPlay regression list.

## What was intentionally not copied

| Upstream path | Size | Why not |
| --- | --- | --- |
| `app/src/main/**` (rest of the app) | ~13 MB of Kotlin | Whole-app code, tied to Nuvio's DI, theme and backend |
| `DV7/libdovi/**` | ~81 MB | Prebuilt Dolby Vision static libraries (binaries) |
| `app/libs/*.aar` | ~24 MB | Prebuilt Media3/FFmpeg binaries; Media3 ships official artifacts |
| `app/src/main/jniLibs/**/libtorrserver.so` | ~170 MB | Torrent server binaries |
| `assets/brand/**` | ~125 KB | Nuvio trademark/logo — not transferable |
| `.github/workflows/android-release.yml`, `pr-*.yml` | — | Build/sign pipeline for a Gradle project that does not exist here |
| `docs/essential-mode.md` | 30 KB | Product spec for a Nuvio-only feature |

If you later want the full tree, clone upstream directly instead of extending
this reference folder.
