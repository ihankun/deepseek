/**
 * Electron main process for the dsh desktop bundle.
 *
 * In the harness, the electron-app host plugin launches this entry once the
 * dsh web server binds; the server URL arrives as `DSH_WEB_URL`, and the
 * launcher mirrors this process's lifetime (kills it during tree teardown,
 * reads its exit to shut the tree down, and watches its piped stdin for EOF
 * when the launcher dies without a signal).
 *
 * In a packaged app there is no launcher: this process starts its own dsh web
 * server — an `ELECTRON_RUN_AS_NODE` child running the bundled CLI with an
 * OS-assigned port — and discovers the URL from the readiness line the web
 * profile prints. This process then owns the window and tray exactly as in
 * the harness mode.
 * @module @deepseek-ai/dsh-electron-app/main
 */

import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, nativeTheme } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serverUrlFromLine } from './server-url.ts'

const ASSET_DIR = fileURLToPath(new URL('../assets/', import.meta.url))

/** The web server URL a harness launcher composed, read from the environment. */
const webUrl = process.env.DSH_WEB_URL

/** The platform the app runs on; macOS keeps system traffic lights. */
const IS_MAC = process.platform === 'darwin'

/**
 * The preload bridge exposing window controls to the injected title bar.
 * Derived from this entry's own location (lib/ in dev and in the packaged
 * asar), so it never depends on the process working directory or app path.
 */
const PRELOAD = join(dirname(fileURLToPath(import.meta.url)), 'types', 'preload.mjs')

/** The app icon shown in the dock and on the window: white rounded-rect with the logo. */
const APP_ICON = join(ASSET_DIR, 'icon.png')

/** The black-shape tray source; template rendering picks up the menu bar color. */
const TRAY_ICON = join(ASSET_DIR, 'deepseek-tray.png')

/** The tray icon's logical size in points; the 2x representation covers Retina. */
const TRAY_SIZE_PX = 24

/** Milliseconds between server-readiness probes. */
const READY_POLL_MS = 200

/** How long the window waits for the web server before giving up. */
const READY_TIMEOUT_MS = 30_000

/** Fail loud: report and terminate with a non-zero status. */
function fatal(message: string): never {
  console.error(`electron: ${message}`)
  if (app.isPackaged) dialog.showErrorBox('DeepSeek Harness', message)
  app.exit(1)
  throw new Error(message)
}

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let serverProcess: ChildProcess | undefined

/** Whether a real quit is in progress; only then does closing the window destroy it. */
let quitting = false

/** The URL the window loads, resolved before the window opens. */
let activeUrl = ''

/** Create (or refocus) the main window pointing at the composed web URL. */
function showMainWindow(): void {
  if (mainWindow === undefined) {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      title: 'DeepSeek Harness',
      icon: APP_ICON,
      autoHideMenuBar: true,
      // No system title bar: macOS keeps the traffic lights over the content
      // (hidden style), win/linux go fully frameless and get the injected
      // title bar with its own window controls.
      ...(IS_MAC
        ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 14, y: 14 } }
        : { frame: false }),
      webPreferences: {
        preload: PRELOAD,
        sandbox: false,
      },
    })
    mainWindow.on('closed', () => { mainWindow = undefined })
    // Closing the window hides the app to the tray; the tray menu (or Cmd+Q)
    // is the real exit path. A quit in progress lets the close through.
    mainWindow.on('close', (event) => {
      if (quitting) return
      event.preventDefault()
      mainWindow?.hide()
    })
    void mainWindow.loadURL(activeUrl)
    // The page layout reads window.dshWindow (the macOS traffic-light
    // reservation); a failed preload silently breaks that, so report it.
    mainWindow.webContents.on('preload-error', (_, preloadPath, error) => {
      console.error(`electron: preload failed to load ${preloadPath}: ${error.message}`)
    })
    // A blank window is a renderer failure with no visible console; forward
    // the page's console and load failures to stderr for diagnosis.
    mainWindow.webContents.on('console-message', (event) => {
      console.error(`electron: [renderer:${event.level}] ${event.message}`)
    })
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`electron: page load failed (${errorCode}) ${errorDescription} at ${validatedURL}`)
    })
    if (!IS_MAC) {
      mainWindow.webContents.on('did-finish-load', () => {
        if (mainWindow !== undefined) injectTitleBar(mainWindow)
      })
    }
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/**
 * Install the tray icon: a fixed 16pt black-shape image marked as a template,
 * so macOS renders it in the menu bar's current color (and win/linux in black).
 */
