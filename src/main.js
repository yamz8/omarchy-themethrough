import * as THREE from 'three'
import themes from './themes.json'
import { buildLayout, buildSlotGeometry, buildPlainGeometry } from './wordmark.js'
import { loadTexture, imageUrl } from './textures.js'
import { Director } from './director.js'
import './style.css'

const canvas = document.querySelector('#scene')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x06070a)
scene.fog = new THREE.Fog(0x06070a, 90, 260)

const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 500)
const director = new Director(camera)

scene.add(new THREE.AmbientLight(0xffffff, 0.75))
const key = new THREE.DirectionalLight(0xffffff, 0.95)
key.position.set(-30, 40, 20)
scene.add(key)

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(800, 800),
  new THREE.MeshStandardMaterial({ color: 0x0a0c11, roughness: 1, metalness: 0 }),
)
floor.rotation.x = -Math.PI / 2
floor.position.y = -0.02
scene.add(floor)

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

// --- loading, then roll ---
const status = document.querySelector('#status')
let done = 0
pending.forEach((p) => p.then(() => {
  done++
  status.textContent = `loading ${done}/${pending.length}`
}))

Promise.all(pending).then(() => {
  status.textContent = ''
  document.body.classList.add('ready', 'lit')
  // Autoplay: the page is the film, so it starts itself once the last
  // background is in. The fade-up covers the first frame.
  setTimeout(() => roll(), 700)
})

// --- the film ---
const playButton = document.querySelector('#play')
const playLabel = playButton.querySelector('.label')
director.onEnd = () => {
  // Stay on the closing frame; only the letterbox retracts.
  document.body.classList.remove('rolling')
  playLabel.textContent = 'replay'
}

function roll() {
  playLabel.textContent = 'replay'
  document.body.classList.add('rolling')
  director.play()
}

playButton.addEventListener('click', roll)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!director.playing) roll() }
})

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

// --- loop ---
renderer.setAnimationLoop(() => {
  director.update()
  renderer.render(scene, camera)
})
