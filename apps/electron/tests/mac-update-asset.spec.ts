import { describe, expect, it } from 'vitest'
import { MAC_ARTIFACT_PREFIX, macAssetNamePattern } from '../src/mac-update-asset.ts'

describe('macAssetNamePattern', () => {
  it('matches the dotted artifact name declared by artifactName', () => {
    expect(macAssetNamePattern('arm64').test('DeepSeek.Harness-0.1.3-arm64.zip')).toBe(true)
    expect(macAssetNamePattern('x64').test('DeepSeek.Harness-0.1.3-x64.zip')).toBe(true)
    expect(MAC_ARTIFACT_PREFIX).toBe('DeepSeek.Harness')
  })

  it('rejects non-matching assets from the same release', () => {
    const pattern = macAssetNamePattern('arm64')
    expect(pattern.test('DeepSeek.Harness-0.1.3-arm64.dmg')).toBe(false)
    expect(pattern.test('DeepSeek.Harness-0.1.3-arm64.zip.blockmap')).toBe(false)
    expect(pattern.test('DeepSeek.Harness-0.1.3-x64.zip')).toBe(false)
    expect(pattern.test('latest-mac.yml')).toBe(false)
  })
})
