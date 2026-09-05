/**
 * Capture mode — `?capture` turns the page into a render target.
 *
 * Two ways to take the film, both writing it out of the browser rather than
 * off the screen, so no desktop, cursor or room noise gets into a take:
 *
 *   ?capture          realtime. Records the canvas and the score together
 *                     through MediaRecorder. Sound, but only as fast as the
 *                     machine can encode 1080p live — on a modest GPU that
 *                     means dropped frames.
 *   ?capture=frames   offline. Steps the film by hand against a clock of its
 *                     own and posts raw pixels a frame at a time, so the
 *                     result is a perfect 60 whatever the machine is doing,
 *                     with real motion blur from several exposures a frame.
 *                     Silent: pair it with a realtime take's audio.
 *
 * The letterbox, the grade and the opening fade are DOM, not canvas, so a
 * canvas recording quietly loses them — the realtime path has that hole. The
 * offline path rebuilds them from the same numbers the stylesheet uses: the
 * bars and the fade per frame, the grade handed to the encoder as a still.
 *
 * Loaded on demand from main.js, so none of this reaches the normal bundle.
 *
 * Query parameters, all optional:
 *   size=1920x1080   canvas backing store, and so the take's resolution
 *   fps=60           frame rate
 *   to=<url>         POST the take here; otherwise it downloads
 *   limit=N          render only N frames
 *   start=<seconds>  begin partway into the film
 *   blur=N           exposures per frame; 1 turns the shutter off
 */

const LEAD = 900   // ms of the opening frame before the film rolls
const TAIL = 3400  // ms held after the last cut, for the letterbox and the tail

// Motion blur. The film moves the image up to 127px between frames on the
// driving shots, and an unblurred edge moving that far reads as a stutter
// rather than as speed. Rendering offline means it can be done the way an
// offline renderer does it — several exposures per frame, averaged — instead
// of approximated from a velocity buffer.
const SAMPLES = 8
const SHUTTER = 0.5  // 180°: the exposure spans half the frame interval

const FADE_MS = 1200  // #fade, `opacity 1.2s ease`
const BAR_MS = 1100   // .bar, `height 1.1s cubic-bezier(0.22, 1, 0.36, 1)`

/** CSS cubic-bezier, solved for y at a given x by bisection — exact enough. */
function bezier(x1, y1, x2, y2) {
  const curve = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3
  return (x) => {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (curve(mid, x1, x2) < x) lo = mid
      else hi = mid
    }
    return curve((lo + hi) / 2, y1, y2)
  }
}

const EASE = bezier(0.25, 0.1, 0.25, 1)          // CSS `ease`
const SWING = bezier(0.22, 1, 0.36, 1)           // the letterbox curve

/**
 * Exposures have to be averaged in light, not in code values: the renderer
 * writes sRGB, and a mean of sRGB numbers is not the mean of the light they
 * stand for. On a bright tile edge crossing dark ground — which is most of
 * what blurs here — averaging the encoded values darkens the trail visibly.
 * Both directions are tabulated, so the per-pixel cost is a lookup.
 */
const LINEAR_STEPS = 4096
const TO_LINEAR = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const TO_SRGB = new Uint8Array(LINEAR_STEPS)
for (let i = 0; i < LINEAR_STEPS; i++) {
  const c = i / (LINEAR_STEPS - 1)
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
  TO_SRGB[i] = Math.round(s * 255)
}

export async function startCapture({ renderer, camera, canvas, director, score, roll, loaded, frame }) {
  const params = new URLSearchParams(location.search)
  const [width, height] = (params.get('size') ?? '1920x1080').split('x').map(Number)
  const fps = Number(params.get('fps') ?? 60)
  const post = params.get('to')

  document.body.classList.add('capturing')

  // The backing store is what gets recorded, so the take is full size even in
  // a small window — `false` leaves the element's own CSS size alone, and the
  // stylesheet letterboxes it for monitoring.
  renderer.setPixelRatio(1)
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()

  await loaded

  const shared = { renderer, canvas, director, score, roll, frame, width, height, fps, post, params }
  if (params.get('capture') === 'frames') await renderOffline(shared)
  else await recordLive(shared)
  document.body.classList.add('capture-done')
}

