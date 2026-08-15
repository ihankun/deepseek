import { defineConfig } from 'tsdown'

/**
 * The desktop bundle ships two built entries: the host plugin the Loader
 * mounts and the Electron main process the plugin launches. The root tsdown
 * workspace build's default entry glob (`lib/types/{index,invariant,startup}.js`)
 * matches only the former, so this override names both.
 */
export default defineConfig({
  entry: ['lib/types/index.js', 'lib/types/main.js'],
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
