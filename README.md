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
2. **Low move** — still down among them, swung across the M
3. **The drive** — the written route, through the middle of the word
4. **Break out** — rise off the surface and let the whole shape land
5. **Overhead** — raked and closer, drifting across the word
6. **Low again** — over the brightest stretch
7. **Hero** — the three-quarter push-in
8. **Sign-off** — settle overhead and hold on the name

The joins are held to two rules, because breaking either one reads as a fault
rather than an edit: consecutive shots differ by at least 30° of view angle or
a clear change of shot size, and no shot eases to a standstill on a cut — a
film that stops moving exactly where it cuts feels like it hitched.

Letterbox bars slide in for the duration and retract at the end, and a vignette
and cool lift are laid over the canvas so it reads as graded footage. There is
no overlay text and no ground grid — the pictures carry it, floating in dark.

Shot timings run on wall-clock time rather than accumulated frame deltas, so a
throttled or backgrounded tab can't fall behind the cut.

## Drive

A second mode, on the button beside `replay`. A Group-B rally coupé drops in,
falls, bounces once and settles, and you drive it over the letters.

`W`/`S` throttle, `A`/`D` steer, `space` brake, `Esc` to leave.

The car is built from primitives with its livery drawn to canvas, not loaded
from a model. It is the silhouette and the racing dress — boxed arches, race
number, round lamps, rear wing — and deliberately carries no third-party marks.

Two things it has to work around: the body is narrower than the track so the
wheels and arches stand proud of the flanks (without that it reads as a slab),
and the headlights are an additive pool on the ground rather than a real light,
because the image tiles are unlit and a lamp would not touch them.

### Tunnels

One cave per theme radiates through a mountain ring around the wordmark. The car
starts in the open basin, surrounded by low-poly peaks and twenty-two jagged
stone portals. Crossing a mouth takes you into a faceted round arch lined with
that theme's backgrounds and grounded by its own colour.

The caves are nearly three times the original length. They breathe subtly in
and out as they run, and their proportions, facet count, image weave, rock
profile, atmosphere and accent details are deterministically keyed to the
theme. Interiors split into glowing ribs, suspended orbs, lantern-like beacons,
crystal spires and monolithic columns, so the change is structural as well as a
palette swap.

There is no cliff. Each road stops inside a closed gallery chamber with every
background from that theme arranged on the end wall. On the final approach a
terminal card reveals the real Omarchy switch command —
`omarchy theme set <theme-name>` — with a one-click copy button.

The caves are walls, not decoration: past the mouths the car can only continue
through a real opening. The film retains its endless ground, while drive mode
uses a larger disc whose edge stays hidden behind the chamber walls.

The hundreds of bore facets are merged into one mesh per background, repeated
details use instancing, materials are shared with the chamber panels, and
frustum culling drops caves outside the chase camera's view.

Handling is scaled to the world rather than to a road — the wordmark is only 81
units long, and at a realistic top speed you cross the whole thing in a couple
of seconds with no time to look at anything. A generous soft boundary keeps the
car from getting lost out in the dark.

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

The **ending** thins the chord from the top down until only the root is left,
closes the filter as it goes, and lets a last swell decay into the reverb tail.
It ramps to true silence rather than easing toward it — `setTargetAtTime`
approaches its target asymptotically, which would leave a drone playing under
the end frame for as long as the page stayed open. Replay undoes it.

The score is **part of the film**, so it starts with it — there is no toggle.
Browsers still gate audible playback on a gesture, so the graph is built as the
page loads and the first touch of it — click, key, wheel — joins the score at
the current shot rather than restarting the film. The listeners come off once
the context reports itself running, so a later click cannot raise the score
again after the closing fade.

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