/**
 * The grade layer the stylesheet lays over the canvas, rebuilt on a 2D
 * context. It never changes, so it is drawn once and handed to the encoder as
 * a still to composite — the per-frame path never touches it.
 *
 * `--bar` is `clamp(28px, 7.5vh, 82px)` against the frame rather than the
 * window, so the letterbox is proportioned to the video and not to whatever
 * size the browser happened to be.
 */
function gradeLayer(width, height) {
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')

  // radial-gradient(120% 85% at 50% 45%, transparent 42%, rgba(4,5,9,.72))
  // An ellipse, so the context is scaled around the focus and the gradient
  // drawn as a circle inside it.
  const rx = width * 1.2
  const ry = height * 0.85
  const vignette = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
  vignette.addColorStop(0.42, 'rgba(4, 5, 9, 0)')
  vignette.addColorStop(1, 'rgba(4, 5, 9, 0.72)')
  ctx.save()
  ctx.translate(width * 0.5, height * 0.45)
  ctx.scale(1, ry / rx)
  ctx.fillStyle = vignette
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2)
  ctx.restore()

  // linear-gradient(190deg, rgba(90,120,200,.06), transparent 55%)
  const lift = ctx.createLinearGradient(0, 0, Math.sin(Math.PI * 190 / 180) * width, Math.cos(Math.PI * 10 / 180) * height)
  lift.addColorStop(0, 'rgba(90, 120, 200, 0.06)')
  lift.addColorStop(0.55, 'rgba(90, 120, 200, 0)')
  ctx.fillStyle = lift
  ctx.fillRect(0, 0, width, height)

  return out
}

/**
 * Offline: replace the clock, step the film, post every frame as raw pixels.
 *
 * Everything downstream — the cut list, the damped aim, the loop's own dt —
 * reads `performance.now()`, so swapping it for a counter is all it takes to
 * turn a realtime film into a deterministic render. Nothing waits on the
 * display, so the take is a true 60 on a machine that cannot play it at 60.
 *
 * Frames leave as raw RGBA rather than encoded stills: this machine spends a
 * full second in `toBlob`, against 20ms to render and read the pixels back.
 * The bytes go straight to an encoder, so nothing is paying for a format that
 * only exists between here and there.
 */
async function renderOffline({ renderer, director, frame, width, height, fps, post, params }) {
  if (!post) throw new Error('?capture=frames needs to= a frame sink')

  renderer.setAnimationLoop(null)
  const gl = renderer.getContext()
  const pixels = new Uint8Array(width * height * 4)
  const words = new Uint32Array(pixels.buffer)
  const BG = 0xff0a0706  // #06070a, little-endian RGBA
  const bar = Math.min(Math.max(28, height * 0.075), 82)

  const step = 1000 / fps
  const total = LEAD + director.total * 1000 + TAIL
  // `limit` renders only N frames and `start` begins partway in, for checking
  // a take — or one fast moment of it — before committing to the whole film.
  const t0 = Number(params.get('start') ?? 0) * 1000
  const count = Math.min(Math.round((total - t0) / step), Number(params.get('limit') ?? Infinity))

  // The still grade goes first: the sink holds the encoder until it lands.
  const grade = await new Promise((r) => gradeLayer(width, height).toBlob(r, 'image/png'))
  await fetch(`${post}?grade`, { method: 'POST', body: grade })

  const real = performance.now.bind(performance)
  const origin = real()
  let virtual = origin
  performance.now = () => virtual

  const started = real()
  let rolled = false
  let endedAt = 0
  // `blur=1` turns the shutter off, for comparing a take against itself.
  const samples = Math.max(1, Number(params.get('blur') ?? SAMPLES))
  const accum = samples > 1 ? new Float32Array(width * height * 4) : null

  // Starting partway in means the film has to be already running, on a clock
  // that puts its first frame at LEAD however far in this take begins.
  if (t0 >= LEAD) { director.play(); director.startedAt = origin + LEAD; rolled = true }

  for (let i = 0; i < count; i++) {
    const t = t0 + i * step
    if (!rolled && t >= LEAD) { virtual = origin + t; director.play(); rolled = true }
    director.onEnd = () => { endedAt = t }

    // One exposure, or several across the open shutter and averaged.
    if (accum) {
      accum.fill(0)
      for (let s = 0; s < samples; s++) {
        virtual = origin + t + ((s + 0.5) / samples) * SHUTTER * step
        frame()
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        for (let p = 0; p < pixels.length; p++) accum[p] += TO_LINEAR[pixels[p]]
      }
      const scale = (LINEAR_STEPS - 1) / samples
      for (let p = 0; p < pixels.length; p++) {
        pixels[p] = TO_SRGB[Math.min(LINEAR_STEPS - 1, (accum[p] * scale) | 0)]
      }
    } else {
      virtual = origin + t
      frame()
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    }

    // The letterbox slides in with the film and retracts on the last cut. Rows
    // come back bottom-up, but the bars are symmetric, so filling the first and
    // last rows is the same either way up.
    const bars = endedAt
      ? 1 - SWING(Math.min((t - endedAt) / BAR_MS, 1))
      : rolled ? SWING(Math.min((t - LEAD) / BAR_MS, 1)) : 0
    if (bars > 0) {
      const rows = Math.round(bar * bars) * width
      words.fill(BG, 0, rows)
      words.fill(BG, words.length - rows)
    }

    // The opening fade, lifting off the first frame.
    const fade = 1 - EASE(Math.min(t / FADE_MS, 1))  // absolute, so start= keeps it lifted
    if (fade > 0) {
      for (let p = 0; p < pixels.length; p += 4) {
        pixels[p] += (6 - pixels[p]) * fade
        pixels[p + 1] += (7 - pixels[p + 1]) * fade
        pixels[p + 2] += (10 - pixels[p + 2]) * fade
      }
    }

    await fetch(post, { method: 'POST', body: pixels })

    if (i % 60 === 0) {
      const pace = (i + 1) / ((real() - started) / 1000)
      const left = (count - i) / pace
      console.log(`[capture] ${i}/${count} frames, ${pace.toFixed(1)}/s, ~${(left / 60).toFixed(1)}min left`)
    }
  }

  await fetch(`${post}?done`, { method: 'POST' })
  performance.now = real
  console.log(`[capture] rendered ${count} frames in ${((real() - started) / 1000).toFixed(0)}s`)
}

