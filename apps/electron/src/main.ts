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
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { healProfilesModuleFallback } from '@deepseek-ai/dsh-app-boot'
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
const APP_ICON = join(ASSET_DIR, 'icon2.png')

/** The denser Windows/Linux window icon: the same mark nearly filling the
 * tile, so the taskbar button reads larger than the macOS dock layout. */
const WINDOW_ICON = join(ASSET_DIR, 'icon2.png')

/** The Windows window icon as a multi-resolution .ico, so the taskbar and
 * Alt-Tab pick exact sizes instead of downscaling a single PNG. */
const WINDOW_ICON_ICO = join(ASSET_DIR, 'icon2.ico')

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
      icon: IS_MAC ? APP_ICON : (process.platform === 'win32' ? WINDOW_ICON_ICO : WINDOW_ICON),
      autoHideMenuBar: true,
      // No system title bar: macOS keeps the traffic lights over the injected
      // drag strip (hidden style), win/linux go fully frameless and get the
      // injected title bar with its own window controls.
      ...(IS_MAC
        ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 14, y: 14 } }
        : { frame: false }),
      webPreferences: {
        preload: PRELOAD,
        sandbox: false,
      },
    })
    mainWindow.on('closed', () => { mainWindow = undefined })
    // Keep the injected title bar's restore icon in sync with the window state.
    mainWindow.on('maximize', () => { mainWindow?.webContents.send('dsh-window-maximize-state', true) })
    mainWindow.on('unmaximize', () => { mainWindow?.webContents.send('dsh-window-maximize-state', false) })
    // Closing the window hides the app to the tray; the tray menu (or Cmd+Q)
    // is the real exit path. A quit in progress lets the close through.
    mainWindow.on('close', (event) => {
      if (quitting) return
      event.preventDefault()
      mainWindow?.hide()
    })
    void mainWindow.loadURL(activeUrl)
    // The injected title bar reads window.dshWindow (win/linux window
    // controls); a failed preload silently breaks that, so report it.
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
    mainWindow.webContents.on('did-finish-load', () => {
      if (mainWindow !== undefined) injectTitleBar(mainWindow)
    })
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

/**
 * The title bar injected into the page, as a script. win/linux get a visible
 * in-flow strip (SVG window controls, theme-matched background) with the
 * content sized below it; macOS gets a fully transparent overlay that leaves
 * the layout untouched — the system traffic lights already float over it, and
 * only strip areas with nothing interactive below drag the window.
 */
