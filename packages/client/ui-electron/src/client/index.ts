/**
 * Electron-specific UI adaptations plugin.
 * Provides platform detection service, Electron-specific behaviors, and the
 * auto-update entry in the sidebar foot.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-sidebar SlotMap merge (the footer.action entry).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { DefaultPlatformService } from './platform-service.ts'
import { startWindowsTitlebarMerge } from './titlebar-merge.ts'
import { startVersionBadge } from './version-badge.ts'
import { UpdateEntry } from './UpdateEntry.tsx'
import { UpdateStore, type UpdateEntryInjected } from './update-store.ts'
import { en, zh, type ElectronKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The desktop-shell update entry copy. */
    electron: ElectronKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'electron'

/** Services required by the Electron plugin. */
export const inject = ['slots', 'layout', 'locale']

/** Registers the Electron-specific UI adaptations.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-electron: dictionaries')

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

    // Hovering the brand wordmark reveals the app version over the HARNESS
    // badge plate (desktop shell only).
    ctx.effect(() => startVersionBadge(), 'ui-electron: version badge')

    // The update entry rides the sidebar foot's action seat, so it appears
    // beside Settings only inside the desktop shell. One store instance is
    // created per activation and handed down through the inject face.
    ctx.effect(() => {
      const store = new UpdateStore(window.dshWindow)
      const injectFace = (): UpdateEntryInjected => ({ store })
      return ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'update',
        order: 0,
        locale: NS,
        inject: injectFace,
      }, UpdateEntry))
    }, 'ui-electron: update entry')
  }
}
