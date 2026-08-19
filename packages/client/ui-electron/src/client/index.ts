/**
 * Electron-specific UI adaptations plugin.
 * Provides platform detection service and Electron-specific behaviors.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { DefaultPlatformService } from './platform-service.ts'
import { startWindowsTitlebarMerge } from './titlebar-merge.ts'

/** Services required by the Electron plugin. */
export const inject = ['slots', 'layout']

/** Registers the Electron-specific UI adaptations.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  // Create and provide platform service
  const platformService = new DefaultPlatformService()
  ctx.effect(() => {
    return ctx.reflect.provide('platform', platformService)
  }, 'ui-electron: platform service')

  // Apply Electron-specific CSS if in Electron environment
  if (platformService.isElectron) {
    ctx.effect(() => {
      // Add CSS class to body for Electron environment
      document.body.classList.add('dsh-electron')

      // Apply macOS-specific adaptations
      if (platformService.isMac) {
        document.body.classList.add('dsh-electron-mac')
      }

      // On Windows the injected title bar's left side is empty; overlay the
      // sidebar's logo row (brand + collapse toggle) into that band.
      if (platformService.isWindows) {
        document.body.classList.add('dsh-electron-win')
      }

      return () => {
        document.body.classList.remove('dsh-electron', 'dsh-electron-mac', 'dsh-electron-win')
      }
    }, 'ui-electron: body platform classes')

    if (platformService.isWindows) {
      ctx.effect(() => startWindowsTitlebarMerge(), 'ui-electron: windows titlebar merge')
    }
  }
}