const TITLE_BAR_INJECTION = (dark: boolean, mac: boolean): string => {
  const foreground = dark ? '#e8e8e8' : '#1a1a1a'
  const hover = dark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.06)'
  const minimizeIcon = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.2"/></svg>'
  const maximizeIcon = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="8" height="8" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>'
  const restoreIcon = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2.5" y="3" width="6" height="6" stroke="currentColor" stroke-width="1.2" fill="none"/><line x1="2.5" y1="3.5" x2="2.5" y2="1.5" stroke="currentColor" stroke-width="1.2"/><line x1="2.5" y1="1.5" x2="9.5" y2="1.5" stroke="currentColor" stroke-width="1.2"/><line x1="9.5" y1="1.5" x2="9.5" y2="3" stroke="currentColor" stroke-width="1.2"/></svg>'
  const closeIcon = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="2.5" y1="2.5" x2="9.5" y2="9.5" stroke="currentColor" stroke-width="1.2"/><line x1="9.5" y1="2.5" x2="2.5" y2="9.5" stroke="currentColor" stroke-width="1.2"/></svg>'
  const chrome = mac ? '' : `
  const fallback = ${dark ? "'rgb(26, 26, 28)'" : "'rgb(247, 248, 250)'"}
  const foreground = ${JSON.stringify(foreground)}
  const hover = ${JSON.stringify(hover)}
  const closeHover = '#e81123'
  // In-flow strip: the bar occupies its own 36px so the page below it never
  // overflows (no document scrollbar) and nothing sits underneath it; sticky
  // keeps it pinned while the app's own containers scroll. The background is
  // the sidebar token as a var(): the theme presenter flips
  // body[data-ds-dark-theme] at runtime, and the variable cascades to this
  // body child, so the strip follows light/dark switches with the column.
  bar.style.height = '36px'
  bar.style.position = 'sticky'
  bar.style.alignItems = 'stretch'
  bar.style.backgroundColor = 'var(--dsw-specific-sidebar-fill, ' + fallback + ')'
  bar.style.color = foreground
  const control = (icon, hoverBg, onClick) => {
    const node = document.createElement('button')
    node.type = 'button'
    node.style.cssText = [
      'width: 46px', 'height: 100%', 'margin: 0', 'padding: 0', 'border: none',
      'background: transparent', 'color: inherit', 'cursor: default', 'outline: none',
      'flex-shrink: 0', 'display: flex', 'align-items: center', 'justify-content: center',
      '-webkit-app-region: no-drag',
    ].join(';')
    node.innerHTML = icon
    node.onmouseenter = () => { node.style.background = hoverBg }
    node.onmouseleave = () => { node.style.background = 'transparent' }
    node.onclick = onClick
    return node
  }
  bar.append(control(${JSON.stringify(minimizeIcon)}, hover, () => { window.dshWindow.minimize() }))
  const maxBtn = control(${JSON.stringify(maximizeIcon)}, hover, () => { window.dshWindow.toggleMaximize() })
  const setMaxIcon = (maximized) => { maxBtn.innerHTML = maximized ? ${JSON.stringify(restoreIcon)} : ${JSON.stringify(maximizeIcon)} }
  if (typeof window.dshWindow.maximized === 'function') void window.dshWindow.maximized().then(setMaxIcon)
  if (typeof window.dshWindow.onMaximizeStateChange === 'function') window.dshWindow.onMaximizeStateChange(setMaxIcon)
  bar.append(maxBtn)
  const closeBtn = control(${JSON.stringify(closeIcon)}, closeHover, () => { window.dshWindow.close() })
  closeBtn.onmouseenter = () => { closeBtn.style.background = closeHover; closeBtn.style.color = '#ffffff' }
  closeBtn.onmouseleave = () => { closeBtn.style.background = 'transparent'; closeBtn.style.color = foreground }
  bar.append(closeBtn)
  const root = document.getElementById('root')
  if (root !== null) {
    root.style.height = 'calc(100vh - 36px)'
    root.style.boxSizing = 'border-box'
  }
  document.documentElement.style.height = '100%'
  document.body.style.margin = '0'
  document.body.style.height = '100%'
  document.body.style.overflow = 'hidden'`
  // macOS: the strip container stays fully pointer-transparent, so nothing
  // below ever loses a click. Window dragging comes from small drag segments
  // planted only where no interactive element sits — the strip is a fixed
  // overlay, so instead of switching app-region live (draggable regions
  // swallow all pointer events and would freeze the switch), the segments
  // are rebuilt from a scan whenever the page changes.
  const dragSegments = mac ? `
  const STRIP_HEIGHT = 40
  const INTERACTIVE_SELECTOR = [
    'a', 'button', 'input', 'textarea', 'select', 'label', 'summary', 'details',
    'audio', 'video', 'iframe',
    '[role="button"]', '[role="link"]', '[role="textbox"]', '[role="checkbox"]',
    '[role="radio"]', '[role="switch"]', '[role="combobox"]', '[role="searchbox"]',
    '[role="slider"]', '[role="spinbutton"]', '[role="menuitem"]', '[role="tab"]',
    '[role="option"]', '[role="treeitem"]', '[role="gridcell"]', '[role="listbox"]',
    '[role="dialog"]', '[role="select"]', '[contenteditable="true"]', '[contenteditable=""]',
  ].join(',')
  const dragSegment = (left, width) => {
    const seg = document.createElement('div')
    seg.className = 'dsh-dragseg'
    seg.style.cssText = [
      'position: fixed', 'top: 0', 'left: ' + left + 'px', 'width: ' + width + 'px',
      'height: ' + STRIP_HEIGHT + 'px', '-webkit-app-region: drag',
    ].join(';')
    return seg
  }
  const observer = new MutationObserver(() => { requestAnimationFrame(rebuildDragSegments) })
  const rebuildDragSegments = () => {
    observer.disconnect()
    bar.querySelectorAll('.dsh-dragseg').forEach((seg) => { seg.remove() })
    const width = window.innerWidth
    const occupied = []
    for (const el of document.querySelectorAll(INTERACTIVE_SELECTOR)) {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue
      const rect = el.getBoundingClientRect()
      // Wide decorative plates (brand marks, header banners) read as title-bar
      // chrome rather than controls; only narrow buttons keep their clicks.
      if (rect.right - rect.left > 160) continue
      if (rect.top < STRIP_HEIGHT && rect.bottom > 0 && rect.left < width && rect.right > 0) {
        occupied.push([Math.max(0, rect.left), Math.min(width, rect.right)])
      }
    }
    occupied.sort((a, b) => a[0] - b[0])
    const merged = []
    for (const [left, right] of occupied) {
      const last = merged[merged.length - 1]
      if (last !== undefined && left <= last[1]) last[1] = Math.max(last[1], right)
      else merged.push([left, right])
    }
    let x = 0
    for (const [left, right] of merged) {
      if (left > x) bar.append(dragSegment(x, left - x))
      x = Math.max(x, right)
    }
    if (x < width) bar.append(dragSegment(x, width - x))
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
  }
  rebuildDragSegments()
  window.addEventListener('resize', rebuildDragSegments)
  window.addEventListener('scroll', () => { requestAnimationFrame(rebuildDragSegments) }, true)
  window.setInterval(rebuildDragSegments, 1000)
` : ''
  return `(() => {
  if (document.getElementById('dsh-titlebar') !== null) return
  const bar = document.createElement('div')
  bar.id = 'dsh-titlebar'
  bar.style.cssText = [
    'position: fixed', 'top: 0', 'left: 0', 'right: 0', 'height: 40px',
    'display: flex', 'align-items: center', 'justify-content: flex-end',
    'z-index: 2147483647', 'user-select: none',
    ${mac ? "'pointer-events: none'" : "'-webkit-app-region: drag'"},
  ].join(';')
  ${chrome}
  ${dragSegments}
  document.body.prepend(bar)
})()`
}

