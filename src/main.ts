import "./style.css"
import {
  cloudConfigured,
  onSession,
  openedFromEmail,
  recoveryFromEmail,
  sendPasswordLink,
  session,
  setPassword,
  signIn,
  signOut,
  signUp,
} from "./auth"
import { noteLocalSram, resolveSync, type SyncState } from "./cloud"
import { store, type Lang } from "./db"
import { installSram, prepareRoms, preloadEmulator, readSram, resumeAudio, startPrepared } from "./emu"
import { isPatchedEmerald } from "./rom"

const app = document.querySelector<HTMLElement>("#app")!
const game = document.querySelector<HTMLElement>("#game")!
const chrome = document.querySelector<HTMLElement>("#chrome")!
const status = document.querySelector<HTMLElement>("#status")!

let rom: Uint8Array | null = null
let language: Lang = "en"
let syncState: SyncState = "local"
let timer = 0

function setStatus(text: string) {
  status.textContent = text
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

function escapeText(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!)
}

function isStandalone() {
  const ios = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia("(display-mode: standalone)").matches || ios.standalone === true
}

function readLogin(form: HTMLFormElement) {
  const data = new FormData(form)
  const email = data.get("email")
  const password = data.get("password")
  if (typeof email !== "string" || typeof password !== "string") return null
  return { email: email.trim(), password }
}

function loginScreen(error = "") {
  panel(`
    <form class="panel" id="login">
      <h1>Emerald++</h1>
      <p>Sign in here. The email link only confirms the address. It does not sign in the home screen app.</p>
      <label>Email <input name="email" type="email" autocomplete="username" required></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" minlength="6" required></label>
      <button class="primary" type="submit">Sign in</button>
      <button class="choice" type="button" id="create">Create account</button>
      <button class="ghost" type="button" id="reset">Email me a password link</button>
      <p class="error" id="err"></p>
      ${cloudConfigured() ? "" : '<button class="ghost" type="button" id="local">Play on this device</button>'}
    </form>
  `)
  const form = document.querySelector<HTMLFormElement>("#login")!
  const err = document.querySelector<HTMLElement>("#err")!
  err.textContent = error
  form.onsubmit = async (event) => {
    event.preventDefault()
    const fields = readLogin(form)
    if (!fields) return
    try {
      await signIn(fields.email, fields.password)
      await afterAuth()
    } catch (cause) {
      err.textContent = cause instanceof Error ? cause.message : "Could not sign in"
    }
  }
  document.querySelector<HTMLButtonElement>("#create")!.onclick = async () => {
    const fields = readLogin(form)
    if (!fields) return
    if (fields.password.length < 6) {
      err.textContent = "Use at least 6 characters."
      return
    }
    try {
      const signedIn = await signUp(fields.email, fields.password)
      if (signedIn) await afterAuth()
      else sentScreen(fields.email)
    } catch (cause) {
      err.textContent = cause instanceof Error ? cause.message : "Could not create the account"
    }
  }
  document.querySelector<HTMLButtonElement>("#reset")!.onclick = async () => {
    const email = new FormData(form).get("email")
    if (typeof email !== "string" || !email.trim()) {
      err.textContent = "Enter the email first."
      return
    }
    try {
      await sendPasswordLink(email.trim())
      sentScreen(email.trim(), "Tap the link, set a password, then come back here and sign in.")
    } catch (cause) {
      err.textContent = cause instanceof Error ? cause.message : "Could not send the email"
    }
  }
  document.querySelector<HTMLButtonElement>("#local")?.addEventListener("click", () => {
    void showLanguage()
  })
}

function sentScreen(email: string, detail = "Tap the link to confirm the address. Then come back to this app and sign in with your password.") {
  panel(`
    <div class="panel">
      <h1>Check your email</h1>
      <p>${detail}</p>
      <p>${escapeText(email)}</p>
      <button class="ghost" type="button" id="back">Back to sign in</button>
    </div>
  `)
  document.querySelector<HTMLButtonElement>("#back")!.onclick = () => loginScreen()
}

function browserHandoff() {
  panel(`
    <div class="panel">
      <h1>Email confirmed</h1>
      <p>This window is not the home screen app. Close it, open Emerald on your home screen, and sign in with your password.</p>
      <button class="primary" type="button" id="here">Continue in this browser</button>
    </div>
  `)
  document.querySelector<HTMLButtonElement>("#here")!.onclick = () => {
    void afterAuth()
  }
}

function passwordScreen(error = "") {
  panel(`
    <form class="panel" id="password">
      <h1>Set a password</h1>
      <p>Then close this window and sign in from the home screen app.</p>
      <label>Password <input name="password" type="password" autocomplete="new-password" minlength="6" required></label>
      <button class="primary" type="submit">Save password</button>
      <p class="error" id="err"></p>
    </form>
  `)
  const err = document.querySelector<HTMLElement>("#err")!
  err.textContent = error
  document.querySelector<HTMLFormElement>("#password")!.onsubmit = async (event) => {
    event.preventDefault()
    const password = new FormData(event.currentTarget as HTMLFormElement).get("password")
    if (typeof password !== "string" || password.length < 6) {
      err.textContent = "Use at least 6 characters."
      return
    }
    try {
      await setPassword(password)
      browserHandoff()
    } catch (cause) {
      err.textContent = cause instanceof Error ? cause.message : "Could not save the password"
    }
  }
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
  setStatus(syncState === "local" ? "On this device" : "Synced")
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
  if (!changed || !cloudConfigured()) return
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
      <p>This phone and the cloud both changed. Pick one. The other stays only until you choose.</p>
      <button class="primary" type="button" id="keep">Keep this phone</button>
      <button class="choice" type="button" id="cloud">Use cloud save</button>
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

async function afterAuth() {
  try {
    syncState = await resolveSync()
  } catch {
    syncState = "error"
  }
  if (syncState === "conflict") {
    await showLanguage()
    showConflict()
    return
  }
  await showLanguage()
}

document.querySelector<HTMLButtonElement>("#names")!.onclick = () => {
  window.clearInterval(timer)
  void flushSram().finally(() => {
    location.reload()
  })
}

document.querySelector<HTMLButtonElement>("#out")!.onclick = async () => {
  await flushSram()
  await signOut()
  window.location.reload()
}

document.querySelector<HTMLButtonElement>("#export")!.onclick = async () => {
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
  if (!cloudConfigured()) {
    syncState = "local"
    await showLanguage()
    return
  }
  const current = await session()
  if (current && recoveryFromEmail) {
    passwordScreen()
    return
  }
  if (current && openedFromEmail && !isStandalone()) {
    browserHandoff()
    return
  }
  if (!current) {
    loginScreen()
    return
  }
  await afterAuth()
}

onSession((next) => {
  if (!next && cloudConfigured() && !app.hidden) loginScreen()
})

void start()

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && cloudConfigured()) {
    void resolveSync().then(async (state) => {
      syncState = state
      if (state === "conflict") showConflict()
      if (state === "synced") {
        const bytes = await store.sram()
        if (bytes) installSram(new Uint8Array(bytes))
        setStatus("Synced")
      }
    })
  }
})
