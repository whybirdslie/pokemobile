import "./style.css"
import { cloudConfigured, noteLocalSram, resolveSync, type SyncState } from "./cloud"
import { store, type Lang } from "./db"
import { installSram, prepareRoms, preloadEmulator, readSram, resumeAudio, startPrepared, toggleSpeed } from "./emu"
import { normalizePhrase, showPhrase, suggestPhrase } from "./phrase"
import { isPatchedEmerald } from "./rom"

const app = document.querySelector<HTMLElement>("#app")!
const game = document.querySelector<HTMLElement>("#game")!
const chrome = document.querySelector<HTMLElement>("#chrome")!
const status = document.querySelector<HTMLElement>("#status")!
const menu = document.querySelector<HTMLElement>("#menu")!
const menuToggle = document.querySelector<HTMLButtonElement>("#menu-toggle")!

let rom: Uint8Array | null = null
let language: Lang = "en"
let syncState: SyncState = "local"
let timer = 0
let draft = suggestPhrase()

function setStatus(text: string) {
  status.textContent = text
}

async function refreshPhraseButton() {
  const button = document.querySelector<HTMLButtonElement>("#phrase")
  if (!button) return
  const key = await store.phrase()
  button.textContent = key ? showPhrase(key) : "Save phrase"
}

function setMenuOpen(open: boolean) {
  menu.hidden = !open
  menuToggle.setAttribute("aria-expanded", open ? "true" : "false")
}

function closeMenu() {
  setMenuOpen(false)
}

function panel(html: string) {
  app.hidden = false
  game.hidden = true
  chrome.hidden = true
  app.innerHTML = html
}

async function loadStoredRom() {
  const stored = await store.rom()
  if (!stored) return null
  const bytes = new Uint8Array(stored)
  return (await isPatchedEmerald(bytes)) ? bytes : null
}

async function tryDevRom() {
  if (!import.meta.env.DEV) return null
  const res = await fetch("/dev-rom")
  if (!res.ok) return null
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (!(await isPatchedEmerald(bytes))) return null
  await store.setRom(bytes)
  return bytes
}

function missingScreen(message = "Emerald++ is not on this phone yet.") {
  panel(`
    <div class="panel">
      <h1>Emerald++</h1>
      <p>${message}</p>
      <p>Choose the patched 32MB ROM from Files. This site does not host the game.</p>
      <label class="primary choice">Choose the patched ROM
        <input id="romfile" type="file" accept=".gba,application/octet-stream" hidden>
      </label>
      <p class="error" id="err"></p>
    </div>
  `)
  const err = document.querySelector<HTMLElement>("#err")!
  document.querySelector<HTMLInputElement>("#romfile")!.onchange = async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!(await isPatchedEmerald(bytes))) {
      err.textContent = "That file is not the patched Emerald++ ROM."
      return
    }
    await store.setRom(bytes)
    rom = bytes
    await showLanguage()
  }
}

async function showLanguage() {
  if (!rom) rom = (await loadStoredRom()) ?? (await tryDevRom())
  if (!rom) {
    missingScreen()
    return
  }
  const meta = await store.meta()
  if (meta?.language) language = meta.language
  panel(`
    <div class="panel">
      <h1>Emerald++</h1>
      <p>Names only. Menus stay English. The save is the same either way.</p>
      <div class="choices">
        <button class="choice" id="en" type="button">English names</button>
        <button class="choice" id="de" type="button">German names</button>
      </div>
      <p id="wait">Getting the game ready.</p>
    </div>
  `)
  const wait = document.querySelector<HTMLElement>("#wait")!
  try {
    await prepareRoms(rom)
    wait.textContent = "Tap a language to play."
  } catch (cause) {
    wait.textContent = cause instanceof Error ? cause.message : "Could not prepare the game"
    return
  }
  for (const lang of ["en", "de"] as const) {
    const button = document.querySelector<HTMLButtonElement>(`#${lang}`)!
    button.setAttribute("aria-pressed", String(language === lang))
    button.onclick = (event) => {
      language = lang
      void play(event)
    }
  }
}