/** Inject the title bar into the page; a no-op once present. */
function injectTitleBar(win: BrowserWindow): void {
  void win.webContents.executeJavaScript(TITLE_BAR_INJECTION(nativeTheme.shouldUseDarkColors, IS_MAC))
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

/** The injected title bar's restore icon needs the current maximized state. */
ipcMain.handle('dsh-window-is-maximized', (event): boolean => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win?.isMaximized() ?? false
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
const RUNTIME_DIR = join(app.getPath('userData'), 'runtime', app.getVersion())
const RUNTIME_NODE_MODULES = join(RUNTIME_DIR, 'node_modules')
/** The electron patch layer, materialized beside the runtime for the server child. */
const RUNTIME_PATCH = join(RUNTIME_DIR, 'cordis.patch.yml')
/** The electron app's own manifest, materialized beside the runtime for the server child. */
const RUNTIME_PACKAGE_JSON = join(RUNTIME_DIR, 'package.json')

/**
 * The electron patch layer the embedded server applies via `--patch`: the
 * checkout's file in dev, the asar copy in a packaged app (both sit one level
 * above this entry's lib/). It inserts the electron-only UI adaptation rows
 * that the web profile's own layers do not mount.
 */
function embeddedPatchFile(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'cordis.patch.yml')
}

/**
 * The electron app's own manifest, the anchor whose dependency closure the
 * profile fallback heals so the patch's bare plugin rows resolve: the checkout
 * file in dev, the materialized copy in a packaged app.
 */
function electronManifestPath(): string {
  return app.isPackaged
    ? RUNTIME_PACKAGE_JSON
    : join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
}

/**
 * Recursively copy one directory tree onto disk.  The source lives inside an
 * asar; Electron's patched `readFile` transparently redirects to the
 * `app.asar.unpacked` companion for files that were unpacked at build time, so
 * every `readFile` resolves to a real on-disk path that the child process can
 * later access without the asar layer.
 */
async function copyDir(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true })
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const source = join(src, entry.name)
    const target = join(dst, entry.name)
    if (entry.isDirectory()) {
      await copyDir(source, target)
    } else {
      // Electron's asar layer redirects reads to app.asar.unpacked for files
      // that were unpacked at build time, but the redirect can fail when the
      // unpacked stub in the asar index doesn't match the actual on-disk
      // layout.  Read directly from the unpacked path first; fall back to the
      // asar path for JS-only files that were never unpacked.
      const unpacked = source.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
      try {
        await writeFile(target, await readFile(unpacked))
      } catch {
        try {
          await writeFile(target, await readFile(source))
        } catch {
          // Skip entries the asar index listed but that exist on neither
          // the unpacked tree nor the archive (stale symlinks, etc.).
        }
      }
    }
  }
}

