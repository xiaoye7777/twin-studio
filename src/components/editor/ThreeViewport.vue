<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch, type WatchStopHandle } from 'vue'
import {
  AmbientLight,
  Box3,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector2,
  Vector3,
} from 'three'
import type { Object3D } from 'three'
import { applySceneTransform, cloneSceneSettings, serializeSceneDocument } from '@/domain/scene'
import type {
  SceneAssetInstanceV1,
  SceneCameraViewV1,
  SceneDocumentV1,
  ScenePrimitiveV1,
  SceneSettingsV1,
} from '@/domain/scene'
import { ASSET_DRAG_MIME, readAssetDragPayload } from '@/editor/assetDrag'
import { findAssetInstanceRoot, getEditorMetadata, setEditorMetadata } from '@/editor/editorMetadata'
import { captureTransform, FunctionalCommand, HistoryManager, PropertyCommand, TransformCommand } from '@/editor/history'
import type { TransformState } from '@/editor/history'
import { ImportedAssetResourceRegistry } from '@/editor/services/ImportedAssetResourceRegistry'
import { BindingTargetResolver, bindingTargetsInObjectTree } from '@/editor/services/BindingTargetResolver'
import { SelectionManager } from '@/editor/services/SelectionManager'
import { TransformManager } from '@/editor/services/TransformManager'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { MeteorScene } from '@/infrastructure/meteor3d'
import { LocalSceneRepository } from '@/infrastructure/scenes'
import { getMockDataSourceDiagnostics, MockDataSource } from '@/infrastructure/data'
import { useEditorStore, type CommonView, type PrimitiveType } from '@/stores/editor'
import { useSceneSettingsStore } from '@/stores/sceneSettings'
import { useTwinStore } from '@/stores/twin'
import type { TwinBinding } from '@/domain/twin'

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
const assetDropLoading = ref(false)
const lastDroppedAssetId = ref('')
const lastDroppedInstanceId = ref('')
const lastDroppedBottomY = ref('')
const activeView = ref('Perspective')
const environmentStatus = ref('None')

const editorStore = useEditorStore()
const sceneSettingsStore = useSceneSettingsStore()
const twinStore = useTwinStore()
const { selectedObject } = storeToRefs(editorStore)
const assetRepository = new IndexedDbAssetRepository()
const sceneRepository = new LocalSceneRepository()
const importedAssetResources = new ImportedAssetResourceRegistry()

let meteorScene: MeteorScene | null = null
let selectionManager: SelectionManager | null = null
let transformManager: TransformManager | null = null
let bindingTargetResolver: BindingTargetResolver | null = null
let mockDataSource: MockDataSource | null = null
let testCube: Mesh | null = null
let ambientLight: AmbientLight | null = null
let directionalLight: DirectionalLight | null = null
let groundMesh: Mesh<PlaneGeometry, MeshStandardMaterial> | null = null
let stopSelectionWatch: WatchStopHandle | null = null
let stopTransformModeWatch: WatchStopHandle | null = null
let stopTransformRevisionWatch: WatchStopHandle | null = null
let stopSceneSaveWatch: WatchStopHandle | null = null
let stopSceneSettingsWatch: WatchStopHandle | null = null
let stopBindingWatch: WatchStopHandle | null = null
let unmounted = false
let saveQueue = Promise.resolve()
let environmentQueue = Promise.resolve()
let appliedEnvironmentAssetId: string | null | undefined
let gizmoTransformBefore: TransformState | null = null
const history = new HistoryManager(() => {
  editorStore.setHistoryState(history.canUndo, history.canRedo)
  if (history.canUndo || history.canRedo) editorStore.setDirty(true)
})

const selectedLabel = computed(() => {
  editorStore.sceneRevision
  if (!editorStore.selectedObject) return '未选择对象'
  return `${editorStore.selectedObject.name || 'Object3D'} · ${editorStore.selectedBid ?? 'No BID'}`
})

