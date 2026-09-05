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

/** Camera and aim heights for the driving shots. */
const DRIVE_Y = 8.5
const AIM_Y = 1.2

/**
 * Where the up-vector starts leaning toward the overhead orientation, and
 * where it has fully arrived. Below the first number the camera keeps a plain
 * +y up and cannot roll.
 */
const TILT_FROM = 0.75
const TILT_TO = 0.998

/**
 * Closest the driving aim may sit ahead of the camera. Derived rather than
 * picked: an aim at least this far out keeps the view shallower than
 * TILT_FROM, so a drive can never wake the overhead up-vector blend and roll
 * the picture. The margin covers the damped aim lagging inside its target
 * while the route folds back.
 */
const AIM_LEAD = 1.15 * (DRIVE_Y - AIM_Y) * Math.sqrt(1 / (TILT_FROM * TILT_FROM) - 1)

/**
 * Framing height for the overhead shots: `OVER()` fits the whole word in,
 * `OVER(k)` a fraction of that height, so two overhead framings can differ by
 * shot size rather than only by position.
 */
const OVER = (k = 1) => `over:${k}`

/**
 * The cut.
 *
 * Five long takes rather than eight short ones. The eight-shot version spent
 * five of its shots barely moving — the image crawled at 0.2 to 2.7 px a
 * frame in them against 8+ in the two driving shots, a fortyfold swing in
 * tempo — so the film kept starting and stopping instead of running. These
 * four opening shots sit between 7.1 and 8.5, close enough that the cuts land
 * inside one continuous movement.
 *
 * What makes a shot feel like it moves is sideways travel, not speed. A
 * camera flying straight ahead barely disturbs the middle of frame however
 * fast it goes, which is why the old approach shots read as static; the
 * driving shots felt quick because the route curves and sweeps the picture
 * across. So the staged shots here track along the word rather than into it.
 *
 * `drive` shots ride the written route at car height; the rest are staged
 * moves. Every join changes the view by at least 30 degrees.
 */
export function buildShots() {
  return [
    // Track in: a low run along the word, looking across and slightly ahead.
    // Sideways rather than head-on, so the pictures sweep the frame instead of
    // creeping out of the vanishing point — a camera flying straight forward
    // barely disturbs the middle of frame however fast it goes. It opens
    // already on pictures: aimed the other way it spent its first two seconds
    // on bare floor, which is the worst possible thing to autoplay.
    {
      dur: 10.5, ease: 'linear',
      a: { p: V(-46, 6.5, 11), t: V(-38, 0, -3) },
      b: { p: V(14, 6.5, 11), t: V(22, 0, -3) },
    },
    // The drive: the route as written, through the middle of the word, and
    // the longest take in the film.
    { dur: 12.0, ease: 'linear', drive: [0.30, 0.50], beat: true },
    // Cross: up off the surface but nowhere near overhead, tracking the whole
    // length the other way. The one shot that shows how far the word runs.
    {
      dur: 9.5, ease: 'linear',
      a: { p: V(-30, 11, 12), t: V(-37, 0, 0) },
      b: { p: V(30, 11, 12), t: V(23, 0, 0) },
    },
    // Low again, matched to the first drive. The window stops at 0.84 rather
    // than running to the end of the route: the themes out at the Y are the
    // monochrome ones, so the old range spent its last seconds in the grey.
    // Ending on the most saturated stretch keeps the colour up to the cut.
    { dur: 9.5, ease: 'linear', drive: [0.68, 0.84] },
    // Pull back: open close enough to read the wallpapers as wallpapers, then
    // rise off them until the whole word lands. The hero and the sign-off as
    // one reveal instead of two shots that each hold still.
    //
    // This one is allowed to be slow, and cannot help it: a framing that holds
    // all 81 by 19 of the word sits 66 units up, and at that distance nothing
    // moves quickly. Ending calm is the point — the film runs, then resolves.
    {
      dur: 9.5, ease: 'easeInOut', beat: true,
      a: { p: V(-4.9, 11.2, 16.3), t: V(-2, 0, 0) },
      b: { p: V(0, OVER(), 0), t: V(0, 0, 0) },
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
    const y = typeof v.y === 'string' ? overheadY(this.camera) * Number(v.y.split(':')[1]) : v.y
    return new THREE.Vector3(v.x, y, v.z)
  }

  /**
   * Where a driving shot looks: the average of several points up the road
   * rather than a single one. A lone look-ahead point sitting on the same
   * curve swings hard through every bend, which is what made the drive snap.
   *
   * The average alone is not enough, because the route is handwriting and
   * doubles back on itself — the bowl of the R returning to its stem, the
   * zigzag of the M. Through those the look-ahead points fold back toward the
   * camera and the average lands a few units in front of it. Aiming there is
   * steep as well as unstable: the camera rides at DRIVE_Y and the aim sits at
   * AIM_Y, so an aim four units ahead looks down at nearly 60 degrees, which is
   * enough to wake the up-vector blend meant for the overhead shots and roll
   * the picture. Holding the aim out at arm's length keeps the view shallow,
   * and is what a driver does anyway — you look through a turn, not at your
   * own bumper.
   */
  aimAhead(u, pos) {
    const acc = new THREE.Vector3()
    const offsets = [0.020, 0.035, 0.052, 0.072, 0.095]
    for (const d of offsets) acc.add(this.route.getPointAt(Math.min(u + d, 1)))
    acc.divideScalar(offsets.length)

    if (!pos) return acc
    let dx = acc.x - pos.x
    let dz = acc.z - pos.z
    let horiz = Math.hypot(dx, dz)
    if (horiz < AIM_LEAD) {
      // Straight down the road if the fold left no usable bearing at all.
      if (horiz < 1e-3) {
        const t = this.route.getTangentAt(Math.min(u + 0.01, 1))
        dx = t.x
        dz = t.z
        horiz = Math.hypot(dx, dz) || 1
      }
      acc.x = pos.x + (dx / horiz) * AIM_LEAD
      acc.z = pos.z + (dz / horiz) * AIM_LEAD
    }
    return acc
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
          this.onShot(shot, i)
        }
        const k = (EASES[shot.ease] ?? linear)(Math.min(time / shot.dur, 1))

        if (shot.drive) {
          const u = THREE.MathUtils.lerp(shot.drive[0], shot.drive[1], k)
          pos = this.route.getPointAt(u)
          pos.y = DRIVE_Y

          const desired = this.aimAhead(u, pos)
          desired.y = AIM_Y
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
    const tilt = THREE.MathUtils.smoothstep(Math.abs(dir.y), TILT_FROM, TILT_TO)
    this.camera.up.set(0, 1 - tilt, -tilt).normalize()
    this.camera.lookAt(target)
  }
}
