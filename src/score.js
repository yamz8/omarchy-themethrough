/**
 * The score.
 *
 * Synthesised rather than sampled, so it carries no licensing and — more
 * usefully — it is driven by the same shot list as the camera. The harmony
 * moves when the picture cuts, because the director tells it to, so the two
 * can't drift apart the way a pre-scheduled track would.
 *
 * Nothing here makes a sound until the viewer asks for it: browsers block
 * audible autoplay, and surprising someone with noise is worse than silence.
 */

const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12)

// One chord per shot. It opens and closes on the minor root, lifting to the
// major fourth and fifth under the two reveals.
const PROGRESSION = [
  [45, 52, 57, 60, 64], // Am   cold open
  [41, 48, 53, 57, 60], // F    low move
  [36, 48, 55, 60, 64], // C    the drive
  [43, 50, 55, 59, 62], // G    break out
  [41, 48, 53, 57, 60], // F    overhead
  [38, 50, 57, 62, 65], // Dm   low again
  [36, 48, 55, 60, 64], // C    hero
  [45, 52, 57, 60, 64], // Am   sign-off
]

const VOICES = 5

/** A short exponentially-decaying noise burst, used as a reverb impulse. */
function impulseResponse(ctx, seconds = 3.2) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.6)
      data[i] = (Math.random() * 2 - 1) * decay
    }
  }
  return buf
}

function noiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

export class Score {
  constructor() {
    this.ctx = null
    this.ready = false
    this.shot = 0
  }

  get running() {
    return Boolean(this.ctx && this.ctx.state === 'running')
  }

  /**
   * Build the graph and ask the context to run.
   *
   * `resume()` is deliberately not awaited: without a trusted gesture Chrome
   * leaves that promise pending indefinitely, which would stall this method
   * and leave the graph unbuilt. Building first and resuming after means a
   * real click starts sound immediately, and anything else simply stays quiet
   * with the graph ready for the next gesture.
   */
  start() {
    if (this.ready) {
      this.ctx.resume()
      return
    }

    const ctx = new (window.AudioContext ?? window.webkitAudioContext)()
    this.ctx = ctx

    // Suspended contexts report currentTime 0 and don't advance; everything
    // scheduled here simply begins when the context starts running.
    const now = ctx.currentTime

    // --- master chain -------------------------------------------------
    this.master = ctx.createGain()
    this.master.gain.value = 0

    const glue = ctx.createDynamicsCompressor()
    glue.threshold.value = -18
    glue.ratio.value = 3
    glue.attack.value = 0.02
    glue.release.value = 0.35

    // A tap on the master, so output level can be inspected rather than assumed.
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.probe = new Float32Array(this.analyser.fftSize)

    this.master.connect(glue).connect(ctx.destination)
    glue.connect(this.analyser)

    // Reverb, generously wet — it is most of what makes this feel like a room
    // rather than a synth.
    this.verb = ctx.createConvolver()
    this.verb.buffer = impulseResponse(ctx)
    const verbGain = ctx.createGain()
    verbGain.gain.value = 0.9
    this.verb.connect(verbGain).connect(this.master)

    this.noise = noiseBuffer(ctx)

    // --- pad ----------------------------------------------------------
    // Two detuned saws per voice through a soft lowpass: warm, not buzzy.
    this.padGain = ctx.createGain()
    this.padGain.gain.value = 0.16
    this.padGain.connect(this.master)
    this.padGain.connect(this.verb)

    this.voices = []
    const chord = PROGRESSION[0]
    for (let i = 0; i < VOICES; i++) {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 620
      filter.Q.value = 0.6

      const gain = ctx.createGain()
      gain.gain.value = i === 0 ? 0.5 : 0.34 / Math.sqrt(i + 1)

      const oscs = [-7, 7].map((cents) => {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = freq(chord[i])
        o.detune.value = cents
        o.connect(filter)
        o.start(now)
        return o
      })

      filter.connect(gain).connect(this.padGain)
      this.voices.push({ oscs, filter, gain })
    }

    // Slow filter drift, so the pad is never quite static.
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.045
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = 190
    lfo.connect(lfoDepth)
    for (const v of this.voices) lfoDepth.connect(v.filter.frequency)
    lfo.start(now)

    // --- sub ----------------------------------------------------------
    // Swells under the driving shots, so the low passes feel like speed.
    this.sub = ctx.createOscillator()
    this.sub.type = 'sine'
    this.sub.frequency.value = freq(chord[0] - 12)
    this.subGain = ctx.createGain()
    this.subGain.gain.value = 0.0
    this.sub.connect(this.subGain).connect(this.master)
    this.sub.start(now)

    // --- air ------------------------------------------------------------
    const air = ctx.createBufferSource()
    air.buffer = this.noise
    air.loop = true
    const airFilter = ctx.createBiquadFilter()
    airFilter.type = 'bandpass'
    airFilter.frequency.value = 4200
    airFilter.Q.value = 0.5
    const airGain = ctx.createGain()
    airGain.gain.value = 0.012
    air.connect(airFilter).connect(airGain).connect(this.verb)
    air.start(now)

    // --- engine ---------------------------------------------------------
    // Silent unless the car is being driven. A lowpassed saw whose pitch and
    // brightness track speed reads as an engine without being a sample.
    this.engineOsc = ctx.createOscillator()
    this.engineOsc.type = 'sawtooth'
    this.engineOsc.frequency.value = 42
    this.engineFilter = ctx.createBiquadFilter()
    this.engineFilter.type = 'lowpass'
    this.engineFilter.frequency.value = 260
    this.engineFilter.Q.value = 3.5
    this.engineGain = ctx.createGain()
    this.engineGain.gain.value = 0
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain)
    this.engineGain.connect(this.master)
    this.engineGain.connect(this.verb)
    this.engineOsc.start(now)