function createTray(): void {
  const base = nativeImage.createFromPath(TRAY_ICON)
  if (base.isEmpty()) {
    tray = new Tray(nativeImage.createEmpty())
  } else {
    const image = nativeImage.createEmpty()
    image.addRepresentation({
      scaleFactor: 1,
      width: TRAY_SIZE_PX,
      height: TRAY_SIZE_PX,
      buffer: base.resize({ width: TRAY_SIZE_PX, height: TRAY_SIZE_PX, quality: 'best' }).toPNG(),
    })
    image.addRepresentation({
      scaleFactor: 2,
      width: TRAY_SIZE_PX * 2,
      height: TRAY_SIZE_PX * 2,
      buffer: base.resize({ width: TRAY_SIZE_PX * 2, height: TRAY_SIZE_PX * 2, quality: 'best' }).toPNG(),
    })
    image.setTemplateImage(true)
    tray = new Tray(image)
  }
  tray.setToolTip('DeepSeek Harness')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口', click: showMainWindow },
    { type: 'separator' },
    { label: '退出', click: () => { app.quit() } },
  ]))
  tray.on('click', showMainWindow)
}

/** The frameless title bar injected into the page on win/linux, as a script. */
const TITLE_BAR_INJECTION = (dark: boolean): string => {
  const background = dark ? 'rgba(32, 32, 32, 0.85)' : 'rgba(250, 250, 250, 0.85)'
  const foreground = dark ? '#e8e8e8' : '#1a1a1a'
  const hover = dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'
  const border = dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
  return `(() => {
  if (document.getElementById('dsh-titlebar') !== null) return
  const bar = document.createElement('div')
  bar.id = 'dsh-titlebar'
  bar.style.cssText = [
    'position: fixed', 'top: 0', 'left: 0', 'right: 0', 'height: 40px',
    'display: flex', 'align-items: center', 'justify-content: flex-end',
    'z-index: 2147483647', '-webkit-app-region: drag', 'user-select: none',
    'background: ${background}', 'border-bottom: 1px solid ${border}',
  ].join(';')
  const button = (action, label) => {
    const node = document.createElement('button')
    node.textContent = label
    node.style.cssText = [
      'width: 46px', 'height: 100%', 'border: none', 'background: transparent',
      'color: ${foreground}', 'font-size: 13px', 'cursor: default', 'outline: none',
      '-webkit-app-region: no-drag', 'display: flex', 'align-items: center',
      'justify-content: center',
    ].join(';')
    node.onmouseenter = () => { node.style.background = '${hover}' }
    node.onmouseleave = () => { node.style.background = 'transparent' }
    node.onclick = () => { window.dshWindow[action]() }
    return node
  }
  bar.append(button('minimize', '\\u2500'))
  bar.append(button('toggleMaximize', '\\u25A1'))
  const close = button('close', '\\u2715')
  close.onmouseenter = () => { close.style.background = '#e81123'; close.style.color = '#ffffff' }
  close.onmouseleave = () => { close.style.background = 'transparent'; close.style.color = '${foreground}' }
  bar.append(close)
  document.body.prepend(bar)
  const root = document.getElementById('root')
  if (root !== null) {
    root.style.height = 'calc(100vh - 40px)'
    root.style.marginTop = '40px'
  }
})()`
}

/** Inject the frameless title bar into the page; a no-op once present. */
function injectTitleBar(win: BrowserWindow): void {
  void win.webContents.executeJavaScript(TITLE_BAR_INJECTION(nativeTheme.shouldUseDarkColors))
}

/** Route the injected title bar's window controls to this window. */
ipcMain.on('dsh-window-control', (event, action: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win === null) return
  switch (action) {
    case 'minimize':
      win.minimize()
      break
    case 'toggle-maximize':
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
      break
    case 'close':
      win.close()
      break
    default:
      void win.webContents.executeJavaScript(`console.warn('dsh title bar: unknown window control', ${JSON.stringify(action)})`)
  }
})

/** Wait until the web server answers, so the window never opens on an error page. */
async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  for (;;) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The server is still binding; probe again after the poll interval.
    }
    if (Date.now() >= deadline) {
      fatal(`web server at ${url} did not become ready within ${READY_TIMEOUT_MS}ms`)
    }
    await new Promise<void>((resolve) => { setTimeout(resolve, READY_POLL_MS) })
  }
}

/**
 * The dsh CLI entry this app starts its server from: the materialized runtime
 * copy of the bundled node_modules in a packaged app, or the checkout's built
 * apps/cli from a dev launch (this entry sits at apps/electron/lib/main.js).
 */
