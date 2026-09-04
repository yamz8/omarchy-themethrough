import * as THREE from 'three'
import wordmark from './wordmark.json'

export const CELL = 1
export const HEIGHT = 1.15
export const COLS = wordmark.cols
export const ROWS = wordmark.rows

// World position of a grid cell's centre. Row 0 sits at -z so the wordmark
// reads correctly when the camera looks straight down.
export const cellX = (c) => (c - (COLS - 1) / 2) * CELL
export const cellZ = (r) => (r - (ROWS - 1) / 2) * CELL

/**
 * Split a letter's cells into `n` contiguous vertical bands of roughly equal
 * weight. Each band becomes one theme's territory, so a theme's images always
 * occupy an unbroken slice of the letter.
 */
function bandsForLetter(letter, n) {
  const perCol = new Map()
  for (const [c] of letter.cells) perCol.set(c, (perCol.get(c) ?? 0) + 1)

  const columns = [...perCol.keys()].sort((a, b) => a - b)
  const total = letter.cells.length
  const target = total / n

  const bands = []
  let current = []
  let acc = 0
  for (const c of columns) {
    current.push(c)
    acc += perCol.get(c)
    const remainingBands = n - bands.length - 1
    const remainingCols = columns.length - (columns.indexOf(c) + 1)
    // Close the band once it has its share, but never strand the bands after it.
    if (bands.length < n - 1 && acc >= target * 0.75 && remainingCols > remainingBands) {
      bands.push(current)
      current = []
      acc = 0
    }
  }
  if (current.length) bands.push(current)
  while (bands.length < n) {
    // Steal a column from the widest band so every theme gets territory.
    const widest = bands.reduce((a, b) => (b.length > a.length ? b : a))
    bands.splice(bands.indexOf(widest) + 1, 0, [widest.pop()])
  }

  return bands.map((cols) => {
    const set = new Set(cols)
    return letter.cells.filter(([c]) => set.has(c))
  })
}

/** Assign every theme a contiguous band inside one letter. */
export function assignThemes(themes, perLetter) {
  const clusters = []
  let t = 0
  wordmark.letters.forEach((letter, i) => {
    const n = perLetter[i]
    bandsForLetter(letter, n).forEach((cells) => {
      clusters.push({ theme: themes[t++], letter: letter.ch, letterIndex: i, cells })
    })
  })
  return clusters
}

/**
 * Top faces for one cluster, UV-mapped so a single square image covers the
 * cluster's bounding box — the letter shape crops the picture.
 */
export function buildTopGeometry(cells) {
  let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity
  for (const [c, r] of cells) {
    minC = Math.min(minC, c); maxC = Math.max(maxC, c)
    minR = Math.min(minR, r); maxR = Math.max(maxR, r)
  }
  const w = maxC - minC + 1
  const h = maxR - minR + 1

  // Cover-fit a square texture across a non-square box.
  const aspect = w / h
  const [u0, u1] = aspect >= 1 ? [0, 1] : [0.5 - aspect / 2, 0.5 + aspect / 2]
  const [v0, v1] = aspect >= 1 ? [0.5 - 1 / (2 * aspect), 0.5 + 1 / (2 * aspect)] : [0, 1]

  const pos = []
  const uv = []
  for (const [c, r] of cells) {
    const x0 = cellX(c) - CELL / 2, x1 = x0 + CELL
    const z0 = cellZ(r) - CELL / 2, z1 = z0 + CELL
    const y = HEIGHT

    const fu = (cc) => u0 + ((cc - minC) / w) * (u1 - u0)
    const fv = (rr) => v1 - ((rr - minR) / h) * (v1 - v0)
    const ua = fu(c), ub = fu(c + 1)
    const va = fv(r), vb = fv(r + 1)

    // Counter-clockwise seen from +Y, so the face survives backface culling.
    pos.push(x0, y, z0, x1, y, z1, x1, y, z0, x0, y, z0, x0, y, z1, x1, y, z1)
    uv.push(ua, va, ub, vb, ub, va, ua, va, ua, vb, ub, vb)
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** Side walls, emitted only where a cell has no neighbour — hidden faces are skipped. */
export function buildSideGeometry(cells, occupied) {
  const pos = []
  const nor = []
  const quad = (a, b, c, d, n) => {
    // Reverse winding so each wall faces outward along `n`.
    pos.push(...a, ...c, ...b, ...a, ...d, ...c)
    for (let i = 0; i < 6; i++) nor.push(...n)
  }

  for (const [c, r] of cells) {
    const x0 = cellX(c) - CELL / 2, x1 = x0 + CELL
    const z0 = cellZ(r) - CELL / 2, z1 = z0 + CELL
    const y0 = 0, y1 = HEIGHT

    if (!occupied.has(`${c},${r - 1}`)) quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1])
    if (!occupied.has(`${c},${r + 1}`)) quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1])
    if (!occupied.has(`${c - 1},${r}`)) quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0])
    if (!occupied.has(`${c + 1},${r}`)) quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0])
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  return g
}

export { wordmark }
