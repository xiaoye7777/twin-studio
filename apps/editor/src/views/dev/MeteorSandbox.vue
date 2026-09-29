<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import {
  getLastMeteorDisposeDiagnostics,
  MeteorScene,
  type MeteorRuntimeDiagnostics,
} from '@/infrastructure/meteor3d'

const canvasRef = ref<HTMLCanvasElement>()
const previousDispose = getLastMeteorDisposeDiagnostics()

const state = reactive({
  initializing: true,
  error: '',
  sceneManager: false,
  renderer: false,
  camera: false,
  controls: false,
  grid: false,
  cube: false,
  ambientLight: false,
  directionalLight: false,
  bid: '',
  findObjectByBid: false,
  resize: false,
  rendererSize: '—',
  cameraPosition: '—',
  threeVersion: '—',
  sharedThreeInstance: false,
  raycastBefore: '—',
  raycastAfterImport: '—',
  raycastAfterInitialization: '—',
  raycastChangedDuringImport: false,
  raycastDiffersFromBaseline: false,
})

let meteorScene: MeteorScene | null = null
let diagnosticsTimer = 0
let unmounted = false

function applyDiagnostics(diagnostics: MeteorRuntimeDiagnostics) {
  state.sceneManager = diagnostics.sceneManager
  state.renderer = diagnostics.renderer
  state.camera = diagnostics.camera
  state.controls = diagnostics.controls
  state.grid = diagnostics.grid
  state.resize = diagnostics.resize
  state.rendererSize = diagnostics.rendererSize
  state.cameraPosition = diagnostics.cameraPosition.map((value) => value.toFixed(2)).join(', ')
  state.threeVersion = diagnostics.threeVersion
  state.sharedThreeInstance = diagnostics.sharedThreeInstance
  state.raycastBefore = diagnostics.raycast.beforeCoreImport
  state.raycastAfterImport = diagnostics.raycast.afterCoreImport
  state.raycastAfterInitialization = diagnostics.raycast.afterManagerInitialization
  state.raycastChangedDuringImport = diagnostics.raycast.changedDuringCoreImport
  state.raycastDiffersFromBaseline = diagnostics.raycast.differsFromAdapterBaseline
}

function refreshDiagnostics() {
  if (!meteorScene) return
  applyDiagnostics(meteorScene.getDiagnostics())
}

const runtimeRows = computed(() => [
  { label: 'SceneManager', value: state.sceneManager ? 'PASS' : 'FAIL', pass: state.sceneManager },
  { label: 'Renderer', value: state.renderer ? 'PASS' : 'FAIL', pass: state.renderer },
  { label: 'Camera', value: state.camera ? 'PASS' : 'FAIL', pass: state.camera },
  { label: 'Controls', value: state.controls ? 'PASS' : 'FAIL', pass: state.controls },
  { label: 'Grid', value: state.grid ? 'PASS' : 'FAIL', pass: state.grid },
  { label: 'Cube', value: state.cube ? 'PASS' : 'FAIL', pass: state.cube },
  { label: 'AmbientLight', value: state.ambientLight ? 'PASS' : 'FAIL', pass: state.ambientLight },
  {
    label: 'DirectionalLight',
    value: state.directionalLight ? 'PASS' : 'FAIL',
    pass: state.directionalLight,
  },
  { label: 'Cube BID', value: state.bid || 'MISSING', pass: Boolean(state.bid) },
  {
    label: 'findObjectByBid',
    value: state.findObjectByBid ? 'PASS' : 'FAIL',
    pass: state.findObjectByBid,
  },
  { label: 'Resize', value: state.resize ? `PASS · ${state.rendererSize}` : 'FAIL', pass: state.resize },
  { label: 'Three.js', value: state.threeVersion, pass: state.threeVersion !== '—' },
  {
    label: 'Three.js shared instance',
    value: state.sharedThreeInstance ? 'PASS' : 'UNPROVEN',
    pass: state.sharedThreeInstance,
  },
])

onMounted(async () => {
  const canvas = canvasRef.value
  if (!canvas) return

  const scene = new MeteorScene(canvas)
  meteorScene = scene

  try {
    await scene.initialize()
    if (unmounted) return

    scene.setGridHelper(true, 30, 30, 30, 30)

    const ambientLight = new AmbientLight(0xffffff, 1.3)
    state.ambientLight = scene.addObject(ambientLight)

    const directionalLight = new DirectionalLight(0xffffff, 2.4)
    directionalLight.position.set(5, 8, 4)
    state.directionalLight = scene.addObject(directionalLight)

    const cube = new Mesh(
      new BoxGeometry(2, 2, 2),
      new MeshStandardMaterial({
        color: 0x3b82f6,
        roughness: 0.35,
        metalness: 0.08,
      }),
    )
    cube.name = 'MeteorSandbox Cube'
    cube.position.y = 1
    state.cube = scene.addObject(cube)

    const bid = typeof cube.userData.bid === 'string' ? cube.userData.bid : ''
    state.bid = bid
    state.findObjectByBid = Boolean(bid && scene.findObjectByBid<Mesh>(bid) === cube)

    refreshDiagnostics()
    diagnosticsTimer = window.setInterval(refreshDiagnostics, 250)
  } catch (error) {
    if (!unmounted) {
      state.error = error instanceof Error ? error.message : String(error)
      scene.dispose()
      meteorScene = null
    }
  } finally {
    state.initializing = false
  }
})

