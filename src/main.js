import * as THREE from 'three'
import themes from './themes.json'
import { buildLayout, buildSlotGeometry, buildPlainGeometry } from './wordmark.js'
import { loadTexture, imageUrl } from './textures.js'
import { Director } from './director.js'
import { Score } from './score.js'
import { Car } from './car.js'
import { buildTunnels, RIM } from './tunnels.js'
import './style.css'

// `?capture` turns the page into a render target for the promo film: fixed
// resolution, no interface, and the take written out of the browser. The
// harness itself is pulled in on demand at the bottom of this file.
const capturing = new URLSearchParams(location.search).has('capture')

const canvas = document.querySelector('#scene')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace

const BASE_SCENE_COLOR = new THREE.Color(0x06070a)
const WHITE = new THREE.Color(0xffffff)
const scene = new THREE.Scene()
scene.background = BASE_SCENE_COLOR.clone()
scene.fog = new THREE.Fog(BASE_SCENE_COLOR, 90, 260)

const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 500)
// `?cut=<name>` swaps the camera language for comparison; see CUTS.
const director = new Director(camera, new URLSearchParams(location.search).get('cut'))

const ambient = new THREE.AmbientLight(0xffffff, 0.75)
scene.add(ambient)
const key = new THREE.DirectionalLight(0xffffff, 0.95)
key.position.set(-30, 40, 20)
scene.add(key)

// Two grounds. The film gets an endless plane; drive mode gets a large disc
// hidden behind the closed cave chambers, so the mountain world has no horizon.
const ground = new THREE.MeshStandardMaterial({ color: 0x0a0c11, roughness: 1, metalness: 0 })

const floorPlane = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), ground)
floorPlane.rotation.x = -Math.PI / 2
floorPlane.position.y = -0.02
scene.add(floorPlane)

const floorDisc = new THREE.Mesh(new THREE.CircleGeometry(RIM, 96), ground)
floorDisc.rotation.x = -Math.PI / 2
floorDisc.position.y = -0.02
floorDisc.visible = false
scene.add(floorDisc)

// --- build the wordmark ---
const clusters = buildLayout(themes)
const wordGroup = new THREE.Group()
const imageMaterials = []
const pending = []

// Every loaded texture, keyed by theme, so the tunnels can line their bores
// from the same images without fetching anything twice.
const themeTextures = new Map(themes.map((t) => [t.name, new Array(t.images.length).fill(null)]))

for (const cluster of clusters) {
  const { theme, blocks, plain } = cluster

  // One image per block, drawn whole across it. No background is repeated.
  blocks.forEach((block, i) => {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
    imageMaterials.push(material)
    wordGroup.add(new THREE.Mesh(buildSlotGeometry(block), material))
    pending.push(
      loadTexture(imageUrl(theme, theme.images[i]))
        .then((tex) => {
          material.map = tex
          material.needsUpdate = true
          themeTextures.get(theme.name)[i] = tex
        })
        .catch(() => {}),
    )
  })

  if (plain.length) {
    wordGroup.add(new THREE.Mesh(
      buildPlainGeometry(plain),
      // Square uncovered tiles can only cover about 78% of a letter, so the
      // rest shows as mat. Key it off the theme's accent rather than its
      // background: most backgrounds are near-black and the letterform breaks
      // into disconnected strips.
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(theme.accent).multiplyScalar(0.6),
        toneMapped: false,
      }),
    ))
  }

  cluster.shown = blocks.length
}
scene.add(wordGroup)

const shown = clusters.reduce((a, c) => a + c.shown, 0)
const total = themes.reduce((a, t) => a + t.images.length, 0)
const short = clusters.filter((c) => c.blocks.length < c.theme.images.length)
console.log(`[themethrough] ${clusters.length} themes, ${shown}/${total} images shown, ${imageMaterials.length} blocks`)
if (short.length) {
  console.warn('[themethrough] too few blocks:', short.map((c) => `${c.theme.name} ${c.blocks.length}<${c.theme.images.length}`).join(', '))
}

// --- loading, then roll ---
const status = document.querySelector('#status')
let done = 0
pending.forEach((p) => p.then(() => {
  done++
  status.textContent = `loading ${done}/${pending.length}`
}))

const loaded = Promise.all(pending).then(() => {
  status.textContent = ''
  document.body.classList.add('ready', 'lit')
  // Autoplay: the page is the film, so it starts itself once the last
  // background is in. The fade-up covers the first frame.
  // The drive control is already live during the fade. Do not let the delayed
  // autoplay restart the film behind drive mode if it is clicked in that gap.
  if (!capturing) setTimeout(() => { if (!driving) roll() }, 700)
})

