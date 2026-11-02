import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { applyUps, createUps, encodeUps } from "./ups.mjs"

const root = path.resolve(import.meta.dirname, "..")
const romPath = path.join(root, "Pokemon - Emerald Version (USA, Europe) (patched).gba")
const cacheDir = path.join(root, "tools", "cache")

const CHARSET = {
  " ": 0x00,
  "ß": 0x15,
  à: 0x16,
  á: 0x17,
  ç: 0x19,
  è: 0x1a,
  é: 0x1b,
  ê: 0x1c,
  ë: 0x1d,
  ì: 0x1e,
  î: 0x20,
  ï: 0x21,
  ò: 0x22,
  ó: 0x23,
  ô: 0x24,
  œ: 0x25,
  ù: 0x26,
  ú: 0x27,
  û: 0x28,
  ñ: 0x29,
  "0": 0xa1,
  "1": 0xa2,
  "2": 0xa3,
  "3": 0xa4,
  "4": 0xa5,
  "5": 0xa6,
  "6": 0xa7,
  "7": 0xa8,
  "8": 0xa9,
  "9": 0xaa,
  "!": 0xab,
  "?": 0xac,
  ".": 0xad,
  "-": 0xae,
  "♂": 0xb5,
  "♀": 0xb6,
  ",": 0xb8,
  "/": 0xba,
  Ä: 0xf1,
  Ö: 0xf2,
  Ü: 0xf3,
  ä: 0xf4,
  ö: 0xf5,
  ü: 0xf6,
  ":": 0xf0,
  "'": 0xb4,
}
for (let i = 0; i < 26; i++) {
  CHARSET[String.fromCharCode(65 + i)] = 0xbb + i
  CHARSET[String.fromCharCode(97 + i)] = 0xd5 + i
}
const DECODE = new Map(Object.entries(CHARSET).map(([char, code]) => [code, char]))

const TRAINERS = {
  May: "Maike",
  Brendan: "Brix",
  Wally: "Heiko",
  Birch: "Birk",
  Steven: "Troy",
  Roxanne: "Felizia",
  Brawly: "Kamillo",
  Wattson: "Walter",
  Flannery: "Flavia",
  Winona: "Wibke",
  Tate: "Ben",
  Liza: "Svenja",
  Wallace: "Wassili",
  Maxie: "Marc",
  Archie: "Adrian",
  Sidney: "Silvio",
  Drake: "Dragan",
}

function encodeName(text) {
  const bytes = []
  for (const char of text) {
    const code = CHARSET[char]
    if (code == null) return null
    bytes.push(code)
  }
  return bytes
}

function decodeSlot(slot) {
  const end = slot.indexOf(0xff)
  if (end < 0) return null
  let text = ""
  for (let i = 0; i < end; i++) {
    const char = DECODE.get(slot[i])
    if (!char) return null
    text += char
  }
  return text
}

function findBytes(hay, needle) {
  const hits = []
  let from = 0
  while (from <= hay.length - needle.length) {
    const at = hay.indexOf(needle, from)
    if (at < 0) break
    hits.push(at)
    from = at + 1
    if (hits.length > 8) break
  }
  return hits
}

function encoded(text) {
  const bytes = encodeName(text)
  if (!bytes) throw new Error(`Cannot encode ${text}`)
  return Buffer.from(bytes)
}

function walk(rom, start, stride, max, width = stride) {
  const rows = []
  let blanks = 0
  for (let i = 0; i < max; i++) {
    const off = start + i * stride
    if (off + width > rom.length) break
    const name = decodeSlot(rom.subarray(off, off + width))
    if (name == null) {
      blanks++
      if (blanks > 2) break
      continue
    }
    blanks = 0
    rows.push({ off, name, width })
  }
  return rows
}

function tableStart(rom, anchor, next, stride, steps) {
  const needle = encoded(anchor)
  const hits = findBytes(rom, needle)
  for (const hit of hits) {
    const there = hit + stride * steps
    const expect = encoded(next)
    if (rom.subarray(there, there + expect.length).equals(expect)) return hit
  }
  return -1
}