onBeforeUnmount(() => {
  unmounted = true
  window.clearInterval(diagnosticsTimer)
  meteorScene?.dispose()
  meteorScene = null
})
</script>

<template>
  <main class="min-h-screen bg-slate-950 px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
    <section class="mx-auto max-w-6xl overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/30">
      <header class="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div>
          <p class="text-xs font-medium uppercase tracking-[0.22em] text-sky-400">Development Route</p>
          <h1 class="mt-1 text-lg font-semibold">Meteor3D Runtime Sandbox</h1>
        </div>
        <div class="flex items-center gap-2">
          <RouterLink
            data-testid="sandbox-exit"
            to="/projects"
            class="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
          >
            离开 Sandbox
          </RouterLink>
          <span class="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-400">
            /dev/meteor-sandbox
          </span>
        </div>
      </header>

      <div class="relative h-[min(62vh,680px)] min-h-[420px] bg-black">
        <canvas ref="canvasRef" class="block h-full w-full" />
        <div class="pointer-events-none absolute left-4 top-4 rounded-md bg-slate-950/75 px-3 py-2 text-xs text-slate-300 backdrop-blur">
          Grid + native THREE.Mesh
        </div>
        <div class="pointer-events-none absolute bottom-4 right-4 rounded-md bg-slate-950/75 px-3 py-2 text-[11px] text-slate-400 backdrop-blur">
          左键旋转 · 右键平移 · 滚轮缩放
        </div>
        <div v-if="state.initializing" class="absolute inset-0 grid place-items-center bg-slate-950/70 text-sm text-slate-300">
          Initializing @meteor3d/core…
        </div>
      </div>

      <section class="border-t border-slate-800 px-5 py-5">
        <div class="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 class="text-sm font-semibold">Runtime Debug</h2>
            <p class="mt-1 text-xs text-slate-500">Camera: {{ state.cameraPosition }}</p>
          </div>
          <span v-if="state.error" class="rounded bg-rose-500/15 px-2.5 py-1 text-xs text-rose-300">
            {{ state.error }}
          </span>
        </div>

        <dl class="grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
          <div v-for="row in runtimeRows" :key="row.label" class="flex min-w-0 items-center justify-between gap-5 border-b border-slate-800/80 pb-2">
            <dt class="shrink-0 text-slate-400">{{ row.label }}</dt>
            <dd
              class="truncate text-right font-mono text-xs"
              :class="row.pass ? 'text-emerald-400' : 'text-rose-400'"
              :title="row.value"
            >
              {{ row.value }}
            </dd>
          </div>
        </dl>

        <div class="mt-5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs">
          <h3 class="font-semibold text-amber-300">Mesh.prototype.raycast side effect</h3>
          <dl class="mt-3 grid gap-2 text-slate-400 sm:grid-cols-3">
            <div>
              <dt>Before core import</dt>
              <dd class="mt-1 font-mono text-slate-200">{{ state.raycastBefore }}</dd>
            </div>
            <div>
              <dt>After core import</dt>
              <dd class="mt-1 font-mono text-slate-200">{{ state.raycastAfterImport }}</dd>
            </div>
            <div>
              <dt>After manager init</dt>
              <dd class="mt-1 font-mono text-slate-200">{{ state.raycastAfterInitialization }}</dd>
            </div>
          </dl>
          <p class="mt-3 text-amber-200/80">
            Import changed prototype: {{ state.raycastChangedDuringImport ? 'YES' : 'NO' }} ·
            Differs from adapter baseline: {{ state.raycastDiffersFromBaseline ? 'YES' : 'NO' }}
          </p>
        </div>

        <div v-if="previousDispose" class="mt-3 rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-xs text-slate-400">
          Previous route disposal · Manager {{ previousDispose.sceneManagerDisposed ? 'PASS' : 'FAIL' }} ·
          ResizeObserver {{ previousDispose.resizeObserverDisconnected ? 'PASS' : 'FAIL' }} ·
          WebGL context {{ previousDispose.webglContextLost ? 'LOST' : 'NOT OBSERVED' }} ·
          raycast restored {{ previousDispose.raycastRestored ? 'YES' : 'NO' }}
        </div>
      </section>
    </section>
  </main>
</template>