    this.ready = true
    this.master.gain.setTargetAtTime(0.55, now, 1.4)
    ctx.resume()
  }

  /** A rising-then-falling filtered noise sweep: the sound of an edit. */
  whoosh(strength = 1) {
    const { ctx } = this
    const now = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true

    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 1.1
    band.frequency.setValueAtTime(320, now)
    band.frequency.exponentialRampToValueAtTime(2600, now + 0.42)
    band.frequency.exponentialRampToValueAtTime(420, now + 1.15)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.075 * strength, now + 0.3)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2)

    src.connect(band).connect(gain)
    gain.connect(this.master)
    gain.connect(this.verb)
    src.start(now)
    src.stop(now + 1.3)
  }

  /** A soft low thud, kept for the two shots that actually reveal something. */
  impact() {
    const { ctx } = this
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(64, now)
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.7)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1)

    osc.connect(gain).connect(this.master)
    osc.start(now)
    osc.stop(now + 1.2)
  }

  /**
   * Move to a shot. Called by the director on each cut, which is why the music
   * lands with the picture rather than near it.
   */
  setShot(index, shot) {
    if (!this.ready) return
    this.shot = index
    const { ctx } = this
    const now = ctx.currentTime
    const chord = PROGRESSION[index % PROGRESSION.length]

    // Glide rather than jump: a hard chord change on every cut would chop.
    this.voices.forEach((v, i) => {
      for (const o of v.oscs) o.frequency.setTargetAtTime(freq(chord[i]), now, 0.45)
    })
    this.sub.frequency.setTargetAtTime(freq(chord[0] - 12), now, 0.45)

    const driving = Boolean(shot?.drive)
    this.subGain.gain.setTargetAtTime(driving ? 0.15 : 0.03, now, driving ? 1.1 : 2.0)

    if (index > 0) this.whoosh(driving ? 1.15 : 0.85)
    // The rise to overhead and the hero push-in are the two beats worth marking.
    if (index === 3 || index === 6) this.impact()
  }

  /** Fade out and rest, without tearing down the graph. */
  release() {
    if (!this.ready) return
    const now = this.ctx.currentTime
    this.master.gain.setTargetAtTime(0.16, now, 1.6)
    this.subGain.gain.setTargetAtTime(0.0, now, 1.6)
  }

  resume() {
    if (!this.ready) return
    this.master.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.8)
  }

  mute() {
    if (!this.ready) return
    this.master.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.4)
  }

  /**
   * Drive the engine from normalised speed (0..1). Called every frame while
   * driving, so the ramps are short and the pitch follows the throttle.
   */
  engine(speed) {
    if (!this.ready) return
    const now = this.ctx.currentTime
    const s = Math.min(Math.max(speed, 0), 1)
    this.engineOsc.frequency.setTargetAtTime(40 + s * 78, now, 0.09)
    this.engineFilter.frequency.setTargetAtTime(240 + s * 900, now, 0.12)
    this.engineGain.gain.setTargetAtTime(0.05 + s * 0.10, now, 0.12)
  }

  /** Cut the engine when leaving drive mode. */
  engineOff() {
    if (!this.ready) return
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25)
  }

  /** RMS of what is currently reaching the output. */
  level() {
    if (!this.ready) return 0
    this.analyser.getFloatTimeDomainData(this.probe)
    let sum = 0
    for (const v of this.probe) sum += v * v
    return Math.sqrt(sum / this.probe.length)
  }
}
