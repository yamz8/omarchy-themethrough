import * as THREE from 'three'
import wordmark from './wordmark.json'

export const CELL = 1
export const HEIGHT = 0
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
function packSlots(cells, size, taken, limit = Infinity) {
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
      if (slots.length >= limit) return slots
    }
  }
  return slots
}

/** Pick `n` entries spread evenly through a list. */
function spread(items, n) {
  if (items.length <= n) return items
  const out = []
  for (let i = 0; i < n; i++) out.push(items[Math.round((i * (items.length - 1)) / (n - 1 || 1))])
  return [...new Set(out)]
}

/**
 * Tile a letter with exactly `count` image blocks — one per background, so no
 * picture is ever repeated.
 *
 * Blocks are made as large as they can be while still producing `count` of
 * them, because the cells no block covers show as bare mat: too few big blocks
 * and the letterform breaks up into disconnected strips.
 */
function packLetter(cells, count) {
  const build = (sizes) => {
    const taken = new Set()
    const out = []
    for (const size of sizes) out.push(...packSlots(cells, size, taken))
    return out
  }

  // Biggest-first, dropping to smaller blocks only when the letter cannot
  // otherwise yield enough of them.
  let blocks = null
  for (const sizes of [[3, 2], [2], [2, 1], [1]]) {
    const all = build(sizes)
    if (all.length < count) continue
    const big = all.filter((b) => b.size === sizes[0])
    blocks = big.length >= count
      ? spread(big, count)
      : [...big, ...spread(all.filter((b) => b.size !== sizes[0]), count - big.length)]
    break
  }
  if (!blocks) blocks = build([1]).slice(0, count)

  blocks.sort((a, b) => (a.c - b.c) || (a.r - b.r))
  const covered = new Set()
  for (const b of blocks) {
    for (let i = 0; i < b.size; i++) for (let j = 0; j < b.size; j++) covered.add(key(b.c + i, b.r + j))
  }
  return { blocks, covered }
}

/** The most blocks a letter can hold, at its smallest useful block size. */
function capacity(cells) {
  return packSlots(cells, 2, new Set()).length
}

/**
 * Give every theme a contiguous run of blocks inside one letter, with each
 * letter taking a share of the themes in proportion to how much it can hold.
 */
export function buildLayout(themes) {
  const letters = wordmark.letters
  const caps = letters.map((l) => capacity(l.cells))
  const areas = letters.map((l) => l.cells.length)
  const areaSum = areas.reduce((a, b) => a + b, 0)
  const imageSum = themes.reduce((a, t) => a + t.images.length, 0)

  const groups = letters.map(() => [])
  let li = 0
  let acc = 0
  for (let i = 0; i < themes.length; i++) {
    const target = (imageSum * areas[li]) / areaSum
    const n = themes[i].images.length
    const lettersLeft = groups.length - li - 1
    const themesLeft = themes.length - i
    if (
      li < groups.length - 1 && acc > 0 && themesLeft > lettersLeft &&
      (Math.abs(acc + n - target) >= Math.abs(acc - target) || acc + n > caps[li])
    ) { li++; acc = 0 }
    groups[li].push(themes[i])
    acc += n
  }

  const clusters = []
  letters.forEach((letter, i) => {
    const group = groups[i]
    if (!group.length) return
    const required = group.reduce((a, t) => a + t.images.length, 0)
    const { blocks, covered } = packLetter(letter.cells, required)
    const plain = letter.cells.filter(([c, r]) => !covered.has(key(c, r)))

    let at = 0
    const mineOf = []
    group.forEach((theme) => {
      const mine = blocks.slice(at, at + theme.images.length)
      at += theme.images.length
      if (!mine.length) return
      const cluster = {
        theme,
        letter: letter.ch,
        letterIndex: i,
        blocks: mine,
        plain: [],
        lo: Math.min(...mine.map((b) => b.c)),
        hi: Math.max(...mine.map((b) => b.c + b.size - 1)),
      }
      mineOf.push(cluster)
      clusters.push(cluster)
    })

    // Hand every uncovered cell to the nearest theme by column. Matching only
    // cells that fall *inside* a theme's own span drops the parts of a letter
    // that sit between two themes — the bars of an O, say — and the letterform
    // comes apart.
    for (const cell of plain) {
      let best = null
      let bestD = Infinity
      for (const cluster of mineOf) {
        const c = cell[0]
        const d = c < cluster.lo ? cluster.lo - c : c > cluster.hi ? c - cluster.hi : 0
        if (d < bestD) { bestD = d; best = cluster }
      }
      if (best) best.plain.push(cell)
    }
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

export { wordmark }