const infrastructureCounts = computed(() => {
  sceneSettingsStore.revision
  if (initializing.value || !editorStore.runtimeReady) {
    return { ground: 0, ambient: 0, directional: 0 }
  }
  const scene = meteorScene?.getScene()
  if (!scene) return { ground: 0, ambient: 0, directional: 0 }
  return {
    ground: scene.children.filter((object) => object.name === 'Editor Ground').length,
    ambient: scene.children.filter((object) => object.name === 'Editor Ambient Light').length,
    directional: scene.children.filter((object) => object.name === 'Editor Directional Light').length,
  }
})

const unresolvedBindingCount = computed(() => {
  twinStore.resolutionRevision
  return twinStore.bindings.filter((binding) => twinStore.resolutionByBindingId[binding.id] === 'unresolved').length
})

const mockDiagnostics = computed(() => {
  twinStore.mockRunning
  twinStore.mockTickCount
  return getMockDataSourceDiagnostics()
})

const bindingResolverDiagnostics = computed(() => {
  twinStore.resolutionRevision
  return bindingTargetResolver?.getDiagnostics() ?? { platformLookupCount: 0, meteorLookupCount: 0 }
})

function createPlatformId(prefix: 'instance' | 'node'): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`
}

function captureInitialTransforms(root: Object3D): void {
  root.traverse((object) => { object.userData.editorInitialTransform = captureTransform(object) })
}

function notifyTransform(object: Object3D): void {
  editorStore.notifyTransformChanged('inspector', object)
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

function createPrimitive(type: PrimitiveType, saved?: ScenePrimitiveV1): Mesh {
  const color = saved?.properties.color ?? (type === 'plane' ? 0x64748b : type === 'cylinder' ? 0x10b981 : 0x3b82f6)
  let geometry: BoxGeometry | PlaneGeometry | CylinderGeometry
  if (type === 'plane') {
    geometry = new PlaneGeometry(saved?.properties.width ?? 10, saved?.properties.height ?? 10)
    geometry.rotateX(-Math.PI / 2)
  } else if (type === 'cylinder') {
    const height = saved?.properties.height ?? 1
    geometry = new CylinderGeometry(
      saved?.properties.radiusTop ?? 0.5,
      saved?.properties.radiusBottom ?? 0.5,
      height,
      saved?.properties.radialSegments ?? 32,
    )
    geometry.translate(0, height / 2, 0)
  } else {
    const width = saved?.properties.width ?? 1
    const height = saved?.properties.height ?? 1
    const depth = saved?.properties.depth ?? 1
    geometry = new BoxGeometry(width, height, depth)
    geometry.translate(0, height / 2, 0)
  }

  const object = new Mesh(
    geometry,
    new MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 }),
  )
  object.name = saved?.name ?? uniqueModelName(type === 'box' ? 'Box' : type === 'plane' ? 'Plane' : 'Cylinder')
  setEditorMetadata(object, {
    kind: 'primitive',
    nodeId: saved?.nodeId ?? createPlatformId('node'),
    primitiveType: type,
  })
  if (saved) {
    applySceneTransform(object, saved.transform)
    if (saved.runtimeBid) object.userData.bid = saved.runtimeBid
  }
  object.visible = saved?.visible ?? true
  object.userData.editorInitialTransform = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  } satisfies TransformState
  return object
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
    deletedAssetNodeIds: [...(instance.deletedAssetNodeIds ?? [])],
  })
  captureInitialTransforms(model)
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
    node.visible = override.visible ?? true
    if (override.runtimeBid) node.userData.bid = override.runtimeBid
    editorStore.markObjectModified(node)
  }
  for (const assetNodeId of instance.deletedAssetNodeIds ?? []) nodes.get(assetNodeId)?.removeFromParent()
  model.visible = instance.visible ?? true

  if (!runtime.addObject(model)) throw new Error(`Meteor3D 无法恢复模型 ${instance.name}`)
  importedModelCount.value += 1
  return model
}

async function restoreScene(runtime: MeteorScene, document: SceneDocumentV1): Promise<Object3D[]> {
  const roots: Object3D[] = []
  for (const primitive of document.primitives) {
    const object = createPrimitive(primitive.type, primitive)
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

function installSceneInfrastructure(runtime: MeteorScene): void {
  const scene = runtime.getScene()
  ambientLight = new AmbientLight(0xffffff)
  ambientLight.name = 'Editor Ambient Light'
  ambientLight.userData.editorInfrastructure = true
  directionalLight = new DirectionalLight(0xffffff)
  directionalLight.name = 'Editor Directional Light'
  directionalLight.userData.editorInfrastructure = true
  scene.add(ambientLight, directionalLight)
}

function updateGround(runtime: MeteorScene, settings: SceneSettingsV1): void {
  if (!groundMesh) {
    const geometry = new PlaneGeometry(1, 1)
    geometry.rotateX(-Math.PI / 2)
    groundMesh = new Mesh(
      geometry,
      new MeshStandardMaterial({
        color: settings.ground.color,
        roughness: 0.92,
        metalness: 0,
      }),
    )
    groundMesh.name = 'Editor Ground'
    groundMesh.position.y = -0.01
    groundMesh.receiveShadow = true
    groundMesh.userData.editorInfrastructure = true
    runtime.getScene().add(groundMesh)
  }
  groundMesh.visible = settings.ground.enabled
  groundMesh.scale.set(settings.ground.size, 1, settings.ground.size)
  groundMesh.material.color.set(settings.ground.color)
  groundMesh.updateMatrixWorld(true)
}

async function applyEnvironment(runtime: MeteorScene, assetId: string | null): Promise<void> {
  if (appliedEnvironmentAssetId === assetId) return
  if (!assetId) {
    runtime.clearEnvironment()
    appliedEnvironmentAssetId = null
    environmentStatus.value = 'None'
    return
  }

  const asset = await assetRepository.get(assetId)
  if (!asset) throw new Error('保存的环境资产不存在')
  if (asset.assetType !== 'environment') throw new Error('选择的资产不是环境贴图')
  const resource = importedAssetResources.getOrCreate(asset)
  const texture = await runtime.loadEnvironment(resource.objectUrl)
  if (!texture || unmounted) return
  appliedEnvironmentAssetId = assetId
  environmentStatus.value = asset.name
}

function applySceneSettings(runtime: MeteorScene, settings: SceneSettingsV1): void {
  const gridSize = Math.max(1, settings.ground.size)
  const segments = Math.max(1, Math.min(200, Math.round(gridSize / 10)))
  runtime.setGridHelper(settings.gridEnabled, gridSize, gridSize, segments, segments)
  runtime.setAxesHelper(settings.axesEnabled, Math.max(5, Math.min(50, gridSize / 10)))
  updateGround(runtime, settings)
  if (ambientLight) ambientLight.intensity = settings.lighting.ambientIntensity
  if (directionalLight) {
    directionalLight.intensity = settings.lighting.directionalIntensity
    directionalLight.position.fromArray(settings.lighting.directionalPosition)
  }

  const requestedAssetId = settings.environmentAssetId
  environmentQueue = environmentQueue
    .then(() => applyEnvironment(runtime, requestedAssetId))
    .catch((error: unknown) => {
      if (!unmounted) {
        runtime.clearEnvironment()
        appliedEnvironmentAssetId = null
        environmentStatus.value = 'Fallback'
        ElMessage.error(error instanceof Error ? error.message : '环境贴图加载失败')
      }
    })
}

function captureCameraView(): SceneCameraViewV1 | undefined {
  const runtime = meteorScene
  if (!runtime) return undefined
  const view = runtime.getView()
  return {
    position: [view.position.x, view.position.y, view.position.z],
    target: [view.target.x, view.target.y, view.target.z],
    fov: runtime.getCamera().fov,
  }
}

async function restoreCameraView(runtime: MeteorScene, view: SceneCameraViewV1): Promise<void> {
  if (view.fov) {
    runtime.getCamera().fov = view.fov
    runtime.getCamera().updateProjectionMatrix()
  }
  await runtime.setView({
    position: { x: view.position[0], y: view.position[1], z: view.position[2] },
    target: { x: view.target[0], y: view.target[1], z: view.target[2] },
    duration: 0,
  })
  activeView.value = 'Saved'
}

async function setCommonView(view: CommonView): Promise<void> {
  const runtime = meteorScene
  if (!runtime) return
  const bounds = new Box3()
  for (const root of editorStore.sceneRoots) bounds.expandByObject(root, true)
  const center = bounds.isEmpty() ? new Vector3() : bounds.getCenter(new Vector3())
  const size = bounds.isEmpty() ? new Vector3(10, 10, 10) : bounds.getSize(new Vector3())
  const radius = Math.max(size.length() / 2, 1)
  const camera = runtime.getCamera()
  const verticalDistance = radius / Math.tan((camera.fov * Math.PI) / 360)
  const distance = Math.max(verticalDistance, radius / Math.max(camera.aspect, 0.1)) * 1.25
  const directions: Record<CommonView, Vector3> = {
    top: new Vector3(0, 1, 0.001),
    front: new Vector3(0, 0, 1),
    right: new Vector3(1, 0, 0),
    perspective: new Vector3(1, 0.75, 1),
  }
  const labels: Record<CommonView, string> = {
    top: 'Top', front: 'Front', right: 'Right', perspective: 'Perspective',
  }
  camera.up.set(0, 1, 0)
  const position = center.clone().addScaledVector(directions[view].normalize(), distance)
  await runtime.setView({
    position: { x: position.x, y: position.y, z: position.z },
    target: { x: center.x, y: center.y, z: center.z },
    duration: 350,
  })
  activeView.value = labels[view]
}

function refreshBindingResolutions(): void {
  const resolver = bindingTargetResolver
  if (!resolver) return
  for (const binding of twinStore.bindings) {
    const status = resolver.resolve(binding.target) ? 'resolved' : 'unresolved'
    const previousStatus = twinStore.resolutionByBindingId[binding.id]
    twinStore.setResolutionStatus(binding.id, status)
    if (status === 'unresolved' && previousStatus !== 'unresolved') {
      console.warn(`Twin binding target unresolved: ${binding.id}`)
    }
  }
}

async function saveScene(): Promise<void> {
  try {
    const document = serializeSceneDocument({
      projectId: props.projectId,
      projectName: props.projectName,
      roots: editorStore.sceneRoots,
      modifiedObjects: editorStore.modifiedObjects,
      sceneSettings: cloneSceneSettings(sceneSettingsStore.settings),
      cameraView: captureCameraView(),
      bindings: twinStore.cloneBindings(),
    })
    await sceneRepository.save(document)
    sceneDocumentDebugJson.value = JSON.stringify(document)
    lastSavedInstanceCount.value = document.instances.length
    lastSavedPrimitiveCount.value = document.primitives.length
    editorStore.setDirty(false)
    ElMessage.success('场景已保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '场景保存失败')
  }
}

async function addRootWithHistory(object: Object3D, label: string): Promise<void> {
  const runtime = meteorScene
  if (!runtime || unmounted) return
  await history.execute(new FunctionalCommand(label, () => {
    if (!runtime.addObject(object)) throw new Error('Meteor3D 拒绝将对象加入场景')
    editorStore.setSceneRoots([...editorStore.sceneRoots, object])
    editorStore.selectObject(object)
  }, () => {
    runtime.removeObject(object)
    editorStore.setSceneRoots(editorStore.sceneRoots.filter((item) => item !== object))
    const selected = editorStore.selectedObject
    let selectedBelongsToRoot = selected === object
    if (selected && !selectedBelongsToRoot) {
      object.traverse((node) => { if (node === selected) selectedBelongsToRoot = true })
    }
    if (selectedBelongsToRoot) editorStore.clearSelection()
  }))
}

async function addPrimitive(type: PrimitiveType): Promise<void> {
  const object = createPrimitive(type)
  await addRootWithHistory(object, `Add ${type}`)
  if (type === 'box' && !testCube) testCube = object
}

function placeObjectOnGround(object: Object3D, groundPoint: Vector3): void {
  object.position.set(groundPoint.x, 0, groundPoint.z)
  object.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(object)
  object.position.y = bounds.isEmpty() ? groundPoint.y : groundPoint.y - bounds.min.y
  object.updateMatrixWorld(true)
}

async function instantiateAsset(assetId: string, groundPoint: Vector3): Promise<Object3D | null> {
  const runtime = meteorScene
  if (!runtime || unmounted) return null
  assetDropLoading.value = true
  try {
    const asset = await assetRepository.get(assetId)
    if (!asset) throw new Error('资产记录不存在，无法创建场景实例')
    const resource = importedAssetResources.getOrCreate(asset)
    const model = await runtime.loadGLTFModel(resource.objectUrl)
    if (unmounted) return null

    const instanceId = createPlatformId('instance')
    model.name = uniqueModelName(model.name.trim() || resource.displayName)
    setEditorMetadata(model, {
      kind: 'assetInstance',
      assetRoot: true,
      assetId,
      instanceId,
      deletedAssetNodeIds: [],
    })
    captureInitialTransforms(model)
    placeObjectOnGround(model, groundPoint)
    await addRootWithHistory(model, 'Add asset instance')

    importedModelCount.value += 1
    latestImportName.value = model.name
    latestImportAnimations.value = model.animations.length
    latestImportRootBid.value = typeof model.userData.bid === 'string' ? model.userData.bid : ''
    lastDroppedAssetId.value = assetId
    lastDroppedInstanceId.value = instanceId
    lastDroppedBottomY.value = new Box3().setFromObject(model).min.y.toFixed(4)
    ElMessage.success(`${model.name} 已放入场景`)
    return model
  } catch (error) {
    if (!unmounted) ElMessage.error(error instanceof Error ? error.message : '模型实例创建失败')
    return null
  } finally {
    assetDropLoading.value = false
  }
}

function handleDragOver(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes(ASSET_DRAG_MIME)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
}

function handleDrop(event: DragEvent): void {
  event.preventDefault()
  const payload = readAssetDragPayload(event.dataTransfer)
  const runtime = meteorScene
  const canvas = canvasRef.value
  if (!payload || !runtime || !canvas) return
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  const screenPosition = new Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  const groundPoint = runtime.raycastGround(screenPosition)
  if (!groundPoint) {
    ElMessage.warning('无法确定放置位置')
    return
  }
  void instantiateAsset(payload.assetId, groundPoint)
}

function refreshRootRegistration(root: Object3D): void {
  if (!meteorScene) return
  meteorScene.removeObject(root)
  meteorScene.addObject(root)
}

async function deleteSelected(): Promise<void> {
  const runtime = meteorScene
  const object = editorStore.selectedObject
  if (!runtime || !object) return
  const isRoot = editorStore.sceneRoots.includes(object)
  const parent = object.parent
  const order = isRoot ? editorStore.sceneRoots.indexOf(object) : (parent?.children.indexOf(object) ?? -1)
  const assetRoot = isRoot ? object : findAssetInstanceRoot(object)
  const metadata = assetRoot ? getEditorMetadata(assetRoot) : null
  const assetNodeId = typeof object.userData.assetNodeId === 'string' ? object.userData.assetNodeId : null
  const bindingTargets = bindingTargetsInObjectTree(object)
  let removedBindings: TwinBinding[] = []

  const remove = () => {
    removedBindings = twinStore.removeBindingsForTargets(bindingTargets)
    runtime.removeObject(object)
    if (isRoot) editorStore.setSceneRoots(editorStore.sceneRoots.filter((item) => item !== object))
    else if (metadata?.kind === 'assetInstance' && assetNodeId && !metadata.deletedAssetNodeIds.includes(assetNodeId)) metadata.deletedAssetNodeIds.push(assetNodeId)
    editorStore.clearSelection()
    editorStore.notifySceneChanged()
  }
  const restore = () => {
    if (isRoot) {
      runtime.addObject(object)
      const roots = [...editorStore.sceneRoots]
      roots.splice(Math.max(0, Math.min(order, roots.length)), 0, object)
      editorStore.setSceneRoots(roots)
    } else if (parent && assetRoot) {
      parent.add(object)
      const current = parent.children.indexOf(object)
      parent.children.splice(current, 1)
      parent.children.splice(Math.max(0, order), 0, object)
      if (metadata?.kind === 'assetInstance' && assetNodeId) metadata.deletedAssetNodeIds = metadata.deletedAssetNodeIds.filter((id) => id !== assetNodeId)
      refreshRootRegistration(assetRoot)
      editorStore.notifySceneChanged()
    }
    twinStore.restoreBindings(removedBindings)
    editorStore.selectObject(object)
  }
  await history.execute(new FunctionalCommand('Delete', remove, restore))
}

async function createDuplicate(root: Object3D): Promise<Object3D | null> {
  const metadata = getEditorMetadata(root)
  if (metadata?.kind === 'primitive') {
    return createPrimitive(metadata.primitiveType, {
      nodeId: createPlatformId('node'), type: metadata.primitiveType, name: `${root.name} Copy`,
      transform: { position: [root.position.x + 0.5, root.position.y, root.position.z + 0.5], rotation: [root.rotation.x, root.rotation.y, root.rotation.z], scale: [root.scale.x, root.scale.y, root.scale.z] },
      properties: { color: '#3b82f6' }, visible: root.visible,
    })
  }
  if (metadata?.kind !== 'assetInstance' || !meteorScene) return null
  const asset = await assetRepository.get(metadata.assetId)
  if (!asset) return null
  const duplicate = await meteorScene.loadGLTFModel(importedAssetResources.getOrCreate(asset).objectUrl)
  duplicate.name = `${root.name} Copy`
  duplicate.position.copy(root.position).add(new Vector3(0.5, 0, 0.5))
  duplicate.rotation.copy(root.rotation)
  duplicate.scale.copy(root.scale)
  setEditorMetadata(duplicate, { kind: 'assetInstance', assetRoot: true, assetId: metadata.assetId, instanceId: createPlatformId('instance'), deletedAssetNodeIds: [] })
  captureInitialTransforms(duplicate)
  return duplicate
}

async function duplicateSelected(): Promise<void> {
  const selected = editorStore.selectedObject
  if (!selected) return
  if (!editorStore.sceneRoots.includes(selected)) { ElMessage.info('暂不支持复制 GLB 内部子节点'); return }
  const duplicate = await createDuplicate(selected)
  if (!duplicate || !meteorScene) return
  const runtime = meteorScene
  await history.execute(new FunctionalCommand('Duplicate', () => {
    runtime.addObject(duplicate); editorStore.setSceneRoots([...editorStore.sceneRoots, duplicate]); editorStore.selectObject(duplicate)
  }, () => {
    runtime.removeObject(duplicate); editorStore.setSceneRoots(editorStore.sceneRoots.filter((item) => item !== duplicate)); editorStore.clearSelection()
  }))
}

function installEditorActions(transforms: TransformManager): void {
  editorStore.setActions({
    undo: () => { void history.undo() }, redo: () => { void history.redo() },
    deleteSelected: () => { void deleteSelected() }, duplicateSelected: () => { void duplicateSelected() },
    toggleVisibility: (object) => { const before = object.visible; void history.execute(new PropertyCommand('Visibility', before, !before, (value) => { object.visible = value; editorStore.notifySceneChanged(object) })) },
    resetSelectedTransform: () => { const object = editorStore.selectedObject; const initial = object?.userData.editorInitialTransform as TransformState | undefined; if (object && initial) void history.execute(new TransformCommand(object, captureTransform(object), initial, notifyTransform)) },
    focusSelected: () => { if (editorStore.selectedBid) void meteorScene?.focusObject(editorStore.selectedBid) },
    fitScene: () => { void meteorScene?.fitScene() }, setSnap: (value) => transforms.setSnap(value),
    commitRename: (object, before, after) => { if (before !== after) void history.execute(new PropertyCommand('Rename', before, after, (value) => { object.name = value; editorStore.notifySceneChanged(object) }), true) },
    commitTransform: (object, before, after) => { void history.execute(new TransformCommand(object, before, after, notifyTransform), true) },
    addPrimitive: (type) => { void addPrimitive(type) },
    instantiateAsset: (assetId) => { void instantiateAsset(assetId, new Vector3()) },
    setCommonView: (view) => { void setCommonView(view) },
  })
}

function disposeEditorRuntime(): void {
  stopSelectionWatch?.()
  stopTransformModeWatch?.()
  stopTransformRevisionWatch?.()
  stopSceneSaveWatch?.()
  stopSceneSettingsWatch?.()
  stopBindingWatch?.()
  stopSelectionWatch = null
  stopTransformModeWatch = null
  stopTransformRevisionWatch = null
  stopSceneSaveWatch = null
  stopSceneSettingsWatch = null
  stopBindingWatch = null
  mockDataSource?.stop()
  mockDataSource = null
  twinStore.setMockRunning(false)
  bindingTargetResolver = null
  selectionManager?.dispose()
  transformManager?.dispose()
  selectionManager = null
  transformManager = null
  editorStore.clearSelection()
  editorStore.setSceneRoots([])
  editorStore.clearModifiedObjects()
  editorStore.setActions(null)
  history.clear()
  editorStore.setDirty(false)
  if (meteorScene && (ambientLight || groundMesh)) {
    meteorScene.clearEnvironment()
    if (groundMesh) {
      groundMesh.removeFromParent()
      groundMesh.geometry.dispose()
      groundMesh.material.dispose()
    }
    ambientLight?.removeFromParent()
    directionalLight?.removeFromParent()
  }
  meteorScene?.dispose()
  meteorScene = null
  importedAssetResources.dispose()
  groundMesh = null
  ambientLight = null
  directionalLight = null
  appliedEnvironmentAssetId = undefined
  testCube = null
  cameraControlsEnabled.value = false
  sceneSettingsStore.resetProject(props.projectId)
  twinStore.resetProject(props.projectId)
}

onMounted(async () => {
  const canvas = canvasRef.value
  if (!canvas) return
  editorStore.clearSelection()
  editorStore.clearModifiedObjects()
  sceneSettingsStore.initializeProject(props.projectId)
  twinStore.initializeProject(props.projectId)
  const runtime = new MeteorScene(canvas)
  meteorScene = runtime

  try {
    await runtime.initialize()
    if (unmounted) return
    cameraControlsEnabled.value = runtime.isCameraControlsEnabled()
    installSceneInfrastructure(runtime)

    let roots: Object3D[] = []
    let restoredDocument: SceneDocumentV1 | null = null
    try {
      const document = await sceneRepository.load(props.projectId)
      if (document) {
        restoredDocument = document
        sceneSettingsStore.initializeProject(props.projectId, document.sceneSettings)
        twinStore.initializeProject(props.projectId, document.bindings ?? [])
        sceneDocumentDebugJson.value = JSON.stringify(document)
        roots = await restoreScene(runtime, document)
        sceneLoadedFromStorage.value = true
      }
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '本地场景恢复失败')
    }

    if (!sceneLoadedFromStorage.value) {
      const cube = createPrimitive('box')
      if (!runtime.addObject(cube)) throw new Error('Meteor3D rejected the demo cube')
      testCube = cube
      roots.push(cube)
    }
    applySceneSettings(runtime, sceneSettingsStore.settings)
    editorStore.setSceneRoots(roots)
    bindingTargetResolver = new BindingTargetResolver(() => editorStore.sceneRoots, runtime)
    stopBindingWatch = watch(() => twinStore.bindingRevision, refreshBindingResolutions, { immediate: true })
    mockDataSource = new MockDataSource({
      getBindings: () => twinStore.bindings.filter(
        (binding) => twinStore.resolutionByBindingId[binding.id] === 'resolved',
      ),
      setRuntimeValue: (bindingId, variableKey, value) => {
        twinStore.setRuntimeValue(bindingId, variableKey, value)
      },
      onTick: () => twinStore.recordMockTick(),
    })
    mockDataSource.start()
    twinStore.setMockRunning(true)
    syncCubeTransform()
    if (restoredDocument?.cameraView) await restoreCameraView(runtime, restoredDocument.cameraView)

    const transforms = new TransformManager(runtime, {
      onAxisChange: (axis) => { transformAxis.value = axis ?? '' },
      onDraggingChange: (dragging) => {
        transformDragging.value = dragging
        cameraControlsEnabled.value = runtime.isCameraControlsEnabled()
        if (dragging) lastCameraConflictCheck.value = cameraControlsEnabled.value ? 'fail' : 'pass'
        const object = editorStore.selectedObject
        if (dragging && object) gizmoTransformBefore = captureTransform(object)
        if (!dragging && object && gizmoTransformBefore) {
          void history.execute(new TransformCommand(object, gizmoTransformBefore, captureTransform(object), notifyTransform), true)
          gizmoTransformBefore = null
        }
      },
      onObjectChange: (object) => editorStore.notifyTransformChanged('gizmo', object),
    })
    transformManager = transforms
    installEditorActions(transforms)
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
    stopSceneSettingsWatch = watch(() => sceneSettingsStore.revision, () => {
      applySceneSettings(runtime, sceneSettingsStore.settings)
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
    :data-asset-drop-loading="assetDropLoading ? 'true' : 'false'"
    :data-last-dropped-asset-id="lastDroppedAssetId"
    :data-last-dropped-instance-id="lastDroppedInstanceId"
    :data-last-dropped-bottom-y="lastDroppedBottomY"
    :data-scene-root-count="editorStore.sceneRoots.length"
    :data-runtime-ready="editorStore.runtimeReady ? 'true' : 'false'"
    :data-active-view="activeView"
    :data-grid-enabled="sceneSettingsStore.settings.gridEnabled ? 'true' : 'false'"
    :data-axes-enabled="sceneSettingsStore.settings.axesEnabled ? 'true' : 'false'"
    :data-ground-enabled="sceneSettingsStore.settings.ground.enabled ? 'true' : 'false'"
    :data-environment-status="environmentStatus"
    :data-ground-mesh-count="infrastructureCounts.ground"
    :data-ambient-light-count="infrastructureCounts.ambient"
    :data-directional-light-count="infrastructureCounts.directional"
    :data-twin-binding-count="twinStore.bindings.length"
    :data-unresolved-binding-count="unresolvedBindingCount"
    :data-mock-running="twinStore.mockRunning ? 'true' : 'false'"
    :data-mock-tick-count="twinStore.mockTickCount"
    :data-active-mock-timers="mockDiagnostics.activeTimerCount"
    :data-binding-platform-lookups="bindingResolverDiagnostics.platformLookupCount"
    :data-binding-meteor-lookups="bindingResolverDiagnostics.meteorLookupCount"
    :data-scene-dirty="editorStore.isDirty ? 'true' : 'false'"
    class="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-900"
    @dragover="handleDragOver"
    @drop="handleDrop"
  >
    <canvas ref="canvasRef" class="block h-full w-full" />
    <pre data-testid="scene-document-debug" class="hidden">{{ sceneDocumentDebugJson }}</pre>

    <div class="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-slate-950/70 px-2.5 py-1.5 text-[11px] text-slate-400 backdrop-blur">
      {{ activeView }} View · Meteor3D Runtime
    </div>
    <div class="pointer-events-none absolute left-3 top-12 z-10 max-w-[360px] truncate rounded-md bg-slate-950/70 px-2.5 py-1.5 font-mono text-[10px] text-sky-300 backdrop-blur">
      {{ selectedLabel }} · {{ editorStore.transformMode }}
    </div>
    <div v-if="unresolvedBindingCount" class="pointer-events-none absolute left-3 top-[84px] z-10 rounded-md bg-amber-950/80 px-2.5 py-1.5 text-[10px] text-amber-300 backdrop-blur">
      {{ unresolvedBindingCount }} 个设备绑定未解析
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
