/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-electron`.
 * @module @deepseek-ai/dsh-client-ui-electron/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-electron'

/** Cordis companion plugin name. */
export const name = 'client-ui-electron-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the platform service and the Windows title-bar merge
 * act on the DOM (body classes, a fixed-position overlay) and emit no cordis
 * events; their behavior is asserted directly by this package's client specs.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
