import * as THREE from 'three'

const loader = new THREE.TextureLoader()

export function loadTexture(url) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.anisotropy = 8
        resolve(tex)
      },
      undefined,
      reject,
    )
  })
}

export const imageUrl = (theme, file) =>
  `${import.meta.env.BASE_URL}bg/${theme.name}/${file}`
