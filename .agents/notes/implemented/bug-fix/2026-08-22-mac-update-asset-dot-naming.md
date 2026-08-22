# Agent Note: macOS update asset dot naming

Status: implemented

English | [中文](2026-08-22-mac-update-asset-dot-naming.zh.md)

## Problem

The desktop shell's macOS auto-update matched release assets with the literal productName spelling `DeepSeek Harness-<version>-<arch>.zip` (a space). electron-builder publishes to GitHub releases under a normalized name — spaces become dots (`DeepSeek.Harness-0.1.2-arm64.zip`, as on the v0.1.2 release) — so every check resolved zero assets and reported `Update package for arm64 not found`. Auto-update never found an update on macOS, and nothing in the repo recorded that GitHub rewrites artifact names at upload time.

## Decision

Asset matching lives in `apps/electron/src/mac-update-asset.ts` as `macAssetNamePattern(arch)`: the productName's space is compiled into the pattern as `[ .]`, so both the GitHub-published dot spelling and the local-build space spelling match, while the `.dmg`, `.zip.blockmap`, other-arch zips, and `latest-mac.yml` in the same release still do not. The updater consumes the pattern; the shared module also exports `MAC_PRODUCT_NAME` for the download-cache file name. The pure matcher is unit-tested against the real v0.1.2 asset roster.

## Alternatives considered

- **Rename the artifact to avoid the ambiguity** (`artifactName: "harness-..."`). Loses the productName branding in release assets and still depends on an unstated normalization rule; matching both spellings keeps the existing published names working.
- **Read `latest-mac.yml` instead of the releases API.** The YAML carries exact file names and hashes, but it is written for electron-updater's own flow; the hand-written installer already resolves arch, digest, and notes from one API response, and a second metadata format would add a parser without removing any code.
- **Normalize the asset name before comparing** (replace dots with spaces on both sides). Equivalent behavior with a lossy transform; the anchored character class states the accepted spellings directly and fails closed for anything else.

## Consequences

- macOS auto-update finds the update zip on releases whose assets carry the dot spelling; the space-spelled local builds keep working if ever uploaded verbatim.
- The `[ .]` tolerance is load-bearing: simplifying it back to a literal space reintroduces the failure silently (the error message names only the arch).
- Windows is unaffected — electron-updater follows `latest.yml`, which records the actual uploaded names.

## Related

- [Electron desktop shell](../feature/2026-08-14-electron-desktop-shell.md) — the packaged app this updater belongs to.
