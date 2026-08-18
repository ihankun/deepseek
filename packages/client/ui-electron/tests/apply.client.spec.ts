// @vitest-environment jsdom
// Client apply wiring: provides the platform service, adds the electron body
// classes per platform, and on Windows starts the title-bar merge. The node
// half and the invariant companion ride along — one line each keeps the
// aggregate coverage gate's exercised surface honest.
import { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { DefaultPlatformService } from '../src/client/platform-service.ts'

const BRIDGE = {
  platform: 'win32',
  minimize: () => {},
  toggleMaximize: () => {},
  close: () => {},
  getSavedBounds: () => Promise.resolve(null),
  setBounds: () => Promise.resolve(true),
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
    '              <button class="brand"><svg></svg></button>',
    '              <button class="toggle"><svg></svg></button>',
    '            </div>',
    '          </div>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>',
  ].join('')
}

async function mount(platform: string) {
  window.dshWindow = { ...BRIDGE, platform }
  const ctx = new Context()
  // The plugin declares 'slots' and 'layout' as injects; apply never reads
  // them today, so stubs satisfy the fiber while it activates.
  ctx.provide('slots', {} as never)
  ctx.provide('layout', {} as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  document.body.innerHTML = ''
  document.body.className = ''
  delete window.dshWindow
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

describe('ui-electron client apply', () => {
  it('declares its service dependencies', () => {
    expect(inject).toEqual(['slots', 'layout'])
  })

  it('provides and later unprovides the platform service', async () => {
    const { ctx, fiber } = await mount('win32')
    expect(ctx.get('platform')).toBeInstanceOf(DefaultPlatformService)
    await fiber.dispose()
    expect(ctx.get('platform')).toBeUndefined()
  })

  it('adds the macOS classes and the electron marker', async () => {
    const { fiber } = await mount('darwin')
    expect(document.body.classList.contains('dsh-electron')).toBe(true)
    expect(document.body.classList.contains('dsh-electron-mac')).toBe(true)
    expect(document.body.classList.contains('dsh-electron-win')).toBe(false)
    await fiber.dispose()
    expect(document.body.classList.contains('dsh-electron')).toBe(false)
    expect(document.body.classList.contains('dsh-electron-mac')).toBe(false)
  })

  it('adds the windows marker and merges the title bar', async () => {
    document.body.innerHTML = shellHtml()
    const { fiber } = await mount('win32')
    expect(document.body.classList.contains('dsh-electron')).toBe(true)
    expect(document.body.classList.contains('dsh-electron-win')).toBe(true)
    const logoRow = document.querySelector('.logo-row') as HTMLElement
    expect(logoRow.style.position).toBe('fixed')
    await fiber.dispose()
    expect(logoRow.style.position).toBe('')
    expect(document.body.classList.contains('dsh-electron-win')).toBe(false)
  })

  it('adds no electron classes in a plain browser', async () => {
    const ctx = new Context()
    ctx.provide('slots', {} as never)
    ctx.provide('layout', {} as never)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.get('platform')).toBeInstanceOf(DefaultPlatformService)
    expect(document.body.classList.contains('dsh-electron')).toBe(false)
    await fiber.dispose()
  })

  it('restores the saved window bounds at boot', async () => {
    const setBounds = vi.fn().mockResolvedValue(true)
    const saved = { x: 10, y: 20, width: 1000, height: 700 }
    window.dshWindow = { ...BRIDGE, setBounds, getSavedBounds: () => Promise.resolve(saved) }
    const ctx = new Context()
    ctx.provide('slots', {} as never)
    ctx.provide('layout', {} as never)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(setBounds).toHaveBeenCalledWith(saved)
    await fiber.dispose()
  })
})
