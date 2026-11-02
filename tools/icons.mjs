import { deflateSync } from "node:zlib"
import { writeFile, mkdir } from "node:fs/promises"
import path from "node:path"

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (~c) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4)
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2
      const dy = y - size / 2
      const inside = dx * dx + dy * dy < (size * 0.28) ** 2
      const i = row + 1 + x * 3
      raw[i] = inside ? 214 : 15
      raw[i + 1] = inside ? 255 : 90
      raw[i + 2] = inside ? 226 : 48
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

const dir = path.resolve(import.meta.dirname, "../public/icons")
await mkdir(dir, { recursive: true })
await writeFile(path.join(dir, "icon-192.png"), png(192))
await writeFile(path.join(dir, "icon-512.png"), png(512))
await writeFile(path.join(dir, "apple-touch-icon.png"), png(180))
