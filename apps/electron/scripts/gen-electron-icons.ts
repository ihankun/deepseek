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

/** The Windows/Linux taskbar tile: a visible corner radius and a matching
 * margin, so the mark fills the button with properly rounded corners and
 * nothing gets clipped at the edges. */
const WIN_CORNER_SHARE = 0.04

/** Transparent margin around the Windows/Linux tile body, as a share of the
 * side.  Must be at least WIN_CORNER_SHARE to avoid corner clipping. */
const WIN_MARGIN_SHARE = 0.04

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

/**
 * Build a Windows .ico with BMP-format entries (one per resolution).
 * Windows renders BMP entries directly at each size — no downscaling — so
 * the icon fills the taskbar button instead of appearing small.
 */
async function writeIco(sourcePng: string, dest: string): Promise<void> {
  const entries: Buffer[] = []
  const imageDataBuffers: Buffer[] = []
  let offset = 6 + WIN_ICO_SIZES.length * 16

  for (const size of WIN_ICO_SIZES) {
    // Resize with contain + transparent background so the logo is centred
    // without distortion; sharp raw() gives top-down RGBA.
    const { data } = await sharp(sourcePng)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    // ICO DIB is bottom-up; flip rows vertically.
    const flipped = Buffer.alloc(data.length)
    const rowBytes = size * 4
    for (let row = 0; row < size; row++) {
      data.copy(flipped, (size - 1 - row) * rowBytes, row * rowBytes, (row + 1) * rowBytes)
    }
    // Convert RGBA → BGRA (ICO byte order).
    for (let i = 0; i < flipped.length; i += 4) {
      const r = flipped[i]
      flipped[i] = flipped[i + 2]
      flipped[i + 2] = r
    }

    // AND mask: 1 bit per pixel, rows padded to 4-byte boundary.
    const andMaskRowBytes = Math.ceil(size / 32) * 4
    const andMask = Buffer.alloc(andMaskRowBytes * size, 0) // all zeros — alpha handles transparency

    const xorMaskSize = size * size * 4

    // BITMAPINFOHEADER (40 bytes).
    const bmp = Buffer.alloc(40)
    bmp.writeUInt32LE(40, 0)   // header size
    bmp.writeInt32LE(size, 4)  // width
    bmp.writeInt32LE(size * 2, 8) // height (doubled for ICO)
    bmp.writeUInt16LE(1, 12)   // planes
    bmp.writeUInt16LE(32, 14)  // bits per pixel
    bmp.writeUInt32LE(0, 16)   // compression (BI_RGB)
    bmp.writeUInt32LE(xorMaskSize + andMask.length, 20)
    bmp.writeUInt32LE(0, 24)   // pixels per meter X
    bmp.writeUInt32LE(0, 28)   // pixels per meter Y
    bmp.writeUInt32LE(0, 32)   // colors used
    bmp.writeUInt32LE(0, 36)   // important colors

    const imageData = Buffer.concat([bmp, flipped, andMask])

    // Directory entry (16 bytes).
    const dir = Buffer.alloc(16)
    dir.writeUInt8(size < 256 ? size : 0, 0) // width
    dir.writeUInt8(size < 256 ? size : 0, 1) // height
    dir.writeUInt8(0, 2)  // color count
    dir.writeUInt8(0, 3)  // reserved
    dir.writeUInt16LE(1, 4)   // planes
    dir.writeUInt16LE(32, 6)  // bits per pixel
    dir.writeUInt32LE(imageData.length, 8)
    dir.writeUInt32LE(offset, 12)

    entries.push(dir)
    imageDataBuffers.push(imageData)
    offset += imageData.length
  }

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: ICO
  header.writeUInt16LE(WIN_ICO_SIZES.length, 4)

  await mkdir(ASSETS, { recursive: true })
  const ico = Buffer.concat([header, ...entries, ...imageDataBuffers])
  await writeFile(dest, ico)
}

await mkdir(ASSETS, { recursive: true })
const macTile = await renderTile(MAC_MARGIN_SHARE, MAC_CORNER_SHARE)
await writeFile(resolve(ASSETS, 'icon.png'), macTile)
const winTile = await renderTile(WIN_MARGIN_SHARE, WIN_CORNER_SHARE)
await writeFile(resolve(ASSETS, 'icon-win.png'), winTile)
await writeIco(resolve(ASSETS, 'icon2.png'), resolve(ASSETS, 'icon2.ico'))
console.log(`gen-electron-icons: wrote icon.png, icon-win.png (body ${Math.round(SIZE * (1 - 2 * WIN_MARGIN_SHARE))}px) and icon2.ico (BMP ${WIN_ICO_SIZES.join('/')})`)
