// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { DefaultPlatformService } from '../src/client/platform-service.ts'

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
    window.dshWindow = { platform: 'darwin', minimize: () => {}, toggleMaximize: () => {}, close: () => {} }
    const service = new DefaultPlatformService()
    expect(service.isElectron).toBe(true)
    expect(service.isMac).toBe(true)
    expect(service.isWindows).toBe(false)
    expect(service.reserveTrafficLights).toBe(true)
  })

  it('reports Windows without the macOS traffic-light reservation', () => {
    window.dshWindow = { platform: 'win32', minimize: () => {}, toggleMaximize: () => {}, close: () => {} }
    const service = new DefaultPlatformService()
    expect(service.isElectron).toBe(true)
    expect(service.isMac).toBe(false)
    expect(service.isWindows).toBe(true)
    expect(service.reserveTrafficLights).toBe(false)
  })
})
