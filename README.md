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
2. **Low move** — still down among them, crossing the M
3. **The drive** — the written route, through the middle of the word
4. **Break out** — rise off the surface and let the whole shape land
5. **Overhead** — drifting slowly across the word
6. **Low again** — over the brightest stretch
7. **Hero** — the three-quarter push-in
8. **Sign-off** — settle overhead and hold on the name

Letterbox bars slide in for the duration and retract at the end, and a vignette
and cool lift are laid over the canvas so it reads as graded footage. There is
no overlay text and no ground grid — the pictures carry it, floating in dark.

Shot timings run on wall-clock time rather than accumulated frame deltas, so a
throttled or backgrounded tab can't fall behind the cut.

## Sound

The score is **synthesised, not sampled** — no audio file, no licensing, a few
KB of code — and it is driven by the same shot list as the camera. The director
calls into it on every cut, so the music lands *with* the picture rather than
near it; a pre-scheduled track would have to be kept in sync, this cannot come
apart.

- a **pad** of two detuned saws per voice through a soft lowpass, gliding to a
  new chord on each cut rather than jumping
- the progression opens and closes on the minor root, lifting to the major
  fourth and fifth under the two reveals
- a **sub** that swells under the driving shots, so the low passes feel quick
- a **filtered noise sweep** on every cut, and a soft **low impact** on the two
  shots that actually reveal something
- generous convolution reverb from a generated impulse — most of what makes it
  sound like a room rather than a synth

It is **silent until asked**. Browsers block audible autoplay, and starting
noise unbidden is worse than starting none, so the film opens quiet with a
`sound` toggle in the corner. Turning it on joins the score at the current
shot rather than restarting the film.

`window.themethrough` exposes `{ director, score }`; `score.level()` reports
the RMS reaching the output, which is how the mix was checked rather than
assumed.

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

Those strokes contain near-reversals — the bowl of an R doubling back to its
stem, the zigzag of an M — and run straight through a spline they become
corners the camera snaps around. Three things keep the drive smooth:

- the path is **resampled and box-blurred** to bound its curvature, then rebuilt
  with centripetal parameterisation so there are no cusps between samples
- the camera aims at the **average of five points up the road**, not one; a lone
  look-ahead sitting on the same curve swings hard through every bend
- the arc-length table is refined from its 200-step default to 4000, since a
  coarse table makes the pace stutter on a path this wiggly

Measured over the two driving shots, that takes peak turn rate from **115 and
121 deg/s down to 37 and 31**, averaging 23 — a comfortable pan rather than a
whip.

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
