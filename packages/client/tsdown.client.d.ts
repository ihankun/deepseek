import type { UserConfig } from 'tsdown'
/**
 * Wire/type layers a client bundle may inline: browser-safe contracts
 * with no runtime identity to share (no Symbol/instanceof/singleton state).
 * Everything else under @deepseek-ai/* is either a module-table entry
 * (external) or a leak the purity gate rejects.
 */
export declare const INLINE_SAFE: RegExp
/** Externals resolved from the loader module table: the platform seed entries plus the documented runtime exemption. */
export declare const CLIENT_EXTERNALS: readonly string[]
/**
 * Build the tsdown config for one UI plugin package: the node-half lib build
 * plus the browser client bundle. Client packages emit both halves during the
 * Client pass by default; packages needed for Host reflection may opt into the
 * earlier Host pass. A package-level tsdown.config.ts REPLACES the root
 * workspace layout, so the lib half must be restated here — dropping it leaves
 * the package without lib/index.js and the host Loader cannot import its node
 * half.
 * @param id - plugin id (package name), stamped into the __ModuleLoader__.load
 * handoff and onto the injected style tags.
 * @param libEntry - node-half entries, spelled at the call site so the
 * package-invariants gate can see `lib/types/invariant.js` in each package's
 * own tsdown.config.ts (a preset-side glob hides it from the mechanical check).
 * @param options - phase placement, lib overrides, and companion Node configs.
 * @returns ENV-selected tsdown config for the current build face.
 */
export declare function clientBundle(id: string, libEntry: readonly string[], options?: ClientBundleOptions): BuildFaceConfig
/**
 * Build a Client-only Node library during the Client pass.
 * @param id - Package name used in tsdown diagnostics.
 * @param libEntry - Emitted JavaScript entries consumed from `lib/types`.
 * @returns ENV-selected tsdown config for the Client build face.
 */
export declare function clientLibrary(id: string, libEntry: readonly string[]): BuildFaceConfig
/**
 * Select arbitrary package-local configs only during the Client pass.
 * @param configs - Node-side configs emitted after Client tsc.
 * @returns ENV-selected tsdown config for the Client build face.
 */
export declare function clientOnly(configs: readonly UserConfig[]): BuildFaceConfig
interface ClientBundleOptions {
  /** Emit the Node-side artifacts during the Host pass instead of the Client pass. */
  readonly hostPhase?: boolean
  /** Additional Node-side configs emitted alongside the package library. */
  readonly companions?: readonly UserConfig[]
  /** Overrides for the package's primary Node-side library config. */
  readonly lib?: UserConfig
}
type BuildFaceConfig = (inlineConfig: Pick<UserConfig, 'env'>) => UserConfig[]
export {}
//# sourceMappingURL=tsdown.client.d.ts.map
