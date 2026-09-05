import * as THREE from 'three'

/**
 * One long cave per theme, radiating out through a ring of mountains.
 *
 * The car begins in the open basin. Every opening is a rocky portal into a
 * different theme: its own proportions, wallpaper weave, accent light and
 * interior motif. The road now ends in a closed gallery chamber rather than at
 * a cliff.
 */

export const INNER = 48      // cave mouths, just beyond the wordmark
export const OUTER = 132     // back wall of each theme chamber
export const RIM = 139       // hidden safely behind the chamber walls

// Put one opening directly ahead of the car's starting line. With an even
// number of caves, an unshifted ring points the car exactly at a rock divider.
const CAVE_OFFSET = -Math.PI / 2
const BASE_RADIUS = 5.35
const BASE_LENGTH_SEGS = 28
const BASE_ARC_SEGS = 9

const QUAD = new THREE.PlaneGeometry(1, 1)
const BOULDER = new THREE.DodecahedronGeometry(1, 0)
const ORB = new THREE.IcosahedronGeometry(1, 1)
const SPIRE = new THREE.ConeGeometry(1, 1, 5)
const COLUMN = new THREE.BoxGeometry(1, 1, 1)

const EXPERIENCES = {
  catppuccin: ['orbs', 'lavender orbit'],
  'catppuccin-latte': ['ribs', 'porcelain daylight'],
  ethereal: ['orbs', 'cosmic drift'],
  everforest: ['spires', 'moss cathedral'],
  'flexoki-light': ['ribs', 'paper sun'],
  gruvbox: ['columns', 'weathered arcade'],
  hackerman: ['ribs', 'neon mainframe'],
  kanagawa: ['beacons', 'lantern passage'],
  'last-horizon': ['orbs', 'ember horizon'],
  lumon: ['columns', 'severed corridor'],
  lupine: ['orbs', 'blossom current'],
  'matte-black': ['ribs', 'ember fissure'],
  miasma: ['spires', 'poison garden'],
  nord: ['spires', 'ice vault'],
  'osaka-jade': ['columns', 'jade sanctuary'],
  'retro-82': ['ribs', 'synth portal'],
  ristretto: ['beacons', 'coffee glow'],
  'rose-pine': ['orbs', 'rose observatory'],
  solitude: ['columns', 'silent monoliths'],
  'tokyo-night': ['beacons', 'midnight express'],
  vantablack: ['ribs', 'lightless pulse'],
  white: ['ribs', 'white aperture'],
}

function hashName(name) {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Stable variations make every cave distinct without storing scene data. */
function experienceFor(theme, index) {
  const h = hashName(theme.name)
  const [motif, label] = EXPERIENCES[theme.name] ?? ['ribs', 'unknown passage']
  return {
    index,
    motif,
    label,
    radius: BASE_RADIUS + ((h >>> 2) % 7 - 3) * 0.11,
    arcSegs: BASE_ARC_SEGS + ((h >>> 7) % 3 - 1),
    lengthSegs: BASE_LENGTH_SEGS + ((h >>> 11) % 7 - 3),
    breathe: 0.025 + ((h >>> 15) % 5) * 0.008,
    waves: 1 + ((h >>> 19) % 3),
    phase: ((h % 997) / 997) * Math.PI * 2,
    weave: 1 + ((h >>> 23) % 3),
    density: 8 + ((h >>> 26) % 7),
    hash: h,
  }
}

function materialFor(cache, tex, side = THREE.FrontSide) {
  const key = `${tex.uuid}:${side}`
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side }))
  }
  return cache.get(key)
}

function radiusAt(style, t) {
  return style.radius * (1 + style.breathe * Math.sin(style.phase + t * Math.PI * 2 * style.waves))
}

function archPoint(phi, radius) {
  return [Math.sin(phi) * radius, Math.cos(phi) * radius]
}

