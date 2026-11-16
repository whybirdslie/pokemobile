export interface Directions {
  up: number
  down: number
  left: number
  right: number
}

const DEAD = 16
const REACH = 34

const idle: Directions = { up: 0, down: 0, left: 0, right: 0 }

function aim(dx: number, dy: number): Directions {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const next = { ...idle }
  if (ax < DEAD && ay < DEAD) return next
  const diagonal = Math.min(ax, ay) >= Math.max(ax, ay) * 0.5
  if (ay >= DEAD && (diagonal || ay > ax)) {
    if (dy < 0) next.up = 1
    else next.down = 1
  }
  if (ax >= DEAD && (diagonal || ax > ay)) {
    if (dx < 0) next.left = 1
    else next.right = 1
  }
  return next
}

export function attachStick(root: HTMLElement, setDirections: (next: Directions) => void) {
  if (root.querySelector("#stick-zone")) return
  const zone = document.createElement("div")
  zone.id = "stick-zone"
  const base = document.createElement("div")
  base.id = "stick-base"
  const knob = document.createElement("div")
  knob.id = "stick-knob"
  zone.append(base, knob)
  root.append(zone)

  let pointer = -1
  let originX = 0
  let originY = 0

  const hide = () => {
    pointer = -1
    zone.classList.remove("live")
    setDirections(idle)
  }

  const place = (dx: number, dy: number) => {
    const rect = zone.getBoundingClientRect()
    const ox = originX - rect.left
    const oy = originY - rect.top
    const dist = Math.hypot(dx, dy) || 1
    const scale = Math.min(1, REACH / dist)
    base.style.left = `${ox}px`
    base.style.top = `${oy}px`
    knob.style.left = `${ox + dx * scale}px`
    knob.style.top = `${oy + dy * scale}px`
  }

  zone.addEventListener("pointerdown", (event) => {
    if (pointer !== -1 || event.button !== 0) return
    pointer = event.pointerId
    originX = event.clientX
    originY = event.clientY
    zone.classList.add("live")
    zone.setPointerCapture(event.pointerId)
    place(0, 0)
    setDirections(idle)
  })

  zone.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointer) return
    const dx = event.clientX - originX
    const dy = event.clientY - originY
    place(dx, dy)
    setDirections(aim(dx, dy))
  })

  const end = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return
    hide()
  }
  zone.addEventListener("pointerup", end)
  zone.addEventListener("pointercancel", end)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") hide()
  })
}
