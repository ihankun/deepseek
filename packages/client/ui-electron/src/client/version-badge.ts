/**
 * Version badge for the desktop shell's brand wordmark.
 *
 * The wordmark svg (BrandWordmark) draws the HARNESS badge as path data, so
 * its text cannot be swapped in place. Instead, this overlays an absolutely
 * positioned label on top of the badge region: hidden by default (the svg's
 * HARNESS shows), and revealed on hover over the brand so the wordmark reads
 * as the app version. The label's background uses the same theme tokens as the
 * badge so the swap is seamless in both light and dark themes.
 * @module @deepseek-ai/dsh-client-ui-electron/version-badge
 */

/** The injected overlay label element's id. */
const BADGE_ID = 'dsh-version-badge-label'
/** The one-time style element id. */
const STYLES_ID = 'dsh-version-badge-styles'
/** The wordmark's viewBox; badge geometry is expressed in its units. */
const VIEWBOX_WIDTH = 182
const VIEWBOX_HEIGHT = 24
/** The HARNESS badge plate's box in viewBox units (BrandWordmark svg). */
const BADGE_X = 129.348
const BADGE_Y = 5.5
const BADGE_WIDTH = 52
const BADGE_HEIGHT = 14

/** The current label overlay, with its geometry listeners, or null. */
interface BadgeInstance {
  label: HTMLDivElement
  brand: HTMLElement
  position: () => void
}

/** A plain-resize observer handle kept beside the label for disposal. */
interface ResizeObserverAware {
  __resizeObserver?: ResizeObserver
}

/** The attached badge instance, or null while not attached. */
let instance: BadgeInstance | null = null

/** The sidebar's brand button: the logo row's first button carrying the wordmark svg. */
function findBrand(): HTMLElement | null {
  const outlet = document.querySelector('#root [data-slot="sidebar"]')
  const sidebarRoot = outlet?.firstElementChild
  const logoRow = sidebarRoot?.firstElementChild
  if (!(logoRow instanceof HTMLElement)) return null
  for (const button of logoRow.querySelectorAll('button')) {
    if (button.querySelector('svg') !== null) return button
  }
  return null
}

/**
 * Wire the hover-to-version badge onto the brand wordmark.
 * A MutationObserver waits for the brand button, injects the overlay, and
 * removes it again if the tree changes shape (re-render, collapse).
 * @returns the disposer.
 */
export function startVersionBadge(): () => void {
  const observer = new MutationObserver(() => { sync() })
  sync()
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    detach()
  }
}

/** Attach the overlay to the brand wordmark, or detach when it is gone. */
function sync(): void {
  const brand = findBrand()
  if (brand === null) {
    detach()
    return
  }
  const svg = brand.querySelector('svg')
  if (!(svg instanceof SVGSVGElement) || instance?.brand === brand) return
  detach()
  attach(brand, svg)
}

/** Inject the version label over the badge plate and wire hover reveal. */
function attach(brand: HTMLElement, svg: SVGSVGElement): void {
  injectStyles()
  const label = document.createElement('div')
  label.id = BADGE_ID
  label.setAttribute('data-version-badge', '')
  label.style.position = 'absolute'
  label.style.display = 'flex'
  label.style.alignItems = 'center'
  label.style.justifyContent = 'center'
  label.style.borderRadius = '2px'
  label.style.pointerEvents = 'none'
  label.style.transition = 'opacity 120ms ease'
  label.style.fontSize = '12px'
  label.style.fontWeight = '600'
  label.style.letterSpacing = '0.02em'
  label.style.color = 'var(--dsw-alias-label-primary-inverted)'
  label.style.background = 'var(--dsw-alias-label-primary)'
  label.textContent = ''

  // The label is an HTML element, so it must live outside the svg. It is
  // positioned against the brand button (its containing block, set to
  // relative), and geometry is derived from the svg box offset within the
  // brand — not the viewport — so viewBox units map onto the rendered box.
  brand.style.position = 'relative'

  const position = (): void => {
    const svgRect = svg.getBoundingClientRect()
    const brandRect = brand.getBoundingClientRect()
    if (svgRect.width === 0 || svgRect.height === 0) return
    const scaleX = svgRect.width / VIEWBOX_WIDTH
    const scaleY = svgRect.height / VIEWBOX_HEIGHT
    label.style.left = `${BADGE_X * scaleX + (svgRect.left - brandRect.left)}px`
    label.style.top = `${BADGE_Y * scaleY + (svgRect.top - brandRect.top)}px`
    label.style.width = `${BADGE_WIDTH * scaleX}px`
    label.style.height = `${BADGE_HEIGHT * scaleY}px`
  }

  const resizeObserver = new ResizeObserver(position)
  resizeObserver.observe(brand)
  ;(label as HTMLElement & ResizeObserverAware).__resizeObserver = resizeObserver
  window.addEventListener('resize', position)
  position()

  brand.appendChild(label)
  instance = { label, brand, position }

  void (window.dshWindow?.version() ?? Promise.resolve(null)).then((version) => {
    if (version !== null && instance?.label === label) label.textContent = `V${version}`
  })
}

/** Remove the injected overlay and its geometry listeners. */
function detach(): void {
  const current = instance
  instance = null
  if (current === null) return
  const label = current.label as HTMLElement & ResizeObserverAware
  label.__resizeObserver?.disconnect()
  window.removeEventListener('resize', current.position)
  label.remove()
  current.brand.style.position = ''
}

/** The one-time style rule that reveals the label on brand hover. */
function injectStyles(): void {
  const existing = document.getElementById(STYLES_ID)
  if (existing instanceof HTMLStyleElement) return
  const style = document.createElement('style')
  style.id = STYLES_ID
  style.textContent = `
    button:has(> [data-version-badge]) { position: relative; }
    button:has(> [data-version-badge]) > [data-version-badge] { opacity: 0; }
    button:has(> [data-version-badge]):hover > [data-version-badge] { opacity: 1; }
  `
  document.head.appendChild(style)
}
