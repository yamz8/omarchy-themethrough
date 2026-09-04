import * as THREE from 'three'

const loader = new THREE.TextureLoader()

export function loadTexture(url) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.generateMipmaps = true
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.anisotropy = 8
        resolve(tex)
      },
      undefined,
      reject,
    )
  })
}

/**
 * Unlit material that crossfades between two images. `brightness` lets the
 * intro view dim the fills so the wordmark reads as a shape first.
 */
export function createFadeMaterial(accent) {
  return new THREE.ShaderMaterial({
    uniforms: {
      mapA: { value: null },
      mapB: { value: null },
      fade: { value: 0 },
      ready: { value: 0 },
      brightness: { value: 1 },
      accent: { value: new THREE.Color(accent) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D mapA;
      uniform sampler2D mapB;
      uniform float fade;
      uniform float ready;
      uniform float brightness;
      uniform vec3 accent;
      varying vec2 vUv;

      void main() {
        // Before the first image lands, show the theme's accent colour.
        vec3 a = texture2D(mapA, vUv).rgb;
        vec3 b = texture2D(mapB, vUv).rgb;
        vec3 img = mix(a, b, clamp(fade, 0.0, 1.0));
        vec3 col = mix(accent, img, ready);
        gl_FragColor = vec4(col * brightness, 1.0);
      }
    `,
  })
}

/**
 * Drives one cluster's image cycle: swaps in the next background every
 * `interval` seconds with a crossfade, loading images on demand.
 */
export class ImageCycle {
  constructor(theme, material) {
    this.theme = theme
    this.material = material
    this.urls = theme.images.map((f) => `${import.meta.env.BASE_URL}bg/${theme.name}/${f}`)
    this.cache = new Map()
    this.index = 0
    this.fading = false
    this.elapsed = 0
    this.loadingNext = false
  }

  async get(i) {
    const url = this.urls[i % this.urls.length]
    if (!this.cache.has(url)) this.cache.set(url, loadTexture(url))
    return this.cache.get(url)
  }

  /** Load and show the first image. */
  async start() {
    const tex = await this.get(0)
    this.material.uniforms.mapA.value = tex
    this.material.uniforms.mapB.value = tex
    this.material.uniforms.ready.value = 1
  }

  update(dt, interval, fadeTime) {
    if (this.urls.length < 2) return
    this.elapsed += dt

    if (!this.fading && this.elapsed > interval && !this.loadingNext) {
      this.loadingNext = true
      this.get(this.index + 1).then((tex) => {
        this.material.uniforms.mapB.value = tex
        this.material.uniforms.fade.value = 0
        this.fading = true
        this.loadingNext = false
      })
    }

    if (this.fading) {
      const u = this.material.uniforms
      u.fade.value += dt / fadeTime
      if (u.fade.value >= 1) {
        u.mapA.value = u.mapB.value
        u.fade.value = 0
        this.fading = false
        this.elapsed = 0
        this.index++
      }
    }
  }
}
