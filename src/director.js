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
 * The cuts.
 *
 * Four ways to move the camera over the same word, so they can be compared by
 * watching rather than by arguing. `?cut=<name>` picks one; `takes` is what
 * the film plays by default.
 *
 * What they share: five or six long takes rather than a scatter of short
 * ones, every join at least 30 degrees, and no driving shot allowed to get
 * steep enough to wake the overhead up-vector blend and roll the horizon.
 *
 * What separates them is the vocabulary of the movement itself — straight
 * tracks, orbits, a camera that never leaves the floor, or one that falls
 * from overhead to the pictures instead of rising away from them.
 */
export const CUTS = {
  /**
   * Long takes: straight tracks alongside the word and two runs of the route,
   * at a tempo held between 6.5 and 7.7 px a frame so the cuts land inside one
   * continuous movement. Ends wide, on the whole word.
   */
  takes: () => [
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
    { dur: 9.5, ease: 'linear', drive: [0.68, 0.84] },
    // Pull back: open close enough to read the wallpapers as wallpapers, then
    // rise off them until the whole word lands.
    //
    // This one is allowed to be slow, and cannot help it: a framing that holds
    // all 81 by 19 of the word sits 66 units up, and at that distance nothing
    // moves quickly. Ending calm is the point — the film runs, then resolves.
    {
      dur: 9.5, ease: 'easeInOut', beat: true,
      a: { p: V(-4.9, 11.2, 16.3), t: V(-2, 0, 0) },
      b: { p: V(0, OVER(), 0), t: V(0, 0, 0) },
    },
  ],

  /**
   * Orbit: the camera never travels in a straight line, it swings. Both
   * staged shots are half-turns around a point in the word, tightening and
   * dropping as they go, so the piece reads as one long circling movement
   * interrupted twice by the road.
   *
   * The calmest of the four by some way, and unavoidably so: circling a
   * subject while looking at it holds that subject almost still in frame — you
   * go around the thing, but the thing does not move. Aiming off the orbit
   * centre livens it up until the camera swings past the aim point, which
   * throws a 222 px whip. Stately is the deal.
   */
  orbit: () => [
    { dur: 11.0, ease: 'linear', arc: { c: V(-20, 0, 0), r0: 28, r1: 20, y0: 15, y1: 10, from: 200, to: 380 } },
    { dur: 11.0, ease: 'linear', drive: [0.30, 0.50], beat: true },
    { dur: 9.5, ease: 'linear', arc: { c: V(6, 0, 0), r0: 24, r1: 17, y0: 13, y1: 8, from: 60, to: -110 } },
    { dur: 9.5, ease: 'linear', drive: [0.68, 0.84] },
    // Lift out of the circle and away, until the word lands whole underneath.
    {
      dur: 10.0, ease: 'easeInOut', beat: true,
      a: { p: V(26, 12, 22), t: V(16, 0, 0) },
      b: { p: V(0, OVER(), 0), t: V(0, 0, 0) },
    },
  ],

  /**
   * Ground: the camera never leaves the floor. Six passes at car height, the
   * word only ever glimpsed a few letters at a time, and the single rise held
   * back to the last shot — so the reveal at the end is the first time anyone
   * sees what the thing actually spells. The busiest of the four.
   *
   * The two route windows are deliberately far apart. Adjacent ones point the
   * camera the same way and the cut between them collapsed to 15 degrees.
   */
  ground: () => [
    {
      dur: 9.0, ease: 'linear',
      a: { p: V(-44, 6, 10), t: V(-36, 0, -3) },
      b: { p: V(-8, 6, 10), t: V(0, 0, -3) },
    },
    { dur: 10.5, ease: 'linear', drive: [0.28, 0.46], beat: true },
    {
      dur: 8.0, ease: 'linear',
      a: { p: V(22, 7, -12), t: V(14, 0, 2) },
      b: { p: V(-14, 7, -12), t: V(-22, 0, 2) },
    },
    { dur: 10.0, ease: 'linear', drive: [0.62, 0.80] },
    {
      dur: 6.0, ease: 'linear',
      a: { p: V(34, 6.5, 9), t: V(26, 0, -4) },
      b: { p: V(8, 6.5, 9), t: V(0, 0, -4) },
    },
    // The only time the camera ever climbs.
    {
      dur: 7.5, ease: 'easeInOut', beat: true,
      a: { p: V(-6, 9, 15), t: V(-2, 0, 0) },
      b: { p: V(0, OVER(), 0), t: V(0, 0, 0) },
    },
  ],

  /**
   * Descend: the mirror image of `takes`. It opens on the whole word from
   * overhead and works downward the whole way, finishing close enough to read
   * a single wallpaper. Says what the thing is in the first second and spends
   * the rest earning the detail, rather than withholding the shape until the
   * end.
   *
   * Its two high shots are the slowest in any of the cuts and cannot be
   * otherwise — the framing that holds the whole word is 66 units up, and
   * nothing moves quickly from there. That is the cost of opening on the
   * answer.
   */
  descend: () => [
    // Overhead, already whole, traversing and sinking.
    {
      dur: 9.5, ease: 'linear',
      a: { p: V(-32, OVER(1.05), 14), t: V(-26, 0, 0) },
      b: { p: V(32, OVER(0.82), 8), t: V(26, 0, 0) },
    },
    // Down into a raked swing across the middle.
    { dur: 10.0, ease: 'linear', arc: { c: V(0, 0, 0), r0: 34, r1: 20, y0: 26, y1: 12, from: 250, to: 340 } },
    { dur: 10.5, ease: 'linear', drive: [0.30, 0.50], beat: true },
    { dur: 10.0, ease: 'linear', drive: [0.68, 0.84] },
    // Ends on the pictures rather than on the name.
    {
      dur: 11.0, ease: 'easeOut', beat: true,
      a: { p: V(-40, 13, 24), t: V(-30, 0, 0) },
      b: { p: V(-4.9, 11.2, 16.3), t: V(-2, 0, 0) },
    },
  ],
}

