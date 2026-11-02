const DB_NAME = "emerald"
const DB_VERSION = 1

export type Lang = "en" | "de"

export interface SaveMeta {
  sha256: string
  dirty: boolean
  updatedAt: number
  language: Lang
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv")
    }
    req.onsuccess = () => resolve(req.result)
  })
}

async function get<T>(key: string): Promise<T | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly")
    const req = tx.objectStore("kv").get(key)
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

async function put(key: string, value: unknown) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite")
    tx.objectStore("kv").put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const store = {
  rom: () => get<ArrayBuffer>("rom"),
  setRom: (bytes: Uint8Array) => put("rom", new Uint8Array(bytes).buffer),
  sram: () => get<ArrayBuffer>("sram"),
  setSram: (bytes: Uint8Array) => put("sram", new Uint8Array(bytes).buffer),
  meta: () => get<SaveMeta>("meta"),
  setMeta: (meta: SaveMeta) => put("meta", meta),
}
