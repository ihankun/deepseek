/**
 * The desktop bundle's host plugin: once the web server binds, launch the
 * Electron main process at the composed URL and couple the two lifetimes.
 * @module @deepseek-ai/dsh-electron-app
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-cmdline'
import type {} from '@deepseek-ai/dsh-host-webserver'

/** Stable Cordis plugin name. */
export const name = 'electron-app'

/** Services that must be active before this plugin mounts. */
export const inject = ['webServer']

const require = createRequire(import.meta.url)

/** The Electron binary shipped with this package. */
function electronBinary(): string {
  return require('electron') as string
}

/** This package's built main-process entry, resolved through its own exports. */
function mainEntry(): string {
  return require.resolve('@deepseek-ai/dsh-electron-app/main')
}

/**
 * Mount the desktop shell: launch Electron against the active web server, then
 * mirror process lifetime in both directions — the shell's exit shuts the tree
 * down, and the tree's teardown kills the shell. The piped stdin carries the
 * launcher's lifetime: its EOF exits the shell when the dsh tree dies without
 * a signal.
 * @param ctx - plugin context carrying the webServer service.
 */
export function apply(ctx: Context): void {
  const exit = ctx.get('appExit')
  if (exit === undefined) {
    throw new Error('electron-app: the launcher must provide ctx.appExit before the tree mounts')
  }
  const url = `http://${ctx.webServer.host}:${String(ctx.webServer.port)}`
  ctx.logger.info('electron: launching desktop shell at %s', url)
  const child: ChildProcess = spawn(electronBinary(), [mainEntry()], {
    env: { ...process.env, DSH_WEB_URL: url },
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  // 'error' fires only when the spawn itself fails (missing binary, bad env);
  // an exited process reports through 'exit' alone, so the two handlers never
  // race on the same launch.
  child.on('error', (error) => {
    ctx.logger.error('electron: failed to launch: %s', error.message)
    exit(1)
  })
  child.on('exit', (code, signal) => {
    const reason = signal !== null ? `signal ${signal}` : `code ${String(code ?? 1)}`
    ctx.logger.info('electron: desktop shell exited (%s)', reason)
    exit(code ?? 1)
  })
  ctx.effect(() => {
    return () => {
      if (child.exitCode === null && child.signalCode === null) child.kill()
    }
  })
}
