import { describe, expect, it } from 'vitest'
import { macAssetNamePattern } from '../src/mac-update-asset.ts'

describe('macAssetNamePattern', () => {
  it('matches the dot-spelled artifact name GitHub publishes', () => {
    expect(macAssetNamePattern('arm64').test('DeepSeek.Harness-0.1.2-arm64.zip')).toBe(true)
    expect(macAssetNamePattern('x64').test('DeepSeek.Harness-0.1.2-x64.zip')).toBe(true)
  })

  it('matches the space-spelled local build name', () => {
    expect(macAssetNamePattern('arm64').test('DeepSeek Harness-0.1.2-arm64.zip')).toBe(true)
  })

  it('rejects non-matching assets from the same release', () => {
    const pattern = macAssetNamePattern('arm64')
    expect(pattern.test('DeepSeek.Harness-0.1.2-arm64.dmg')).toBe(false)
    expect(pattern.test('DeepSeek.Harness-0.1.2-arm64.zip.blockmap')).toBe(false)
    expect(pattern.test('DeepSeek.Harness-0.1.2-x64.zip')).toBe(false)
    expect(pattern.test('latest-mac.yml')).toBe(false)
  })
})
