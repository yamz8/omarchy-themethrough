import * as THREE from 'three'
import { wordmark, cellX, cellZ } from './wordmark.js'

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const linear = (t) => t
const EASES = { easeInOut, easeOut, linear }

const centre = (l) => cellX((l.c0 + l.c1) / 2)
const L = Object.fromEntries(wordmark.letters.map((l) => [l.ch, centre(l)]))

/** Height that frames the whole wordmark from directly overhead. */
function overheadY(camera) {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
  return Math.max(
    (wordmark.cols * 1.18) / 2 / (t * camera.aspect),
    (wordmark.rows * 2.1) / 2 / t,
  )
}

/**
 * The route written through the letters, used for the driving shots. One
 * continuous gesture per letter — looping and doubling back the way a pen
 * would, rather than a straight pass down the word.
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

function buildRoute() {
  const pts = []
  for (const letter of wordmark.letters) {
    let minR = Infinity, maxR = -Infinity
    for (const [, r] of letter.cells) { minR = Math.min(minR, r); maxR = Math.max(maxR, r) }
    for (const [u, v] of STROKES[letter.ch] ?? [[0.5, 0.5]]) {
      pts.push(new THREE.Vector3(
        cellX(letter.c0 + u * (letter.c1 - letter.c0)),
        0,
        cellZ(minR + v * (maxR - minR)),
      ))
    }
  }
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35)
}

const V = (x, y, z) => new THREE.Vector3(x, y, z)

/**
 * The cut. Each shot is a move from one framing to another; the camera jumps
 * between shots, so the joins read as edits rather than one endless glide.
 *
 * `drive` shots ride the written route at car height; the rest are staged
 * moves. Captions carry the facts the piece is actually about.
 */
export function buildShots() {
  return [
    // Cold open: down among the pictures, drifting, before you know what it is.
    {
      dur: 5.5, ease: 'linear',
      a: { p: V(L.O - 15, 2.5, 9), t: V(L.O - 4, 0.6, 3) },
      b: { p: V(L.O - 2, 2.9, 6), t: V(L.O + 9, 0.6, 1) },
    },
    // Title, still low, still moving.
    {
      dur: 5.0, ease: 'linear',
      a: { p: V(L.M - 9, 3.2, 10), t: V(L.M, 0.6, 2) },
      b: { p: V(L.M + 4, 3.6, 7), t: V(L.M + 13, 0.6, 0) },
      caption: { title: 'OMARCHY', sub: 'every theme, laid into the wordmark' },
    },
    // The drive: the route as written, through the middle of the word.
    { dur: 9.0, ease: 'linear', drive: [0.30, 0.52] },
    // Break out: rise off the surface and let the whole shape land.
    {
      dur: 5.5, ease: 'easeInOut',
      a: { p: V(L.R, 7, 16), t: V(L.R + 6, 0.5, 2) },
      b: { p: V(0, 'over', 0), t: V(0, 0, 0) },
      caption: { title: '22 themes', sub: 'catppuccin · gruvbox · nord · tokyo-night · …' },
    },
    // Overhead, drifting slowly across the word.
    {
      dur: 5.5, ease: 'linear',
      a: { p: V(-13, 'over', 0), t: V(-13, 0, 0) },
      b: { p: V(13, 'over', 0), t: V(13, 0, 0) },
      caption: { title: '71 backgrounds', sub: 'each one whole, each one once' },
    },
    // Low again, over the brightest stretch of the word.
    { dur: 7.0, ease: 'linear', drive: [0.72, 0.88] },
    // Hero: the three-quarter push-in.
    {
      dur: 6.0, ease: 'easeOut',
      a: { p: V(-6, 40, 78), t: V(0, 0, 4) },
      b: { p: V(0, 31, 60), t: V(0, 0, 0) },
    },
    // Settle overhead and hold on the name.
    {
      dur: 6.5, ease: 'easeInOut',
      a: { p: V(0, 'over', 26), t: V(0, 0, 3) },
      b: { p: V(0, 'over', 0), t: V(0, 0, 0) },
      caption: { title: 'OMARCHY', sub: 'yamz8.github.io/omarchy-themethrough' },
    },
  ]
}

export class Director {
  constructor(camera) {
    this.camera = camera
    this.route = buildRoute()
    this.shots = buildShots()
    this.total = this.shots.reduce((a, s) => a + s.dur, 0)

    this.playing = false
    this.startedAt = 0
    this.shotIndex = -1

    this.onShot = () => {}
    this.onEnd = () => {}
  }

  play() {
    this.playing = true
    this.shotIndex = -1
    // Wall-clock, so a throttled or backgrounded tab can't fall behind.
    this.startedAt = performance.now()
  }

  stop() {
    this.playing = false
  }

  /** Resolve a keyframe, filling in framings that depend on the viewport. */
  point(v) {
    const y = v.y === 'over' ? overheadY(this.camera) : v.y
    return new THREE.Vector3(v.x, y, v.z)
  }

  /** The still we hold on before the film starts and after it ends. */
  poster() {
    const last = this.shots[this.shots.length - 1]
    return { pos: this.point(last.b.p), target: this.point(last.b.t) }
  }

  update() {
    let pos, target

    if (!this.playing) {
      const p = this.poster()
      pos = p.pos
      target = p.target
    } else {
      let time = (performance.now() - this.startedAt) / 1000
      if (time >= this.total) {
        this.playing = false
        this.onEnd()
        const p = this.poster()
        pos = p.pos
        target = p.target
      } else {
        let i = 0
        while (i < this.shots.length - 1 && time > this.shots[i].dur) {
          time -= this.shots[i].dur
          i++
        }
        const shot = this.shots[i]
        if (i !== this.shotIndex) {
          this.shotIndex = i
          this.onShot(shot, i)
        }
        const k = (EASES[shot.ease] ?? linear)(Math.min(time / shot.dur, 1))

        if (shot.drive) {
          const u = THREE.MathUtils.lerp(shot.drive[0], shot.drive[1], k)
          pos = this.route.getPointAt(u)
          target = this.route.getPointAt(Math.min(u + 0.035, 1))
          pos.y = 7.5
          target.y = 1.4
        } else {
          pos = this.point(shot.a.p).lerp(this.point(shot.b.p), k)
          target = this.point(shot.a.t).lerp(this.point(shot.b.t), k)
        }
      }
    }

    this.camera.position.copy(pos)
    // Looking straight down is degenerate with a +y up vector, so tilt the up
    // vector toward -z — but only as the camera actually approaches vertical.
    // Blending it in any earlier rolls the horizon during the low shots.
    const dir = target.clone().sub(pos).normalize()
    const tilt = THREE.MathUtils.smoothstep(Math.abs(dir.y), 0.92, 0.999)
    this.camera.up.set(0, 1 - tilt, -tilt).normalize()
    this.camera.lookAt(target)
  }
}