// --- the film ---
const playButton = document.querySelector('#play')
const playLabel = playButton.querySelector('.label')
// --- sound ---------------------------------------------------------------
// The score is part of the film, so it starts with it. Browsers still gate
// audible playback on a gesture, so the graph is built up front and the first
// touch of the page — click, key, wheel — joins the score at the current shot
// rather than restarting the film: no jolt, and the cuts from here on still
// land together.
const score = new Score()

function startSound() {
  try {
    score.start()
    const i = Math.max(director.shotIndex, 0)
    score.setShot(i, director.shots[i])
    score.resume()
  } catch {
    // No audio device, or the context was refused — the film is fine silent.
  }
}

const WAKE_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart']

function wakeSound() {
  startSound()
  // `resume()` only settles once the context is actually running, so the
  // listeners come off after the gesture that worked, not the one that asked.
  score.ctx?.resume().then(() => {
    if (!score.running) return
    for (const e of WAKE_EVENTS) window.removeEventListener(e, wakeSound)
  }, () => {})
}

startSound()
if (!score.running) {
  for (const e of WAKE_EVENTS) window.addEventListener(e, wakeSound)
}

director.onShot = (shot, i) => {
  score.setShot(i, shot)
}

director.onEnd = () => {
  // Stay on the closing frame; only the letterbox retracts.
  document.body.classList.remove('rolling')
  playLabel.textContent = 'replay'
  score.release()
}

function roll() {
  playLabel.textContent = 'replay'
  document.body.classList.add('rolling')
  director.play()
  score.resume()
}

playButton.addEventListener('click', roll)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!director.playing) roll() }
})

