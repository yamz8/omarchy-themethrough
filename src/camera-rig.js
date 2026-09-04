import * as THREE from 'three'
import { wordmark, cellX, cellZ } from './wordmark.js'

export const TOP = {
  pos: new THREE.Vector3(0, 66, 0),
  target: new THREE.Vector3(0, 0, 0),
}

const WORD_W = wordmark.cols
const WORD_D = wordmark.rows

/**
 * Pull the overhead camera back just far enough to frame the whole wordmark,
 * so it fits landscape monitors and portrait phones alike.
 */
export function frameTopView(camera) {
  const vFov = THREE.MathUtils.degToRad(camera.fov)
  const t = Math.tan(vFov / 2)
  const forWidth = (WORD_W * 1.15) / 2 / (t * camera.aspect)
  const forDepth = (WORD_D * 2.0) / 2 / t
  TOP.pos.y = Math.max(forWidth, forDepth)
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * How the route is written through each letter, in the letter's own box:
 * u runs 0..1 left to right, v runs 0..1 top to bottom. These are drawn like
 * handwriting — one continuous gesture per letter, looping and doubling back
 * the way a pen would, rather than a straight pass down the word.
 */
const STROKES = {
  O: [[0.5, 0.10], [0.15, 0.30], [0.14, 0.70], [0.5, 0.90], [0.86, 0.70], [0.85, 0.30], [0.52, 0.11]],
  M: [[0.10, 0.90], [0.10, 0.12], [0.50, 0.74], [0.90, 0.12], [0.90, 0.90]],
  A: [[0.10, 0.90], [0.32, 0.46], [0.50, 0.12], [0.68, 0.46], [0.90, 0.90]],
  R: [[0.10, 0.90], [0.10, 0.12], [0.60, 0.15], [0.82, 0.32], [0.58, 0.50], [0.16, 0.54], [0.90, 0.90]],
  C: [[0.88, 0.20], [0.55, 0.10], [0.16, 0.35], [0.16, 0.66], [0.55, 0.90], [0.88, 0.80]],
  H: [[0.10, 0.12], [0.10, 0.90], [0.50, 0.50], [0.90, 0.12], [0.90, 0.90]],
  Y: [[0.10, 0.12], [0.48, 0.52], [0.50, 0.90], [0.70, 0.54], [0.90, 0.12]],
}

/** Bounds of each letter in grid space, so strokes can be placed inside them. */
function letterBox(letter) {
  let minR = Infinity, maxR = -Infinity
  for (const [, r] of letter.cells) { minR = Math.min(minR, r); maxR = Math.max(maxR, r) }
  return { c0: letter.c0, c1: letter.c1, r0: minR, r1: maxR }
}

/** The written route: every letter's gesture, joined into one continuous line. */
function buildRoute() {
  const pts = []
  wordmark.letters.forEach((letter, i) => {
    const box = letterBox(letter)
    const stroke = STROKES[letter.ch] ?? [[0.5, 0.5]]
    if (i === 0) {
      // Lead in from just off the left of the word, like the start of a stroke.
      // Kept short: a long run-up only shows empty floor.
      pts.push(new THREE.Vector3(cellX(box.c0) - 7, 0, cellZ(box.r1) + 4))
    }
    for (const [u, v] of stroke) {
      pts.push(new THREE.Vector3(
        cellX(box.c0 + u * (box.c1 - box.c0)),
        0,
        cellZ(box.r0 + v * (box.r1 - box.r0)),
      ))
    }
  })
  const last = wordmark.letters[wordmark.letters.length - 1]
  const box = letterBox(last)
  // Finish close to the last letter, on its centre line, so the drive ends over
  // the word and the climb back out still has it in frame.
  pts.push(new THREE.Vector3(cellX(box.c1) + 6, 0, cellZ((box.r0 + box.r1) / 2)))
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35)
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera
    this.route = buildRoute()
    this.length = this.route.getLength()

    // Ride low over the surface, looking a short way up the road — a car on it,
    // not a flypast above it.
    this.rideHeight = 7.5
    this.lookAhead = 13
    this.speed = 8.5

    this.state = 'top'
    this.t = 0
    this.pos = TOP.pos.clone()
    this.target = TOP.target.clone()

    // Phases run on wall-clock time. Advancing by per-frame deltas would let a
    // throttled tab (backgrounded, or just a slow frame rate) fall behind.
    this.startedAt = 0
    this.descendTime = 3.0
    this.tourTime = this.length / this.speed
    console.log(`[themethrough] route ${this.length.toFixed(0)} units, drive ${this.tourTime.toFixed(1)}s`)
    this.ascendTime = 3.4

    this.onStateChange = () => {}
  }

  get running() {
    return this.state !== 'top'
  }

  start() {
    if (this.running) return
    this.t = 0
    this.setState('descending')
  }

  setState(s) {
    this.state = s
    this.startedAt = performance.now()
    this.onStateChange(s)
  }

  /** Camera and aim for a point along the route, measured in metres travelled. */
  ride(u) {
    const pos = this.route.getPointAt(THREE.MathUtils.clamp(u, 0, 1))
    const ahead = this.route.getPointAt(THREE.MathUtils.clamp(u + this.lookAhead / this.length, 0, 1))
    pos.y = this.rideHeight
    ahead.y = this.rideHeight * 0.22
    return { pos, target: ahead }
  }

  update() {
    const elapsed = (performance.now() - this.startedAt) / 1000

    if (this.state === 'top') {
      this.pos.copy(TOP.pos)
      this.target.copy(TOP.target)
    } else if (this.state === 'descending') {
      this.t = elapsed / this.descendTime
      const k = easeInOut(Math.min(this.t, 1))
      const to = this.ride(0)
      this.pos.copy(TOP.pos).lerp(to.pos, k)
      this.target.copy(TOP.target).lerp(to.target, k)
      if (this.t >= 1) this.setState('touring')
    } else if (this.state === 'touring') {
      this.t = elapsed / this.tourTime
      const at = this.ride(Math.min(this.t, 1))
      this.pos.copy(at.pos)
      this.target.copy(at.target)
      if (this.t >= 1) this.setState('ascending')
    } else if (this.state === 'ascending') {
      this.t = elapsed / this.ascendTime
      const k = easeInOut(Math.min(this.t, 1))
      const from = this.ride(1)
      this.pos.copy(from.pos).lerp(TOP.pos, k)
      this.target.copy(from.target).lerp(TOP.target, k)
      if (this.t >= 1) { this.t = 0; this.setState('top') }
    }

    this.camera.position.copy(this.pos)
    // Looking straight down is degenerate with a +y up vector, so tilt the up
    // vector toward -z — but only as the camera actually approaches vertical.
    // Blending it in any earlier rolls the horizon during the low drive.
    const dir = this.target.clone().sub(this.pos).normalize()
    const tilt = THREE.MathUtils.smoothstep(Math.abs(dir.y), 0.92, 0.999)
    this.camera.up.set(0, 1 - tilt, -tilt).normalize()
    this.camera.lookAt(this.target)
  }

  /** Index of the letter the camera is nearest, or -1 outside the drive. */
  currentLetter() {
    if (this.state !== 'touring') return -1
    const x = this.pos.x
    let best = -1
    let bestD = 10
    wordmark.letters.forEach((l, i) => {
      const d = Math.abs(cellX((l.c0 + l.c1) / 2) - x)
      if (d < bestD) { bestD = d; best = i }
    })
    return best
  }
}
