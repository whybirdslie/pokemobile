import { store, type SaveMeta } from "./db"
import { sha256 } from "./rom"

export type SyncState = "local" | "synced" | "uploading" | "conflict" | "error"

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
  const meta: SaveMeta = {
    sha256: res.headers.get("x-sha256") || hash,
    dirty: false,
    updatedAt: Number(res.headers.get("x-updated-at")) || Date.now(),
    language: (await store.meta())?.language ?? "en",
  }
  await store.setMeta(meta)
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
  if (!saveUrl || !(await store.phrase())) return "local"
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
  if (!cloud || !local) return "synced"
  if (meta && cloud.sha256 === meta.sha256 && !meta.dirty) return "synced"
  const localBytes = new Uint8Array(local)
  const localHash = await sha256(localBytes)
  if (localHash === cloud.sha256) {
    await store.setMeta({
      sha256: localHash,
      dirty: false,
      updatedAt: meta?.updatedAt ?? cloud.updatedAt,
      language: meta?.language ?? "en",
    })
    return "synced"
  }
  if ((meta?.dirty ?? true) && !choice) return "conflict"
  if (choice === "cloud" || !meta?.dirty) {
    await store.setSram(cloud.bytes)
    await store.setMeta({
      sha256: cloud.sha256,
      dirty: false,
      updatedAt: cloud.updatedAt,
      language: meta?.language ?? "en",
    })
    return "synced"
  }
  await pushSram(localBytes)
  return "synced"
}
