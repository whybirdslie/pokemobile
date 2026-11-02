export function encodeUps(value) {
  const out = []
  let n = value
  while (true) {
    const x = n & 0x7f
    n = Math.floor(n / 128)
    if (n === 0) {
      out.push(x | 0x80)
      break
    }
    out.push(x)
    n -= 1
  }
  return out
}

export function decodeUps(buf, cursor) {
  let data = 0
  let shift = 1
  while (cursor.i < buf.length) {
    const x = buf[cursor.i++]
    data += (x & 0x7f) * shift
    if (x & 0x80) break
    shift <<= 7
    data += shift
  }
  return data
}

export function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
  }
  return (~c) >>> 0
}

function at(buf, i) {
  return i < buf.length ? buf[i] : 0
}

export function createUps(source, target) {
  const body = [0x55, 0x50, 0x53, 0x31]
  body.push(...encodeUps(source.length))
  body.push(...encodeUps(target.length))
  const size = Math.max(source.length, target.length)
  let i = 0
  let rel = 0
  while (i < size) {
    while (i < size && at(source, i) === at(target, i)) i++
    if (i >= size) break
    body.push(...encodeUps(i - rel))
    while (i < size && at(source, i) !== at(target, i)) {
      body.push(at(source, i) ^ at(target, i))
      i++
    }
    rel = i
    body.push(0)
  }
  const patch = Buffer.from(body)
  const srcCrc = crc32(source)
  const dstCrc = crc32(target)
  const patchCrc = crc32(patch)
  const out = Buffer.alloc(patch.length + 12)
  patch.copy(out)
  out.writeUInt32LE(srcCrc, patch.length)
  out.writeUInt32LE(dstCrc, patch.length + 4)
  out.writeUInt32LE(patchCrc, patch.length + 8)
  return out
}

export function applyUps(patch, source) {
  if (patch[0] !== 0x55 || patch[1] !== 0x50 || patch[2] !== 0x53 || patch[3] !== 0x31) {
    throw new Error("Not a UPS patch")
  }
  const cursor = { i: 4 }
  const sourceSize = decodeUps(patch, cursor)
  const targetSize = decodeUps(patch, cursor)
  if (source.length !== sourceSize) {
    throw new Error(`ROM size ${source.length} does not match the name patch (${sourceSize})`)
  }
  const target = new Uint8Array(targetSize)
  target.set(source.subarray(0, Math.min(source.length, targetSize)))
  const end = patch.length - 12
  let offset = 0
  while (cursor.i < end) {
    offset += decodeUps(patch, cursor)
    while (cursor.i < end) {
      const x = patch[cursor.i++]
      if (x === 0) break
      const base = offset < source.length ? source[offset] : 0
      if (offset < target.length) target[offset] = base ^ x
      offset++
    }
  }
  const srcCrc = patch.readUInt32LE ? patch.readUInt32LE(end) : readU32(patch, end)
  const dstCrc = patch.readUInt32LE ? patch.readUInt32LE(end + 4) : readU32(patch, end + 4)
  if (crc32(source) !== srcCrc) throw new Error("Name patch source checksum failed")
  if (crc32(target) !== dstCrc) throw new Error("Name patch output checksum failed")
  return target
}

function readU32(buf, offset) {
  return (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0
}
