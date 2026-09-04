import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import './style.css'

const canvas = document.querySelector('#scene')

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0b0d12)
scene.fog = new THREE.FogExp2(0x0b0d12, 0.07)

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
)
camera.position.set(3.5, 2.5, 5)

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.autoRotate = true
controls.autoRotateSpeed = 0.6

// Central solid, plus a wireframe shell a hair larger so the edges stay visible.
const geometry = new THREE.IcosahedronGeometry(1.4, 1)

const core = new THREE.Mesh(
  geometry,
  new THREE.MeshStandardMaterial({
    color: 0x3b6ea5,
    roughness: 0.35,
    metalness: 0.6,
    flatShading: true,
  }),
)
scene.add(core)

const shell = new THREE.LineSegments(
  new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.45, 1)),
  new THREE.LineBasicMaterial({ color: 0x7fb3e8, transparent: true, opacity: 0.3 }),
)
scene.add(shell)

// A drift of points to give the empty space some depth.
const starCount = 1200
const positions = new Float32Array(starCount * 3)
for (let i = 0; i < starCount; i++) {
  positions[i * 3 + 0] = (Math.random() - 0.5) * 30
  positions[i * 3 + 1] = (Math.random() - 0.5) * 30
  positions[i * 3 + 2] = (Math.random() - 0.5) * 30
}
const stars = new THREE.Points(
  new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3),
  ),
  new THREE.PointsMaterial({ color: 0x8899aa, size: 0.035, sizeAttenuation: true }),
)
scene.add(stars)

scene.add(new THREE.AmbientLight(0xffffff, 0.4))

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2)
keyLight.position.set(4, 6, 3)
scene.add(keyLight)

const rimLight = new THREE.PointLight(0xff8a5c, 25, 20)
rimLight.position.set(-4, -2, -4)
scene.add(rimLight)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

const clock = new THREE.Clock()

renderer.setAnimationLoop(() => {
  const elapsed = clock.getElapsedTime()

  core.rotation.y = elapsed * 0.15
  shell.rotation.y = elapsed * 0.15
  shell.rotation.x = elapsed * 0.05
  stars.rotation.y = elapsed * 0.01

  controls.update()
  renderer.render(scene, camera)
})
