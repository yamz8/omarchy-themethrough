import * as THREE from 'three'
import { wordmark, cellX, HEIGHT } from './wordmark.js'

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
const easeOut = (t) => 1 - Math.pow(1 - t, 3)

/** Centre x of each letter, in world units. */
const letterCentres = wordmark.letters.map((l) => cellX((l.c0 + l.c1) / 2))

const ENTRY = letterCentres[0] - 17
const EXIT = letterCentres[letterCentres.length - 1] + 17

// The flight runs along the front edge of the wordmark rather than through it.
// Skimming between the blocks sounds good but reads as blank walls: the image
// faces point straight up, so they only stay legible from a raised, tilted view.
const FLY_Z = 13
const FLY_Y = 16

/**
 * The low pass. The camera dollies left to right in front of the letters,
 * rising and easing nearer/further so each one is seen from its own angle.
 */
function buildPath() {
  const pts = [new THREE.Vector3(ENTRY, FLY_Y + 2.5, FLY_Z + 4)]
  letterCentres.forEach((x, i) => {
    const lift = i % 2 === 0 ? -1.4 : 1.6
    const push = i % 2 === 0 ? 1.5 : -1.8
    pts.push(new THREE.Vector3(x, FLY_Y + lift, FLY_Z + push))
  })
  pts.push(new THREE.Vector3(EXIT, FLY_Y + 2.5, FLY_Z + 4))
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4)
}

/** The camera looks at each letter in turn, just above the block tops. */
function buildLookPath() {
  const pts = [new THREE.Vector3(ENTRY + 6, HEIGHT, -1)]
  letterCentres.forEach((x) => {
    pts.push(new THREE.Vector3(x, HEIGHT * 0.5, -1.5))
  })
  pts.push(new THREE.Vector3(EXIT - 6, HEIGHT, -1))
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4)
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera
    this.path = buildPath()
    this.lookPath = buildLookPath()

    this.state = 'top'
    this.t = 0
    this.pos = TOP.pos.clone()
    this.target = TOP.target.clone()

    this.descendTime = 3.0
    this.tourTime = 24
    this.ascendTime = 3.4

    this.onStateChange = () => {}
  }

  get running() {
    return this.state !== 'top'
  }

  start() {
    if (this.running) return
    this.setState('descending')
    this.t = 0
  }

  setState(s) {
    this.state = s
    this.onStateChange(s)
  }

  /** Where the tour begins — used to blend the descent into the flight. */
  tourStart() {
    return { pos: this.path.getPoint(0), target: this.lookPath.getPoint(0) }
  }

  tourEnd() {
    return { pos: this.path.getPoint(1), target: this.lookPath.getPoint(1) }
  }

  update(dt) {
    if (this.state === 'top') {
      this.pos.copy(TOP.pos)
      this.target.copy(TOP.target)
    } else if (this.state === 'descending') {
      this.t += dt / this.descendTime
      const k = easeInOut(Math.min(this.t, 1))
      const to = this.tourStart()
      this.pos.copy(TOP.pos).lerp(to.pos, k)
      this.target.copy(TOP.target).lerp(to.target, k)
      if (this.t >= 1) {
        this.t = 0
        this.setState('touring')
      }
    } else if (this.state === 'touring') {
      this.t += dt / this.tourTime
      const k = Math.min(this.t, 1)
      // Ease only at the very ends so the middle travels at a steady pace.
      const e = k < 0.12 ? easeOut(k / 0.12) * 0.12 : k > 0.88 ? 0.88 + (1 - Math.pow(1 - (k - 0.88) / 0.12, 2)) * 0.12 : k
      this.pos.copy(this.path.getPoint(e))
      this.target.copy(this.lookPath.getPoint(e))
      if (this.t >= 1) {
        this.t = 0
        this.setState('ascending')
      }
    } else if (this.state === 'ascending') {
      this.t += dt / this.ascendTime
      const k = easeInOut(Math.min(this.t, 1))
      const from = this.tourEnd()
      this.pos.copy(from.pos).lerp(TOP.pos, k)
      this.target.copy(from.target).lerp(TOP.target, k)
      if (this.t >= 1) {
        this.t = 0
        this.setState('top')
      }
    }

    this.camera.position.copy(this.pos)
    // Looking straight down is degenerate with a +y up vector, so tilt the up
    // vector toward -z as the camera approaches vertical.
    const dir = this.target.clone().sub(this.pos).normalize()
    const vertical = Math.abs(dir.y)
    this.camera.up.set(0, 1 - vertical, -vertical).normalize()
    this.camera.lookAt(this.target)
  }

  /** Index of the letter the camera is nearest, or -1 outside the tour. */
  currentLetter() {
    if (this.state !== 'touring') return -1
    const x = this.pos.x
    let best = -1
    let bestD = 9
    letterCentres.forEach((cx, i) => {
      const d = Math.abs(cx - x)
      if (d < bestD) { bestD = d; best = i }
    })
    return best
  }
}

export { letterCentres }
