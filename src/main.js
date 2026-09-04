import * as THREE from 'three'
import themes from './themes.json'
import {
  wordmark, buildLayout, buildSlotGeometry, buildPlainGeometry,
} from './wordmark.js'
import { loadTexture, imageUrl } from './textures.js'
import { CameraRig, frameTopView } from './camera-rig.js'
import './style.css'

const canvas = document.querySelector('#scene')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x08090c)
scene.fog = new THREE.Fog(0x08090c, 70, 190)

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 500)
frameTopView(camera)
const rig = new CameraRig(camera)

scene.add(new THREE.AmbientLight(0xffffff, 0.75))
const key = new THREE.DirectionalLight(0xffffff, 0.95)
key.position.set(-30, 40, 20)
scene.add(key)

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(800, 800),
  new THREE.MeshStandardMaterial({ color: 0x0c0e13, roughness: 1, metalness: 0 }),
)
floor.rotation.x = -Math.PI / 2
floor.position.y = -0.02
scene.add(floor)

const grid = new THREE.GridHelper(800, 200, 0x1b2030, 0x12151d)
scene.add(grid)

// --- build the wordmark ---
const clusters = buildLayout(themes)
const wordGroup = new THREE.Group()
const imageMaterials = []
const pending = []

for (const cluster of clusters) {
  const { theme, blocks, plain } = cluster

  // One image per block, drawn whole across it. No background is repeated.
  blocks.forEach((block, i) => {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
    imageMaterials.push(material)
    wordGroup.add(new THREE.Mesh(buildSlotGeometry(block), material))
    pending.push(
      loadTexture(imageUrl(theme, theme.images[i]))
        .then((tex) => { material.map = tex; material.needsUpdate = true })
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

// --- loading ---
const status = document.querySelector('#status')
let done = 0
pending.forEach((p) => p.then(() => {
  done++
  status.textContent = `loading backgrounds ${done}/${pending.length}`
}))
Promise.all(pending).then(() => {
  document.body.classList.add('ready')
  status.textContent = ''
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
const dimColor = new THREE.Color(0xffffff)

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05)
  rig.update()

  // Hold the fills back a touch in the overhead view so the word reads as a shape.
  const target = rig.state === 'top' ? 0.84 : 1
  dimColor.r += (target - dimColor.r) * Math.min(1, dt * 3)
  dimColor.setScalar(dimColor.r)
  for (const m of imageMaterials) m.color.copy(dimColor)

  const li = rig.currentLetter()
  if (li !== lastLetter) {
    lastLetter = li
    if (li >= 0) {
      label.textContent = wordmark.letters[li].ch
      themeLabel.textContent = clusters
        .filter((c) => c.letterIndex === li)
        .map((c) => c.theme.name)
        .join(' · ')
    }
  }

  renderer.render(scene, camera)
})