window.addEventListener('resize', () => {
  if (capturing) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

// --- drive ---------------------------------------------------------------
// A second mode: drop the car in and drive it over the letters.
const car = new Car()
car.root.visible = false
scene.add(car.root)

const driveButton = document.querySelector('#drive')
const input = { throttle: 0, steer: 0, brake: false }
const held = new Set()
let driving = false

const themeReveal = document.querySelector('#theme-reveal')
const caveTheme = document.querySelector('#cave-theme')
const caveMood = document.querySelector('#cave-mood')
const themeCommand = document.querySelector('#theme-command')
const copyTheme = document.querySelector('#copy-theme')
let revealedTheme = ''
let copyReset = 0

const caveLooks = new Map(themes.map((theme) => {
  const accent = new THREE.Color(theme.accent)
  const fog = new THREE.Color(theme.bg)
  if (theme.mode === 'light') fog.multiplyScalar(0.16)
  else fog.lerp(accent, 0.12).multiplyScalar(0.58)
  return [theme.name, {
    fog,
    light: accent.clone().lerp(new THREE.Color(0xffffff), 0.28),
    ambient: accent.clone().lerp(new THREE.Color(0xffffff), 0.62),
  }]
}))

function titleCaseTheme(name) {
  return name.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
}

function showThemeChamber(cave) {
  const visible = cave?.progress > 0.76
  document.body.classList.toggle('at-theme-chamber', visible)
  themeReveal.setAttribute('aria-hidden', String(!visible))
  if (!visible || revealedTheme === cave.theme.name) return

  revealedTheme = cave.theme.name
  caveTheme.textContent = titleCaseTheme(cave.theme.name)
  caveMood.textContent = cave.style.label
  themeCommand.textContent = `omarchy theme set ${cave.theme.name}`
  copyTheme.textContent = 'copy command'
}

copyTheme.addEventListener('click', async () => {
  const command = themeCommand.textContent
  try {
    await navigator.clipboard.writeText(command)
    copyTheme.textContent = 'copied'
  } catch {
    copyTheme.textContent = 'copy failed'
  }
  clearTimeout(copyReset)
  copyReset = setTimeout(() => { copyTheme.textContent = 'copy command' }, 1800)
})

// A little fill light, so the car reads as a solid object against a scene lit
// almost entirely for flat, unlit picture tiles.
const carLight = new THREE.DirectionalLight(0xffffff, 1.1)
carLight.position.set(6, 14, 8)
carLight.visible = false
scene.add(carLight)

const chaseEye = new THREE.Vector3()
const chaseAim = new THREE.Vector3()

// Built on first entry, not at load: the textures have to be in already, and
// the film never shows them.
let tunnels = null
function ensureTunnels() {
  if (tunnels) return
  tunnels = buildTunnels(themes, themeTextures)
  tunnels.group.visible = false
  scene.add(tunnels.group)
  car.constrain = tunnels.constrain
}

function readInput() {
  input.throttle = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) +
    (held.has('KeyS') || held.has('ArrowDown') ? -1 : 0)
  input.steer = (held.has('KeyA') || held.has('ArrowLeft') ? -1 : 0) +
    (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0)
  input.brake = held.has('Space')
}

function updateCaveExperience(cave, dt) {
  const inside = Boolean(cave && cave.progress > 0.02)
  const look = inside ? caveLooks.get(cave.theme.name) : null
  const k = 1 - Math.exp(-2.6 * dt)

  scene.background.lerp(look?.fog ?? BASE_SCENE_COLOR, k)
  scene.fog.color.lerp(look?.fog ?? BASE_SCENE_COLOR, k)
  scene.fog.near = THREE.MathUtils.lerp(scene.fog.near, inside ? 24 : 90, k)
  scene.fog.far = THREE.MathUtils.lerp(scene.fog.far, inside ? 118 : 260, k)
  carLight.color.lerp(look?.light ?? WHITE, k)
  ambient.color.lerp(look?.ambient ?? WHITE, k)
  showThemeChamber(cave)
}

function setDriving(on) {
  // Built before anything is shown: on the first entry the group does not yet
  // exist, so setting visibility ahead of this left the tunnels hidden.
  if (on) ensureTunnels()

  driving = on
  document.body.classList.toggle('driving', on)
  document.body.classList.toggle('rolling', false)
  car.root.visible = on
  carLight.visible = on
  floorDisc.visible = on
  floorPlane.visible = !on
  if (tunnels) tunnels.group.visible = on
  driveButton.querySelector('.label').textContent = on ? 'exit' : 'drive'

  if (on) {
    director.stop()
    car.reset()
    // Start the chase behind where the car will land, so the first frame is
    // already framed rather than snapping into place.
    const c = car.chase()
    chaseEye.copy(c.pos)
    chaseAim.copy(c.target)
    // Come back up first. Driving is nearly always entered from the end of
    // the film, and the film ends by running the outro, which ramps the master
    // gain to zero — so without this the car is silent, engine included, since
    // the engine is routed through that same master. Setting a chord on a
    // muted bus changes nothing you can hear.
    score.resume()
    // Borrow a driving shot's voicing, since that is what the car is doing.
    // Found rather than numbered: the cut list is re-cut from time to time.
    const i = director.shots.findIndex((s) => s.drive)
    score.setShot(Math.max(i, 0), director.shots[Math.max(i, 0)])
  } else {
    held.clear()
    playLabel.textContent = 'replay'
    score.engineOff()
    revealedTheme = ''
    showThemeChamber(null)
    scene.background.copy(BASE_SCENE_COLOR)
    scene.fog.color.copy(BASE_SCENE_COLOR)
    scene.fog.near = 90
    scene.fog.far = 260
    carLight.color.set(0xffffff)
    ambient.color.set(0xffffff)
  }
}

driveButton.addEventListener('click', () => setDriving(!driving))

window.addEventListener('keydown', (e) => {
  if (!driving) return
  if (e.code === 'Escape') { setDriving(false); return }
  held.add(e.code)
  // Arrows and space scroll the page otherwise.
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
})
window.addEventListener('keyup', (e) => held.delete(e.code))
window.addEventListener('blur', () => held.clear())

// A handle for inspecting or tweaking playback from the console.
window.themethrough = { director, score, car, held, input, renderer, scene }

// --- loop ---
// The body is named rather than inline so capture mode can step it by hand
// against a clock of its own, instead of waiting on the display.
let lastFrame = 0

function frame() {
  const now = performance.now()
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 1 / 60
  lastFrame = now

  if (driving) {
    readInput()
    car.update(dt, input)

    // Damped chase, on the same frame-rate independent constant the film uses,
    // so the follow eases rather than snapping to the car each frame.
    const c = car.chase()
    const k = 1 - Math.exp(-4.5 * dt)
    chaseEye.lerp(c.pos, k)
    chaseAim.lerp(c.target, 1 - Math.exp(-7 * dt))
    camera.position.copy(chaseEye)
    camera.up.set(0, 1, 0)
    camera.lookAt(chaseAim)

    carLight.position.set(car.pos.x + 6, 14, car.pos.z + 8)
    carLight.target.position.copy(car.pos)
    carLight.target.updateMatrixWorld()

    updateCaveExperience(tunnels.locate(car.pos), dt)

    score.engine(Math.abs(car.speed) / 20)
  } else {
    director.update()
  }

  renderer.render(scene, camera)
}

renderer.setAnimationLoop(frame)

if (capturing) {
  import('./capture.js').then(({ startCapture }) =>
    startCapture({ renderer, camera, canvas, director, score, roll, loaded, frame }))
}
