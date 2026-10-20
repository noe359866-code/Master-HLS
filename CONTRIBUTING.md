# Contributing

Thanks for helping improve WuPlay. This repository is the **release and issue
tracker** for WuPlay: it hosts the published APKs, the changelog and the bug /
feature backlog. It does not contain the app source code, so code pull requests
are not handled here.

The rules below are adapted from the
[NuvioTV contribution policy](https://github.com/NuvioMedia/NuvioTV/blob/dev/CONTRIBUTING.md)
and are enforced by the automated triage workflows in `.github/workflows/`.

---

## Where to ask what

| You want to... | Go to |
| --- | --- |
| Report a reproducible bug | [Bug report](https://github.com/wuplayapp/wuplay-releases/issues/new?template=bug_report.yml) |
| Suggest a feature or improvement | [Feature request](https://github.com/wuplayapp/wuplay-releases/issues/new?template=feature_request.yml) |
| Ask a usage question | [Question](https://github.com/wuplayapp/wuplay-releases/issues/new?template=question.md) or [Discord](https://discord.gg/PvZjHVGtE9) |
| Get the latest APK | [Releases](https://github.com/wuplayapp/wuplay-releases/releases/latest) |
| Read what changed | [CHANGELOG.md](CHANGELOG.md) |

Issues are for things that can be acted on. Support chat, device-specific setup
help and "how do I...?" questions belong in Discord.

---

## Bug reports

Before opening an issue:

1. Search existing issues. Duplicates are closed.
2. Install the latest release and confirm the bug still happens.
3. Make sure the bug is not caused by a specific add-on or source. If it only
   happens with one add-on, report it to that add-on's author.
4. Keep it to **one bug per issue**. Split unrelated problems.

Required in every bug report:

- App version (Settings → About) and install method
- Device model, Android version and platform
- Player mode (internal or external player)
- Area of the app affected
- What you did, what you expected, and what actually happened
- Steps to reproduce, one action per line

**Crashes need logs.** If the app crashes or force closes, attach a short
`adb logcat -d` snippet or stack trace from around the crash. Crash reports
without logs are labeled `needs-info` and closed after 7 days without an answer.

Do not paste links to copyrighted material, credentials, tokens or personal
data. A content title plus an add-on name is enough context. See
[SECURITY.md](SECURITY.md) if you need to report something sensitive.

### Automated triage

Three workflows keep the backlog useful:

| Workflow | What it does |
| --- | --- |
| `triage-needs-info.yml` | Labels vague reports `needs-info` and posts what is missing |
| `stale-needs-info.yml` | Closes `needs-info` bugs after 7 days without a reply |
| `close-stale-issues.yml` | Closes bug issues with no activity for 30 days |

Reopening an issue is treated as an explicit maintainer decision: the bots will
not close it again. If your issue was closed for missing details, add the
information and ask for it to be reopened.

---

## Feature requests

- One request per issue, focused on the problem you are trying to solve.
- Explain the real use case, not only the proposed UI.
- Large or directional changes need maintainer approval **before** any work
  starts.
- Requests to bundle copyrighted content, circumvent DRM or bypass paywalls are
  out of scope.

---

## Documentation and changelog

Small documentation fixes are welcome. Changelog entries are written by
maintainers from the release notes of each version; please do not reword past
entries in unrelated PRs.

---

## Code of conduct

Be respectful and assume good faith. Maintainers may edit titles, add labels,
merge duplicates or close issues that do not follow this document. Repeated
abuse or spam results in a block.
