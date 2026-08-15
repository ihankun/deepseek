/**
 * The desktop shell's preload bridge, present only inside the Electron shell.
 * The shell injects this through contextBridge; a plain browser has none, so
 * every consumer must treat it as optional. The shell's injected title bar
 * calls the window controls; macOS keeps the system traffic lights.
 * @module @deepseek-ai/dsh-client-ui-layout/electron-shell
 */

declare global {
  interface Window {
    dshWindow?: {
      platform: string
      minimize(): void
      toggleMaximize(): void
      close(): void
    }
  }
}

export {}
