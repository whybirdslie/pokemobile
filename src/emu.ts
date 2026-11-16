import { applyUps } from "./ups"
import type { Lang } from "./db"
import { attachStick, type Directions } from "./stick"

interface Fs {
  writeFile(path: string, data: Uint8Array): void
  analyzePath(path: string): { exists: boolean }
  mkdir(path: string): void
}

interface GameManager {
  getSaveFile(flush?: boolean): Uint8Array | null
  getSaveFilePath(): string
  loadSaveFiles(): void
  simulateInput?(player: number, button: number, value: number): void
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
let speed = 1
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
    // L/Select sit above the left thumb zone. Start/R sit above A/B.
    // The cross is hidden. The left half is a floating stick.
    VirtualGamepadSettings: [
      { type: "button", text: "B", id: "b", location: "right", left: 8, top: 78, bold: true, input_value: 0 },
      { type: "button", text: "A", id: "a", location: "right", left: 56, top: 16, bold: true, input_value: 8 },
      {
        type: "dpad",
        id: "dpad",
        location: "left",
        left: "50%",
        top: "50%",
        joystickInput: false,
        inputValues: [4, 5, 6, 7],
      },
      { type: "button", text: "L", id: "l", location: "left", left: 0, top: -42, fontSize: 15, bold: true, block: true, input_value: 10 },
      { type: "button", text: "Select", id: "select", location: "left", left: 52, top: -42, fontSize: 13, block: true, input_value: 2 },
      { type: "button", text: "Start", id: "start", location: "right", left: 0, top: -42, fontSize: 13, block: true, input_value: 3 },
      { type: "button", text: "R", id: "r", location: "right", left: 86, top: -42, fontSize: 15, bold: true, block: true, input_value: 11 },
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
  setSpeed(speed)
  window.setTimeout(() => setSpeed(speed), 400)
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
  const root = document.querySelector<HTMLElement>("#game")
  if (root) {
    attachStick(root, setDirections)
    liftFaceButtons()
  }
  window.setTimeout(() => {
    setSpeed(speed)
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

let forwarding = false

function speedPlayer() {
  return emu as (Emu & {
    isFastForward?: boolean
    isSlowMotion?: boolean
    gameManager?: {
      toggleFastForward?: (on: number) => void
      toggleSlowMotion?: (on: number) => void
      setFastForwardRatio?: (ratio: number) => void
    }
  }) | null
}

export function setSpeed(rate: number) {
  const next = Math.min(3, Math.max(1, Math.round(rate * 10) / 10))
  const player = speedPlayer()
  const mgr = player?.gameManager
  speed = next
  if (!mgr?.toggleFastForward || !mgr.setFastForwardRatio) {
    forwarding = false
    return next
  }
  mgr.toggleSlowMotion?.(0)
  if (player) player.isSlowMotion = false
  if (next <= 1) {
    forwarding = false
    if (player) player.isFastForward = false
    mgr?.toggleFastForward?.(0)
    return 1
  }
  mgr?.setFastForwardRatio?.(next)
  if (player) player.isFastForward = true
  if (!forwarding) {
    forwarding = true
    window.setTimeout(() => {
      if (speed <= 1) return
      mgr?.toggleFastForward?.(1)
    }, 10)
  }
  return speed
}

export function commitSpeed() {
  if (speed <= 1) return speed
  const player = speedPlayer()
  const mgr = player?.gameManager
  if (!mgr?.toggleFastForward || !mgr.setFastForwardRatio) return speed
  forwarding = false
  if (player) player.isFastForward = true
  mgr.toggleFastForward(0)
  mgr.setFastForwardRatio(speed)
  const turnOn = mgr.toggleFastForward
  forwarding = true
  const rate = speed
  window.setTimeout(() => {
    if (speed !== rate) return
    turnOn(1)
  }, 10)
  return speed
}

const padHeld: Directions = { up: 0, down: 0, left: 0, right: 0 }
const padButton = { up: 4, down: 5, left: 6, right: 7 } as const

export function setDirections(next: Directions) {
  const mgr = emu?.gameManager
  if (!mgr?.simulateInput) return
  ;(Object.keys(padButton) as (keyof Directions)[]).forEach((key) => {
    const value = next[key] ? 1 : 0
    if (padHeld[key] === value) return
    padHeld[key] = value
    mgr.simulateInput!(0, padButton[key], value)
  })
}

const faceButtons: [string, number][] = [
  [".b_b", 0],
  [".b_select", 2],
  [".b_start", 3],
  [".b_a", 8],
  [".b_l", 10],
  [".b_r", 11],
]

function liftFaceButtons() {
  const lift = (remaining: TouchList | null) => {
    const mgr = emu?.gameManager
    if (!mgr?.simulateInput) return
    faceButtons.forEach(([sel, id]) => {
      const el = document.querySelector(`#game ${sel}`)
      if (!el) return
      if (!el.classList.contains("ejs_virtualGamepad_button_down")) return
      let held = false
      if (remaining) {
        for (let i = 0; i < remaining.length; i++) {
          const hit = document.elementFromPoint(remaining[i].clientX, remaining[i].clientY)
          if (hit && el.contains(hit)) held = true
        }
      }
      if (held) return
      el.classList.remove("ejs_virtualGamepad_button_down")
      mgr.simulateInput!(0, id, 0)
    })
  }
  window.addEventListener("touchend", (event) => lift(event.touches))
  window.addEventListener("touchcancel", () => lift(null))
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") lift(null)
  })
}

export function resumeAudio() {
  const ctx = (emu as unknown as { gameManager?: { Module?: { AL?: { currentCtx?: { audioCtx?: AudioContext } } } } })
    ?.gameManager?.Module?.AL?.currentCtx?.audioCtx
  if (ctx && ctx.state !== "running") void ctx.resume()
}