/** The cut the film plays unless `?cut=` asks for another. */
export const DEFAULT_CUT = 'takes'

export function buildShots(name = DEFAULT_CUT) {
  return (CUTS[name] ?? CUTS[DEFAULT_CUT])()
}

export class Director {
  constructor(camera, cut) {
    this.camera = camera
    this.route = buildRoute()
    this.shots = buildShots(cut)
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

  /** One height, which may be a viewport-dependent `over:` framing. */
  resolve(y) {
    return typeof y === 'string' ? overheadY(this.camera) * Number(y.split(':')[1]) : y
  }

  /** Blend two heights, either of which may be an `over:` framing. */
  height(y0, k, y1) {
    return THREE.MathUtils.lerp(this.resolve(y0), this.resolve(y1 ?? y0), k)
  }

  /** Resolve a keyframe, filling in framings that depend on the viewport. */
  point(v) {
    const y = this.resolve(v.y)
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

    return pos ? this.holdLead(acc, pos, u) : acc
  }

  /**
   * Push an aim point out to the minimum lead, in place.
   *
   * Applied to the damped aim as well as to the target it chases, because
   * damping can leave the aim well inside a target that is itself legal — the
   * clamp only bounds where the aim is heading, not where it currently is. A
   * route window that folds harder than the two the film uses will otherwise
   * still roll, which is a guarantee that holds by luck rather than by
   * construction.
   */
  holdLead(aim, pos, u) {
    let dx = aim.x - pos.x
    let dz = aim.z - pos.z
    let horiz = Math.hypot(dx, dz)
    if (horiz >= AIM_LEAD) return aim
    // Straight down the road if the fold left no usable bearing at all.
    if (horiz < 1e-3) {
      const t = this.route.getTangentAt(Math.min(u + 0.01, 1))
      dx = t.x
      dz = t.z
      horiz = Math.hypot(dx, dz) || 1
    }
    aim.x = pos.x + (dx / horiz) * AIM_LEAD
    aim.z = pos.z + (dz / horiz) * AIM_LEAD
    return aim
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
            this.holdLead(this.aim, pos, u)
          }
          target = this.aim
        } else if (shot.arc) {
          // Swing around a point instead of crossing between two framings.
          // Lerping a camera between two places on a circle draws the chord,
          // not the arc, so a sweep of any width cuts through the middle of
          // the thing it is meant to be going around. Interpolating the angle
          // is the only way to actually orbit.
          this.aimLive = false
          const { c, r0, r1, y0, y1, from, to, t: at } = shot.arc
          const angle = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(from, to, k))
          const radius = THREE.MathUtils.lerp(r0, r1 ?? r0, k)
          const height = this.height(y0, k, y1)
          pos = new THREE.Vector3(
            c.x + radius * Math.cos(angle),
            height,
            c.z + radius * Math.sin(angle),
          )
          target = at ? this.point(at) : c.clone()
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
