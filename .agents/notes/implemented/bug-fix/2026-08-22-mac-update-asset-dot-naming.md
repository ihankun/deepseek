# Agent Note: macOS update asset dot naming

Status: implemented

English | [中文](2026-08-22-mac-update-asset-dot-naming.zh.md)

## Problem

The desktop shell's macOS auto-update matched release assets with the literal productName spelling `DeepSeek Harness-<version>-<arch>.zip` (a space). electron-builder publishes to GitHub releases under a normalized name — spaces become dots (`DeepSeek.Harness-0.1.2-arm64.zip`, as on the v0.1.2 release) — so every check resolved zero assets and reported `Update package for arm64 not found`. Auto-update never found an update on macOS, and nothing in the repo recorded that the publisher rewrites artifact names at upload time.

## Decision

**The dotted spelling is the one artifact name, everywhere.** electron-builder's `artifactName` declares it explicitly (`DeepSeek.Harness-${version}-${arch}.${ext}` on mac, `DeepSeek.Harness-Setup-${version}.${ext}` on win), so the local build output and the published GitHub release asset carry the same name verbatim and no upload-time normalization is in play. Asset matching lives in `apps/electron/src/mac-update-asset.ts` as `macAssetNamePattern(arch)`: an anchored pattern over `MAC_ARTIFACT_PREFIX = 'DeepSeek.Harness'` that accepts only the declared dotted name and rejects everything else in the release (`.dmg`, `.zip.blockmap`, other-arch zips, `latest-mac.yml`). The same prefix names the updater's download-cache file. The pure matcher is unit-tested against a real release roster.

## Alternatives considered

- **Match both spellings (`[ .]` for the space).** Kept the pre-fix local build name working but encoded two accepted spellings for one artifact and preserved dependence on the unstated upload normalization; naming the dotted form once in `artifactName` deletes the ambiguity instead of tolerating it.
- **Read `latest-mac.yml` instead of the releases API.** The YAML carries exact file names and hashes, but it is written for electron-updater's own flow; the hand-written installer already resolves arch, digest, and notes from one API response, and a second metadata format would add a parser without removing any code.
- **Normalize the asset name before comparing** (replace dots with spaces on both sides). Equivalent behavior with a lossy transform; the anchored literal prefix states the accepted name directly and fails closed for anything else.

## Consequences

- Build output, GitHub assets, and the update matcher all use the dotted name from v0.1.3 on; a mismatch between any two of them is now a visible config edit rather than silent behavior.
- Installed pre-0.1.3 clients (the space-only matcher) do not see dotted releases and must upgrade manually once; this was accepted, not overlooked.
- Windows is unaffected — electron-updater follows `latest.yml`, which records the actual uploaded names.

## Related

- [Electron desktop shell](../feature/2026-08-14-electron-desktop-shell.md) — the packaged app this updater belongs to.
