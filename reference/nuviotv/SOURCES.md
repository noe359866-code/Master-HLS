# File map

Byte-for-byte copies from `NuvioMedia/NuvioTV@ffe16251565d92026fae22dc671b3cec3eea4a7a`
(`dev`, 2026-10-19). Only the paths changed; file contents were not edited.

| Local path | Upstream path |
| --- | --- |
| `updater/ReleaseSelector.kt` | `app/src/main/java/com/nuvio/tv/updater/ReleaseSelector.kt` |
| `updater/VersionUtils.kt` | `app/src/main/java/com/nuvio/tv/updater/VersionUtils.kt` |
| `updater/UpdateChannel.kt` | `app/src/main/java/com/nuvio/tv/updater/UpdateChannel.kt` |
| `updater/UpdateBannerPolicy.kt` | `app/src/main/java/com/nuvio/tv/updater/UpdateBannerPolicy.kt` |
| `updater/AbiSelector.kt` | `app/src/full/java/com/nuvio/tv/updater/AbiSelector.kt` |
| `updater/ApkDownloader.kt` | `app/src/full/java/com/nuvio/tv/updater/ApkDownloader.kt` |
| `updater/ApkInstaller.kt` | `app/src/full/java/com/nuvio/tv/updater/ApkInstaller.kt` |
| `updater/UpdatePreferences.kt` | `app/src/full/java/com/nuvio/tv/updater/UpdatePreferences.kt` |
| `updater/AppUpdate.kt` | `app/src/full/java/com/nuvio/tv/updater/model/AppUpdate.kt` |
| `updater/GitHubReleaseApi.kt` | `app/src/main/java/com/nuvio/tv/data/remote/api/GitHubReleaseApi.kt` |
| `updater/GitHubReleaseDto.kt` | `app/src/main/java/com/nuvio/tv/data/remote/dto/GitHubReleaseDto.kt` |
| `updater/test/ReleaseSelectorTest.kt` | `app/src/test/java/com/nuvio/tv/updater/ReleaseSelectorTest.kt` |
| `updater/test/VersionUtilsTest.kt` | `app/src/test/java/com/nuvio/tv/updater/VersionUtilsTest.kt` |
| `updater/test/UpdateBannerPolicyTest.kt` | `app/src/test/java/com/nuvio/tv/updater/UpdateBannerPolicyTest.kt` |
| `player/ParallelRangeDataSource.kt` | `app/src/main/java/com/nuvio/tv/ui/screens/player/ParallelRangeDataSource.kt` |
| `player/test/ParallelRangeDataSourceTest.kt` | `app/src/test/java/com/nuvio/tv/ui/screens/player/ParallelRangeDataSourceTest.kt` |
| `ffmpeg-decoder-downmix/**` | `ffmpeg-decoder-downmix/**` (verbatim tree) |
| `release_test_cases.csv` | `release_test_cases.csv` |
| `LICENSE-GPL-3.0.txt` | `LICENSE` |

Verify a copy at any time:

```bash
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/NuvioMedia/NuvioTV /tmp/nuviotv
cd /tmp/nuviotv
git sparse-checkout set --no-cone '/app/src/main/java/com/nuvio/tv/updater/' \
  '/app/src/full/java/com/nuvio/tv/updater/' \
  '/app/src/main/java/com/nuvio/tv/data/remote/' \
  '/app/src/main/java/com/nuvio/tv/ui/screens/player/ParallelRangeDataSource.kt' \
  '/ffmpeg-decoder-downmix/'
diff -r /tmp/nuviotv/ffmpeg-decoder-downmix \
  /path/to/repo/reference/nuviotv/ffmpeg-decoder-downmix
```

## Adapted files (not byte-identical)

| Local path | Upstream path | Changes |
| --- | --- | --- |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | `.github/ISSUE_TEMPLATE/bug_report.yml` | WuPlay product fields (install method, areas, add-on checks), wording, log policy |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | `.github/ISSUE_TEMPLATE/feature_request.yml` | WuPlay areas and wording |
| `.github/ISSUE_TEMPLATE/config.yml` | `.github/ISSUE_TEMPLATE/config.yml` | Links point to WuPlay releases, README and Discord |
| `.github/workflows/triage-needs-info.yml` | `.github/workflows/triage-needs-info.yml` | `wuplay-bot` markers; no immediate close of crash reports |
| `.github/workflows/stale-needs-info.yml` | `.github/workflows/stale-needs-info.yml` | `wuplay-bot` marker; 7 days instead of 1 |
| `.github/workflows/close-stale-issues.yml` | `.github/workflows/close-stale-issues.yml` | `wuplay-bot` marker; WuPlay wording |
| `.gitignore` | `.gitignore` | Trimmed to what applies here |
| `CONTRIBUTING.md` | `CONTRIBUTING.md` | Rewritten for a release/issue-only repository, keeping the triage policy |
