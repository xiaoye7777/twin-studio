<script setup lang="ts">
import { storeToRefs } from 'pinia'
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type WatchStopHandle,
} from 'vue'
import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import type { Object3D } from 'three'
import { SelectionManager } from '@/editor/services/SelectionManager'
import { TransformManager } from '@/editor/services/TransformManager'
import { MeteorScene } from '@/infrastructure/meteor3d'
import { useEditorStore } from '@/stores/editor'

const canvasRef = ref<HTMLCanvasElement>()
const initializing = ref(true)
const initializationError = ref('')
const transformDragging = ref(false)
const transformAxis = ref('')
const cameraControlsEnabled = ref(false)
const lastCameraConflictCheck = ref('not-tested')
const cubePosition = ref('—')
const cubeRotation = ref('—')
const cubeScale = ref('—')

const editorStore = useEditorStore()
const { selectedObject } = storeToRefs(editorStore)

let meteorScene: MeteorScene | null = null
let selectionManager: SelectionManager | null = null
let transformManager: TransformManager | null = null
let testCube: Mesh | null = null
let selectableRoots: Object3D[] = []
let stopSelectionWatch: WatchStopHandle | null = null
let stopTransformModeWatch: WatchStopHandle | null = null
let unmounted = false

const selectedLabel = computed(() => {
  if (!editorStore.selectedObject) return '未选择对象'
  return `${editorStore.selectedObject.name || 'Object3D'} · ${editorStore.selectedBid ?? 'No BID'}`
})

function syncCubeTransform(): void {
  if (!testCube) return

  cubePosition.value = testCube.position.toArray().map((value) => value.toFixed(3)).join(',')
  cubeRotation.value = [testCube.rotation.x, testCube.rotation.y, testCube.rotation.z]
    .map((value) => value.toFixed(3))
    .join(',')
  cubeScale.value = testCube.scale.toArray().map((value) => value.toFixed(3)).join(',')
}

function disposeEditorRuntime(): void {
  stopSelectionWatch?.()
  stopTransformModeWatch?.()
  stopSelectionWatch = null
  stopTransformModeWatch = null

  selectionManager?.dispose()
  transformManager?.dispose()
  selectionManager = null
  transformManager = null

  editorStore.clearSelection()
  meteorScene?.dispose()
  meteorScene = null
  testCube = null
  selectableRoots = []
  cameraControlsEnabled.value = false
}

onMounted(async () => {
  const canvas = canvasRef.value
  if (!canvas) return

  editorStore.clearSelection()
  const runtime = new MeteorScene(canvas)
  meteorScene = runtime

  try {
    await runtime.initialize()
    if (unmounted) return

    runtime.setGridHelper(true, 30, 30, 30, 30)
    cameraControlsEnabled.value = runtime.isCameraControlsEnabled()

    const ambientLight = new AmbientLight(0xffffff, 1.3)
    runtime.addObject(ambientLight)

    const directionalLight = new DirectionalLight(0xffffff, 2.4)
    directionalLight.position.set(5, 8, 4)
    runtime.addObject(directionalLight)

    const cube = new Mesh(
      new BoxGeometry(1.4, 1.4, 1.4),
      new MeshStandardMaterial({
        color: 0x3b82f6,
        roughness: 0.35,
        metalness: 0.08,
      }),
    )
    cube.name = 'Demo Cube'
    cube.position.y = 0.7

    if (!runtime.addObject(cube)) throw new Error('Meteor3D rejected the demo cube')

    testCube = cube
    selectableRoots = [cube]
    syncCubeTransform()

    const transforms = new TransformManager(runtime, {
      onAxisChange: (axis) => {
        transformAxis.value = axis ?? ''
      },
      onDraggingChange: (dragging) => {
        transformDragging.value = dragging
        cameraControlsEnabled.value = runtime.isCameraControlsEnabled()
        if (dragging) {
          lastCameraConflictCheck.value = cameraControlsEnabled.value ? 'fail' : 'pass'
        }
      },
      onObjectChange: syncCubeTransform,
    })
    transformManager = transforms

    selectionManager = new SelectionManager({
      canvas,
      meteorScene: runtime,
      editorStore,
      getSelectableRoots: () => selectableRoots,
      shouldIgnorePointer: () => transforms.isPointerInteractionActive(),
    })

    stopSelectionWatch = watch(
      selectedObject,
      (object) => {
        if (object) transforms.attach(object)
        else transforms.detach()
      },
      { immediate: true },
    )

    stopTransformModeWatch = watch(
      () => editorStore.transformMode,
      (mode) => transforms.setMode(mode),
      { immediate: true },
    )
  } catch (error) {
    if (!unmounted) {
      initializationError.value = error instanceof Error ? error.message : String(error)
      disposeEditorRuntime()
    }
  } finally {
    initializing.value = false
  }
})

onBeforeUnmount(() => {
  unmounted = true
  disposeEditorRuntime()
})
</script>

<template>
  <div
    data-testid="editor-viewport"
    :data-selected-bid="editorStore.selectedBid ?? ''"
    :data-transform-mode="editorStore.transformMode"
    :data-transform-attached="editorStore.selectedObject ? 'true' : 'false'"
    :data-transform-dragging="transformDragging ? 'true' : 'false'"
    :data-transform-axis="transformAxis"
    :data-camera-controls-enabled="cameraControlsEnabled ? 'true' : 'false'"
    :data-last-camera-conflict-check="lastCameraConflictCheck"
    :data-cube-position="cubePosition"
    :data-cube-rotation="cubeRotation"
    :data-cube-scale="cubeScale"
    class="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-900"
  >
    <canvas ref="canvasRef" class="block h-full w-full" />

    <div class="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-slate-950/70 px-2.5 py-1.5 text-[11px] text-slate-400 backdrop-blur">
      透视视图 · Meteor3D Runtime
    </div>
    <div class="pointer-events-none absolute left-3 top-12 z-10 max-w-[360px] truncate rounded-md bg-slate-950/70 px-2.5 py-1.5 font-mono text-[10px] text-sky-300 backdrop-blur">
      {{ selectedLabel }} · {{ editorStore.transformMode }}
    </div>
    <div class="pointer-events-none absolute bottom-3 right-3 z-10 text-[10px] text-slate-500">
      点击选择 · 左键旋转 · 右键平移 · 滚轮缩放
    </div>

    <div v-if="initializing" class="absolute inset-0 z-20 grid place-items-center bg-slate-950/70 text-xs text-slate-300">
      正在初始化 Meteor3D Runtime…
    </div>
    <div v-else-if="initializationError" class="absolute inset-0 z-20 grid place-items-center bg-slate-950/85 px-8 text-center text-sm text-rose-300">
      {{ initializationError }}
    </div>
  </div>
</template>
