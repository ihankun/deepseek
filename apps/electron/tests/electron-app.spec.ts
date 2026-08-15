import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'

const { spawnMock, requireMock } = vi.hoisted(() => {
  const requireMock = vi.fn((specifier: string) => (
    specifier === 'electron' ? '/usr/bin/fake-electron' : '/fake/main.js'
  ))
  requireMock.resolve = vi.fn(() => '/fake/main.js')
  return { spawnMock: vi.fn(), requireMock }
})

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

// The built main entry lives in lib/, which tests never build; resolve it to a
// placeholder so apply() can be exercised without artifacts.
vi.mock('node:module', () => ({ createRequire: () => requireMock }))

afterEach(() => { vi.restoreAllMocks() })

/** A child-process stand-in carrying exactly the lifecycle surface apply() reads. */
function fakeChild(): {
  exitCode: number | null
  signalCode: string | null
  kill: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  emit: ReturnType<typeof vi.fn>
} {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {}
  const emit = vi.fn((event: string, ...args: unknown[]) => {
    for (const listener of listeners[event] ?? []) listener(...args)
  })
  return {
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
    emit,
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      ;(listeners[event] ??= []).push(listener)
    }),
  }
}

/** A context carrying the webServer service and a recorded appExit. */
function makeContext() {
  const exits: number[] = []
  const disposers: (() => void)[] = []
  const ctx = {
    webServer: { host: '127.0.0.1', port: 3080 },
    get: vi.fn(() => (code: number) => { exits.push(code) }),
    logger: { info: vi.fn(), error: vi.fn() },
    effect: vi.fn((body: () => (() => void) | undefined) => {
      const disposer = body()
      if (disposer !== undefined) disposers.push(disposer)
    }),
  }
  return { ctx, exits, disposers }
}

/** The spawn arguments apply() computed from the fake require. */
function spawnArguments(): { binary: string; entry: string; env: Record<string, string> } {
  const [binary, entryList, options] = spawnMock.mock.calls[0] as [
    string,
    string[],
    { env: Record<string, string> },
  ]
  return { binary, entry: entryList.join(''), env: options.env }
}

describe('apply', () => {
  it('fails loud when the launcher provides no appExit', () => {
    const ctx = {
      webServer: { host: '127.0.0.1', port: 3080 },
      get: vi.fn(() => undefined),
      logger: { info: vi.fn(), error: vi.fn() },
      effect: vi.fn(),
    }
    expect(() => { apply(ctx) }).toThrow('the launcher must provide ctx.appExit')
  })

  it('launches Electron at the bound server URL and hands the tree the exit code', () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const { ctx, exits } = makeContext()
    apply(ctx)
    expect(spawnArguments()).toEqual({
      binary: '/usr/bin/fake-electron',
      entry: '/fake/main.js',
      env: expect.objectContaining({ DSH_WEB_URL: 'http://127.0.0.1:3080' }) as Record<string, string>,
    })
    child.emit('exit', 0, null)
    expect(exits).toEqual([0])
  })

  it('reports a spawn failure and exits nonzero', () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const { ctx, exits } = makeContext()
    apply(ctx)
    child.emit('error', new Error('ENOENT'))
    expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to launch'), 'ENOENT')
    expect(exits).toEqual([1])
  })

  it('kills the shell when the tree tears down', () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const { ctx, disposers } = makeContext()
    apply(ctx)
    expect(disposers).toHaveLength(1)
    disposers[0]?.()
    expect(child.kill).toHaveBeenCalled()
  })

  it('skips the kill for an already-exited shell', () => {
    const child = fakeChild()
    child.exitCode = 0
    spawnMock.mockReturnValue(child)
    const { ctx, disposers } = makeContext()
    apply(ctx)
    disposers[0]?.()
    expect(child.kill).not.toHaveBeenCalled()
  })
})
