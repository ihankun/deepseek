/**
 * Preload bridge for the desktop shell's window controls.
 *
 * The frameless window (win/linux) has no system buttons; the title bar the
 * main process injects into the page calls these methods, which forward to
 * the main process over IPC.
 * @module @deepseek-ai/dsh-electron-app/preload
 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dshWindow', {
  /** The platform the app runs on, so the title bar can adapt its layout. */
  platform: process.platform,
  minimize: (): void => { ipcRenderer.send('dsh-window-control', 'minimize') },
  toggleMaximize: (): void => { ipcRenderer.send('dsh-window-control', 'toggle-maximize') },
  close: (): void => { ipcRenderer.send('dsh-window-control', 'close') },
} satisfies Record<string, unknown> & {
  platform: NodeJS.Platform
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
})
