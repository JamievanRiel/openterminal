/**
 * Generates the app icon set from code: amber "OT" monogram on pure black,
 * matching the design tokens. Pure Node (zlib PNG encoder), no dependencies.
 * Outputs: build/icon.png (1024², electron-builder derives .ico/.icns/PNGs)
 * plus build/tray-16.png and build/tray-32.png.
 * Re-run: node scripts/generate-icon.js
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const AMBER = [255, 152, 0]
const BLACK = [0, 0, 0]

/** Draw the OT monogram into a size×size RGBA buffer. */
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4)
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = 255
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, BLACK)

  const s = size / 1024 // design in 1024-space
  const stroke = Math.max(1, Math.round(96 * s))

  // "O": ring centered left-of-middle
  const ocx = Math.round(300 * s)
  const ocy = Math.round(512 * s)
  const oR = Math.round(205 * s)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - ocx) ** 2 + (y - ocy) ** 2)
      if (Math.abs(d - oR) <= stroke / 2) put(x, y, AMBER)
    }
  }
  // "T": bar + stem right-of-middle
  const tx = Math.round(740 * s)
  const barY = Math.round(307 * s)
  const barHalf = Math.round(160 * s)
  for (let y = barY; y < barY + stroke; y++) {
    for (let x = tx - barHalf; x <= tx + barHalf; x++) put(x, y, AMBER)
  }
  for (let y = barY; y <= Math.round(742 * s); y++) {
    for (let x = tx - Math.round(stroke / 2); x <= tx + Math.round(stroke / 2); x++) put(x, y, AMBER)
  }
  // baseline tick (terminal cursor nod)
  const cy = Math.round(830 * s)
  for (let y = cy; y < cy + Math.round(40 * s); y++) {
    for (let x = Math.round(120 * s); x <= Math.round(280 * s); x++) put(x, y, AMBER)
  }
  return px
}

const outDir = path.join(__dirname, '..', 'build')
fs.mkdirSync(outDir, { recursive: true })
for (const [name, size] of [
  ['icon.png', 1024],
  ['tray-16.png', 16],
  ['tray-32.png', 32]
]) {
  fs.writeFileSync(path.join(outDir, name), encodePng(size, size, drawIcon(size)))
  console.log('wrote build/' + name)
}
