// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { restoreWindowState } from '../src/client/window-state.ts'

const BRIDGE = {
  getSavedBounds: () => Promise.resolve(null),
  setBounds: () => Promise.resolve(true),
}

describe('restoreWindowState', () => {
  it('does nothing when no bounds were persisted', async () => {
    const setBounds = vi.fn().mockResolvedValue(true)
    await restoreWindowState({ ...BRIDGE, setBounds })
    expect(setBounds).not.toHaveBeenCalled()
  })

  it('applies the persisted bounds', async () => {
    const setBounds = vi.fn().mockResolvedValue(true)
    const saved = { x: 120, y: 90, width: 1024, height: 700 }
    await restoreWindowState({ ...BRIDGE, setBounds, getSavedBounds: () => Promise.resolve(saved) })
    expect(setBounds).toHaveBeenCalledWith(saved)
  })

  it('propagates a rejected setBounds', async () => {
    const setBounds = vi.fn().mockRejectedValue(new Error('window gone'))
    await expect(restoreWindowState({
      ...BRIDGE,
      setBounds,
      getSavedBounds: () => Promise.resolve({ x: 0, y: 0, width: 800, height: 600 }),
    })).rejects.toThrow('window gone')
  })
})