/** Realtime: the canvas and the score, muxed live by MediaRecorder. */
async function recordLive({ canvas, director, score, roll, width, height, fps, post }) {
  // Audible playback is gated on a gesture, so the take waits for one rather
  // than recording a silent film and finding out afterwards.
  if (!score.running) {
    console.log('[capture] waiting for a click to unblock audio')
    document.body.classList.add('needs-gesture')
    await new Promise((resolve) => {
      const tick = () => (score.running ? resolve() : setTimeout(tick, 120))
      tick()
    })
    document.body.classList.remove('needs-gesture')
  }

  const stream = canvas.captureStream(fps)
  const audio = score.tap()
  if (audio) for (const track of audio.getAudioTracks()) stream.addTrack(track)
  console.log(`[capture] armed ${width}x${height} @${fps}, audio ${audio ? 'on' : 'MISSING'}`)

  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find((m) => MediaRecorder.isTypeSupported(m))
  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 40e6,  // deliberately generous: this is the master,
    audioBitsPerSecond: 192e3, // and it gets encoded down once, not twice
  })

  const chunks = []
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  const stopped = new Promise((resolve) => { rec.onstop = resolve })

  // The film ends by calling back, so the take follows the cut list rather
  // than a stopwatch that could drift away from it.
  const ended = new Promise((resolve) => {
    const previous = director.onEnd
    director.onEnd = (...args) => { previous?.(...args); resolve() }
  })

  // Frames actually presented, against frames the clock expected: a take that
  // dropped its way through the heavy shots should be thrown away, not posted.
  let frames = 0
  const counting = () => { frames++; requestAnimationFrame(counting) }
  requestAnimationFrame(counting)

  const wait = (ms) => new Promise((r) => setTimeout(r, ms))

  rec.start()
  const began = performance.now()
  frames = 0
  await wait(LEAD)
  roll()
  await ended
  await wait(TAIL)
  rec.stop()
  await stopped

  const seconds = (performance.now() - began) / 1000
  const rate = frames / seconds
  const blob = new Blob(chunks, { type: mime })
  const report = `${seconds.toFixed(1)}s, ${(blob.size / 1e6).toFixed(1)}MB, ${rate.toFixed(1)}fps`
  console.log(`[capture] ${rate < fps * 0.95 ? 'DROPPED FRAMES — ' : ''}${report}`)

  if (post) {
    await fetch(post, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } })
    console.log('[capture] sent')
  } else {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'themethrough.webm'
    a.click()
  }
}
