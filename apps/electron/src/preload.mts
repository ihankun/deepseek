/**
 * Preload bridge for the desktop shell's window controls.
 *
 * The frameless window (win/linux) has no system buttons; the title bar the
 * main process injects into the page calls these methods, which forward to
 * the main process over IPC.
 * @module @deepseek-ai/dsh-electron-app/preload
 */

import { contextBridge, ipcRenderer } from 'electron'

/** Window geometry shared with the main process over the bridge. */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
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
  /** The window geometry persisted by the main process, or null on first run. */
  getSavedBounds: (): Promise<WindowBounds | null> => ipcRenderer.invoke('dsh-window-get-saved-bounds'),
  /** Move and resize the window; the main process clamps to the visible
   * display. Resolves false when the payload is invalid. */
  setBounds: (bounds: WindowBounds): Promise<boolean> => ipcRenderer.invoke('dsh-window-set-bounds', bounds),
} satisfies Record<string, unknown> & {
  platform: NodeJS.Platform
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
  maximized: () => Promise<boolean>
  onMaximizeStateChange: (listener: (maximized: boolean) => void) => void
  getSavedBounds: () => Promise<WindowBounds | null>
  setBounds: (bounds: WindowBounds) => Promise<boolean>
})
