import { readFile } from "node:fs/promises"

const rom = await readFile(new URL("../Pokemon - Emerald Version (USA, Europe) (patched).gba", import.meta.url))
const dec = new Map()
for (let i = 0; i < 26; i++) {
  dec.set(0xbb + i, String.fromCharCode(65 + i))
  dec.set(0xd5 + i, String.fromCharCode(97 + i))
}
dec.set(0x00, " ")
dec.set(0xff, "|")
dec.set(0xad, ".")
dec.set(0xae, "-")
dec.set(0xb4, "'")
function text(off, len) {
  let s = ""
  for (let i = 0; i < len; i++) s += dec.get(rom[off + i]) ?? "."
  return s
}
function enc(s) {
  const out = []
  for (const c of s) {
    if (c === " ") out.push(0)
    else if (c >= "A" && c <= "Z") out.push(0xbb + c.charCodeAt(0) - 65)
    else if (c >= "a" && c <= "z") out.push(0xd5 + c.charCodeAt(0) - 97)
    else throw new Error(c)
  }
  return Buffer.from(out)
}
const start = 0x973f40
console.log(rom.subarray(start, start + 0x90).toString("hex"))
console.log(text(start, 0x90))
for (const word of ["Roxanne", "Wally", "Brendan", "Brawly", "Birch"]) {
  const needle = enc(word)
  let at = 0
  let n = 0
  while ((at = rom.indexOf(needle, at)) >= 0 && n < 4) {
    console.log(word, at.toString(16), text(Math.max(0, at - 8), 48))
    at += 1
    n++
  }
}
