import { store, type SaveMeta } from "./db"
import { sha256 } from "./rom"

export type SyncState = "local" | "synced" | "uploading" | "error"

const saveUrl =
  (import.meta.env.VITE_SAVE_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://pokemobile-saves.jeffreycheung2000.workers.dev"

export function cloudConfigured() {
  return saveUrl.length > 0
}

function copyBytes(bytes: Uint8Array) {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

async function rememberSync(hash: string, updatedAt: number, language: SaveMeta["language"]) {
  await store.setMeta({
    sha256: hash,
    base: hash,
    dirty: false,
    updatedAt,
    language,
  })
}

export async function pushSram(bytes: Uint8Array) {
  const key = await store.phrase()
  if (!saveUrl || !key) return
  const hash = await sha256(bytes)
  const res = await fetch(`${saveUrl}/saves/${key}`, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: copyBytes(bytes),
  })
  if (!res.ok) throw new Error("Could not upload the save")
  await rememberSync(
    res.headers.get("x-sha256") || hash,
    Number(res.headers.get("x-updated-at")) || Date.now(),
    (await store.meta())?.language ?? "en",
  )
}

export async function pullSram() {
  const key = await store.phrase()
  if (!saveUrl || !key) return null
  const res = await fetch(`${saveUrl}/saves/${key}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error("Could not download the save")
  const bytes = new Uint8Array(await res.arrayBuffer())
  const hash = res.headers.get("x-sha256") || (await sha256(bytes))
  return { bytes, sha256: hash, updatedAt: Number(res.headers.get("x-updated-at")) || Date.now() }
}

function syncedBase(meta: SaveMeta | null) {
  if (!meta) return undefined
  if (meta.base) return meta.base
  if (!meta.dirty && meta.sha256) return meta.sha256
  return undefined
}

export async function noteLocalSram(bytes: Uint8Array, language: SaveMeta["language"]) {
  const hash = await sha256(bytes)
  const prev = await store.meta()
  const base = syncedBase(prev)
  await store.setSram(bytes)
  await store.setMeta({
    sha256: hash,
    base,
    dirty: base ? hash !== base : Boolean(prev?.dirty),
    updatedAt: Date.now(),
    language,
  })
  return prev?.sha256 !== hash
}

export async function resolveSync(): Promise<SyncState> {
  if (!saveUrl || !(await store.phrase())) return "local"
  const meta = await store.meta()
  const language = meta?.language ?? "en"
  const local = await store.sram()
  if (local && local.byteLength >= 64) {
    const localBytes = new Uint8Array(local)
    const localHash = await sha256(localBytes)
    if (syncedBase(meta) === localHash) {
      if (meta?.dirty) await rememberSync(localHash, meta.updatedAt, language)
      return "synced"
    }
    await pushSram(localBytes)
    return "synced"
  }
  const cloud = await pullSram()
  if (!cloud) return "synced"
  await store.setSram(cloud.bytes)
  await rememberSync(cloud.sha256, cloud.updatedAt, language)
  return "synced"
}
