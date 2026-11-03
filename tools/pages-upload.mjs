import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import blake3 from "blake3-wasm"

const root = path.resolve(import.meta.dirname, "..")
const dist = path.join(root, "dist")
const jwt = process.env.CF_PAGES_UPLOAD_JWT
if (!jwt) throw new Error("CF_PAGES_UPLOAD_JWT is missing")

const TYPES = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json",
  webmanifest: "application/manifest+json",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  wasm: "application/wasm",
  data: "application/octet-stream",
  ups: "application/octet-stream",
}

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, base, out)
    else out.push(path.relative(base, full).split(path.sep).join("/"))
  }
  return out
}

function hashFile(filepath) {
  const contents = readFileSync(filepath)
  const base64Contents = contents.toString("base64")
  const extension = path.extname(filepath).substring(1)
  return blake3.hash(base64Contents + extension).toString("hex").slice(0, 32)
}

const files = walk(dist).map((rel) => {
  const filepath = path.join(dist, rel)
  const ext = path.extname(rel).substring(1).toLowerCase()
  return {
    rel,
    filepath,
    hash: hashFile(filepath),
    size: statSync(filepath).size,
    contentType: TYPES[ext] || "application/octet-stream",
  }
})

const check = await fetch("https://api.cloudflare.com/client/v4/pages/assets/check-missing", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ hashes: files.map((f) => f.hash) }),
})
const checkJson = await check.json()
if (!checkJson.success) throw new Error(JSON.stringify(checkJson.errors))
const missing = new Set(checkJson.result)

const toUpload = files.filter((f) => missing.has(f.hash))
for (let i = 0; i < toUpload.length; i += 20) {
  const batch = toUpload.slice(i, i + 20)
  const payload = batch.map((f) => ({
    key: f.hash,
    value: readFileSync(f.filepath).toString("base64"),
    metadata: { contentType: f.contentType },
    base64: true,
  }))
  const res = await fetch("https://api.cloudflare.com/client/v4/pages/assets/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!json.success) throw new Error(JSON.stringify(json.errors))
  console.log(`uploaded ${Math.min(i + batch.length, toUpload.length)}/${toUpload.length}`)
}

await fetch("https://api.cloudflare.com/client/v4/pages/assets/upsert-hashes", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ hashes: files.map((f) => f.hash) }),
})

const manifest = Object.fromEntries(files.map((f) => [`/${f.rel}`, f.hash]))
const out = path.join(root, "tools", ".pages-manifest.json")
writeFileSync(out, JSON.stringify(manifest))
console.log(`files=${files.length} uploaded=${toUpload.length} manifest=${out}`)
