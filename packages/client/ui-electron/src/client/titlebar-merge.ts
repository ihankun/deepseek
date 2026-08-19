/**
 * Windows title-bar merge for the desktop shell.
 *
 * The Electron main process injects a 36px title-bar strip (drag region plus
 * window controls) at the top of the page on Windows, leaving its left side
 * empty. This overlays the sidebar's logo row — the brand wordmark and the
 * collapse toggle — into that band with fixed positioning, so the window's
 * top-left corner carries the brand and the fold control instead of blank
 * chrome.
 *
 * The logo row stays inside the React tree, so its ancestor-state styling
 * (rail collapse geometry, the whale/panel hover swap, tooltips) keeps
 * working. The row becomes its own drag region — Electron swallows clicks
 * under a drag region, so the injected title bar below cannot serve
 * click-through — and the fold toggle (plus the wordmark graphic, which is
 * the new-session shortcut) carries `no-drag` to stay clickable, exactly the
 * contract the title bar's own window controls follow. The row's width
 * tracks the sidebar column, so the toggle stays aligned with the column
 * edge through drag-resize and collapse.
 * @module @deepseek-ai/dsh-client-ui-electron/titlebar-merge
 */

/** The injected title-bar strip's element id (apps/electron/src/main.ts). */
const TITLEBAR_ID = 'dsh-titlebar'
/** Fallback strip height when the injected element is not measurable yet. */
const TITLEBAR_HEIGHT_FALLBACK = 36
/** The injected title bar's own stacking level; the overlay must match it. */
const TITLEBAR_Z_INDEX = 2147483647
/** Left inset of the logo row, aligned with the sidebar's inline padding token. */
const LOGO_INSET_PX = 12

/**
 * The sidebar header seat plus its owning column, located through the slot
 * renderer's stable `[data-slot]` anchor: every render site wraps its content
 * in a `data-slot="<key>"` div (`display: contents`, layout-neutral), so the
 * sidebar outlet is a fixed address regardless of layout churn. The sidebar
 * root and its logo row (brand + fold toggle) hang directly under the outlet.
 */
interface SidebarHeader {
  /** The logo row to overlay into the title-bar band. */
  readonly logoRow: HTMLElement
  /** The sidebar column whose width the logo row mirrors. */
  readonly column: HTMLElement
}

/**
 * The sidebar's logo row and column, or null while the app has not rendered
 * the sidebar.
 * @returns the header seat and its column.
 */
function findSidebarHeader(): SidebarHeader | null {
  const outlet = document.querySelector('#root [data-slot="sidebar"]')
  const sidebarRoot = outlet?.firstElementChild
  const logoRow = sidebarRoot?.firstElementChild
  if (!(logoRow instanceof HTMLElement)) return null
  // The boot page and failure report also put a div at this chain's end; the
  // logo row is the brand + fold-toggle seat, so it always holds a button.
  if (logoRow.querySelector('button') === null) return null
  const column = outlet?.parentElement
  if (column === null || column === undefined) return null
  return { logoRow, column }
}

/**
 * Overlay the sidebar's logo row into the injected title-bar band on Windows.
 * The row is fixed at the window's top-left, its width mirrors the sidebar
 * column, and pointer events pass through everywhere except the fold toggle
 * and the brand wordmark graphic.
 */
export class TitlebarMerger {
  private readonly observer: MutationObserver
  private resizeObserver: ResizeObserver | undefined
  private row: HTMLElement | undefined

  constructor() {
    this.observer = new MutationObserver(() => { this.sync() })
  }

  /** Begin observing; a merge happens as soon as both elements exist. */
  start(): void {
    this.sync()
    this.observer.observe(document.body, { childList: true, subtree: true })
  }

  /** Unobserve and undo the overlay styles. */
  dispose(): void {
    this.observer.disconnect()
    this.resizeObserver?.disconnect()
    this.restore()
  }

  private sync(): void {
    const titlebar = document.getElementById(TITLEBAR_ID)
    const header = findSidebarHeader()
    if (titlebar === null || header === null) {
      this.restore()
      return
    }
    if (header.logoRow === this.row) return
    this.restore()
    this.merge(header.logoRow, header.column, titlebar)
  }

  private merge(row: HTMLElement, column: HTMLElement, titlebar: HTMLElement): void {
    const height = titlebar.offsetHeight > 0 ? titlebar.offsetHeight : TITLEBAR_HEIGHT_FALLBACK

    row.style.position = 'fixed'
    row.style.top = '0'
    row.style.left = '0'
    row.style.zIndex = String(TITLEBAR_Z_INDEX)
    row.style.height = `${height}px`
    row.style.margin = '0'
    row.style.width = `${column.clientWidth}px`
    // The class padding sits the logo flush against the window edge; the
    // title-bar band needs the sidebar's own inline inset so the wordmark
    // aligns with the content below.
    row.style.paddingLeft = `${LOGO_INSET_PX}px`
    // The row becomes its own drag region (Electron swallows clicks under a
    // drag region; the injected title bar below cannot serve click-through).
    row.style.setProperty('-webkit-app-region', 'drag')

    // The fold toggle is the row's last button; everything else is the brand
    // wordmark button, which spans the strip (flex: 1). Clickable elements
    // over a drag region need an explicit `no-drag` to receive events — the
    // same contract the injected title bar's own window controls follow. The
    // toggle stays fully interactive; the brand button stays click-through
    // except its wordmark graphic, so the rest of the strip drags the window.
    const buttons = [...row.querySelectorAll('button')]
    const toggle = buttons.at(-1)
    for (const button of buttons) {
      button.style.setProperty('-webkit-app-region', 'no-drag')
      if (button === toggle) {
        button.style.pointerEvents = 'auto'
        continue
      }
      button.style.pointerEvents = 'none'
      for (const graphic of button.querySelectorAll('svg')) {
        graphic.style.pointerEvents = 'auto'
        graphic.style.cursor = 'pointer'
        graphic.style.setProperty('-webkit-app-region', 'no-drag')
      }
    }

    this.row = row
    this.resizeObserver = new ResizeObserver(() => {
      row.style.width = `${column.clientWidth}px`
    })
    this.resizeObserver.observe(column)
  }

  private restore(): void {
    const row = this.row
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
    this.row = undefined
    if (row === undefined || !document.contains(row)) return
    row.style.position = ''
    row.style.top = ''
    row.style.left = ''
    row.style.zIndex = ''
    row.style.height = ''
    row.style.margin = ''
    row.style.width = ''
    row.style.paddingLeft = ''
    row.style.removeProperty('-webkit-app-region')
    for (const button of row.querySelectorAll('button')) {
      button.style.pointerEvents = ''
      button.style.removeProperty('-webkit-app-region')
      for (const graphic of button.querySelectorAll('svg')) {
        graphic.style.pointerEvents = ''
        graphic.style.cursor = ''
        graphic.style.removeProperty('-webkit-app-region')
      }
    }
  }
}

/** Start the merge and return its disposer. */
export function startWindowsTitlebarMerge(): () => void {
  const merger = new TitlebarMerger()
  merger.start()
  return () => { merger.dispose() }
}
