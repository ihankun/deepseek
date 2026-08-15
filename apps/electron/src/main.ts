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

import { app, BrowserWindow, Menu, Tray, dialog, nativeImage } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serverUrlFromLine } from './server-url.ts'

const ASSET_DIR = fileURLToPath(new URL('../assets/', import.meta.url))

/** The web server URL a harness launcher composed, read from the environment. */
const webUrl = process.env.DSH_WEB_URL

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
    })
    mainWindow.on('closed', () => { mainWindow = undefined })
    void mainWindow.loadURL(activeUrl)
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

/** The dsh CLI entry inside this packaged app, read from the bundled node_modules. */
function embeddedDshEntry(): string {
  return join(app.getAppPath(), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
}

/**
 * Start the packaged app's own dsh web server: an `ELECTRON_RUN_AS_NODE` child
 * running the bundled CLI with an OS-assigned port, and wait for the readiness
 * line that names the URL. The server's stderr forwards to this process's.
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
  return new Promise<string>((resolve, reject) => {
    const deadline = setTimeout(() => {
      reject(new Error(`dsh server did not become ready within ${READY_TIMEOUT_MS}ms`))
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
      reject(new Error(`dsh server exited with code ${String(code)} before becoming ready`))
    })
  })
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0)
} else {
  app.on('second-instance', showMainWindow)
  app.on('activate', showMainWindow)
  app.on('window-all-closed', () => { app.quit() })
  // The embedded server must not outlive its window: quitting kills it, and
  // its own exit quits the app (the readiness handler already settled).
  app.on('before-quit', () => {
    if (serverProcess?.exitCode === null) serverProcess.kill()
  })
  void app.whenReady().then(async () => {
    let url = webUrl
    if (url === undefined) {
      if (!app.isPackaged) {
        fatal('DSH_WEB_URL is not set; launch through the dsh electron profile')
      }
      try {
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
    // In the harness mode the launcher pipes its stdin into this process; EOF
    // means the launcher died without the tree teardown that would have
    // killed us directly. The packaged mode ignores stdin.
    process.stdin.on('end', () => { app.quit() })
  })
}
