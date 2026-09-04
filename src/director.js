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

/**
 * Round the hand-placed corners out of a path.
 *
 * The strokes are written like handwriting, so they contain near-reversals —
 * the bowl of an R doubling back to its stem, the zigzag of an M. Run straight
 * through a spline those become corners the camera snaps around. Resampling
 * and box-blurring the points bounds the curvature instead, at the cost of a
 * little fidelity to the letterform.
 */
function smoothPath(curve, samples = 600, radius = 7, passes = 2) {
  let pts = []
  for (let i = 0; i <= samples; i++) pts.push(curve.getPointAt(i / samples))

  for (let p = 0; p < passes; p++) {
    const out = []
    for (let i = 0; i < pts.length; i++) {
      const acc = new THREE.Vector3()
      let n = 0
      for (let k = -radius; k <= radius; k++) {
        const j = i + k
        if (j < 0 || j >= pts.length) continue
        acc.add(pts[j])
        n++
      }
      out.push(acc.divideScalar(n))
    }
    // Pin the ends so smoothing doesn't shorten the run in or out.
    out[0] = pts[0]
    out[out.length - 1] = pts[pts.length - 1]
    pts = out
  }

  // Centripetal parameterisation: no cusps or overshoot between samples.
  const smoothed = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  // The default 200-step arc-length table makes speed stutter on a path this
  // wiggly; a finer table keeps the drive at an even pace.
  smoothed.arcLengthDivisions = 4000
  smoothed.updateArcLengths()
  return smoothed
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
  return smoothPath(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35))
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
    },
    // The drive: the route as written, through the middle of the word.
    { dur: 9.5, ease: 'linear', drive: [0.31, 0.47] },
    // Break out: rise off the surface and let the whole shape land.
    {
      dur: 5.5, ease: 'easeInOut',
      a: { p: V(L.R, 7, 16), t: V(L.R + 6, 0.5, 2) },
      b: { p: V(0, 'over', 0), t: V(0, 0, 0) },
    },
    // Overhead, drifting slowly across the word.
    {
      dur: 5.5, ease: 'linear',
      a: { p: V(-13, 'over', 0), t: V(-13, 0, 0) },
      b: { p: V(13, 'over', 0), t: V(13, 0, 0) },
    },
    // Low again, over the brightest stretch of the word.
    { dur: 7.5, ease: 'linear', drive: [0.73, 0.86] },
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

    // Smoothed aim for the driving shots, and the frame clock that drives it.
    this.aim = new THREE.Vector3()
    this.aimLive = false
    this.lastFrame = 0

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

  /**
   * Where a driving shot looks: the average of several points up the road
   * rather than a single one. A lone look-ahead point sitting on the same
   * curve swings hard through every bend, which is what made the drive snap.
   */
  aimAhead(u) {
    const acc = new THREE.Vector3()
    const offsets = [0.020, 0.035, 0.052, 0.072, 0.095]
    for (const d of offsets) acc.add(this.route.getPointAt(Math.min(u + d, 1)))
    return acc.divideScalar(offsets.length)
  }

  /** The still we hold on before the film starts and after it ends. */
  poster() {
    const last = this.shots[this.shots.length - 1]
    return { pos: this.point(last.b.p), target: this.point(last.b.t) }
  }

  update() {
    const now = performance.now()
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.1) : 1 / 60
    this.lastFrame = now

    let pos, target
    let cut = false

    if (!this.playing) {
      const p = this.poster()
      pos = p.pos
      target = p.target
    } else {
      let time = (now - this.startedAt) / 1000
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
          cut = true
        }
        const k = (EASES[shot.ease] ?? linear)(Math.min(time / shot.dur, 1))

        if (shot.drive) {
          const u = THREE.MathUtils.lerp(shot.drive[0], shot.drive[1], k)
          pos = this.route.getPointAt(u)
          pos.y = 8.5

          const desired = this.aimAhead(u)
          desired.y = 1.2
          if (!this.aimLive || cut) {
            // Snap on a cut: the join should be an edit, not a swing.
            this.aim.copy(desired)
            this.aimLive = true
          } else {
            // Frame-rate independent damping, so the aim eases through bends
            // at the same rate whatever the frame rate.
            this.aim.lerp(desired, 1 - Math.exp(-3.2 * dt))
          }
          target = this.aim
        } else {
          this.aimLive = false
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
    const tilt = THREE.MathUtils.smoothstep(Math.abs(dir.y), 0.75, 0.998)
    this.camera.up.set(0, 1 - tilt, -tilt).normalize()
    this.camera.lookAt(target)
  }
}
