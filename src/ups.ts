function decodeUps(buf: Uint8Array, cursor: { i: number }) {
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

function crc32(buf: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (~c) >>> 0
}

function readU32(buf: Uint8Array, offset: number) {
  return (
    (buf[offset] |
      (buf[offset + 1] << 8) |
      (buf[offset + 2] << 16) |
      (buf[offset + 3] << 24)) >>>
    0
  )
}

export function applyUps(patch: Uint8Array, source: Uint8Array) {
  if (patch[0] !== 0x55 || patch[1] !== 0x50 || patch[2] !== 0x53 || patch[3] !== 0x31) {
    throw new Error("Not a UPS patch")
  }
  const cursor = { i: 4 }
  const sourceSize = decodeUps(patch, cursor)
  const targetSize = decodeUps(patch, cursor)
  if (source.length !== sourceSize) {
    throw new Error("This ROM does not match the name patch")
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
  if (crc32(source) !== readU32(patch, end)) throw new Error("Name patch source checksum failed")
  if (crc32(target) !== readU32(patch, end + 4)) throw new Error("Name patch output checksum failed")
  return target
}
