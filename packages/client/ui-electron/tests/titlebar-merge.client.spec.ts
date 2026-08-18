// @vitest-environment jsdom
/**
 * TitlebarMerger spec: the logo row overlays the injected title-bar band on
 * Windows, its width tracks the sidebar column, only the toggle and the
 * wordmark graphic take clicks (the rest passes through to the drag region),
 * and dispose restores the inline styles. The observer path runs against a
 * jsdom DOM with stubbed ResizeObserver; element discovery follows the shell
 * nesting (#root > frame > sidebar column > sidebar root > logo row).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TitlebarMerger, startWindowsTitlebarMerge } from '../src/client/titlebar-merge.ts'

/** Captures the ResizeObserver callback so tests can fire resizes manually. */
let fireResize: (() => void) | null = null
class ResizeObserverStub {
  cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) { this.cb = cb }
  observe(): void { fireResize = () => { this.cb([], this) } }
  unobserve(): void {}
  disconnect(): void { fireResize = null }
}

function shellHtml(): string {
  return [
    '<div id="dsh-titlebar"></div>',
    '<div id="root">',
    '  <div data-slot="root">',
    '    <div class="frame">',
    '      <div class="sidebar-col">',
    '        <div data-slot="sidebar">',
    '          <div class="sidebar-root">',
    '            <div class="logo-row">',
    '              <button class="brand"><svg data-name="wordmark"></svg></button>',
    '              <button class="toggle"><svg data-name="fish"></svg><svg data-name="panel"></svg></button>',
    '            </div>',
    '          </div>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>',
  ].join('')
}

function mount(): { titlebar: HTMLElement; column: HTMLElement; logoRow: HTMLElement } {
  document.body.innerHTML = shellHtml()
  const titlebar = document.getElementById('dsh-titlebar') as HTMLElement
  const column = document.querySelector('.sidebar-col') as HTMLElement
  const logoRow = document.querySelector('.logo-row') as HTMLElement
  return { titlebar, column, logoRow }
}

function columnWidth(column: HTMLElement, width: number): void {
  Object.defineProperty(column, 'clientWidth', { value: width, configurable: true })
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  document.body.innerHTML = ''
  fireResize = null
  vi.unstubAllGlobals()
})

