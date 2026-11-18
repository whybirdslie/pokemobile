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
  touch?: boolean
  enableMouseLock?: boolean
  toggleVirtualGamepad?: (on: boolean) => void
  changeSettingOption?: (key: string, value: string) => void
  keyChange?: (event: KeyboardEvent) => void
}

declare global {
  interface Window {
    EmulatorJS?: new (el: string, config: Record<string, unknown>) => Emu
  }
}

let pendingSram: Uint8Array | null = null
let emu: Emu | null = null
let speed = 0
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
  prepared = {
    en: keepHmItems(rom),
    de: keepHmItems(await germanRom(rom)),
  }
}

// TM100 is item 0x2A9. HM01-HM08 are 0x2AA-0x2B1 and share the same teach
// function. That function only keeps the item for ids up to TM100, so using
// Cut deletes it. Raise the cutoff through HM08.
function keepHmItems(rom: Uint8Array) {
  const copy = rom.slice()
  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength)
  if (view.getUint32(0x122960, true) !== 0x2a9) return copy
  view.setUint32(0x122960, 0x2b1, true)
  return copy
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
      { type: "button", text: "Start", id: "start", location: "right", left: 28, top: -42, fontSize: 13, block: true, input_value: 3 },
      { type: "button", text: "R", id: "r", location: "right", left: 104, top: -42, fontSize: 15, bold: true, block: true, input_value: 11 },
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
  speed = 0
  player.on("saveDatabaseLoaded", (fs) => {
    writeSram(fs as Fs)
  })
  // Click events have no pointerType. A touch screen already built the pad,
  // and marking the start as touch shows it. A desktop with no touch has no
  // pad DOM, and forcing touch there crashes setup. An iPad with a Magic
  // Keyboard still has maxTouchPoints, even though the trackpad is a fine pointer.
  const touchScreen = touchHardware()
  const root = document.querySelector<HTMLElement>("#game")
  if (touchScreen) {
    root?.classList.add("touch-pad")
    player.on("start", () => showTouchPad(player))
  }
  player.startButtonClicked({
    pointerType: touchScreen ? "touch" : "",
    preventDefault() {
      gesture.preventDefault()
    },
    target: gesture.target,
  } as unknown as Event)
  document.querySelector("#game .ejs_start_button")?.remove()
  if (root) {
    attachStick(root, setDirections)
    liftFaceButtons()
    keepKeyboard(player, root)
    if (touchScreen) {
      root.tabIndex = -1
      root.focus()
    }
  }
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

function touchHardware() {
  return navigator.maxTouchPoints > 0 || matchMedia("(any-pointer: coarse)").matches
}

function showTouchPad(player: Emu) {
  player.touch = true
  player.enableMouseLock = false
  try {
    player.changeSettingOption?.("virtual-gamepad", "enabled")
    player.changeSettingOption?.("lockMouse", "disabled")
    player.changeSettingOption?.("keyboardInput", "disabled")
  } catch {
    /* settings menu may still be opening */
  }
  player.toggleVirtualGamepad?.(true)
}

function typingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select") !== null)
}

function keepKeyboard(player: Emu, root: HTMLElement) {
  const onKey = (event: KeyboardEvent) => {
    if (!player.keyChange || event.repeat || event.metaKey || event.ctrlKey) return
    if (typingTarget(event.target) || document.querySelector(".modal")) return
    if (event.target instanceof Node && root.contains(event.target)) return
    player.keyChange(event)
  }
  window.addEventListener("keydown", onKey)
  window.addEventListener("keyup", onKey)
  root.addEventListener("pointerdown", () => {
    if (typingTarget(document.activeElement)) return
    root.focus()
  })
  // Trackpad movement is a mouse move. That opens the emulator menu bar.
  root.addEventListener("mousemove", (event) => {
    event.stopPropagation()
  }, true)
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement && root.contains(document.pointerLockElement)) {
      void document.exitPointerLock()
    }
  })
}

export function toggleSpeed(rate: 1.5 | 2 | 3) {
  const player = emu as (Emu & {
    isFastForward?: boolean
    isSlowMotion?: boolean
    gameManager?: {
      toggleFastForward?: (on: number) => void
      toggleSlowMotion?: (on: number) => void
      setFastForwardRatio?: (ratio: number) => void
    }
  }) | null
  const next = speed === rate ? 0 : rate
  const mgr = player?.gameManager
  mgr?.toggleSlowMotion?.(0)
  mgr?.toggleFastForward?.(0)
  if (player) {
    player.isFastForward = next !== 0
    player.isSlowMotion = false
  }
  speed = next
  if (next !== 0 && mgr?.setFastForwardRatio && mgr.toggleFastForward) {
    mgr.setFastForwardRatio(next)
    const turnOn = mgr.toggleFastForward.bind(mgr)
    window.setTimeout(() => {
      if (speed !== next) return
      turnOn(1)
    }, 10)
  }
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
