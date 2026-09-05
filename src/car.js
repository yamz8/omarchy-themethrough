import * as THREE from 'three'

/**
 * A white Group-B rally coupé, built from primitives — boxed arches, race
 * number, round lamps, rear wing.
 *
 * The livery is drawn to canvas rather than textured from a file: the
 * silhouette and racing dress are the point, and no third-party marks are
 * reproduced.
 */

const BODY_L = 4.3
// Narrower than the track, so the wheels and their flared arches stand proud
// of the flanks — without that the car reads as a slab.
const BODY_W = 1.62
const TRACK = 0.88
const WHEEL_R = 0.36

function liveryTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')

  g.fillStyle = '#f2f1ec'
  g.fillRect(0, 0, 512, 256)

  // Rally stripes sweeping off the rear quarter.
  g.fillStyle = '#c8102e'
  g.beginPath(); g.moveTo(300, 0); g.lineTo(360, 0); g.lineTo(250, 256); g.lineTo(190, 256); g.fill()
  g.fillStyle = '#1b3a93'
  g.beginPath(); g.moveTo(360, 0); g.lineTo(400, 0); g.lineTo(290, 256); g.lineTo(250, 256); g.fill()

  // Door roundel.
  g.fillStyle = '#ffffff'
  g.beginPath(); g.arc(150, 128, 62, 0, Math.PI * 2); g.fill()
  g.lineWidth = 5
  g.strokeStyle = '#16181d'
  g.stroke()
  g.fillStyle = '#16181d'
  g.font = 'bold 96px ui-monospace, monospace'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('1', 150, 132)

  // Suggestion of decals, without borrowing anyone's marks.
  g.fillStyle = 'rgba(22,24,29,0.75)'
  for (const [x, y, w, h] of [[40, 40, 62, 14], [40, 66, 44, 10], [430, 52, 52, 12], [418, 190, 64, 12]]) {
    g.fillRect(x, y, w, h)
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** Soft radial falloff, used for both the headlight pool and the contact shadow. */
function radialTexture(inner, outer) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, inner)
  grad.addColorStop(1, outer)
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

function buildBody() {
  const group = new THREE.Group()

  const paint = new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.45, metalness: 0.1 })
  const livery = new THREE.MeshStandardMaterial({ map: liveryTexture(), roughness: 0.45, metalness: 0.1 })
  const trim = new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.7 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e1219, roughness: 0.12, metalness: 0.6 })

  // One tall hull rather than a hull plus a wide deck: the deck read as a
  // flatbed with a box sitting on it.
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_L, 0.62, BODY_W),
    [paint, paint, paint, paint, livery, livery],
  )
  hull.position.y = 0.62
  group.add(hull)

  // Greenhouse: low, inset only a little, set back over the rear axle.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.44, BODY_W - 0.18), glass)
  cabin.position.set(-0.3, 1.15, 0)
  group.add(cabin)

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, BODY_W - 0.22), paint)
  roof.position.set(-0.34, 1.41, 0)
  group.add(roof)

  // Bumpers.
  for (const x of [BODY_L / 2 - 0.02, -BODY_L / 2 + 0.02]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, BODY_W + 0.12), trim)
    bumper.position.set(x, 0.5, 0)
    group.add(bumper)
  }

  // Dark grille band with the lamps set into it, so they read as part of the
  // nose instead of floating off the front.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, BODY_W - 0.14), trim)
  grille.position.set(BODY_L / 2 + 0.02, 0.82, 0)
  group.add(grille)

  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xfff4d6 })
  for (const z of [0.5, -0.5]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.14, 18), lampGlow)
    l.rotation.z = Math.PI / 2
    l.position.set(BODY_L / 2 + 0.06, 0.82, z)
    group.add(l)
  }

  // Boxed arches over each wheel — the detail that says Group B.
  for (const x of [1.35, -1.35]) {
    for (const z of [TRACK, -TRACK]) {
      const arch = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.34, 0.3), trim)
      arch.position.set(x, 0.74, z)
      group.add(arch)
    }
  }

  // Sills, to sit the car down on the ground rather than float it.
  for (const z of [BODY_W / 2, -BODY_W / 2]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.14, 0.08), trim)
    sill.position.set(0, 0.36, z)
    group.add(sill)
  }

  // Rear wing on its stays.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, BODY_W + 0.02), trim)
  wing.position.set(-BODY_L / 2 + 0.3, 1.42, 0)
  group.add(wing)
  for (const z of [0.58, -0.58]) {
    const stay = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.08), trim)
    stay.position.set(-BODY_L / 2 + 0.3, 1.26, z)
    group.add(stay)
  }

  return group
}

function buildWheel() {
  const group = new THREE.Group()
  const tyre = new THREE.Mesh(
    new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 20),
    new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.9 }),
  )
  tyre.rotation.x = Math.PI / 2
  group.add(tyre)

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(WHEEL_R * 0.58, WHEEL_R * 0.58, 0.32, 10),
    new THREE.MeshStandardMaterial({ color: 0xb9bec7, roughness: 0.35, metalness: 0.6 }),
  )
  hub.rotation.x = Math.PI / 2
  group.add(hub)
  return group
}

