import * as THREE from 'three'
import themes from './themes.json'
import {
  wordmark, assignThemes, buildTopGeometry, buildSideGeometry, HEIGHT,
} from './wordmark.js'
import { createFadeMaterial, ImageCycle } from './textures.js'
import { CameraRig, frameTopView } from './camera-rig.js'
import './style.css'

const THEMES_PER_LETTER = [3, 4, 3, 3, 3, 3, 3]

const canvas = document.querySelector('#scene')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x08090c)
scene.fog = new THREE.Fog(0x08090c, 55, 135)

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 400)
frameTopView(camera)
const rig = new CameraRig(camera)

// --- lights (side walls only; the image tops are unlit) ---
scene.add(new THREE.AmbientLight(0xffffff, 0.75))
const key = new THREE.DirectionalLight(0xffffff, 0.95)
key.position.set(-30, 40, 20)
scene.add(key)

// --- floor ---
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.MeshStandardMaterial({ color: 0x0c0e13, roughness: 1, metalness: 0 }),
)
floor.rotation.x = -Math.PI / 2
floor.position.y = -0.01
scene.add(floor)

const grid = new THREE.GridHelper(600, 150, 0x1b2030, 0x12151d)
grid.position.y = 0
scene.add(grid)

// --- build the wordmark ---
const occupied = new Set()
for (const letter of wordmark.letters) {
  for (const [c, r] of letter.cells) occupied.add(`${c},${r}`)
}

const clusters = assignThemes(themes, THEMES_PER_LETTER)
const cycles = []
const wordGroup = new THREE.Group()

for (const cluster of clusters) {
  const material = createFadeMaterial(cluster.theme.accent)
  const top = new THREE.Mesh(buildTopGeometry(cluster.cells), material)
  top.renderOrder = 1
  wordGroup.add(top)

  const side = new THREE.Mesh(
    buildSideGeometry(cluster.cells, occupied),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(cluster.theme.accent).multiplyScalar(0.32),
      roughness: 0.75,
      metalness: 0.1,
    }),
  )
  wordGroup.add(side)

  cluster.material = material
  cycles.push(new ImageCycle(cluster.theme, material))
}
scene.add(wordGroup)

// --- progressive loading: first image of every theme, then the rest ---
const status = document.querySelector('#status')
let loaded = 0
Promise.all(
  cycles.map((cycle) =>
    cycle.start().then(() => {
      loaded++
      status.textContent = `loading themes ${loaded}/${cycles.length}`
    }).catch(() => { loaded++ }),
  ),
).then(() => {
  document.body.classList.add('ready')
  status.textContent = ''
  // Warm the remaining images in the background so crossfades never stall.
  cycles.forEach((cycle) => cycle.urls.forEach((_, i) => i > 0 && cycle.get(i)))
})

// --- HUD ---
const button = document.querySelector('#enter')
const label = document.querySelector('#letter-label')
const themeLabel = document.querySelector('#theme-label')

button.addEventListener('click', () => rig.start())
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); rig.start() }
})

rig.onStateChange = (s) => {
  document.body.classList.toggle('touring', s !== 'top')
  button.disabled = s !== 'top'
  if (s === 'top') { label.textContent = ''; themeLabel.textContent = '' }
}

// --- resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  frameTopView(camera)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

// --- loop ---
const clock = new THREE.Clock()
let lastLetter = -1

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05)

  rig.update(dt)

  // Images cycle slowly from above, faster and brighter during the flythrough.
  const touring = rig.state === 'touring'
  for (const cycle of cycles) cycle.update(dt, touring ? 5 : 9, 1.4)

  const dim = rig.state === 'top' ? 0.82 : 1
  for (const cluster of clusters) {
    const u = cluster.material.uniforms.brightness
    u.value += (dim - u.value) * Math.min(1, dt * 3)
  }

  const li = rig.currentLetter()
  if (li !== lastLetter) {
    lastLetter = li
    if (li >= 0) {
      label.textContent = wordmark.letters[li].ch
      const names = clusters.filter((c) => c.letterIndex === li).map((c) => c.theme.name)
      themeLabel.textContent = names.join(' · ')
    }
  }

  renderer.render(scene, camera)
})
