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

const key = (c, r) => `${c},${r}`

export const occupied = new Set()
for (const letter of wordmark.letters) {
  for (const [c, r] of letter.cells) occupied.add(key(c, r))
}

/**
 * Every non-overlapping SxS block whose cells are all present in `cells` and
 * not already taken. A block sits entirely on solid letter, so an image drawn
 * across it is shown whole — the letter outline never clips it.
 */
function packSlots(cells, size, taken) {
  const own = new Set(cells.map(([c, r]) => key(c, r)))
  const slots = []

  let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity
  for (const [c, r] of cells) {
    minC = Math.min(minC, c); maxC = Math.max(maxC, c)
    minR = Math.min(minR, r); maxR = Math.max(maxR, r)
  }

  for (let c = minC; c <= maxC - size + 1; c++) {
    for (let r = minR; r <= maxR - size + 1; r++) {
      let ok = true
      for (let i = 0; i < size && ok; i++) {
        for (let j = 0; j < size; j++) {
          const k = key(c + i, r + j)
          if (!own.has(k) || taken.has(k)) { ok = false; break }
        }
      }
      if (!ok) continue
      for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) taken.add(key(c + i, r + j))
      slots.push({ c, r, size })
    }
  }
  return slots
}

/**
 * Tile a whole letter with image blocks, in reading order. `mixed` prefers big
 * 3x3 blocks and fills the gaps with 2x2; the 2x2-only mode yields more (but
 * smaller) blocks, for letters that have more images to show than room for.
 */
function packLetter(cells, mixed) {
  const taken = new Set()
  const blocks = mixed
    ? [...packSlots(cells, 3, taken), ...packSlots(cells, 2, taken)]
    : packSlots(cells, 2, taken)
  blocks.sort((a, b) => (a.c - b.c) || (a.r - b.r))
  return { blocks, taken }
}

/**
 * Give every theme a contiguous run of blocks inside one letter.
 *
 * Letters are handed a share of the themes in proportion to how many images
 * they can physically hold, so no theme ends up in a slice too narrow to fit
 * a single block. Spare blocks are shared out so the letters stay filled.
 */
export function buildLayout(themes) {
  const letters = wordmark.letters
  const mixedCap = letters.map((l) => packLetter(l.cells, true).blocks.length)
  const smallCap = letters.map((l) => packLetter(l.cells, false).blocks.length)
  const capSum = mixedCap.reduce((a, b) => a + b, 0)
  const imageSum = themes.reduce((a, t) => a + t.images.length, 0)

  // Walk the themes in order, cutting to the next letter at whichever point
  // lands closest to that letter's fair share.
  const groups = letters.map(() => [])
  let li = 0
  let acc = 0
  for (let i = 0; i < themes.length; i++) {
    const target = (imageSum * mixedCap[li]) / capSum
    const n = themes[i].images.length
    const lettersLeft = groups.length - li - 1
    const themesLeft = themes.length - i
    if (
      li < groups.length - 1 && acc > 0 && themesLeft > lettersLeft &&
      (Math.abs(acc + n - target) >= Math.abs(acc - target) || acc + n > smallCap[li])
    ) { li++; acc = 0 }
    groups[li].push(themes[i])
    acc += n
  }

  const clusters = []
  letters.forEach((letter, i) => {
    const group = groups[i]
    if (!group.length) return
    const required = group.reduce((a, t) => a + t.images.length, 0)

    // Big blocks if they all fit; otherwise the denser, smaller grid.
    const mixed = required <= mixedCap[i]
    const { blocks, taken } = packLetter(letter.cells, mixed)

    // Each theme gets at least one block per image; spares go round in turn.
    const runs = group.map((t) => t.images.length)
    let spare = blocks.length - required
    for (let j = 0; spare > 0; j = (j + 1) % runs.length) { runs[j]++; spare-- }

    const plain = letter.cells.filter(([c, r]) => !taken.has(key(c, r)))

    let at = 0
    group.forEach((theme, j) => {
      const mine = blocks.slice(at, at + runs[j])
      at += runs[j]
      const lo = Math.min(...mine.map((b) => b.c))
      const hi = Math.max(...mine.map((b) => b.c + b.size - 1))
      clusters.push({
        theme,
        letter: letter.ch,
        letterIndex: i,
        blocks: mine,
        // Uncovered slivers take the colour of whichever theme owns their column.
        plain: plain.filter(([c]) => c >= lo && c <= hi),
        cells: letter.cells.filter(([c]) => c >= lo && c <= hi),
      })
    })
  })
  return clusters
}

/** Top faces for one image block, UV-mapped so the whole square image lands on it. */
export function buildSlotGeometry(slot) {
  const pos = []
  const uv = []
  for (let i = 0; i < slot.size; i++) {
    for (let j = 0; j < slot.size; j++) {
      const c = slot.c + i
      const r = slot.r + j
      const x0 = cellX(c) - CELL / 2, x1 = x0 + CELL
      const z0 = cellZ(r) - CELL / 2, z1 = z0 + CELL
      const y = HEIGHT

      const ua = i / slot.size, ub = (i + 1) / slot.size
      const va = 1 - j / slot.size, vb = 1 - (j + 1) / slot.size

      pos.push(x0, y, z0, x1, y, z1, x1, y, z0, x0, y, z0, x0, y, z1, x1, y, z1)
      uv.push(ua, va, ub, vb, ub, va, ua, va, ua, vb, ub, vb)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}

/** Flat top faces for cells no image block covers. */
export function buildPlainGeometry(cells) {
  const pos = []
  for (const [c, r] of cells) {
    const x0 = cellX(c) - CELL / 2, x1 = x0 + CELL
    const z0 = cellZ(r) - CELL / 2, z1 = z0 + CELL
    const y = HEIGHT
    pos.push(x0, y, z0, x1, y, z1, x1, y, z0, x0, y, z0, x0, y, z1, x1, y, z1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}

/** Side walls, emitted only where a cell has no neighbour. */
export function buildSideGeometry(cells) {
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

    if (!occupied.has(key(c, r - 1))) quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1])
    if (!occupied.has(key(c, r + 1))) quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1])
    if (!occupied.has(key(c - 1, r))) quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0])
    if (!occupied.has(key(c + 1, r))) quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0])
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  return g
}

export { wordmark }
