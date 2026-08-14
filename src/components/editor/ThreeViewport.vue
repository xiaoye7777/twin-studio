<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const containerRef = ref<HTMLDivElement>()

let renderer: THREE.WebGLRenderer | undefined
let scene: THREE.Scene | undefined
let camera: THREE.PerspectiveCamera | undefined
let controls: OrbitControls | undefined
let resizeObserver: ResizeObserver | undefined
let animationFrame = 0

function resizeViewport() {
  const container = containerRef.value
  if (!container || !renderer || !camera) return
  const width = Math.max(container.clientWidth, 1)
  const height = Math.max(container.clientHeight, 1)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, false)
}

onMounted(() => {
  const container = containerRef.value
  if (!container) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x111827)

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
  camera.position.set(6, 5, 7)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(0, 0.75, 0)
  controls.update()

  const grid = new THREE.GridHelper(30, 30, 0x4b6385, 0x26354b)
  scene.add(grid)

  const axes = new THREE.AxesHelper(2)
  scene.add(axes)

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.25)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 2.2)
  directionalLight.position.set(4, 8, 5)
  directionalLight.castShadow = true
  scene.add(directionalLight)

  const geometry = new THREE.BoxGeometry(2, 2, 2)
  const material = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    roughness: 0.36,
    metalness: 0.1,
  })
  const cube = new THREE.Mesh(geometry, material)
  cube.name = 'Demo Cube'
  cube.position.y = 1
  cube.castShadow = true
  scene.add(cube)

  const floorGeometry = new THREE.PlaneGeometry(30, 30)
  const floorMaterial = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.18 })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  resizeObserver = new ResizeObserver(resizeViewport)
  resizeObserver.observe(container)
  resizeViewport()

  const render = () => {
    animationFrame = requestAnimationFrame(render)
    controls?.update()
    if (renderer && scene && camera) renderer.render(scene, camera)
  }
  render()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  controls?.dispose()

  scene?.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => material.dispose())
  })

  if (renderer) {
    renderer.renderLists.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
  }

  renderer = undefined
  scene = undefined
  camera = undefined
  controls = undefined
})
</script>

<template>
  <div ref="containerRef" class="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-900">
    <div class="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-slate-950/65 px-2.5 py-1.5 text-[11px] text-slate-400 backdrop-blur">
      透视视图 · Orbit Controls
    </div>
    <div class="pointer-events-none absolute bottom-3 right-3 z-10 text-[10px] text-slate-500">
      左键旋转 · 右键平移 · 滚轮缩放
    </div>
  </div>
</template>
