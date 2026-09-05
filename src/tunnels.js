import * as THREE from 'three'

/**
 * One tunnel per theme, radiating out from the wordmark.
 *
 * The walls and ceiling are clad in that theme's backgrounds. Each tunnel ends
 * at the rim of the ground — a cliff — and beyond the drop the whole theme
 * hangs in the void facing back down the tunnel, so arriving at the edge is
 * the reveal.
 */

export const INNER = 46      // tunnel mouths, clear of the wordmark
export const OUTER = 76      // the cliff
export const RIM = 78        // where the ground itself ends
const WIDTH = 10
// Height matches the panel pitch so each wall image stays square — the
// backgrounds are 1:1 and stretching them to fit a taller wall was obvious.
const SEGMENTS = 5
const HEIGHT = (OUTER - INNER) / SEGMENTS
const HALF = WIDTH / 2

const QUAD = new THREE.PlaneGeometry(1, 1)

function materialFor(cache, tex) {
  if (!cache.has(tex)) {
    cache.set(tex, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.FrontSide }))
  }
  return cache.get(tex)
}

function panel(material, w, h, pos, rotY) {
  const m = new THREE.Mesh(QUAD, material)
  m.scale.set(w, h, 1)
  m.position.copy(pos)
  m.rotation.y = rotY
  return m
}

/**
 * Build every tunnel. Returns the group plus the constraint the car drives
 * against, so the corridors are walls rather than decoration.
 */
export function buildTunnels(themes, texturesByTheme) {
  const group = new THREE.Group()
  const cache = new Map()
  const V = new THREE.Vector3()

  themes.forEach((theme, index) => {
    const textures = (texturesByTheme.get(theme.name) ?? []).filter(Boolean)
    if (!textures.length) return

    const angle = (index / themes.length) * Math.PI * 2
    const tunnel = new THREE.Group()
    // Local +x runs outward along this theme's bearing.
    tunnel.rotation.y = -angle
    group.add(tunnel)

    const length = OUTER - INNER
    const seg = length / SEGMENTS
    const accent = new THREE.Color(theme.accent)

    for (let i = 0; i < SEGMENTS; i++) {
      const x = INNER + seg * (i + 0.5)
      const tex = textures[i % textures.length]
      const mat = materialFor(cache, tex)

      // Walls face inward, so the images are what you drive between.
      tunnel.add(panel(mat, seg, HEIGHT, V.set(x, HEIGHT / 2, -HALF), 0))
      tunnel.add(panel(mat, seg, HEIGHT, V.set(x, HEIGHT / 2, HALF), Math.PI))

      // Ceiling, laid face-down.
      const roof = new THREE.Mesh(QUAD, materialFor(cache, textures[(i + 1) % textures.length]))
      roof.scale.set(seg, WIDTH, 1)
      roof.position.set(x, HEIGHT, 0)
      roof.rotation.x = Math.PI / 2
      tunnel.add(roof)
    }

    // A strip of the theme's accent underfoot, so each corridor is keyed to it.
    const road = new THREE.Mesh(
      QUAD,
      new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(0.34), toneMapped: false }),
    )
    road.scale.set(length, WIDTH, 1)
    road.position.set(INNER + length / 2, 0.014, 0)
    road.rotation.x = -Math.PI / 2
    tunnel.add(road)

    // Beyond the cliff: the whole theme, hanging in the dark on an arc facing
    // back down the tunnel. Kept low and fanned, so it is already framed by the
    // mouth on the approach rather than hidden above the ceiling.
    const n = textures.length
    const radius = OUTER + 13
    const size = 7
    const pitch = 0.105
    textures.forEach((tex, j) => {
      const phi = (j - (n - 1) / 2) * pitch
      const y = 4.2 + (j % 2 ? 2.4 : 0)
      const mesh = new THREE.Mesh(QUAD, materialFor(cache, tex))
      mesh.scale.set(size, size, 1)
      mesh.position.set(Math.cos(phi) * radius, y, Math.sin(phi) * radius)
      // Turn each panel to face the tunnel it belongs to.
      mesh.rotation.y = -(Math.PI / 2 + phi)
      tunnel.add(mesh)
    })
  })

  return { group, constrain: makeConstraint(themes.length) }
}

/**
 * Keep the car in the corridors.
 *
 * Inside the mouths it roams free. Past them it can only continue where a
 * tunnel actually is — everywhere else the ring of wall stops it — and it is
 * held just short of the cliff rather than driven off it.
 */
function makeConstraint(count) {
  const step = (Math.PI * 2) / count
  const clearance = HALF - 1.3
  const stop = OUTER + 1

  return (pos) => {
    const r = Math.hypot(pos.x, pos.z)
    if (r < INNER) return

    const a = Math.atan2(pos.z, pos.x)
    const centre = Math.round(a / step) * step
    // Signed angular offset from the nearest tunnel's centre line.
    const off = Math.atan2(Math.sin(a - centre), Math.cos(a - centre))
    const lateral = off * r

    let nr = Math.min(r, stop)
    let nlat = lateral

    if (Math.abs(lateral) > clearance) {
      // Not lined up with a mouth: the wall between tunnels holds it back.
      nr = INNER
    } else {
      nlat = THREE.MathUtils.clamp(lateral, -clearance, clearance)
    }

    const na = centre + nlat / Math.max(nr, 1e-3)
    pos.x = Math.cos(na) * nr
    pos.z = Math.sin(na) * nr
  }
}
