import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

const CACHE_PREFIX = 'twin-studio:thumb:v1:'
let renderer: WebGLRenderer | null = null
let queue: Promise<unknown> = Promise.resolve()

/**
 * A small product-shot thumbnail of a glTF model, rendered offscreen once and cached in localStorage. One
 * shared renderer, one model at a time, so the library never competes with the main viewport for the GPU.
 */
export function modelThumbnail(key: string, url: string): Promise<string | null> {
  const cached = localStorage.getItem(CACHE_PREFIX + key)
  if (cached) return Promise.resolve(cached)
  const task = queue
    .then(() => render(url))
    .then(image => {
      if (image) {
        try {
          localStorage.setItem(CACHE_PREFIX + key, image)
        } catch {
          // Quota: thumbnails are a convenience; render again next time.
        }
      }
      return image
    })
  queue = task.catch(() => null)
  return task.catch(() => null)
}

async function render(url: string): Promise<string | null> {
  if (!renderer) {
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 180
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.setPixelRatio(1)
    renderer.setSize(240, 180, false)
  }
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync(url)
  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04)
  scene.environment = environment.texture
  scene.add(new HemisphereLight(0xffffff, 0x404040, 1.2))
  const sun = new DirectionalLight(0xffffff, 2.2)
  sun.position.set(3, 5, 4)
  scene.add(sun)
  scene.add(gltf.scene)
  const box = new Box3().setFromObject(gltf.scene)
  const size = box.getSize(new Vector3()).length() || 1
  const center = box.getCenter(new Vector3())
  const camera = new PerspectiveCamera(30, 240 / 180, size / 100, size * 10)
  camera.position.copy(center).add(new Vector3(1, 0.75, 1.15).normalize().multiplyScalar(size * 1.55))
  camera.lookAt(center)
  renderer.setClearColor(0x000000, 0)
  renderer.render(scene, camera)
  const image = renderer.domElement.toDataURL('image/webp', 0.86)
  gltf.scene.traverse(node => {
    const mesh = node as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] }
    mesh.geometry?.dispose()
    for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [])
      material.dispose()
  })
  environment.dispose()
  pmrem.dispose()
  return image
}