/**
 * Materialize the bundled runtime onto disk. dsh's profile fallback heals
 * symlinks that point at the installation; inside an asar those targets do not
 * exist on the real filesystem, so the server must run from a disk copy.
 * Cached per app version; the copy lands in a temp dir and renames into place
 * so an interrupted first run never leaves a partial tree. The electron patch
 * and the app's own manifest ride along: the server child is plain Node and
 * cannot read asar paths, and its profile fallback heal needs the electron
 * closure (the CLI's own closure lacks the electron-only plugin rows).
 */
async function ensureRuntimeCopy(): Promise<void> {
  if (!existsSync(RUNTIME_NODE_MODULES)) {
    const startedAt = Date.now()
    const staging = `${RUNTIME_NODE_MODULES}.tmp`
    await copyDir(join(app.getAppPath(), 'node_modules'), staging)
    await rename(staging, RUNTIME_NODE_MODULES)
    console.error(`electron: materialized runtime in ${Date.now() - startedAt}ms`)
  }
  await writeFile(RUNTIME_PATCH, await readFile(embeddedPatchFile()))
  await writeFile(RUNTIME_PACKAGE_JSON, await readFile(join(app.getAppPath(), 'package.json')))
}

/**
 * Start the app's own dsh web server: an `ELECTRON_RUN_AS_NODE` child running
 * the CLI with an OS-assigned port, and wait for the readiness line that names
 * the URL. The server's stderr forwards to this process's.
 * @returns the loopback URL once the server is up.
 */
function startEmbeddedServer(): Promise<string> {
  const patchPath = app.isPackaged ? RUNTIME_PATCH : embeddedPatchFile()
  // --patch must precede --port: the CLI treats an unknown option's value as
  // the first positional, after which enablePositionalOptions stops parsing
  // options entirely.
  const child = spawn(process.execPath, [embeddedDshEntry(), 'web', '--patch', patchPath, '--port', '0'], {
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
    // Windows keys the taskbar button off the app identity; matching the
    // packaged appId keeps dev runs grouped under the same icon.
    if (process.platform === 'win32') app.setAppUserModelId('ai.deepseek.harness')
    // No external harness URL: start this app's own server, dev or packaged.
    let url = webUrl
    if (url === undefined) {
      try {
        if (app.isPackaged) await ensureRuntimeCopy()
        // The patch's plugin rows resolve through the profile module
        // fallback; heal it from the electron closure so the CLI's own heal
        // (which lacks the electron-only rows) leaves them linked.
        healProfilesModuleFallback(electronManifestPath())
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
