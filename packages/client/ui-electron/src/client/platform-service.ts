/**
 * Platform detection service for Electron-specific UI adaptations.
 * Provides platform information without requiring direct window.dshWindow access.
 */
export interface PlatformService {
  /** Whether the app is running in Electron shell. */
  readonly isElectron: boolean
  /** Whether the app is running on macOS. */
  readonly isMac: boolean
  /** Whether the app should reserve space for macOS traffic lights. */
  readonly reserveTrafficLights: boolean
}

/** Default platform detection implementation. */
export class DefaultPlatformService implements PlatformService {
  readonly isElectron: boolean
  readonly isMac: boolean
  readonly reserveTrafficLights: boolean

  constructor() {
    if (typeof window === 'undefined' || window.dshWindow === undefined) {
      this.isElectron = false
      this.isMac = false
      this.reserveTrafficLights = false
    } else {
      this.isElectron = true
      this.isMac = window.dshWindow.platform === 'darwin'
      this.reserveTrafficLights = this.isMac
    }
  }
}
