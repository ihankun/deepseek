// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { UpdateStore, hasActionableUpdate, readyToInstall } from '../src/client/update-store.ts'
import type { UpdaterState } from '../src/client/platform-service.ts'

const FULL_STATE: UpdaterState = {
  supported: true,
  status: 'idle',
  version: null,
  releaseName: null,
  releaseNotes: null,
  progress: null,
  error: null,
}

function makeBridge() {
  let listener: ((state: UpdaterState) => void) | undefined
  let current: UpdaterState | null = null
  const check = vi.fn(() => Promise.resolve(true))
  const download = vi.fn(() => Promise.resolve(true))
  const install = vi.fn(() => Promise.resolve(true))
  const api = {
    platform: 'darwin',
    minimize: () => {},
    toggleMaximize: () => {},
    close: () => {},
    updaterState: vi.fn(() => Promise.resolve(current)),
    updaterCheck: check,
    updaterDownload: download,
    updaterInstall: install,
    onUpdaterStateChange: (fn: (state: UpdaterState) => void) => { listener = fn },
  }
  return {
    api,
    push: (state: UpdaterState) => { current = state; listener?.(state) },
    setInitial: (state: UpdaterState) => { current = state },
  }
}

describe('UpdateStore', () => {
  it('mirrors the initial bridge state and pushes', async () => {
    const bridge = makeBridge()
    bridge.setInitial({ ...FULL_STATE, status: 'available', version: '9.9.9' })
    const store = new UpdateStore(bridge.api as never)
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(store.getSnapshot().status).toBe('available')
    expect(store.getSnapshot().version).toBe('9.9.9')

    bridge.push({ ...FULL_STATE, status: 'downloading', progress: { percent: 42, transferred: 42, total: 100 } })
    expect(store.getSnapshot().status).toBe('downloading')
    expect(store.getSnapshot().progress?.percent).toBe(42)
  })

  it('forwards verbs to the bridge', () => {
    const bridge = makeBridge()
    const store = new UpdateStore(bridge.api as never)
    store.check()
    store.download()
    store.install()
    expect(bridge.api.updaterCheck).toHaveBeenCalled()
    expect(bridge.api.updaterDownload).toHaveBeenCalled()
    expect(bridge.api.updaterInstall).toHaveBeenCalled()
  })

  it('notifies subscribers on push', async () => {
    const bridge = makeBridge()
    const store = new UpdateStore(bridge.api as never)
    const subscriber = vi.fn()
    store.subscribe(subscriber)
    bridge.push({ ...FULL_STATE, status: 'not-available' })
    expect(subscriber).toHaveBeenCalled()
    expect(store.getSnapshot().status).toBe('not-available')
  })
})

describe('updater state predicates', () => {
  it('flags actionable states and readiness', () => {
    expect(hasActionableUpdate({ ...FULL_STATE, status: 'available' })).toBe(true)
    expect(hasActionableUpdate({ ...FULL_STATE, status: 'downloading' })).toBe(true)
    expect(hasActionableUpdate({ ...FULL_STATE, status: 'downloaded' })).toBe(true)
    expect(hasActionableUpdate({ ...FULL_STATE, status: 'idle' })).toBe(false)
    expect(hasActionableUpdate({ ...FULL_STATE, status: 'not-available' })).toBe(false)
    expect(hasActionableUpdate({ ...FULL_STATE, status: 'error' })).toBe(false)
    expect(readyToInstall({ ...FULL_STATE, status: 'downloaded' })).toBe(true)
    expect(readyToInstall({ ...FULL_STATE, status: 'available' })).toBe(false)
  })
})
