import { Group, type Mesh, type MeshStandardMaterial, type Object3D } from 'three'
import {
  applySceneTransform,
  type ModelNodeV2,
  type PrimitiveNodeV2,
  type SceneDocumentV2,
  type SceneNodeV2,
  type SceneTransformV1,
  serializeTransform,
} from '../../domain/scene'
import type { AssetRepository } from '../../infrastructure/assets/AssetRepository'
import type { TwinEngine } from '../../engine/TwinEngine'
import { ImportedAssetResourceRegistry } from './ImportedAssetResourceRegistry'
import {
  applyPrimitiveMaterial,
  createAreaObject,
  createLabelObject,
  createLightObject,
  createPathObject,
  createPrimitiveObject,
  disposeOwned,
  primitiveGeometry,
  updateLabelObject,
  updateLightObject,
} from './nodeObjects'
import { setEditorMetadata } from './objectMetadata'

/** The parts of the engine a scene document is rendered through. TwinEngine satisfies it; tests fake it. */
export type SceneHost = Pick<
  TwinEngine,
  'addObject' | 'removeObject' | 'loadGLTFModel' | 'getScene' | 'applySettings' | 'setHelpers' | 'flyTo'
> & { readonly environmentStatus: string }

export interface SceneSyncOptions {
  /** Editor scenes show helpers (grid, axes) and keep hidden nodes pickable from the hierarchy. */
  editor?: boolean
}

export interface SceneSyncResult {
  warnings: string[]
}

/** The imported pose of a node inside a model, restored before overrides are re-applied. */
interface AssetNodeState {
  object: Object3D
  parent: Object3D | null
  name: string
  transform: SceneTransformV1
  visible: boolean
}

interface MountedNode {
  /** The node last applied to `object`; null until its properties are first applied. */
  node: SceneNodeV2 | null
  object: Object3D
  /** Model nodes only, keyed by assetNodeId. */
  assetNodes?: Map<string, AssetNodeState>
}

function needsRebuild(before: SceneNodeV2, after: SceneNodeV2): boolean {
  return (
    before.kind !== after.kind ||
    (before.kind === 'model' && after.kind === 'model' && before.model.assetId !== after.model.assetId)
  )
}

/**
 * Renders a scene document into the engine and keeps it in step with later versions of the document.
 * `update` diffs by reference: documents from DocumentStore share every unchanged node, so only edited nodes
 * are touched. Updates are serialized, so callers may fire them without awaiting.
 */
export class SceneSync {
  private document: SceneDocumentV2 | null = null
  private readonly mounted = new Map<string, MountedNode>()
  /** Where each mounted node is attached: a parent node id, null for top level. */
  private readonly attachedTo = new Map<string, string | null>()
  /** Objects added to the host as top-level trees. */
  private readonly topLevel = new Set<Object3D>()
  /**
   * Top-level trees taken out of the host during an update because their structure is changing. The host
   * indexes a tree when it is added, so a tree is removed before it changes and added back afterwards.
   */
  private readonly suspended = new Set<Object3D>()
  /** Model nodes whose asset failed to load, by assetId: not retried until the asset changes. */
  private readonly failed = new Map<string, string>()
  private queue: Promise<unknown> = Promise.resolve()
  private started = false
  private disposed = false

  constructor(
    private readonly host: SceneHost,
    private readonly assets: AssetRepository,
    readonly resources = new ImportedAssetResourceRegistry(),
    private readonly options: SceneSyncOptions = {},
  ) {}

  get environmentStatus(): string {
    return this.host.environmentStatus
  }

  get current(): SceneDocumentV2 | null {
    return this.document
  }

  /** Top-level objects in document order. */
  get roots(): Object3D[] {
    return (this.document?.nodes ?? [])
      .filter(node => node.parentId === null)
      .flatMap(node => this.mounted.get(node.id)?.object ?? [])
  }

  objectFor(nodeId: string): Object3D | null {
    return this.mounted.get(nodeId)?.object ?? null
  }

