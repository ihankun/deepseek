/**
 * Regenerate the app icons under assets/.
 *
 * The source (icon-white.png, the white-background release icon) is processed
 * to platform tile proportions: the macOS icon keeps the Apple dock layout
 * (body ~82% of the canvas, 22.5% squircle corner), while the Windows/Linux
 * window icon crops most of the white frame above/below the mark and stretches
 * the rest to the tile, so the logo itself fills the taskbar button. Windows
 * also gets a multi-resolution .ico (16–256), because the taskbar and Alt-Tab
 * pick exact sizes from it instead of downscaling a single PNG.
 * @module gen-electron-icons
 */

import { mkdir, writeFile } from 'node:fs/promises'
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
const MAC_CORNER_SHARE = 0.225

/** Transparent margin around the macOS dock icon body, as a share of the side. */
const MAC_MARGIN_SHARE = 0.09

/** The Windows/Linux taskbar tile: a small corner and a thin margin, so the
 * mark nearly fills the button. */
const WIN_CORNER_SHARE = 0.015

/** Transparent margin around the Windows/Linux tile body, as a share of the side. */
const WIN_MARGIN_SHARE = 0.01

/** The cropped source band is this multiple of the mark height, so the logo
 * keeps a thin white frame while filling most of the tile after stretching. */
const WIN_CROP_MARK_MULTIPLE = 1.35

/** The sizes embedded in the Windows .ico; 256 is the Vista+ PNG entry. */
const WIN_ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/** The vertical span of non-white pixels in a PNG buffer, as [top, bottom]. */
async function markSpan(buffer: Buffer): Promise<[number, number]> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true })
  let top = info.height
  let bottom = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4
      if (data[i + 3] > 0 && (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235)) {
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  return [top, bottom]
}

/** Render one platform tile to a 512x512 PNG buffer. */
async function renderTile(marginShare: number, cornerShare: number, cropShare?: number): Promise<Buffer> {
  const bodySize = Math.round(SIZE * (1 - 2 * marginShare))
  const cornerRadius = Math.round(bodySize * cornerShare)
  const offset = Math.round(SIZE * marginShare)
  const sourceWidth = (await sharp(SOURCE).metadata()).width ?? SIZE
  let body = SOURCE
  if (cropShare !== undefined) {
    const [top, bottom] = await markSpan(SOURCE)
    const markHeight = bottom - top + 1
    const cropHeight = Math.round(markHeight * cropShare)
    const cropTop = Math.max(0, Math.round((top + bottom) / 2 - cropHeight / 2))
    body = await sharp(SOURCE)
      .extract({ left: 0, top: cropTop, width: sourceWidth, height: cropHeight })
      .resize({ width: bodySize, height: bodySize, fit: 'fill' })
      .png()
      .toBuffer()
  } else {
    body = await sharp(SOURCE)
      .resize({ width: bodySize, height: bodySize })
      .png()
      .toBuffer()
  }
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
    .toBuffer()
  return icon
}

/** Pack downscaled PNGs of the source tile into a Windows .ico container. */
async function writeIco(source: Buffer, dest: string): Promise<void> {
  const images: Buffer[] = []
  for (const size of WIN_ICO_SIZES) {
    images.push(await sharp(source).resize({ width: size, height: size }).png().toBuffer())
  }
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  const entries = Buffer.alloc(16 * images.length)
  let offset = 6 + 16 * images.length
  for (let i = 0; i < images.length; i++) {
    const size = WIN_ICO_SIZES[i]
    const entry = entries.subarray(i * 16, (i + 1) * 16)
    entry[0] = size >= 256 ? 0 : size // width; 0 means 256
    entry[1] = size >= 256 ? 0 : size // height
    entry[2] = 0 // color count
    entry[3] = 0 // reserved
    entry.writeUInt16LE(1, 4) // planes
    entry.writeUInt16LE(32, 6) // bit count
    entry.writeUInt32LE(images[i].length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += images[i].length
  }
  await mkdir(ASSETS, { recursive: true })
  await writeFile(dest, Buffer.concat([header, entries, ...images]))
}

await mkdir(ASSETS, { recursive: true })
const macTile = await renderTile(MAC_MARGIN_SHARE, MAC_CORNER_SHARE)
await writeFile(resolve(ASSETS, 'icon.png'), macTile)
const winTile = await renderTile(WIN_MARGIN_SHARE, WIN_CORNER_SHARE, WIN_CROP_MARK_MULTIPLE)
await writeFile(resolve(ASSETS, 'icon-win.png'), winTile)
await writeIco(winTile, resolve(ASSETS, 'icon-win.ico'))
console.log(`gen-electron-icons: wrote icon.png, icon-win.png (body ${Math.round(SIZE * (1 - 2 * WIN_MARGIN_SHARE))}px) and icon-win.ico (${WIN_ICO_SIZES.join('/')})`)