async function play(event: Event) {
  if (!rom) return
  const meta = await store.meta()
  await store.setMeta({
    sha256: meta?.sha256 ?? "",
    dirty: meta?.dirty ?? false,
    updatedAt: meta?.updatedAt ?? Date.now(),
    language,
  })
  app.hidden = true
  game.hidden = false
  chrome.hidden = false
  closeMenu()
  await refreshPhraseButton()
  setStatus((await store.phrase()) ? "Synced" : "On this phone")
  const sramBuf = await store.sram()
  try {
    startPrepared(language, sramBuf ? new Uint8Array(sramBuf) : null, event)
  } catch (cause) {
    missingScreen(cause instanceof Error ? cause.message : "Could not start")
    return
  }
  try {
    await navigator.wakeLock.request("screen")
  } catch {
    /* installed mode is more likely to allow this */
  }
  window.clearInterval(timer)
  timer = window.setInterval(() => void flushSram(), 15000)
}

async function flushSram() {
  const bytes = readSram()
  if (!bytes) return
  const changed = await noteLocalSram(bytes, language)
  if (!changed || !cloudConfigured() || !(await store.phrase())) return
  setStatus("Uploading")
  try {
    const state = await resolveSync()
    syncState = state
    setStatus(state === "conflict" ? "Save conflict" : "Synced")
    if (state === "conflict") showConflict()
  } catch {
    syncState = "error"
    setStatus("Sync failed")
  }
}

function showConflict() {
  const existing = document.querySelector("#conflict")
  if (existing) return
  const modal = document.createElement("div")
  modal.id = "conflict"
  modal.className = "modal"
  modal.innerHTML = `
    <div class="panel">
      <h1>Two saves</h1>
      <p>This phone and the phrase both changed. Pick one.</p>
      <button class="primary" type="button" id="keep">Keep this phone</button>
      <button class="choice" type="button" id="cloud">Use the phrase save</button>
    </div>
  `
  document.body.appendChild(modal)
  modal.querySelector<HTMLButtonElement>("#keep")!.onclick = async () => {
    await resolveSync("phone")
    modal.remove()
    setStatus("Synced")
  }
  modal.querySelector<HTMLButtonElement>("#cloud")!.onclick = async () => {
    await resolveSync("cloud")
    const bytes = await store.sram()
    if (bytes) installSram(new Uint8Array(bytes))
    modal.remove()
    setStatus("Synced")
  }
}

function showPhraseModal() {
  const existing = document.querySelector("#phrase-modal")
  if (existing) existing.remove()
  const modal = document.createElement("div")
  modal.id = "phrase-modal"
  modal.className = "modal"
  modal.innerHTML = `
    <form class="panel" id="phrase-form">
      <h1>Save phrase</h1>
      <p>Three words you can say. Use the same words on another phone and the save follows. Anyone who knows the words can open it.</p>
      <p class="phrase" id="words"></p>
      <button class="primary" type="submit">Use these words</button>
      <button class="choice" type="button" id="another">Different words</button>
      <label>Or type your own
        <input id="own" name="own" autocomplete="off" placeholder="river moss lantern">
      </label>
      <p class="error" id="phrase-err"></p>
      <button class="ghost" type="button" id="phrase-close">Close</button>
    </form>
  `
  document.body.appendChild(modal)
  const words = modal.querySelector<HTMLElement>("#words")!
  const err = modal.querySelector<HTMLElement>("#phrase-err")!
  const own = modal.querySelector<HTMLInputElement>("#own")!
  const paint = () => {
    words.textContent = showPhrase(normalizePhrase(draft) || "")
  }
  paint()
  modal.querySelector<HTMLButtonElement>("#another")!.onclick = () => {
    draft = suggestPhrase()
    own.value = ""
    err.textContent = ""
    paint()
  }
  modal.querySelector<HTMLButtonElement>("#phrase-close")!.onclick = () => modal.remove()
  modal.querySelector<HTMLFormElement>("#phrase-form")!.onsubmit = async (event) => {
    event.preventDefault()
    const typed = own.value.trim()
    const key = normalizePhrase(typed || draft)
    if (!key) {
      err.textContent = "Use 2 to 4 words, letters only."
      return
    }
    await store.setPhrase(key)
    draft = showPhrase(key)
    await refreshPhraseButton()
    modal.remove()
    if (!cloudConfigured()) {
      setStatus("On this phone")
      return
    }
    setStatus("Uploading")
    try {
      syncState = await resolveSync()
      setStatus(syncState === "conflict" ? "Save conflict" : "Synced")
      if (syncState === "conflict") showConflict()
      if (syncState === "synced") {
        const bytes = await store.sram()
        if (bytes && !game.hidden) installSram(new Uint8Array(bytes))
      }
    } catch {
      syncState = "error"
      setStatus("Sync failed")
    }
  }
}

