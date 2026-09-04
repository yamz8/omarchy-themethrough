#!/usr/bin/env node
/**
 * Regenerates everything derived from a local Omarchy install:
 *
 *   public/bg/<theme>/*.webp   backgrounds, squared and compressed for the web
 *   src/themes.json            theme names, accent colours, image lists
 *   src/wordmark.json          the wordmark's pixel grid, split into letters
 *
 * Run after installing new themes:  node tools/generate-assets.js
 * Requires ImageMagick (`magick`) on PATH.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'

const run = promisify(execFile)

const THEME_DIR = process.env.OMARCHY_THEMES ?? '/usr/share/omarchy/themes'
const WORDMARK = process.env.OMARCHY_WORDMARK ?? 'assets/omarchy-wordmark.png'
const SIZE = 512
const ROOT = path.resolve(import.meta.dirname, '..')

/** Letter column ranges within the 81-wide grid, in reading order. */
const LETTERS = [['O', 0, 8], ['M', 11, 25], ['A', 27, 36], ['R', 38, 47], ['C', 50, 60], ['H', 61, 70], ['Y', 72, 80]]
const COLS = 81
const ROWS = 19

async function buildBackgrounds() {
  const themes = []
  const names = (await fs.readdir(THEME_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory()).map((d) => d.name).sort()

  for (const name of names) {
    const src = path.join(THEME_DIR, name, 'backgrounds')
    let files
    try {
      files = (await fs.readdir(src))
        .filter((f) => /\.(jpe?g|png)$/i.test(f))
        // Skip the branded wallpapers that are just the wordmark on a flat
        // ground — they read as blank tiles laid into the letters.
        .filter((f) => !/omarchy/i.test(f))
        .sort()
    } catch { continue }
    if (!files.length) continue

    const outDir = path.join(ROOT, 'public/bg', name)
    await fs.mkdir(outDir, { recursive: true })

    await Promise.all(files.map((f) => run('magick', [
      path.join(src, f), '-auto-orient',
      '-resize', `${SIZE}x${SIZE}^`, '-gravity', 'center', '-extent', `${SIZE}x${SIZE}`,
      '-quality', '78', '-define', 'webp:method=5',
      path.join(outDir, f.replace(/\.[^.]+$/, '.webp')),
    ])))

    const toml = await fs.readFile(path.join(THEME_DIR, name, 'colors.toml'), 'utf8')
    const pick = (k) => toml.match(new RegExp(`^${k}\\s*=\\s*"([^"]+)"`, 'm'))?.[1] ?? null
    themes.push({
      name,
      accent: pick('accent'),
      bg: pick('background'),
      mode: pick('mode') ?? 'dark',
      images: files.map((f) => f.replace(/\.[^.]+$/, '.webp')),
    })
  }

  await fs.writeFile(path.join(ROOT, 'src/themes.json'), JSON.stringify(themes, null, 1))
  return themes
}

/** Sample the wordmark's alpha channel onto the 81x19 grid it was drawn on. */
async function buildWordmark() {
  const raw = path.join(ROOT, 'node_modules/.cache-wordmark.gray')
  await fs.mkdir(path.dirname(raw), { recursive: true })
  const { stdout } = await run('magick', ['identify', '-format', '%w %h', WORDMARK])
  const [w, h] = stdout.trim().split(' ').map(Number)
  await run('magick', [WORDMARK, '-alpha', 'extract', '-depth', '8', `gray:${raw}`])
  const buf = await fs.readFile(raw)
  await fs.rm(raw, { force: true })

  const on = (x, y) => buf[y * w + x] > 128
  const cw = w / COLS
  const ch = h / ROWS

  const grid = []
  for (let r = 0; r < ROWS; r++) {
    const row = []
    for (let c = 0; c < COLS; c++) {
      let hit = 0, n = 0
      for (let y = Math.floor(r * ch); y < Math.min(h, (r + 1) * ch); y += 2)
        for (let x = Math.floor(c * cw); x < Math.min(w, (c + 1) * cw); x += 2) { n++; if (on(x, y)) hit++ }
      row.push(hit / n >= 0.5 ? 1 : 0)
    }
    grid.push(row)
  }

  const letters = LETTERS.map(([ch_, c0, c1]) => {
    const cells = []
    for (let r = 0; r < ROWS; r++) for (let c = c0; c <= c1; c++) if (grid[r][c]) cells.push([c, r])
    return { ch: ch_, c0, c1, cells }
  })

  await fs.writeFile(path.join(ROOT, 'src/wordmark.json'), JSON.stringify({ cols: COLS, rows: ROWS, letters }))
  return letters
}

const themes = await buildBackgrounds()
console.log(`themes: ${themes.length}, images: ${themes.reduce((a, t) => a + t.images.length, 0)}`)

try {
  const letters = await buildWordmark()
  console.log(`wordmark: ${letters.map((l) => `${l.ch}=${l.cells.length}`).join(' ')}`)
} catch (err) {
  console.log(`wordmark: skipped (${WORDMARK} not found) — keeping existing src/wordmark.json`)
}