export class Car {
  constructor() {
    this.root = new THREE.Group()

    this.chassis = new THREE.Group()
    this.chassis.add(buildBody())
    this.root.add(this.chassis)

    // Front wheels steer, so they sit in their own pivots.
    this.wheels = []
    const spots = [[1.35, TRACK], [1.35, -TRACK], [-1.35, TRACK], [-1.35, -TRACK]]
    spots.forEach(([x, z], i) => {
      const pivot = new THREE.Group()
      pivot.position.set(x, WHEEL_R, z)
      const wheel = buildWheel()
      pivot.add(wheel)
      this.chassis.add(pivot)
      this.wheels.push({ pivot, wheel, front: i < 2 })
    })

    // Headlight pool. The image tiles are unlit, so a real light would not
    // touch them — an additive pool on the ground brightens them instead.
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 7.5),
      new THREE.MeshBasicMaterial({
        map: radialTexture('rgba(255,242,210,0.95)', 'rgba(255,242,210,0)'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    pool.rotation.x = -Math.PI / 2
    pool.position.set(6.4, 0.012, 0)
    this.root.add(pool)

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 3.4),
      new THREE.MeshBasicMaterial({
        map: radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'),
        transparent: true,
        depthWrite: false,
      }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.006
    this.root.add(shadow)
    this.shadow = shadow

    this.reset()
  }

  reset(x = 0, z = 22) {
    this.pos = new THREE.Vector3(x, 0, z)
    this.heading = -Math.PI / 2
    this.speed = 0
    this.steer = 0
    this.spin = 0
    this.roll = 0
    // Dropped in, not placed: it falls and settles.
    this.dropY = 15
    this.dropV = 0
    this.landed = false
    this.dropStart = performance.now()
  }

  get dropping() {
    return !this.landed
  }

  update(dt, input) {
    if (!this.landed) {
      this.dropV -= 34 * dt
      this.dropY += this.dropV * dt
      if (this.dropY <= 0) {
        this.dropY = 0
        // One small bounce, then settle.
        if (this.dropV < -6) this.dropV *= -0.26
        else { this.dropV = 0; this.landed = true }
      }
      // The fall is stepped per frame, which is right for physics but means a
      // throttled tab would leave the car hanging in the air. Bound it by the
      // clock so the drop always finishes.
      if (performance.now() - this.dropStart > 2000) {
        this.dropY = 0
        this.dropV = 0
        this.landed = true
      }
    }

    // Scaled to the world, not to a road: the wordmark is only 81 long, and
    // at a realistic top speed you cross the whole thing in a couple of
    // seconds with no time to look at anything.
    const MAX = 20
    const REV = 7.5

    if (input.throttle > 0) this.speed += 15 * dt
    else if (input.throttle < 0) this.speed -= 17 * dt
    if (input.brake) this.speed *= 1 - Math.min(1, 3.4 * dt)

    // Drag, stronger at speed, plus a dead zone so it comes to rest.
    this.speed -= this.speed * (0.9 + Math.abs(this.speed) * 0.02) * dt
    if (!input.throttle && Math.abs(this.speed) < 0.35) this.speed = 0
    this.speed = THREE.MathUtils.clamp(this.speed, -REV, MAX)

    // Steering falls away as speed rises, and does nothing at a standstill.
    const grip = THREE.MathUtils.clamp(Math.abs(this.speed) / 6, 0, 1)
    const authority = 1 - 0.45 * THREE.MathUtils.clamp(Math.abs(this.speed) / MAX, 0, 1)
    const target = input.steer * 0.55
    this.steer += (target - this.steer) * Math.min(1, 9 * dt)
    this.heading -= this.steer * 2.1 * authority * grip * Math.sign(this.speed || 1) * dt

    this.pos.x += Math.cos(this.heading) * this.speed * dt
    this.pos.z += Math.sin(this.heading) * this.speed * dt

    // A generous soft boundary, so it is hard to get lost out in the dark.
    const BX = 92
    const BZ = 62
    if (Math.abs(this.pos.x) > BX || Math.abs(this.pos.z) > BZ) {
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, -BX, BX)
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, -BZ, BZ)
      this.speed *= 0.86
    }

    // Lean into the corner, and squat under power.
    const targetRoll = -this.steer * 0.12 * grip
    this.roll += (targetRoll - this.roll) * Math.min(1, 6 * dt)

    this.spin += (this.speed / WHEEL_R) * dt
    for (const w of this.wheels) {
      w.wheel.rotation.z = -this.spin
      if (w.front) w.pivot.rotation.y = -this.steer * 0.6
    }

    this.root.position.set(this.pos.x, this.dropY, this.pos.z)
    this.root.rotation.y = -this.heading
    this.chassis.rotation.z = this.roll
    this.chassis.rotation.x = THREE.MathUtils.clamp(-this.speed * 0.0016, -0.05, 0.05)

    // The shadow stays on the ground while the car is still falling.
    this.shadow.position.y = 0.006 - this.dropY
    this.shadow.scale.setScalar(1 + this.dropY * 0.06)
  }

  /** Where a chase camera wants to sit, and where it should look. */
  chase() {
    const back = new THREE.Vector3(-Math.cos(this.heading), 0, -Math.sin(this.heading))
    const lift = 2.9 + Math.abs(this.speed) * 0.03
    const dist = 7.2 + Math.abs(this.speed) * 0.11
    return {
      pos: new THREE.Vector3(
        this.pos.x + back.x * dist,
        this.dropY + lift,
        this.pos.z + back.z * dist,
      ),
      target: new THREE.Vector3(
        this.pos.x - back.x * 5,
        this.dropY + 1.1,
        this.pos.z - back.z * 5,
      ),
    }
  }
}