async function csv(name) {
  await mkdir(cacheDir, { recursive: true })
  const file = path.join(cacheDir, name)
  try {
    return await readFile(file, "utf8")
  } catch {
    const res = await fetch(`https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/${name}`)
    if (!res.ok) throw new Error(`Failed to download ${name}`)
    const text = await res.text()
    await writeFile(file, text)
    return text
  }
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ",") {
      row.push(cell)
      cell = ""
    } else if (c === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else if (c !== "\r") cell += c
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function nameMap(text, idIndex, nameIndex) {
  const rows = parseCsv(text)
  const header = rows[0]
  const lang = header.indexOf("local_language_id")
  const byId = new Map()
  for (const row of rows.slice(1)) {
    const langId = row[lang]
    if (langId !== "9" && langId !== "6") continue
    const id = row[idIndex]
    const bucket = byId.get(id) ?? {}
    bucket[langId === "9" ? "en" : "de"] = row[nameIndex]
    byId.set(id, bucket)
  }
  const map = new Map()
  for (const bucket of byId.values()) {
    if (bucket.en && bucket.de) map.set(bucket.en, bucket.de)
  }
  return map
}

function lookup(map, english) {
  if (map.has(english)) return map.get(english)
  const folded = english.toLowerCase()
  for (const [en, de] of map) {
    if (en.toLowerCase() === folded) return de
  }
  return null
}

function writeSlot(target, row, german, clips) {
  const max = row.width - 1
  let text = german
  const raw = encodeName(text)
  if (!raw) {
    clips.push({ english: row.name, german, reason: "unencodable" })
    return false
  }
  if (raw.length > max) {
    text = [...german].slice(0, max).join("")
    while (text && (encodeName(text)?.length ?? 99) > max) text = [...text].slice(0, -1).join("")
    clips.push({ english: row.name, german, used: text, reason: "clipped" })
  }
  const bytes = encodeName(text)
  if (!bytes || bytes.length > max || bytes.length === 0) return false
  for (let i = 0; i < row.width; i++) target[row.off + i] = 0
  for (let i = 0; i < bytes.length; i++) target[row.off + i] = bytes[i]
  target[row.off + bytes.length] = 0xff
  return true
}

function applyMap(rom, target, rows, map, clips) {
  let changed = 0
  for (const row of rows) {
    if (!row.name) continue
    const german = lookup(map, row.name)
    if (!german || german === row.name) continue
    if (writeSlot(target, row, german, clips)) changed++
  }
  return changed
}

function findTrainerTable(rom) {
  const stride = 11
  const keys = Object.keys(TRAINERS)
  const hits = []
  for (const name of keys) {
    const needle = encoded(name)
    let from = 0
    while (from < rom.length) {
      const at = rom.indexOf(needle, from)
      if (at < 0) break
      const slot = decodeSlot(rom.subarray(at, at + stride))
      if (slot === name) hits.push(at)
      from = at + 1
    }
  }
  if (hits.length < 6) return []
  hits.sort((a, b) => a - b)
  let best = []
  for (let i = 0; i < hits.length; i++) {
    const window = hits.filter((hit) => hit >= hits[i] && hit < hits[i] + stride * 250)
    const aligned = window.filter((hit) => (hit - hits[i]) % stride === 0)
    if (aligned.length > best.length) best = aligned
  }
  if (best.length < 6) return []
  const origin = Math.min(...best)
  return walk(rom, origin - stride * 40 < 0 ? origin : origin, stride, 400).filter((row) => row.off >= origin - stride * 5)
}

const encCheck = Buffer.from(encodeUps(16777216)).toString("hex")
if (encCheck !== "007f7e86") throw new Error(`UPS encode check failed: ${encCheck}`)

const rom = await readFile(romPath)
const sha = createHash("sha256").update(rom).digest("hex")
await writeFile(
  path.join(root, "src", "rom-id.ts"),
  `export const PATCHED_ROM_SIZE = 33554432\nexport const PATCHED_ROM_SHA256 = "${sha}"\n`,
)

const speciesAt = tableStart(rom, "Bulbasaur", "Ivysaur", 11, 1)
const moveAt = tableStart(rom, "Pound", "Tackle", 17, 32)
const abilityAt = tableStart(rom, "Overgrow", "Blaze", 17, 1)
if (speciesAt < 0 || moveAt < 0 || abilityAt < 0) {
  throw new Error(`Missing table species=${speciesAt} moves=${moveAt} abilities=${abilityAt}`)
}

let abilityStart = abilityAt
for (let back = 1; back < 80; back++) {
  const off = abilityAt - back * 17
  if (off < 0) break
  const name = decodeSlot(rom.subarray(off, off + 17))
  if (name == null) break
  abilityStart = off
}

const species = walk(rom, speciesAt, 11, 2500)
const moves = walk(rom, moveAt, 17, 1200)
const abilities = walk(rom, abilityStart, 17, 400)

let itemAnchor = -1
const potionNeedle = Buffer.concat([encoded("Potion"), Buffer.from([0xff])])
let searchAt = 0
while (searchAt >= 0) {
  const hit = rom.indexOf(potionNeedle, searchAt)
  if (hit < 0) break
  const next = decodeSlot(rom.subarray(hit + 40, hit + 54))
  if (next === "Super Potion") {
    itemAnchor = hit
    break
  }
  searchAt = hit + 1
}
let itemStart = itemAnchor
if (itemAnchor >= 0) {
  for (let back = 1; back < 800; back++) {
    const off = itemAnchor - back * 40
    if (off < 0) break
    const name = decodeSlot(rom.subarray(off, off + 14))
    if (name == null) break
    itemStart = off
  }
}
const items = itemStart >= 0 ? walk(rom, itemStart, 40, 2500, 14) : []

let typeAt = -1
let typeStride = 0
const normalHits = findBytes(rom, encoded("Normal"))
for (const hit of normalHits) {
  for (const stride of [7, 8, 9]) {
    const sample = walk(rom, hit, stride, 20).map((row) => row.name)
    if (sample.includes("Fire") && sample.includes("Water")) {
      typeAt = hit
      typeStride = stride
      break
    }
  }
  if (typeAt >= 0) break
}
const types = typeAt >= 0 ? walk(rom, typeAt, typeStride, 30) : []
const trainers = findTrainerTable(rom)

const [speciesCsv, moveCsv, abilityCsv, itemCsv, typeCsv] = await Promise.all([
  csv("pokemon_species_names.csv"),
  csv("move_names.csv"),
  csv("ability_names.csv"),
  csv("item_names.csv"),
  csv("type_names.csv"),
])

const maps = {
  species: nameMap(speciesCsv, 0, 2),
  moves: nameMap(moveCsv, 0, 2),
  abilities: nameMap(abilityCsv, 0, 2),
  items: nameMap(itemCsv, 0, 2),
  types: nameMap(typeCsv, 0, 2),
  trainers: new Map(Object.entries(TRAINERS)),
}
maps.types.set("Electr", "Elektro")
maps.types.set("Psychc", "Psycho")
maps.types.set("Fight", "Kampf")

const target = Buffer.from(rom)
const clips = []
const counts = {
  species: applyMap(rom, target, species, maps.species, clips),
  moves: applyMap(rom, target, moves, maps.moves, clips),
  abilities: applyMap(rom, target, abilities, maps.abilities, clips),
  items: applyMap(rom, target, items, maps.items, clips),
  types: applyMap(rom, target, types, maps.types, clips),
  trainers: applyMap(rom, target, trainers, maps.trainers, clips),
}

const patch = createUps(rom, target)
const round = applyUps(patch, rom)
if (Buffer.compare(round, target) !== 0) throw new Error("Name patch did not round-trip")

await mkdir(path.join(root, "public", "patch"), { recursive: true })
await writeFile(path.join(root, "public", "patch", "emeraldpp-de-names.ups"), patch)
await writeFile(
  path.join(root, "tools", "cache", "name-report.json"),
  JSON.stringify(
    {
      sha,
      counts,
      sizes: {
        species: species.length,
        moves: moves.length,
        abilities: abilities.length,
        items: items.length,
        types: types.length,
        trainers: trainers.length,
      },
      itemStride: items.length ? 40 : 0,
      typeStride,
      sampleSpecies: species.slice(0, 8).map((row) => row.name),
      sampleItems: items.slice(0, 12).map((row) => row.name),
      sampleTypes: types.map((row) => row.name),
      clips,
    },
    null,
    2,
  ),
)
console.log(JSON.stringify({ counts, patchBytes: patch.length, clips: clips.length }))