menuToggle.onclick = (event) => {
  event.stopPropagation()
  setMenuOpen(menu.hidden)
}

menu.onclick = (event) => event.stopPropagation()

document.addEventListener("pointerdown", (event) => {
  if (menu.hidden || chrome.hidden) return
  const target = event.target
  if (target instanceof Node && (chrome.contains(target) || menu.contains(target))) return
  closeMenu()
})

document.querySelector<HTMLButtonElement>("#names")!.onclick = () => {
  closeMenu()
  window.clearInterval(timer)
  void flushSram().finally(() => {
    location.reload()
  })
}

document.querySelector<HTMLButtonElement>("#phrase")!.onclick = () => {
  closeMenu()
  showPhraseModal()
}

for (const which of ["fast", "slow"] as const) {
  document.querySelector<HTMLButtonElement>(`#${which}`)!.onclick = () => {
    const state = toggleSpeed(which)
    document.querySelector<HTMLButtonElement>("#fast")!.setAttribute("aria-pressed", String(state.fast))
    document.querySelector<HTMLButtonElement>("#slow")!.setAttribute("aria-pressed", String(state.slow))
  }
}

const SCALE_KEY = "emerald-land-scale"

function applyLandScale(percent: number) {
  const clamped = Math.min(100, Math.max(70, Math.round(percent)))
  document.documentElement.style.setProperty("--land-scale", String(clamped / 100))
  localStorage.setItem(SCALE_KEY, String(clamped))
  const readout = document.querySelector("#screen-readout")
  const range = document.querySelector<HTMLInputElement>("#screen-range")
  if (readout) readout.textContent = `${clamped}%`
  if (range && range.value !== String(clamped)) range.value = String(clamped)
}

const screenRange = document.querySelector<HTMLInputElement>("#screen-range")!
const saved = localStorage.getItem(SCALE_KEY)
const storedScale = saved == null ? 92 : Number(saved)
applyLandScale(Number.isFinite(storedScale) ? storedScale : 92)
screenRange.oninput = () => applyLandScale(Number(screenRange.value))

document.querySelector<HTMLButtonElement>("#export")!.onclick = async () => {
  closeMenu()
  const bytes = readSram() ?? (await store.sram())
  if (!bytes) return
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const copy = new ArrayBuffer(raw.byteLength)
  new Uint8Array(copy).set(raw)
  const file = new File([copy], "emeraldpp.sav", {
    type: "application/octet-stream",
  })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] })
    return
  }
  const link = document.createElement("a")
  link.href = URL.createObjectURL(file)
  link.download = file.name
  link.click()
}

document.addEventListener("pointerdown", () => resumeAudio())
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") void flushSram()
  else resumeAudio()
})

window.addEventListener("pagehide", () => {
  const bytes = readSram()
  if (bytes) void noteLocalSram(bytes, language)
})

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js")
}

async function start() {
  rom = (await loadStoredRom()) ?? (await tryDevRom())
  void preloadEmulator()
  const phrase = await store.phrase()
  if (phrase) draft = showPhrase(phrase)
  if (phrase && cloudConfigured()) {
    try {
      syncState = await resolveSync()
    } catch {
      syncState = "error"
    }
  }
  await showLanguage()
  if (syncState === "conflict") showConflict()
}

void start()

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !cloudConfigured()) return
  void store.phrase().then((phrase) => {
    if (!phrase) return
    void resolveSync().then(async (state) => {
      syncState = state
      if (state === "conflict") showConflict()
      if (state === "synced") {
        const bytes = await store.sram()
        if (bytes && !game.hidden) installSram(new Uint8Array(bytes))
        setStatus("Synced")
      }
    })
  })
})