function addInwardQuad(pos, uv, p00, p10, p11, p01) {
  pos.push(...p00, ...p11, ...p10, ...p00, ...p01, ...p11)
  if (uv) uv.push(0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1)
}

/** Merge the hundreds of wallpaper facets into one mesh per background. */
function buildBore(textures, cache, style) {
  const meshes = []
  const seg = (OUTER - INNER) / style.lengthSegs
  const dphi = Math.PI / style.arcSegs
  const buckets = textures.map(() => ({ pos: [], uv: [] }))

  for (let i = 0; i < style.lengthSegs; i++) {
    const t0 = i / style.lengthSegs
    const t1 = (i + 1) / style.lengthSegs
    const x0 = INNER + i * seg
    const x1 = x0 + seg
    const r0 = radiusAt(style, t0)
    const r1 = radiusAt(style, t1)

    for (let j = 0; j < style.arcSegs; j++) {
      const [y00, z00] = archPoint(j * dphi, r0)
      const [y01, z01] = archPoint((j + 1) * dphi, r0)
      const [y10, z10] = archPoint(j * dphi, r1)
      const [y11, z11] = archPoint((j + 1) * dphi, r1)
      const bucket = buckets[(i * style.weave + j + style.index) % buckets.length]

      addInwardQuad(
        bucket.pos,
        bucket.uv,
        [x0, y00, z00],
        [x1, y10, z10],
        [x1, y11, z11],
        [x0, y01, z01],
      )
    }
  }

  buckets.forEach((bucket, i) => {
    if (!bucket.pos.length) return
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.pos, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2))
    meshes.push(new THREE.Mesh(geometry, materialFor(cache, textures[i])))
  })
  return meshes
}

function accentMaterial(theme, opacity = 0.72) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(theme.accent),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
}

function buildRibs(theme, style, start = INNER + 5, end = OUTER - 11) {
  const pos = []
  const count = Math.max(1, style.density - 1)
  const width = count === 1 ? 0.32 : 0.16

  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1)
    const x0 = THREE.MathUtils.lerp(start, end, t)
    const x1 = x0 + width
    const radius = radiusAt(style, t) * 0.982
    for (let j = 0; j < style.arcSegs; j++) {
      const [y0, z0] = archPoint((j / style.arcSegs) * Math.PI, radius)
      const [y1, z1] = archPoint(((j + 1) / style.arcSegs) * Math.PI, radius)
      addInwardQuad(pos, null, [x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1])
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return new THREE.Mesh(geometry, accentMaterial(theme, theme.name === 'hackerman' ? 0.88 : 0.54))
}

