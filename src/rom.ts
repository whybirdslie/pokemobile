import { PATCHED_ROM_SHA256, PATCHED_ROM_SIZE } from "./rom-id"

export async function sha256(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest("SHA-256", copy)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

export function headerOf(bytes: Uint8Array) {
  const title = String.fromCharCode(...bytes.subarray(0xa0, 0xac)).replace(/\0/g, "")
  const code = String.fromCharCode(...bytes.subarray(0xac, 0xb0))
  return { title, code, size: bytes.length }
}

export async function isPatchedEmerald(bytes: Uint8Array) {
  const header = headerOf(bytes)
  if (header.size !== PATCHED_ROM_SIZE || header.code !== "BPEE") return false
  if (!PATCHED_ROM_SHA256) return true
  return (await sha256(bytes)) === PATCHED_ROM_SHA256
}
