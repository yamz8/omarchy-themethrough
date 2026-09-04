# omarchy · themethrough

The Omarchy wordmark, laid flat on the floor and filled with the backgrounds
from every installed theme. You open above it, looking straight down, then
descend and fly the length of the word before rising back to where you started.

**Live: https://yamz8.github.io/omarchy-themethrough/**

## How it works

The wordmark is pixel art on an **81 × 19** grid. `tools/generate-assets.js`
samples the PNG's alpha channel back onto that grid, giving 738 filled cells
split across the seven letters:

| O | M | A | R | C | H | Y |
|---|---|---|---|---|---|---|
| 96 | 147 | 104 | 118 | 87 | 94 | 92 |

Each cell becomes a low extruded block. Every letter is then tiled with square
**image blocks** — 3×3 cells where they fit, 2×2 where a letter has more images
to show than room for. A block only ever sits on cells that are all solid
letter, so the background drawn across it is shown **whole**: the letter
outline never crops a picture. All **92 backgrounds** appear, each in its
entirety.

The 22 themes are handed contiguous runs of those blocks, and each letter gets
a share of the themes in proportion to how many images it can physically hold —
otherwise a theme can land in a slice too narrow to fit even one block. Slivers
the blocks can't cover take the theme's `background` colour, lifted toward its
`accent` so the letter edges stay defined.

Blocks only emit side walls where they have no neighbour, so interior faces
between adjacent cells are never built. Image faces are unlit, so the
wallpapers show their true colour; the walls are lit and tinted with the
theme's `accent`. Nothing animates or cycles — the layout is static.

The camera opens overhead, framed to the viewport, then drives the length of
the word at low altitude, so the letter tops read as a road of images passing
beneath, changing theme letter by letter. Phases run on wall-clock time rather
than accumulated frame deltas, so a throttled or backgrounded tab can't fall
behind.

## Develop

```bash
npm install
npm run dev
```

## Regenerating assets

The 92 backgrounds are read from a local Omarchy install, squared to 512px and
compressed to WebP (108 MB → 1.9 MB). Re-run after installing new themes:

```bash
npm run assets    # needs ImageMagick (`magick`) on PATH
```

It reads `/usr/share/omarchy/themes` (override with `OMARCHY_THEMES`) and
writes `public/bg/`, `src/themes.json`, and `src/wordmark.json`.

## Deploy

Every push to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`.
