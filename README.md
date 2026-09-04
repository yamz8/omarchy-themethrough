# omarchy · themethrough

The Omarchy wordmark, laid flat on the floor and filled with the backgrounds
from every installed theme. You open above it, looking straight down, then
descend and fly the length of the word before rising back to where you started.

**Live: https://yamz8.github.io/omarchy-themethrough/**

## The film

The page is a piece of film and plays itself once the last background loads.
It runs as a **cut list**, not one endless glide — eight shots, each a move
from one framing to another, with the camera jumping between them so the joins
read as edits:

1. **Cold open** — down among the pictures, drifting, before you know what it is
2. **Title** — still low, still moving, as `OMARCHY` comes up
3. **The drive** — the written route, through the middle of the word
4. **Break out** — rise off the surface and let the whole shape land
5. **Overhead** — drifting slowly across the word
6. **Low again** — over the brightest stretch
7. **Hero** — the three-quarter push-in
8. **Sign-off** — settle overhead and hold on the name

Letterbox bars slide in for the duration and retract at the end, the closing
card holds, and `replay` sits clear of it in the opposite corner. A vignette
and a cool lift are laid over the canvas so it reads as graded footage.

Shot timings run on wall-clock time rather than accumulated frame deltas, so a
throttled or backgrounded tab can't fall behind the cut.

## How it works

The wordmark is pixel art on an **81 × 19** grid. `tools/generate-assets.js`
samples the PNG's alpha channel back onto that grid, giving 738 filled cells
split across the seven letters:

| O | M | A | R | C | H | Y |
|---|---|---|---|---|---|---|
| 96 | 147 | 104 | 118 | 87 | 94 | 92 |

The letters lie flat on the floor and are tiled with square **image blocks** —
3×3 cells where they fit, 2×2 where a letter has more images to show than room
for big ones. A block only ever sits on cells that are all solid letter, so the
background drawn across it is shown **whole**: the letter outline never crops a
picture. Each of the **71 backgrounds appears exactly once** — nothing repeats.

Square uncropped tiles can only cover about 78% of a letter, so the rest shows
as mat in the theme's `accent`. Every uncovered cell goes to the nearest theme
by column; matching only cells that fall inside a theme's own span would drop
the parts of a letter sitting between two themes — the bars of an O — and the
letterform comes apart.

The generator skips the branded wallpapers whose filenames contain `omarchy`:
they are the wordmark on a flat ground, and read as blank tiles laid into the
letters.

The driving shots ride a route written through each letter as one continuous
gesture, looping and doubling back the way a pen would.

## Develop

```bash
npm install
npm run dev
```

## Regenerating assets

The backgrounds are read from a local Omarchy install, squared to 512px and
compressed to WebP (108 MB → 1.8 MB). Re-run after installing new themes:

```bash
npm run assets    # needs ImageMagick (`magick`) on PATH
```

It reads `/usr/share/omarchy/themes` (override with `OMARCHY_THEMES`) and
writes `public/bg/`, `src/themes.json`, and `src/wordmark.json`.

## Deploy

Every push to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`.
