// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { DefaultPlatformService } from '../src/client/platform-service.ts'

const BRIDGE = {
  minimize: () => {},
  toggleMaximize: () => {},
  close: () => {},
  updaterState: () => Promise.resolve(null),
  updaterCheck: () => Promise.resolve(true),
  updaterDownload: () => Promise.resolve(true),
  updaterInstall: () => Promise.resolve(true),
  onUpdaterStateChange: () => {},
  version: () => Promise.resolve('0.1.1'),
}

describe('DefaultPlatformService', () => {
  it('reports a plain browser as non-Electron', () => {
    delete window.dshWindow
    const service = new DefaultPlatformService()
    expect(service.isElectron).toBe(false)
    expect(service.isMac).toBe(false)
    expect(service.isWindows).toBe(false)
    expect(service.reserveTrafficLights).toBe(false)
  })

  it('reports macOS and reserves the traffic-light band', () => {
    window.dshWindow = { ...BRIDGE, platform: 'darwin' }
    const service = new DefaultPlatformService()
    expect(service.isElectron).toBe(true)
    expect(service.isMac).toBe(true)
    expect(service.isWindows).toBe(false)
    expect(service.reserveTrafficLights).toBe(true)
  })

  it('reports Windows without the macOS traffic-light reservation', () => {
    window.dshWindow = { ...BRIDGE, platform: 'win32' }
    const service = new DefaultPlatformService()
    expect(service.isElectron).toBe(true)
    expect(service.isMac).toBe(false)
    expect(service.isWindows).toBe(true)
    expect(service.reserveTrafficLights).toBe(false)
  })
})
