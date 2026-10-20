# Third-party notices

This repository contains material copied from other open-source projects. This
file records where it came from and under which license it is distributed.

## WuPlay repository content

The WuPlay release assets, README, CHANGELOG and screenshots are distributed
under **CC0 1.0 Universal** (see [LICENSE](LICENSE)).

## NuvioMedia/NuvioTV (GPL-3.0)

Files under [`reference/nuviotv/`](reference/nuviotv/) are snapshots copied from
[NuvioMedia/NuvioTV](https://github.com/NuvioMedia/NuvioTV), branch `dev`, commit
[`ffe16251565d92026fae22dc671b3cec3eea4a7a`](https://github.com/NuvioMedia/NuvioTV/commit/ffe16251565d92026fae22dc671b3cec3eea4a7a)
(2026-10-19).

NuvioTV is licensed under **GNU General Public License v3.0**. A verbatim copy of
the license is included at
[`reference/nuviotv/LICENSE-GPL-3.0.txt`](reference/nuviotv/LICENSE-GPL-3.0.txt).

The same GPL-3.0 terms apply to the copied files and to any derivative work made
from them. They are kept in their own directory, with the original file names and
package declarations, so the obligation is easy to see. If you redistribute this
repository as a whole, you must comply with GPL-3.0 for that directory in
addition to CC0 for the WuPlay content.

### Adapted workflows

The following GitHub Actions workflows were copied and adapted (bot markers,
timings and messages changed; the triage workflow no longer closes crash reports
immediately):

- `.github/workflows/triage-needs-info.yml`
- `.github/workflows/stale-needs-info.yml`
- `.github/workflows/close-stale-issues.yml`

The issue templates in `.github/ISSUE_TEMPLATE/` are adapted from the NuvioTV
forms as well.

### Nested third-party notices inside `reference/nuviotv/`

`reference/nuviotv/ffmpeg-decoder-downmix/` contains its own
[NOTICE](reference/nuviotv/ffmpeg-decoder-downmix/NOTICE.md) with additional
attribution:

- Base implementation: AndroidX Media3 `decoder_ffmpeg` extension (Apache-2.0).
- Downmix behavior: adapted from Kodi (`xbmc/xbmc`), GPL-2.0-or-later.

Keep that NOTICE file next to the module if you reuse it.

## Radarr and the Servarr ecosystem

[`reference/radarr/`](reference/radarr/README.md) and
[`reference/ecosystem.md`](reference/ecosystem.md) contain **only** documentation,
links and an example `docker-compose.yml`. No Radarr source code is vendored
here, so no GPL obligation is added by those files. Radarr itself is GPL-3.0
(<https://github.com/Radarr/Radarr>); the example compose file follows the
publicly documented parameters of the `linuxserver/radarr` image.

## Trademarks

"WuPlay", "NuvioTV", "Stremio", "Android TV", "Google TV" and "Fire TV" are
trademarks of their respective owners. Nothing in this repository grants rights
to those marks.
