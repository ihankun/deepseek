import { defineConfig } from 'tsdown'

/**
 * The desktop app's main entry. The root tsdown workspace build's default
 * entry glob (`lib/types/{index,invariant,startup}.js`) matches nothing here,
 * so this override names it.
 */
export default defineConfig({
  entry: ['lib/types/main.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: {
    // Electron resolves from the runtime (the main process imports it as a
    // built-in, the harness resolves the npm package at spawn time); bundling
    // its CommonJS entry would break the ESM main process with __dirname.
    neverBundle: ['electron'],
  },
})
