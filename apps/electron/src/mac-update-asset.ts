/**
 * Release-asset name matching for the macOS auto-update zip.
 *
 * electron-builder uploads artifacts with the productName's spaces replaced
 * by dots (`DeepSeek.Harness-<version>-<arch>.zip`), while local builds keep
 * the space, so both spellings must match.
 * @module @deepseek-ai/dsh-electron-app/mac-update-asset
 */

/** The release artifact prefix (electron-builder productName). */
export const MAC_PRODUCT_NAME = 'DeepSeek Harness'

/**
 * The release-asset name pattern for a macOS update zip of one architecture.
 * @param arch - the arch label used in the artifact name (`arm64` or `x64`).
 * @returns the anchored pattern.
 */
export function macAssetNamePattern(arch: string): RegExp {
  return new RegExp(`^${escapeRegExp(MAC_PRODUCT_NAME).replace(/ /g, '[ .]')}-.*-${arch}\\.zip$`)
}

/** Escape a literal string for use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
