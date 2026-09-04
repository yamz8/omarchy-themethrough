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

Each cell becomes a low extruded block. All **22 themes** are laid across the
seven letters (M gets four, the rest three) as contiguous vertical bands, so a
theme always owns an unbroken slice of a letter. One background is mapped
across each band's bounding box — the letter shape crops the picture — and the
bands crossfade through the rest of their theme's images as you watch.

Blocks only emit side walls where they have no neighbour, so the interior faces
between adjacent cells are never built. Top faces are unlit, so the wallpapers
show their true colour; the walls are lit and tinted with the theme's `accent`
from its `colors.toml`.

The flight runs *in front of* the letters rather than between them: the image
faces point straight up, so they only stay legible from a raised, tilted view.

## Develop

```bash
npm install
npm run dev
```

## Regenerating assets

The 92 backgrounds are read from a local Omarchy install, squared to 1024px and
compressed to WebP (108 MB → 5.6 MB). Re-run after installing new themes:

```bash
npm run assets    # needs ImageMagick (`magick`) on PATH
```

It reads `/usr/share/omarchy/themes` (override with `OMARCHY_THEMES`) and
writes `public/bg/`, `src/themes.json`, and `src/wordmark.json`.

## Deploy

Every push to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`.
