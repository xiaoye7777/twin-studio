<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch, type WatchStopHandle } from 'vue'
import {
  AmbientLight,
  Box3,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three'
import type { Object3D } from 'three'
import { applySceneTransform, serializeSceneDocument } from '@/domain/scene'
import type { SceneAssetInstanceV1, SceneDocumentV1, ScenePrimitiveV1 } from '@/domain/scene'
import { setEditorMetadata } from '@/editor/editorMetadata'
import { ImportedAssetResourceRegistry } from '@/editor/services/ImportedAssetResourceRegistry'
import { SelectionManager } from '@/editor/services/SelectionManager'
import { TransformManager } from '@/editor/services/TransformManager'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { MeteorScene } from '@/infrastructure/meteor3d'
import { LocalSceneRepository } from '@/infrastructure/scenes'
import { useEditorStore } from '@/stores/editor'

const props = defineProps<{ projectId: string; projectName: string }>()

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
const importedModelCount = ref(0)
const latestImportName = ref('')
const latestImportAnimations = ref(0)
const latestImportRootBid = ref('')
const sceneLoadedFromStorage = ref(false)
const lastSavedInstanceCount = ref(0)
const lastSavedPrimitiveCount = ref(0)
const sceneDocumentDebugJson = ref('')

const editorStore = useEditorStore()
const { selectedObject } = storeToRefs(editorStore)
const assetRepository = new IndexedDbAssetRepository()
const sceneRepository = new LocalSceneRepository()
const importedAssetResources = new ImportedAssetResourceRegistry()

let meteorScene: MeteorScene | null = null
let selectionManager: SelectionManager | null = null
let transformManager: TransformManager | null = null
let testCube: Mesh | null = null
let stopSelectionWatch: WatchStopHandle | null = null
let stopTransformModeWatch: WatchStopHandle | null = null
let stopTransformRevisionWatch: WatchStopHandle | null = null
let stopModelImportWatch: WatchStopHandle | null = null
let stopSceneSaveWatch: WatchStopHandle | null = null
let unmounted = false
let nextModelOffsetX = 2.5
let importQueue = Promise.resolve()
let saveQueue = Promise.resolve()

const selectedLabel = computed(() => {
  editorStore.sceneRevision
  if (!editorStore.selectedObject) return '未选择对象'
  return `${editorStore.selectedObject.name || 'Object3D'} · ${editorStore.selectedBid ?? 'No BID'}`
})

function createPlatformId(prefix: 'instance' | 'node'): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`
}

function syncCubeTransform(): void {
  if (!testCube) return
  cubePosition.value = testCube.position.toArray().map((value) => value.toFixed(3)).join(',')
  cubeRotation.value = [testCube.rotation.x, testCube.rotation.y, testCube.rotation.z]
    .map((value) => value.toFixed(3)).join(',')
  cubeScale.value = testCube.scale.toArray().map((value) => value.toFixed(3)).join(',')
}

function uniqueModelName(preferredName: string): string {
  const usedNames = new Set(editorStore.sceneRoots.map((object) => object.name))
  if (!usedNames.has(preferredName)) return preferredName
  let suffix = 2
  while (usedNames.has(`${preferredName} (${suffix})`)) suffix += 1
  return `${preferredName} (${suffix})`
}

function createBoxPrimitive(saved?: ScenePrimitiveV1): Mesh {
  const cube = new Mesh(
    new BoxGeometry(1.4, 1.4, 1.4),
    new MeshStandardMaterial({
      color: saved?.properties.color ?? 0x3b82f6,
      roughness: 0.35,
      metalness: 0.08,
    }),
  )
  cube.name = saved?.name ?? 'Demo Cube'
  setEditorMetadata(cube, {
    kind: 'primitive',
    nodeId: saved?.nodeId ?? createPlatformId('node'),
    primitiveType: 'box',
  })
  if (saved) {
    applySceneTransform(cube, saved.transform)
    if (saved.runtimeBid) cube.userData.bid = saved.runtimeBid
  } else {
    cube.position.y = 0.7
  }
  return cube
}

function indexAssetNodes(root: Object3D): Map<string, Object3D> {
  const nodes = new Map<string, Object3D>()
  root.traverse((node) => {
    if (typeof node.userData.assetNodeId === 'string') {
      nodes.set(node.userData.assetNodeId, node)
    }
  })
  return nodes
}

async function restoreAssetInstance(
  runtime: MeteorScene,
  instance: SceneAssetInstanceV1,
): Promise<Object3D | null> {
  const asset = await assetRepository.get(instance.assetId)
  if (!asset) {
    console.warn(`Scene restore skipped missing asset: ${instance.assetId}`)
    return null
  }

  const resource = importedAssetResources.getOrCreate(asset)
  const model = await runtime.loadGLTFModel(resource.objectUrl)
  model.name = instance.name
  setEditorMetadata(model, {
    kind: 'assetInstance',
    assetRoot: true,
    assetId: instance.assetId,
    instanceId: instance.instanceId,
  })
  applySceneTransform(model, instance.transform)
  if (instance.runtimeBid) model.userData.bid = instance.runtimeBid

  const nodes = indexAssetNodes(model)
  for (const override of instance.nodeOverrides) {
    const node = nodes.get(override.assetNodeId)
    if (!node) {
      console.warn(`Scene restore skipped missing asset node: ${override.assetNodeId}`)
      continue
    }
    node.name = override.name
    applySceneTransform(node, override.transform)
    if (override.runtimeBid) node.userData.bid = override.runtimeBid
    editorStore.markObjectModified(node)
  }

  if (!runtime.addObject(model)) throw new Error(`Meteor3D 无法恢复模型 ${instance.name}`)
  importedModelCount.value += 1
  return model
}

async function restoreScene(runtime: MeteorScene, document: SceneDocumentV1): Promise<Object3D[]> {
  const roots: Object3D[] = []
  for (const primitive of document.primitives) {
    const object = createBoxPrimitive(primitive)
    if (!runtime.addObject(object)) throw new Error(`Meteor3D 无法恢复 Primitive ${primitive.name}`)
    roots.push(object)
    if (!testCube && object instanceof Mesh) testCube = object
  }
  for (const instance of document.instances) {
    try {
      const object = await restoreAssetInstance(runtime, instance)
      if (object) roots.push(object)
    } catch (error) {
      console.warn(`Scene instance restore failed: ${instance.instanceId}`, error)
    }
  }
  return roots
}

async function importModel(file: File): Promise<void> {
  const runtime = meteorScene
  if (!runtime || unmounted) return
  const loadingMessage = ElMessage({ message: `正在导入 ${file.name}…`, type: 'info', duration: 0 })

  try {
    const asset = await assetRepository.saveFile(file)
    const resource = importedAssetResources.getOrCreate(asset)
    const model = await runtime.loadGLTFModel(resource.objectUrl)
    if (unmounted) return

    model.name = uniqueModelName(model.name.trim() || resource.displayName)
    setEditorMetadata(model, {
      kind: 'assetInstance',
      assetRoot: true,
      assetId: asset.id,
      instanceId: createPlatformId('instance'),
    })
    model.updateMatrixWorld(true)
    const size = new Box3().setFromObject(model).getSize(new Vector3())
    model.position.x += nextModelOffsetX
    nextModelOffsetX += Math.max(size.x * 1.2, 2.5)

    if (!runtime.addObject(model)) throw new Error('Meteor3D 拒绝将模型加入场景')
    editorStore.setSceneRoots([...editorStore.sceneRoots, model])
    editorStore.selectObject(model)
    importedModelCount.value += 1
    latestImportName.value = model.name
    latestImportAnimations.value = model.animations.length
    latestImportRootBid.value = typeof model.userData.bid === 'string' ? model.userData.bid : ''
    if (latestImportRootBid.value) await runtime.focusObject(latestImportRootBid.value)
    ElMessage.success(`${model.name} 导入成功`)
  } catch (error) {
    if (!unmounted) ElMessage.error(error instanceof Error ? error.message : '模型导入失败')
  } finally {
    loadingMessage.close()
  }
}

async function saveScene(): Promise<void> {
  try {
    const document = serializeSceneDocument({
      projectId: props.projectId,
      projectName: props.projectName,
      roots: editorStore.sceneRoots,
      modifiedObjects: editorStore.modifiedObjects,
    })
    await sceneRepository.save(document)
    sceneDocumentDebugJson.value = JSON.stringify(document)
    lastSavedInstanceCount.value = document.instances.length
    lastSavedPrimitiveCount.value = document.primitives.length
    ElMessage.success('场景已保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '场景保存失败')
  }
}

function disposeEditorRuntime(): void {
  stopSelectionWatch?.()
  stopTransformModeWatch?.()
  stopTransformRevisionWatch?.()
  stopModelImportWatch?.()
  stopSceneSaveWatch?.()
  stopSelectionWatch = null
  stopTransformModeWatch = null
  stopTransformRevisionWatch = null
  stopModelImportWatch = null
  stopSceneSaveWatch = null
  selectionManager?.dispose()
  transformManager?.dispose()
  selectionManager = null
  transformManager = null
  editorStore.clearSelection()
  editorStore.setSceneRoots([])
  editorStore.clearPendingModelImport()
  editorStore.clearModifiedObjects()
  importedAssetResources.dispose()
  meteorScene?.dispose()
  meteorScene = null
  testCube = null
  cameraControlsEnabled.value = false
}

onMounted(async () => {
  const canvas = canvasRef.value
  if (!canvas) return
  editorStore.clearSelection()
  editorStore.clearModifiedObjects()
  const runtime = new MeteorScene(canvas)
  meteorScene = runtime

  try {
    await runtime.initialize()
    if (unmounted) return
    runtime.setGridHelper(true, 30, 30, 30, 30)
    cameraControlsEnabled.value = runtime.isCameraControlsEnabled()
    runtime.addObject(new AmbientLight(0xffffff, 1.3))
    const directionalLight = new DirectionalLight(0xffffff, 2.4)
    directionalLight.position.set(5, 8, 4)
    runtime.addObject(directionalLight)

    let roots: Object3D[] = []
    try {
      const document = await sceneRepository.load(props.projectId)
      if (document) {
        sceneDocumentDebugJson.value = JSON.stringify(document)
        roots = await restoreScene(runtime, document)
        sceneLoadedFromStorage.value = true
      }
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '本地场景恢复失败')
    }

    if (!sceneLoadedFromStorage.value) {
      const cube = createBoxPrimitive()
      if (!runtime.addObject(cube)) throw new Error('Meteor3D rejected the demo cube')
      testCube = cube
      roots.push(cube)
    }
    editorStore.setSceneRoots(roots)
    syncCubeTransform()

    const transforms = new TransformManager(runtime, {
      onAxisChange: (axis) => { transformAxis.value = axis ?? '' },
      onDraggingChange: (dragging) => {
        transformDragging.value = dragging
        cameraControlsEnabled.value = runtime.isCameraControlsEnabled()
        if (dragging) lastCameraConflictCheck.value = cameraControlsEnabled.value ? 'fail' : 'pass'
      },
      onObjectChange: (object) => editorStore.notifyTransformChanged('gizmo', object),
    })
    transformManager = transforms
    selectionManager = new SelectionManager({
      canvas,
      meteorScene: runtime,
      editorStore,
      getSelectableRoots: () => editorStore.sceneRoots,
      shouldIgnorePointer: () => transforms.isPointerInteractionActive(),
    })
    stopSelectionWatch = watch(selectedObject, (object) => {
      if (object) transforms.attach(object)
      else transforms.detach()
    }, { immediate: true })
    stopTransformModeWatch = watch(() => editorStore.transformMode, (mode) => transforms.setMode(mode), { immediate: true })
    stopTransformRevisionWatch = watch(() => editorStore.transformRevision, syncCubeTransform)
    stopModelImportWatch = watch(() => editorStore.modelImportRevision, () => {
      const file = editorStore.pendingModelFile
      if (file) importQueue = importQueue.then(() => importModel(file))
    })
    stopSceneSaveWatch = watch(() => editorStore.sceneSaveRevision, () => {
      saveQueue = saveQueue.then(saveScene)
    })
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
    :data-imported-model-count="importedModelCount"
    :data-latest-import-name="latestImportName"
    :data-latest-import-animations="latestImportAnimations"
    :data-latest-import-root-bid="latestImportRootBid"
    :data-scene-loaded-from-storage="sceneLoadedFromStorage ? 'true' : 'false'"
    :data-last-saved-instance-count="lastSavedInstanceCount"
    :data-last-saved-primitive-count="lastSavedPrimitiveCount"
    class="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-900"
  >
    <canvas ref="canvasRef" class="block h-full w-full" />
    <pre data-testid="scene-document-debug" class="hidden">{{ sceneDocumentDebugJson }}</pre>

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