  /** The id of the document node an object belongs to (walking up from parts of a model). */
  nodeIdOf(object: Object3D): string | null {
    for (let current: Object3D | null = object; current; current = current.parent) {
      const id: unknown = current.userData.sceneNodeId
      if (typeof id === 'string' && this.mounted.get(id)?.object === current) return id
    }
    return null
  }

  /** Builds the scene for a document and moves the camera to its opening view. */
  async mount(document: SceneDocumentV2): Promise<SceneSyncResult> {
    if (this.started) throw new Error('SceneSync is already mounted')
    this.started = true
    const result = await this.update(document)
    if (document.cameraView) await this.host.flyTo(document.cameraView, 0)
    this.assertActive()
    return result
  }

  update(document: SceneDocumentV2): Promise<SceneSyncResult> {
    const task = this.queue.then(() => this.apply(document))
    this.queue = task.catch(() => {})
    return task
  }

  /** Resolves once every queued update has been applied. */
  settled(): Promise<void> {
    return this.queue.then(() => {})
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const entry of this.mounted.values()) if (entry.node?.kind !== 'model') disposeOwned(entry.object)
    this.resources.dispose()
    this.mounted.clear()
    this.attachedTo.clear()
    this.topLevel.clear()
  }

  private assertActive(): void {
    if (this.disposed) throw new DOMException('Scene loading cancelled', 'AbortError')
  }

  private async apply(next: SceneDocumentV2): Promise<SceneSyncResult> {
    this.assertActive()
    const previous = this.document
    const warnings: string[] = []
    const nextIds = new Set(next.nodes.map(node => node.id))

    // 1. Build objects for new nodes and nodes whose kind or model asset changed.
    const toBuild = next.nodes.filter(node => {
      const current = this.mounted.get(node.id)
      if (current) return needsRebuild(current.node!, node)
      return !(node.kind === 'model' && this.failed.get(node.id) === node.model.assetId)
    })
    const built = await Promise.all(toBuild.map(node => this.build(node, warnings)))
    this.assertActive()

    try {
      // 2. Remove deleted and rebuilt nodes.
      const rebuilt = new Set(toBuild.map(node => node.id))
      for (const id of [...this.mounted.keys()]) {
        if (!nextIds.has(id) || rebuilt.has(id)) this.remove(id)
      }
      for (const id of this.failed.keys()) if (!nextIds.has(id)) this.failed.delete(id)
      toBuild.forEach((node, index) => {
        const entry = built[index]
        if (entry) this.mounted.set(node.id, entry)
      })

      // 3. Apply properties of every node whose value changed.
      for (const node of next.nodes) {
        const entry = this.mounted.get(node.id)
        if (!entry || entry.node === node) continue
        this.applyNode(entry, node, warnings)
        entry.node = node
      }

      // 4. Attach nodes to their parents; new top-level trees go to the host last so it indexes them whole.
      const added: Object3D[] = []
      for (const node of next.nodes) {
        const entry = this.mounted.get(node.id)
        if (!entry || this.attachedTo.get(node.id) === node.parentId) continue
        if (this.attachedTo.has(node.id)) this.detach(entry.object)
        if (node.parentId === null) added.push(entry.object)
        else {
          const parent = this.mounted.get(node.parentId)!.object
          this.suspend(parent)
          parent.add(entry.object)
        }
        this.attachedTo.set(node.id, node.parentId)
      }
      for (const object of added) {
        if (!this.host.addObject(object)) throw new Error(`无法加载场景对象 ${object.name}`)
        this.topLevel.add(object)
      }
      // Keep sibling order as in the document (it is the hierarchy's display order).
      this.sortChildren(next)
    } finally {
      for (const root of this.suspended) if (this.topLevel.has(root)) this.host.addObject(root)
      this.suspended.clear()
    }

    // 5. Scene settings. The camera view is only applied on mount: it is the opening view, not live state.
    this.document = next
    if (next.settings !== previous?.settings) {
      try {
        this.host.setHelpers(this.options.editor ? next.settings.helpers : { grid: false, axes: false })
        await this.host.applySettings(next.settings, { hdrUrl: await this.hdrUrl(next) })
      } catch (error) {
        this.assertActive()
        warnings.push(error instanceof Error ? error.message : String(error))
      }
    }
    this.assertActive()
    return { warnings }
  }

  private async hdrUrl(document: SceneDocumentV2): Promise<string | null> {
    const id = document.settings.sky.mode === 'hdr' ? document.settings.sky.hdrAssetId : null
    if (!id) return null
    const asset = await this.assets.get(id)
    if (!asset || asset.assetType !== 'environment') throw new Error('环境贴图资产不存在或类型不正确')
    return this.resources.getOrCreate(asset).objectUrl
  }

  private sortChildren(document: SceneDocumentV2): void {
    const order = new Map(document.nodes.map((node, index) => [node.id, index]))
    for (const entry of this.mounted.values()) {
      if (entry.node?.kind !== 'group') continue
      entry.object.children.sort(
        (a, b) =>
          (order.get(a.userData.sceneNodeId as string) ?? 1e9) - (order.get(b.userData.sceneNodeId as string) ?? 1e9),
      )
    }
  }

  /** Creates the object for a node. Properties are applied later; null (with a warning) if a model fails. */
  private async build(node: SceneNodeV2, warnings: string[]): Promise<MountedNode | null> {
    switch (node.kind) {
      case 'group':
        return { node: null, object: this.tag(new Group(), node) }
      case 'primitive':
        return { node: null, object: this.tag(createPrimitiveObject(node), node) }
      case 'path':
        return { node: null, object: this.tag(this.container(createPathObject(node)), node) }
      case 'area':
        return { node: null, object: this.tag(this.container(createAreaObject(node)), node) }
      case 'label':
        return { node: null, object: this.tag(createLabelObject(node), node) }
      case 'light':
        return { node: null, object: this.tag(createLightObject(node), node) }
    }
    try {
      const asset = await this.assets.get(node.model.assetId)
      this.assertActive()
      if (!asset) throw new Error(`缺少资产 ${node.model.assetId}`)
      const model = await this.host.loadGLTFModel(this.resources.getOrCreate(asset).objectUrl)
      this.assertActive()
      const assetNodes = new Map<string, AssetNodeState>()
      model.traverse(object => {
        const transform = serializeTransform(object)
        // Original poses let the Editor reset a node without consulting the document.
        object.userData.editorInitialTransform = transform
        const id: unknown = object.userData.assetNodeId
        if (typeof id === 'string' && object !== model) {
          assetNodes.set(id, { object, parent: object.parent, name: object.name, transform, visible: object.visible })
        }
      })
      this.failed.delete(node.id)
      return { node: null, object: this.tag(model, node), assetNodes }
    } catch (error) {
      this.assertActive()
      this.failed.set(node.id, node.model.assetId)
      warnings.push(`${node.id}: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  /** Paths and areas rebuild their geometry on change inside a stable container. */
  private container(content: Object3D): Group {
    const group = new Group()
    content.userData.nodeContent = true
    group.add(content)
    return group
  }

  private tag(object: Object3D, node: SceneNodeV2): Object3D {
    object.userData.sceneNodeId = node.id
    object.userData.nodeKind = node.kind
    if (node.runtimeBid) object.userData.bid = node.runtimeBid
    if (node.kind === 'primitive') {
      setEditorMetadata(object, { kind: 'primitive', nodeId: node.id, primitiveType: node.primitive.shape })
    }
    return object
  }

  private applyNode(entry: MountedNode, node: SceneNodeV2, warnings: string[]): void {
    const { object } = entry
    const before = entry.node
    object.name = node.name
    object.visible = node.visible
    applySceneTransform(object, node.transform)
    switch (node.kind) {
      case 'model':
        this.applyModel(entry, node, before?.kind === 'model' ? before : null, warnings)
        break
      case 'primitive':
        this.applyPrimitive(object as Mesh, node, before?.kind === 'primitive' ? before : null)
        break
      case 'path':
        if (before?.kind === 'path' && before.path !== node.path) this.replaceContent(object, createPathObject(node))
        break
      case 'area':
        if (before?.kind === 'area' && before.area !== node.area) this.replaceContent(object, createAreaObject(node))
        break
      case 'label':
        if (before?.kind === 'label' && before.label !== node.label) updateLabelObject(object, node)
        break
      case 'light':
        if (before?.kind === 'light' && before.light !== node.light) updateLightObject(object, node)
        break
    }
  }

  private replaceContent(container: Object3D, content: Object3D): void {
    this.suspend(container)
    for (const child of [...container.children]) {
      if (!child.userData.nodeContent) continue
      child.removeFromParent()
      disposeOwned(child)
    }
    content.userData.nodeContent = true
    container.add(content)
  }

  private applyModel(entry: MountedNode, node: ModelNodeV2, before: ModelNodeV2 | null, warnings: string[]): void {
    setEditorMetadata(entry.object, {
      kind: 'assetInstance',
      assetRoot: true,
      assetId: node.model.assetId,
      instanceId: node.id,
      deletedAssetNodeIds: [...node.model.deleted],
    })
    if (before?.model === node.model) return
    const states = entry.assetNodes!
    const deleted = new Set(node.model.deleted)
    // Transforms do not invalidate the host's index; adding or removing parts does.
    for (const [id, state] of states) {
      if (state.parent && (state.object.parent !== state.parent) !== deleted.has(id)) {
        this.suspend(entry.object)
        break
      }
    }
    for (const state of states.values()) {
      state.object.name = state.name
      state.object.visible = state.visible
      applySceneTransform(state.object, state.transform)
      if (state.parent && state.object.parent !== state.parent) state.parent.add(state.object)
    }
    for (const [id, override] of Object.entries(node.model.overrides)) {
      const state = states.get(id)
      if (!state) {
        warnings.push(`缺少模型节点 ${node.id}/${id}`)
        continue
      }
      if (override.name !== undefined) state.object.name = override.name
      if (override.transform) applySceneTransform(state.object, override.transform)
      state.object.visible = override.visible ?? true
      if (override.runtimeBid) state.object.userData.bid = override.runtimeBid
    }
    for (const id of deleted) states.get(id)?.object.removeFromParent()
  }

  private applyPrimitive(mesh: Mesh, node: PrimitiveNodeV2, before: PrimitiveNodeV2 | null): void {
    if (!before || before.primitive === node.primitive) return
    const geometryKeys = ['shape', 'width', 'height', 'depth', 'radiusTop', 'radiusBottom', 'radialSegments'] as const
    if (geometryKeys.some(key => node.primitive[key] !== before.primitive[key])) {
      // Swap the geometry in place so the object keeps its identity across edits. The host indexes geometry
      // for picking, so the tree leaves the host before the old geometry is disposed.
      this.suspend(mesh)
      mesh.geometry.dispose()
      mesh.geometry = primitiveGeometry(node.primitive)
      mesh.castShadow = node.primitive.shape !== 'plane'
      setEditorMetadata(mesh, { kind: 'primitive', nodeId: node.id, primitiveType: node.primitive.shape })
    }
    applyPrimitiveMaterial(mesh.material as MeshStandardMaterial, node.primitive)
  }

  private remove(id: string): void {
    const entry = this.mounted.get(id)!
    if (this.attachedTo.has(id)) this.detach(entry.object)
    this.mounted.delete(id)
    this.attachedTo.delete(id)
    // Models share geometry with the engine's model cache; every other kind owns its resources. Children
    // that are themselves nodes are detached first, so only this node's own content is freed.
    if (entry.node && entry.node.kind !== 'model') {
      for (const child of [...entry.object.children]) if (child.userData.sceneNodeId) child.removeFromParent()
      disposeOwned(entry.object)
    }
  }

  private detach(object: Object3D): void {
    if (this.topLevel.delete(object)) {
      if (!this.suspended.delete(object)) this.host.removeObject(object)
    } else {
      this.suspend(object)
      object.removeFromParent()
    }
  }

  /** Takes the top-level tree containing `object` out of the host until the update finishes. */
  private suspend(object: Object3D): void {
    for (let current: Object3D | null = object; current; current = current.parent) {
      if (!this.topLevel.has(current)) continue
      if (!this.suspended.has(current)) {
        this.host.removeObject(current)
        this.suspended.add(current)
      }
      return
    }
  }
}