function embeddedDshEntry(): string {
  return app.isPackaged
    ? join(RUNTIME_NODE_MODULES, '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    : join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'cli', 'lib', 'bin.js')
}

/** Where the packaged runtime lands on disk, keyed by app version. */
const RUNTIME_NODE_MODULES = join(app.getPath('userData'), 'runtime', app.getVersion(), 'node_modules')

/** Recursively copy one directory tree (asar reads resolve unpacked stubs). */
async function copyDir(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true })
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const source = join(src, entry.name)
    const target = join(dst, entry.name)
    if (entry.isDirectory()) await copyDir(source, target)
    else await copyFile(source, target)
  }
}

/**
 * Materialize the bundled node_modules onto disk. dsh's profile fallback
 * heals symlinks that point at the installation; inside an asar those targets
 * do not exist on the real filesystem, so the server must run from a disk
 * copy. Cached per app version; the copy lands in a temp dir and renames into
 * place so an interrupted first run never leaves a partial tree.
 */
async function ensureRuntimeCopy(): Promise<void> {
  if (existsSync(RUNTIME_NODE_MODULES)) return
  const startedAt = Date.now()
  const staging = `${RUNTIME_NODE_MODULES}.tmp`
  await copyDir(join(app.getAppPath(), 'node_modules'), staging)
  await rename(staging, RUNTIME_NODE_MODULES)
  console.error(`electron: materialized runtime in ${Date.now() - startedAt}ms`)
}

/**
 * Start the app's own dsh web server: an `ELECTRON_RUN_AS_NODE` child running
 * the CLI with an OS-assigned port, and wait for the readiness line that names
 * the URL. The server's stderr forwards to this process's.
 * @returns the loopback URL once the server is up.
 */
function startEmbeddedServer(): Promise<string> {
  const child = spawn(process.execPath, [embeddedDshEntry(), 'web', '--port', '0'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverProcess = child
  child.stderr.pipe(process.stderr)
  let stdout = ''
  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
  return new Promise<string>((resolve, reject) => {
    // Failures before the window exists have no console; the tail of the
    // server's stderr is what fatal() shows in the error dialog.
    const failureDetail = (reason: string): string => {
      const tail = stderr.trim().split('\n').slice(-12).join('\n')
      return `${reason}${tail === '' ? '' : `\n\n${tail}`}`
    }
    const deadline = setTimeout(() => {
      reject(new Error(failureDetail(`dsh server did not become ready within ${READY_TIMEOUT_MS}ms`)))
      child.kill()
    }, READY_TIMEOUT_MS)
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      const url = serverUrlFromLine(stdout)
      if (url !== undefined) {
        clearTimeout(deadline)
        resolve(url)
      }
    })
    child.on('exit', (code) => {
      clearTimeout(deadline)
      reject(new Error(failureDetail(`dsh server exited with code ${String(code)} before becoming ready`)))
    })
  })
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0)
} else {
  app.on('second-instance', showMainWindow)
  app.on('activate', showMainWindow)
  // Closing the window hides it instead of quitting, so this only ever fires
  // during a real quit (when the window's close is let through); quitting
  // again is a no-op.
  app.on('window-all-closed', () => { app.quit() })
  // A real quit is the only path that destroys the window.
  app.on('before-quit', () => { quitting = true })
  // The embedded server must not outlive the app: quitting kills it, and its
  // own exit quits the app (the readiness handler already settled).
  app.on('before-quit', () => {
    if (serverProcess?.exitCode === null) serverProcess.kill()
  })
  void app.whenReady().then(async () => {
    // No external harness URL: start this app's own server, dev or packaged.
    let url = webUrl
    if (url === undefined) {
      try {
        if (app.isPackaged) await ensureRuntimeCopy()
        url = await startEmbeddedServer()
      } catch (error) {
        fatal(error instanceof Error ? error.message : String(error))
      }
      if (serverProcess !== undefined) serverProcess.on('exit', () => { app.quit() })
    }
    await waitForServer(url)
    activeUrl = url
    if (process.platform === 'darwin') {
      app.dock?.setIcon(nativeImage.createFromPath(APP_ICON))
    }
    showMainWindow()
    createTray()
    // An external launcher pipes its stdin into this process; EOF means it
    // died without the teardown that would have killed us directly.
    process.stdin.on('end', () => { app.quit() })
  }, () => {
    // fatal has already reported the failure; this settles its throw so
    // startup failures exit cleanly instead of lingering as an unhandled
    // promise rejection.
    app.exit(1)
  })
}
