/**
 * Regenerate the app icon under assets/.
 *
 * The source (icon-white.png, the white-background release icon) is processed
 * to the Apple icon-template proportions: the body occupies the central ~82%
 * of the canvas (9% margin per side) with the macOS standard corner radius
 * (22.5%), so the dock tile reads at the same visual weight as neighboring
 * apps instead of full-bleed.
 * @module gen-electron-icons
 */

import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

const ROOT = resolve(import.meta.dirname, '..')
const ASSETS = resolve(ROOT, 'assets')
const SOURCE = resolve(ASSETS, 'icon-white.png')
const SIZE = 512

/**
 * The macOS dock's standard app-icon corner radius share of the side (Big Sur
 * squircle, ~22.5%). Source icons carry only a small file corner because the
 * system overlays this mask on installed apps; a dock icon set at runtime
 * (dev mode) is shown as-is, so the mask must be baked in.
 */
const CORNER_SHARE = 0.225

/** Transparent margin around the icon body, as a share of the canvas side. */
const MARGIN_SHARE = 0.09

const bodySize = Math.round(SIZE * (1 - 2 * MARGIN_SHARE))
const cornerRadius = Math.round(bodySize * CORNER_SHARE)
const offset = Math.round(SIZE * MARGIN_SHARE)
const body = await sharp(SOURCE)
  .resize({ width: bodySize, height: bodySize })
  .png()
  .toBuffer()
const canvas = sharp({
  create: {
    width: SIZE,
    height: SIZE,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
const mask = Buffer.from(
  `<svg width="${String(SIZE)}" height="${String(SIZE)}">`
  + `<rect x="${String(offset)}" y="${String(offset)}" width="${String(bodySize)}" height="${String(bodySize)}" rx="${String(cornerRadius)}" fill="white"/>`
  + '</svg>',
)
await mkdir(ASSETS, { recursive: true })
// Separate passes: chained composite() calls on one pipeline overwrite the
// earlier overlay, so the body lands on the canvas first, then the mask crops
// that result.
const withBody = await canvas
  .composite([{ input: body, gravity: 'centre' }])
  .png()
  .toBuffer()
const icon = await sharp(withBody)
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toFile(resolve(ASSETS, 'icon.png'))
console.log(`gen-electron-icons: wrote icon.png (${String(icon.width)}x${String(icon.height)}, body ${String(bodySize)}px with ${String(cornerRadius)}px corners, ${Math.round(MARGIN_SHARE * 100)}% margin)`)