describe('TitlebarMerger', () => {
  it('overlays the logo row into the title-bar band, drags as a region, and keeps the toggle clickable', () => {
    const { titlebar, column, logoRow } = mount()
    columnWidth(column, 280)
    Object.defineProperty(titlebar, 'offsetHeight', { value: 40, configurable: true })
    const [brand, toggle] = logoRow.querySelectorAll('button')
    const brandSvg = brand!.querySelector('svg')!
    // jsdom's CSSStyleDeclaration does not know -webkit-app-region; spy on
    // the per-element style writes to assert the drag-region contract.
    const rowSet = vi.spyOn(logoRow.style, 'setProperty')
    const brandSet = vi.spyOn(brand!.style, 'setProperty')
    const toggleSet = vi.spyOn(toggle!.style, 'setProperty')
    const svgSet = vi.spyOn(brandSvg.style, 'setProperty')
    const merger = new TitlebarMerger()
    merger.start()
    expect(logoRow.style.position).toBe('fixed')
    expect(logoRow.style.top).toBe('0px')
    expect(logoRow.style.left).toBe('0px')
    expect(logoRow.style.zIndex).toBe('2147483647')
    expect(logoRow.style.height).toBe('40px')
    expect(logoRow.style.width).toBe('280px')
    expect(logoRow.style.paddingLeft).toBe('12px')
    expect(rowSet).toHaveBeenCalledWith('-webkit-app-region', 'drag')
    expect(brandSet).toHaveBeenCalledWith('-webkit-app-region', 'no-drag')
    expect(toggleSet).toHaveBeenCalledWith('-webkit-app-region', 'no-drag')
    expect(svgSet).toHaveBeenCalledWith('-webkit-app-region', 'no-drag')
    expect(brand!.style.pointerEvents).toBe('none')
    expect(brandSvg.style.pointerEvents).toBe('auto')
    expect(brandSvg.style.cursor).toBe('pointer')
    expect(toggle!.style.pointerEvents).toBe('auto')
    const rowRemove = vi.spyOn(logoRow.style, 'removeProperty')
    const brandRemove = vi.spyOn(brand!.style, 'removeProperty')
    const svgRemove = vi.spyOn(brandSvg.style, 'removeProperty')
    merger.dispose()
    expect(logoRow.style.position).toBe('')
    expect(logoRow.style.paddingLeft).toBe('')
    expect(brand!.style.pointerEvents).toBe('')
    expect(brandSvg.style.pointerEvents).toBe('')
    expect(rowRemove).toHaveBeenCalledWith('-webkit-app-region')
    expect(brandRemove).toHaveBeenCalledWith('-webkit-app-region')
    expect(svgRemove).toHaveBeenCalledWith('-webkit-app-region')
  })

  it('falls back to the default strip height when the title bar has no layout', () => {
    const { column, logoRow } = mount()
    columnWidth(column, 280)
    const merger = new TitlebarMerger()
    merger.start()
    expect(logoRow.style.height).toBe('36px')
    merger.dispose()
  })

  it('tracks the sidebar column width on resize', () => {
    const { column, logoRow } = mount()
    columnWidth(column, 280)
    const merger = new TitlebarMerger()
    merger.start()
    expect(logoRow.style.width).toBe('280px')
    columnWidth(column, 140)
    fireResize?.()
    expect(logoRow.style.width).toBe('140px')
    merger.dispose()
  })

  it('does nothing without the injected title bar', () => {
    const { titlebar, logoRow } = mount()
    titlebar.remove()
    const merger = new TitlebarMerger()
    merger.start()
    expect(logoRow.style.position).toBe('')
    merger.dispose()
  })

  it('does nothing while the app has not rendered the sidebar', () => {
    document.body.innerHTML = '<div id="dsh-titlebar"></div><div id="root"><div data-slot="root"><div class="boot"></div></div></div>'
    const merger = new TitlebarMerger()
    merger.start()
    expect(document.querySelector('.logo-row')).toBeNull()
    merger.dispose()
  })

  it('merges when the title bar appears after start', async () => {
    const { titlebar, logoRow } = mount()
    titlebar.remove()
    const merger = new TitlebarMerger()
    merger.start()
    expect(logoRow.style.position).toBe('')
    const later = document.createElement('div')
    later.id = 'dsh-titlebar'
    document.body.prepend(later)
    await vi.waitFor(() => { expect(logoRow.style.position).toBe('fixed') })
    merger.dispose()
  })

  it('re-merges onto a remounted logo row', async () => {
    const { column, logoRow } = mount()
    columnWidth(column, 280)
    const merger = new TitlebarMerger()
    merger.start()
    expect(logoRow.style.position).toBe('fixed')
    logoRow.remove()
    const fresh = document.createElement('div')
    fresh.className = 'logo-row'
    fresh.innerHTML = '<button class="brand"><svg></svg></button><button class="toggle"><svg></svg></button>'
    document.querySelector('.sidebar-root')!.append(fresh)
    await vi.waitFor(() => { expect(fresh.style.position).toBe('fixed') })
    merger.dispose()
  })

  it('restore tolerates a logo row that left the document', () => {
    const { column, logoRow } = mount()
    columnWidth(column, 280)
    const merger = new TitlebarMerger()
    merger.start()
    logoRow.remove()
    expect(() => { merger.dispose() }).not.toThrow()
  })
})

describe('startWindowsTitlebarMerge', () => {
  it('returns a working disposer', () => {
    const { column, logoRow } = mount()
    columnWidth(column, 280)
    const dispose = startWindowsTitlebarMerge()
    expect(logoRow.style.position).toBe('fixed')
    dispose()
    expect(logoRow.style.position).toBe('')
  })
})
