import { applyUps } from "./ups"
import type { Lang } from "./db"

interface Fs {
  writeFile(path: string, data: Uint8Array): void
  analyzePath(path: string): { exists: boolean }
  mkdir(path: string): void
}

interface GameManager {
  getSaveFile(flush?: boolean): Uint8Array | null
  getSaveFilePath(): string
  loadSaveFiles(): void
  FS: Fs
}

interface Emu {
  on(event: string, cb: (...args: unknown[]) => void): void
  startButtonClicked(event: Event): void
  gameManager?: GameManager
}

declare global {
  interface Window {
    EmulatorJS?: new (el: string, config: Record<string, unknown>) => Emu
  }
}

let pendingSram: Uint8Array | null = null
let emu: Emu | null = null
let scriptsReady: Promise<void> | null = null
let prepared: { en: Uint8Array; de: Uint8Array } | null = null

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const tag = document.createElement("script")
    tag.src = src
    tag.onload = () => resolve()
    tag.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(tag)
  })
}

export function preloadEmulator() {
  if (!scriptsReady) {
    const css = document.createElement("link")
    css.rel = "stylesheet"
    css.href = "/data/emulator.min.css"
    document.head.appendChild(css)
    scriptsReady = loadScript("/data/emulator.min.js")
  }
  return scriptsReady
}

async function germanRom(rom: Uint8Array) {
  const res = await fetch("/patch/emeraldpp-de-names.ups")
  if (!res.ok) throw new Error("German name patch is missing")
  return applyUps(new Uint8Array(await res.arrayBuffer()), rom)
}

function writeSram(fs: Fs) {
  if (!pendingSram) return
  const path = "/data/saves/emeraldpp.srm"
  if (!fs.analyzePath("/data").exists) fs.mkdir("/data")
  if (!fs.analyzePath("/data/saves").exists) fs.mkdir("/data/saves")
  fs.writeFile(path, pendingSram)
}

export async function prepareRoms(rom: Uint8Array) {
  await preloadEmulator()
  prepared = { en: rom, de: await germanRom(rom) }
}

export function startPrepared(lang: Lang, sram: Uint8Array | null, gesture: Event) {
  if (!prepared) throw new Error("ROM is not ready")
  const bytes = prepared[lang]
  pendingSram = sram
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  const file = new File([copy], "emeraldpp.gba", { type: "application/octet-stream" })
  const Ctor = window.EmulatorJS
  if (!Ctor) throw new Error("Emulator failed to load")
  const player = new Ctor("#game", {
    gameUrl: URL.createObjectURL(file),
    dataPath: "/data/",
    system: "gba",
    gameName: "emeraldpp",
    color: "#9be7a8",
    backgroundColor: "#07140c",
    volume: 0.8,
    startOnLoad: false,
    threads: false,
    controlScheme: "gba",
    language: "en-US",
    // L/R/Select/Start/Fast/Slow stay in the bottom strip. Only A/B and the
    // D-pad sit on the sides of the game.
    VirtualGamepadSettings: [
      { type: "button", text: "B", id: "b", location: "right", left: 10, top: 70, bold: true, input_value: 0 },
      { type: "button", text: "A", id: "a", location: "right", left: 81, top: 40, bold: true, input_value: 8 },
      {
        type: "dpad",
        id: "dpad",
        location: "left",
        left: "50%",
        top: "50%",
        joystickInput: false,
        inputValues: [4, 5, 6, 7],
      },
      { type: "button", text: "L", id: "l", location: "center", left: -95, fontSize: 15, bold: true, block: true, input_value: 10 },
      { type: "button", text: "Select", id: "select", location: "center", left: -30, fontSize: 13, block: true, input_value: 2 },
      { type: "button", text: "Start", id: "start", location: "center", left: 45, fontSize: 13, block: true, input_value: 3 },
      { type: "button", text: "R", id: "r", location: "center", left: 115, fontSize: 15, bold: true, block: true, input_value: 11 },
      { type: "button", text: "Fast", id: "speed_fast", location: "center", left: -30, top: 42, fontSize: 13, block: true, input_value: 27 },
      { type: "button", text: "Slow", id: "speed_slow", location: "center", left: 80, top: 42, fontSize: 13, block: true, input_value: 29 },
    ],
    buttonOpts: {
      playPause: false,
      restart: false,
      mute: false,
      settings: true,
      fullscreen: false,
      saveState: true,
      loadState: true,
      screenRecord: false,
      gamepad: true,
      cheat: false,
      volume: true,
      saveSavFiles: true,
      loadSavFiles: true,
      quickSave: false,
      quickLoad: false,
      screenshot: false,
      cacheManager: false,
      exitEmulation: false,
    },
  })
  emu = player
  player.on("saveDatabaseLoaded", (fs) => {
    writeSram(fs as Fs)
  })
  // Click events have no pointerType. On a phone the pad DOM already exists
  // (hasTouchScreen). Marking this as touch shows it. Doing that on a desktop
  // crashes setup, because the pad was never built.
  const touchScreen = navigator.maxTouchPoints > 0 || matchMedia("(any-pointer: coarse)").matches
  player.startButtonClicked({
    pointerType: touchScreen ? "touch" : "",
    preventDefault() {
      gesture.preventDefault()
    },
    target: gesture.target,
  } as unknown as Event)
  document.querySelector("#game .ejs_start_button")?.remove()
  window.setTimeout(() => {
    const mgr = player.gameManager
    if (!mgr || !pendingSram) return
    try {
      const savePath = mgr.getSaveFilePath()
      if (savePath && savePath !== "/data/saves/emeraldpp.srm") {
        mgr.FS.writeFile(savePath, pendingSram)
        mgr.loadSaveFiles()
      }
    } catch {
      /* core may still be booting */
    }
  }, 1500)
}

export function readSram() {
  const mgr = emu?.gameManager
  if (!mgr) return null
  try {
    const file = mgr.getSaveFile(true)
    return file ? new Uint8Array(file) : null
  } catch {
    return null
  }
}

export function installSram(bytes: Uint8Array) {
  pendingSram = bytes
  const mgr = emu?.gameManager
  if (!mgr) return
  const savePath = mgr.getSaveFilePath() || "/data/saves/emeraldpp.srm"
  mgr.FS.writeFile(savePath, bytes)
  mgr.loadSaveFiles()
}

export function resumeAudio() {
  const ctx = (emu as unknown as { gameManager?: { Module?: { AL?: { currentCtx?: { audioCtx?: AudioContext } } } } })
    ?.gameManager?.Module?.AL?.currentCtx?.audioCtx
  if (ctx && ctx.state !== "running") void ctx.resume()
}
