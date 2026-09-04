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

The letters lie flat on the floor and are tiled with square **image blocks** —
3×3 cells where they fit, 2×2 where a letter has more images to show than room
for big ones. A block only ever sits on cells that are all solid letter, so the
background drawn across it is shown **whole**: the letter outline never crops a
picture. Each of the **71 backgrounds appears exactly once** — nothing repeats,
and nothing animates.

Square uncropped tiles can only cover about 78% of a letter, so the rest shows
as mat in the theme's `accent`. Every uncovered cell goes to the nearest theme
by column; matching only cells that fall inside a theme's own span would drop
the parts of a letter sitting between two themes — the bars of an O — and the
letterform comes apart.

The generator skips the branded wallpapers whose filenames contain `omarchy`:
they are the wordmark on a flat ground, and read as blank tiles laid into the
letters.

The camera opens overhead, framed to the viewport, then **drives the word like
a road**. The route is written through each letter as one continuous gesture —
looping and doubling back the way a pen would, not a straight pass down the
word — and the camera rides it at constant speed, low and looking a short way
ahead. Phases run on wall-clock time rather than accumulated frame deltas, so a
throttled or backgrounded tab can't fall behind.

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
