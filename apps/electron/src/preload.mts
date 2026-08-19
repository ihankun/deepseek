/**
 * Preload bridge for the desktop shell's window controls and auto-update.
 *
 * The frameless window (win/linux) has no system buttons; the title bar the
 * main process injects into the page calls these methods, which forward to
 * the main process over IPC. The update entry points expose the main-process
 * auto-update controller to the renderer UI.
 * @module @deepseek-ai/dsh-electron-app/preload
 */

import { contextBridge, ipcRenderer } from 'electron'

/** A live snapshot of the update state machine, mirrored from the main process. */
export interface UpdaterState {
  supported: boolean
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
  version: string | null
  releaseName: string | null
  releaseNotes: string | null
  progress: { percent: number; transferred: number; total: number } | null
  error: string | null
}

contextBridge.exposeInMainWorld('dshWindow', {
  /** The platform the app runs on, so the title bar can adapt its layout. */
  platform: process.platform,
  minimize: (): void => { ipcRenderer.send('dsh-window-control', 'minimize') },
  toggleMaximize: (): void => { ipcRenderer.send('dsh-window-control', 'toggle-maximize') },
  close: (): void => { ipcRenderer.send('dsh-window-control', 'close') },
  /** The current maximized state, so the title bar can swap its restore icon. */
  maximized: (): Promise<boolean> => ipcRenderer.invoke('dsh-window-is-maximized'),
  /** Subscribe to maximize-state changes pushed from the main process. */
  onMaximizeStateChange: (listener: (maximized: boolean) => void): void => {
    ipcRenderer.on('dsh-window-maximize-state', (_event, maximized: boolean) => { listener(maximized) })
  },
  /** The current auto-update state, or null when unsupported. */
  updaterState: (): Promise<UpdaterState | null> => ipcRenderer.invoke('dsh-updater-get-state'),
  /** Ask the main process to check for updates. Resolves true when accepted. */
  updaterCheck: (): Promise<boolean> => ipcRenderer.invoke('dsh-updater-check'),
  /** Approve and start downloading the available update. Resolves true when accepted. */
  updaterDownload: (): Promise<boolean> => ipcRenderer.invoke('dsh-updater-download'),
  /** Quit and install the downloaded update. Resolves true when accepted. */
  updaterInstall: (): Promise<boolean> => ipcRenderer.invoke('dsh-updater-install'),
  /** Subscribe to auto-update state changes pushed from the main process. */
  onUpdaterStateChange: (listener: (state: UpdaterState) => void): void => {
    ipcRenderer.on('dsh-updater-state', (_event, state: UpdaterState) => { listener(state) })
  },
  /** The app's version string (e.g. 0.1.1), or null when the sender is invalid. */
  version: (): Promise<string | null> => ipcRenderer.invoke('dsh-app-version'),
} satisfies Record<string, unknown> & {
  platform: NodeJS.Platform
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
  maximized: () => Promise<boolean>
  onMaximizeStateChange: (listener: (maximized: boolean) => void) => void
  updaterState: () => Promise<UpdaterState | null>
  updaterCheck: () => Promise<boolean>
  updaterDownload: () => Promise<boolean>
  updaterInstall: () => Promise<boolean>
  onUpdaterStateChange: (listener: (state: UpdaterState) => void) => void
  version: () => Promise<string | null>
})
