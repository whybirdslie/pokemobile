import { supabase } from "./auth"
import { store, type SaveMeta } from "./db"
import { sha256 } from "./rom"

export type SyncState = "local" | "synced" | "uploading" | "conflict" | "error"

function fromBytea(value: unknown) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (typeof value !== "string") throw new Error("Unexpected save format")
  const hex = value.startsWith("\\x") ? value.slice(2) : ""
  if (hex) {
    const out = new Uint8Array(hex.length / 2)
    for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    return out
  }
  const raw = atob(value)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function toHex(bytes: Uint8Array) {
  let hex = ""
  for (const b of bytes) hex += b.toString(16).padStart(2, "0")
  return `\\x${hex}`
}

async function userId() {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function pushSram(bytes: Uint8Array) {
  const id = await userId()
  if (!supabase || !id) return
  const hash = await sha256(bytes)
  const { error } = await supabase.from("emerald_saves").upsert({
    user_id: id,
    sav: toHex(bytes),
    sha256: hash,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
  const meta: SaveMeta = {
    sha256: hash,
    dirty: false,
    updatedAt: Date.now(),
    language: (await store.meta())?.language ?? "en",
  }
  await store.setMeta(meta)
}

export async function pullSram() {
  const id = await userId()
  if (!supabase || !id) return null
  const { data, error } = await supabase
    .from("emerald_saves")
    .select("sav, sha256, updated_at")
    .eq("user_id", id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { bytes: fromBytea(data.sav), sha256: data.sha256 as string, updatedAt: Date.parse(data.updated_at as string) }
}

export async function noteLocalSram(bytes: Uint8Array, language: SaveMeta["language"]) {
  const hash = await sha256(bytes)
  const prev = await store.meta()
  await store.setSram(bytes)
  await store.setMeta({
    sha256: hash,
    dirty: prev?.sha256 !== hash,
    updatedAt: Date.now(),
    language,
  })
  return prev?.sha256 !== hash
}

export async function resolveSync(choice?: "phone" | "cloud"): Promise<SyncState> {
  if (!supabase) return "local"
  const id = await userId()
  if (!id) return "local"
  const meta = await store.meta()
  const local = await store.sram()
  const cloud = await pullSram()
  if (!local && !cloud) return "synced"
  if (!cloud && local) {
    await pushSram(new Uint8Array(local))
    return "synced"
  }
  if (cloud && !local) {
    await store.setSram(cloud.bytes)
    await store.setMeta({
      sha256: cloud.sha256,
      dirty: false,
      updatedAt: cloud.updatedAt,
      language: meta?.language ?? "en",
    })
    return "synced"
  }
  if (!cloud || !local || !meta) return "synced"
  if (cloud.sha256 === meta.sha256 && !meta.dirty) return "synced"
  const localBytes = new Uint8Array(local)
  const localHash = await sha256(localBytes)
  if (localHash === cloud.sha256) {
    await store.setMeta({ ...meta, sha256: localHash, dirty: false })
    return "synced"
  }
  if (meta.dirty && !choice) return "conflict"
  if (choice === "cloud" || !meta.dirty) {
    await store.setSram(cloud.bytes)
    await store.setMeta({
      sha256: cloud.sha256,
      dirty: false,
      updatedAt: cloud.updatedAt,
      language: meta.language,
    })
    return "synced"
  }
  await pushSram(localBytes)
  return "synced"
}