function buildInstancedMotif(theme, style) {
  const count = style.density
  const material = accentMaterial(theme, style.motif === 'beacons' ? 0.9 : 0.68)
  const geometry = style.motif === 'spires' ? SPIRE : style.motif === 'columns' ? COLUMN : ORB
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)

  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1)
    const side = i % 2 ? 1 : -1
    const radius = radiusAt(style, t)
    const wobble = Math.sin(style.phase + i * 1.73)
    const x = THREE.MathUtils.lerp(INNER + 8, OUTER - 14, t)

    if (style.motif === 'spires') {
      const height = 1.2 + (0.5 + 0.5 * wobble) * 2.2
      position.set(x, height / 2, side * (radius - 0.7))
      scale.set(0.28 + (i % 3) * 0.09, height, 0.28 + (i % 2) * 0.12)
    } else if (style.motif === 'columns') {
      const height = radius * (0.46 + (i % 3) * 0.09)
      position.set(x, height / 2, side * (radius - 0.48))
      scale.set(0.18 + (i % 2) * 0.1, height, 0.26)
    } else {
      const phi = 0.2 * Math.PI + ((i * 0.37 + style.phase) % 1) * Math.PI * 0.6
      const inset = radius - (style.motif === 'beacons' ? 0.62 : 0.42)
      const [y, z] = archPoint(phi, inset)
      position.set(x, y, z)
      const size = style.motif === 'beacons' ? 0.2 + (i % 3) * 0.08 : 0.14 + (i % 4) * 0.055
      scale.setScalar(size)
    }

    rotation.setFromAxisAngle(up, wobble * 0.7)
    matrix.compose(position, rotation, scale)
    mesh.setMatrixAt(i, matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

/** A jagged stone portal and low-poly peaks turn the central disc into a basin. */
function buildMountain(theme, style, caveCount) {
  const group = new THREE.Group()
  const accent = new THREE.Color(theme.accent)
  // Keep the basin one coherent mountain range. Theme colour belongs mainly
  // to the illuminated mouth and cave interior, not the whole rock face.
  const rockColor = new THREE.Color(0x252a34).lerp(accent, theme.mode === 'light' ? 0.13 : 0.09)
  rockColor.offsetHSL(0, -0.08, ((style.hash >>> 9) % 5 - 2) * 0.012)

  const material = new THREE.MeshStandardMaterial({
    color: rockColor,
    roughness: 1,
    metalness: theme.name === 'lumon' ? 0.24 : 0.03,
    flatShading: true,
    side: THREE.DoubleSide,
  })

  const pos = []
  const segments = style.arcSegs + 5
  for (let j = 0; j < segments; j++) {
    const p0 = (j / segments) * Math.PI
    const p1 = ((j + 1) / segments) * Math.PI
    const inner0 = archPoint(p0, style.radius * 1.015)
    const inner1 = archPoint(p1, style.radius * 1.015)
    const noise0 = 1.35 + 0.34 * Math.sin(style.phase + j * 2.13)
    const noise1 = 1.35 + 0.34 * Math.sin(style.phase + (j + 1) * 2.13)
    const outer0 = archPoint(p0, style.radius + noise0)
    const outer1 = archPoint(p1, style.radius + noise1)
    const x0 = INNER - 0.35
    const xo0 = INNER + 1.1 + 0.5 * Math.sin(style.phase + j)
    const xo1 = INNER + 1.1 + 0.5 * Math.sin(style.phase + j + 1)

    pos.push(
      x0, inner0[0], inner0[1], xo1, outer1[0], outer1[1], xo0, outer0[0], outer0[1],
      x0, inner0[0], inner0[1], x0, inner1[0], inner1[1], xo1, outer1[0], outer1[1],
    )
  }

  // Continue the portal frame into a tall mountain sector. Adjacent sectors
  // meet at their angular midpoints, creating one unbroken massif around the
  // basin while the semicircular hole itself remains completely open.
  const halfSpan = Math.tan(Math.PI / caveCount) * (INNER + 1.8)
  const shoulderRadius = style.radius + 1.18
  const ridge = []
  const middle = []
  const shoulder = []
  for (let j = 0; j <= segments; j++) {
    const u = j / segments
    const phi = u * Math.PI
    const [y, z] = archPoint(phi, shoulderRadius)
    const ridgeY = 30 +
      4.2 * Math.sin(style.phase + u * Math.PI * 2.1) +
      2.2 * Math.sin(style.phase * 0.63 + u * Math.PI * 5.2)
    const ridgeZ = THREE.MathUtils.lerp(halfSpan, -halfSpan, u)
    shoulder.push([INNER + 0.72, y, z])
    middle.push([
      INNER + 4.8 + 1.4 * Math.sin(style.phase * 0.8 + u * Math.PI * 4.2),
      THREE.MathUtils.lerp(y, ridgeY, 0.46) + 1.7 * Math.sin(style.phase + u * Math.PI * 6),
      THREE.MathUtils.lerp(z, ridgeZ, 0.58),
    ])
    ridge.push([
      INNER + 12.5 + 2.1 * Math.sin(style.phase + u * Math.PI * 3),
      ridgeY,
      ridgeZ,
    ])
  }

  for (let j = 0; j < segments; j++) {
    pos.push(
      ...shoulder[j], ...middle[j + 1], ...middle[j],
      ...shoulder[j], ...shoulder[j + 1], ...middle[j + 1],
      ...middle[j], ...ridge[j + 1], ...ridge[j],
      ...middle[j], ...middle[j + 1], ...ridge[j + 1],
    )
  }

  const positiveGround = [INNER + 0.72, 0, halfSpan]
  const negativeGround = [INNER + 0.72, 0, -halfSpan]
  pos.push(
    ...shoulder[0], ...positiveGround, ...middle[0],
    ...positiveGround, ...ridge[0], ...middle[0],
    ...shoulder[segments], ...middle[segments], ...negativeGround,
    ...negativeGround, ...middle[segments], ...ridge[segments],
  )

  const portalGeometry = new THREE.BufferGeometry()
  portalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  portalGeometry.computeVertexNormals()
  group.add(new THREE.Mesh(portalGeometry, material))

  // A restrained accent rim makes the opening legible from the basin and
  // carries the eye onto the coloured approach strip.
  const portalStyle = { ...style, density: 2 }
  group.add(buildRibs(theme, portalStyle, INNER - 0.48, INNER - 0.12))

  // Faceted boulders interrupt the broad slope so the filled upper area reads
  // as layered rock, not a flat scenic wall. They begin above the crown and
  // never intrude into the driveable opening.
  const boulderCount = 9
  const boulders = new THREE.InstancedMesh(BOULDER, material, boulderCount)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const axis = new THREE.Vector3(0.3, 1, 0.2).normalize()
  for (let i = 0; i < boulderCount; i++) {
    const row = Math.floor(i / 3)
    const col = i % 3 - 1
    const wobble = Math.sin(style.phase + i * 1.91)
    position.set(
      INNER + 1.9 + row * 2.8 + wobble * 0.45,
      style.radius + 2.7 + row * 4.25 + Math.abs(col) * 0.7,
      col * halfSpan * 0.54 + wobble * 0.38,
    )
    rotation.setFromAxisAngle(axis, style.phase + i * 0.83)
    scale.set(
      2.25 + (i % 2) * 0.65,
      1.65 + ((i + 1) % 3) * 0.48,
      2.05 + (i % 3) * 0.36,
    )
    matrix.compose(position, rotation, scale)
    boulders.setMatrixAt(i, matrix)
  }
  boulders.instanceMatrix.needsUpdate = true
  group.add(boulders)
  return group
}

/** Close the cave with a wallpaper gallery rather than an exposed drop. */
function buildChamber(theme, textures, cache, style) {
  const group = new THREE.Group()
  const radius = radiusAt(style, 1) * 1.04
  const wallColor = new THREE.Color(theme.bg).lerp(new THREE.Color(theme.accent), 0.1)
  if (theme.mode === 'light') wallColor.multiplyScalar(0.72)

  const wall = new THREE.Mesh(
    new THREE.CircleGeometry(radius, style.arcSegs * 2, 0, Math.PI),
    new THREE.MeshBasicMaterial({ color: wallColor, side: THREE.FrontSide, toneMapped: false }),
  )
  wall.rotation.y = -Math.PI / 2
  wall.position.set(OUTER - 1, 0, 0)
  group.add(wall)

  const n = textures.length
  const cols = Math.min(4, Math.ceil(Math.sqrt(n * 1.7)))
  const rows = Math.ceil(n / cols)
  const size = Math.min(5.2, (radius * 1.72) / cols, (radius - 1) / rows)
  const gap = size * 1.045
  const totalHeight = rows * gap

  textures.forEach((tex, i) => {
    const row = Math.floor(i / cols)
    const col = i % cols
    const inRow = Math.min(cols, n - row * cols)
    const mesh = new THREE.Mesh(QUAD, materialFor(cache, tex))
    mesh.scale.set(size, size, 1)
    mesh.position.set(
      OUTER - 1.06,
      0.55 + (row + 0.5) * totalHeight / rows,
      (col - (inRow - 1) / 2) * gap,
    )
    mesh.rotation.y = -Math.PI / 2
    group.add(mesh)
  })

  // One bright arch frames the gallery as a destination.
  const endStyle = { ...style, density: 2 }
  group.add(buildRibs(theme, endStyle, OUTER - 2.1, OUTER - 1.7))
  return group
}

/** Build the mountains, caves, chambers, collision and theme lookup. */
export function buildTunnels(themes, texturesByTheme) {
  const group = new THREE.Group()
  const cache = new Map()
  const styles = themes.map(experienceFor)

  themes.forEach((theme, index) => {
    const textures = (texturesByTheme.get(theme.name) ?? []).filter(Boolean)
    if (!textures.length) return

    const style = styles[index]
    const angle = CAVE_OFFSET + (index / themes.length) * Math.PI * 2
    const cave = new THREE.Group()
    // Local +x runs outward along this theme's bearing.
    cave.rotation.y = -angle
    group.add(cave)

    cave.add(buildMountain(theme, style, themes.length))
    for (const mesh of buildBore(textures, cache, style)) cave.add(mesh)
    cave.add(style.motif === 'ribs' ? buildRibs(theme, style) : buildInstancedMotif(theme, style))
    cave.add(buildChamber(theme, textures, cache, style))

    const roadStart = INNER - 4.5
    const length = OUTER - roadStart
    const roadColor = new THREE.Color(0x11151c).lerp(new THREE.Color(theme.accent), 0.42)
    if (theme.mode === 'light') roadColor.multiplyScalar(0.72)
    const road = new THREE.Mesh(
      QUAD,
      new THREE.MeshBasicMaterial({ color: roadColor, toneMapped: false }),
    )
    road.scale.set(length, style.radius * 1.88, 1)
    road.position.set(roadStart + length / 2, 0.014, 0)
    road.rotation.x = -Math.PI / 2
    cave.add(road)
  })

  return {
    group,
    constrain: makeConstraint(themes.length, styles),
    locate: makeLocator(themes, styles),
  }
}

function nearestCave(pos, count) {
  const step = (Math.PI * 2) / count
  const radius = Math.hypot(pos.x, pos.z)
  const angle = Math.atan2(pos.z, pos.x)
  const rawIndex = Math.round((angle - CAVE_OFFSET) / step)
  const index = ((rawIndex % count) + count) % count
  const centre = CAVE_OFFSET + rawIndex * step
  const offset = Math.atan2(Math.sin(angle - centre), Math.cos(angle - centre))
  return { radius, index, lateral: offset * radius }
}

/** Keep the car inside a cave once it crosses the mountain ring. */
function makeConstraint(count, styles) {
  const stop = OUTER - 5.2

  return (pos) => {
    const nearest = nearestCave(pos, count)
    if (nearest.radius < INNER) return

    const clearance = styles[nearest.index].radius - 2.25
    let nextRadius = Math.min(nearest.radius, stop)
    let lateral = nearest.lateral

    if (Math.abs(lateral) > clearance) {
      nextRadius = INNER
    } else {
      lateral = THREE.MathUtils.clamp(lateral, -clearance, clearance)
    }

    const centre = CAVE_OFFSET + nearest.index * (Math.PI * 2 / count)
    const nextAngle = centre + lateral / Math.max(nextRadius, 1e-3)
    pos.x = Math.cos(nextAngle) * nextRadius
    pos.z = Math.sin(nextAngle) * nextRadius
  }
}

/** Report which cave the car occupies and how near it is to the chamber. */
function makeLocator(themes, styles) {
  return (pos) => {
    const nearest = nearestCave(pos, themes.length)
    const clearance = styles[nearest.index].radius - 1.7
    if (nearest.radius < INNER - 1 || Math.abs(nearest.lateral) > clearance) return null
    return {
      theme: themes[nearest.index],
      style: styles[nearest.index],
      progress: THREE.MathUtils.clamp((nearest.radius - INNER) / (OUTER - INNER), 0, 1),
    }
  }
}
