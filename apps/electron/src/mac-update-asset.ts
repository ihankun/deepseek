/**
 * Release-asset name matching for the macOS auto-update zip.
 *
 * electron-builder's `artifactName` declares the dotted prefix
 * (`DeepSeek.Harness-<version>-<arch>.zip`), so the local build output and
 * the published GitHub release asset carry the same name verbatim.
 * @module @deepseek-ai/dsh-electron-app/mac-update-asset
 */

/** The release-artifact prefix declared by electron-builder's `artifactName`. */
export const MAC_ARTIFACT_PREFIX = 'DeepSeek.Harness'

/**
 * The release-asset name pattern for a macOS update zip of one architecture.
 * @param arch - the arch label used in the artifact name (`arm64` or `x64`).
 * @returns the anchored pattern.
 */
export function macAssetNamePattern(arch: string): RegExp {
  return new RegExp(`^${escapeRegExp(MAC_ARTIFACT_PREFIX)}-.*-${arch}\\.zip$`)
}

/** Escape a literal string for use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
