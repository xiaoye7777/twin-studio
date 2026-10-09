import { reactive, shallowRef } from 'vue'
import { Box3, Matrix4, type Object3D, Vector3 } from 'three'
import {
  ancestorIds,
  type AssetRepository,
  BindingTargetResolver,
  type CameraBookmark,
  type CameraView,
  createEffect,
  createEmptyDocument,
  createInteraction,
  createTwinState,
  type DocumentChange,
  DocumentStore,
  duplicateNodes,
  type EffectInstance,
  type EffectKind,
  EffectRuntime,
  type EngineStats,
  formatRuntimeValue,
  getBuiltinTemplates,
  groupNodes,
  identityTransform,
  idleTourState,
  InteractionRuntime,
  isLockedOrHidden,
  loadSceneDocument,
  newId,
  nodeById,
  plain,
  primitiveDefaults,
  type PrimitiveShape,
  type ProjectDataSource,
  type QualitySetting,
  removeNodes,
  reparentNodes,
  RuntimeVisibilityLayer,
  type SceneDocumentV2,
  type SceneInteraction,
  type SceneNodeV2,
  scenePresets,
  type SceneRepository,
  type SceneSettingsV2,
  SceneSync,
  subtreeIds,
  targetForNode,
  targetNodeId,
  topmost,
  type Tour,
  TourPlayer,
  type TourState,
  type TourStep,
  transformOf,
  type TwinBinding,
  type TwinBindingTarget,
  twinBindingTargetKey,
  TwinDataRuntime,
  TwinEngine,
  ungroupNodes,
  uniqueName,
  ViewerPointerEvents,
  type VisualRule,
  VisualRuleRuntime,
  worldMatrixOf,
} from '@twin-studio/core'
import { type DrawKind, type DrawResult, DrawTool } from './DrawTool'
import { deviceIdFor, deviceVariables, type DeviceTemplate } from './deviceTemplates'
import { type GizmoMode, TransformGizmo } from './TransformGizmo'

export type EditorTool = 'select' | GizmoMode
export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

export interface EditorSessionDeps {
  projectId: string
  projectName: string
  assets: AssetRepository
  scenes: SceneRepository
  /** Called after each save with a small JPEG of the scene for the project card. */
  onCover?: (dataUrl: string) => void
  quality?: QualitySetting
}

const primitiveNames: Record<PrimitiveShape, string> = {
  box: '立方体',
  plane: '平面',
  cylinder: '圆柱',
  sphere: '球体',
  cone: '圆锥',
}

/**
 * One open project in the editor. The document (DocumentStore) is the single source of truth: every edit is
 * a transaction, SceneSync renders it, and the panels read `doc`. Nothing in the 3D scene is edited directly.
 */
export class EditorSession {
  readonly engine: TwinEngine
  readonly sync: SceneSync
  readonly store: DocumentStore<SceneDocumentV2>
  readonly doc = shallowRef<SceneDocumentV2>(createEmptyDocument('', ''))
  readonly selection = shallowRef<string[]>([])
  readonly hovered = shallowRef<string | null>(null)
  readonly twin = reactive(createTwinState())
  /** Thumbnails rendered for bookmarks saved without one (kept out of the document and its history). */
  readonly thumbnails = reactive<Record<string, string>>({})
  readonly ui = reactive({
    ready: false,
    error: '',
    warnings: [] as string[],
    mode: 'edit' as 'edit' | 'preview',
    tool: 'translate' as EditorTool,
    space: 'world' as 'world' | 'local',
    snap: { enabled: false, translate: 1, rotate: 15, scale: 0.1 },
    draw: null as DrawKind | null,
    drawPoints: 0,
    canUndo: false,
    canRedo: false,
    undoLabel: '',
    redoLabel: '',
    saveState: 'saved' as SaveState,
    saveError: '',
    lastSaved: '',
    stats: { fps: 0, quality: 'medium', setting: 'auto', pixelRatio: 1, drawCalls: 0, triangles: 0 } as EngineStats,
    tour: idleTourState() as TourState,
    cursor: null as [number, number, number] | null,
    syncRevision: 0,
    dataRevision: 0,
  })
  readonly projectId: string
  private readonly assets: AssetRepository
  private readonly scenes: SceneRepository
  private readonly resolver: BindingTargetResolver
  private readonly data: TwinDataRuntime
  private readonly visibility = new RuntimeVisibilityLayer()
  private readonly gizmo: TransformGizmo
  private readonly drawTool: DrawTool
  readonly tours: TourPlayer
  private effects: EffectRuntime | null = null
  private rules: VisualRuleRuntime | null = null
  private preview: { interactions: InteractionRuntime; pointers: ViewerPointerEvents } | null = null
  private gizmoIds: string[] = []
  private clipboard: { nodes: SceneNodeV2[]; effects: EffectInstance[] } | null = null
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null
  private statsTimer: ReturnType<typeof setInterval>
  private pointer: { x: number; y: number; button: number } | null = null
  private hoverFrame: number | null = null
  private disposed = false

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly deps: EditorSessionDeps,
  ) {
    this.projectId = deps.projectId
    this.assets = deps.assets
    this.scenes = deps.scenes
    this.engine = new TwinEngine(canvas, { quality: deps.quality ?? 'auto', preserveDrawingBuffer: true })
    this.sync = new SceneSync(this.engine, this.assets, undefined, { editor: true })
    this.store = new DocumentStore(createEmptyDocument(deps.projectId, deps.projectName), 300)
    this.resolver = new BindingTargetResolver(id => this.sync.objectFor(id))
    this.data = new TwinDataRuntime(this.twin, this.resolver)
    this.gizmo = new TransformGizmo(this.engine, {
      onStart: () => {},
      onChange: ({ worlds }) => this.applyGizmo(worlds),
      onEnd: () => this.store.seal(),
    })
    this.gizmo.setMode('translate')
    this.drawTool = new DrawTool(
      this.engine,
      result => this.finishDrawing(result),
      state => {
        this.ui.draw = state.kind
        this.ui.drawPoints = state.points
      },
    )
    this.tours = new TourPlayer(
      {
        getTours: () => this.doc.value.tours,
        getBookmarks: () => this.doc.value.bookmarks,
        flyTo: (view, duration) => this.engine.flyTo(view, duration),
        frameNode: (id, duration) => {
          const object = this.sync.objectFor(id)
          return object ? this.engine.focus(object, duration) : Promise.resolve(true)
        },
        setNodeVisible: (id, visible) => {
          const object = this.sync.objectFor(id)
          if (object) this.visibility.set(object, visible)
        },
        restoreVisibility: () => this.visibility.dispose(),
        setHighlight: id => {
          if (id)
            this.effects?.setTransientEffects('tour', [
              { ...createEffect('outline', { type: 'node', nodeId: id }), id: 'tour:highlight' },
            ])
          else this.effects?.clearTransientEffects('tour')
        },
      },
      state => (this.ui.tour = state),
    )
    this.store.subscribe(change => this.onDocumentChange(change))
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    window.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('dblclick', this.onDoubleClick)
    this.statsTimer = setInterval(() => {
      this.ui.stats = this.engine.getStats()
    }, 1000)
  }

  // ================================================================ lifecycle

  async open(): Promise<void> {
    try {
      const saved = await this.scenes.load(this.projectId)
      if (this.disposed) return
      const document = saved ?? createEmptyDocument(this.projectId, this.deps.projectName)
      this.store.reset(document)
      const { warnings } = await this.sync.mount(this.store.document)
      if (this.disposed) return
      this.ui.warnings = warnings
      this.effects = new EffectRuntime(this.engine, this.resolver)
      this.effects.dataProvider = (target, variables) => this.deviceLines(target, variables)
      this.data.initialize(this.projectId, document.bindings)
      this.data.start(document.dataSources)
      this.rules = new VisualRuleRuntime(
        this.effects,
        this.twin,
        this.resolver,
        () => this.doc.value.visualRules,
        () => this.doc.value.effects,
        () => this.ui.syncRevision,
      )
      if (!document.cameraView) await this.engine.fitAll(0)
      this.ui.saveState = saved ? 'saved' : 'unsaved'
      this.ui.ready = true
      // Models finish streaming in the first second; thumbnails taken after that show the full scene.
      setTimeout(() => void this.fillBookmarkThumbnails(), 1500)
    } catch (error) {
      this.ui.error = error instanceof Error ? error.message : String(error)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer)
      if (this.store.isDirty) void this.save()
    }
    clearInterval(this.statsTimer)
    if (this.hoverFrame !== null) cancelAnimationFrame(this.hoverFrame)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    window.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('dblclick', this.onDoubleClick)
    this.exitPreview()
    this.tours.dispose()
    this.rules?.dispose()
    this.effects?.dispose()
    this.data.stop()
    this.visibility.dispose()
    this.gizmo.dispose()
    this.drawTool.dispose()
    this.sync.dispose()
    this.engine.dispose()
  }

  // ================================================================ document plumbing

  /** Runs an undoable edit. Ignored in preview mode. */
  edit(label: string, recipe: (draft: SceneDocumentV2) => void, options: { coalesceKey?: string } = {}): boolean {
    if (this.ui.mode === 'preview' || !this.ui.ready) return false
    return this.store.transaction(label, recipe, options)
  }

  /** Ends a run of coalesced edits (slider release, drag end). */
  commit(): void {
    this.store.seal()
  }

  undo(): void {
    if (this.ui.mode === 'edit') this.store.undo()
  }

  redo(): void {
    if (this.ui.mode === 'edit') this.store.redo()
  }

  private onDocumentChange(change: DocumentChange<SceneDocumentV2>): void {
    const { document: next, previous } = change
    this.doc.value = next
    this.ui.canUndo = this.store.canUndo
    this.ui.canRedo = this.store.canRedo
    this.ui.undoLabel = this.store.undoLabel ?? ''
    this.ui.redoLabel = this.store.redoLabel ?? ''
    void this.sync.update(next).then(({ warnings }) => {
      if (this.disposed) return
      if (warnings.length) this.ui.warnings = warnings
      this.ui.syncRevision++
      this.data.refresh()
      this.effects?.refresh()
      this.refreshSelectionVisuals()
    })
    if (change.origin !== 'reset') {
      if (next.bindings !== previous.bindings) {
        this.data.initialize(this.projectId, next.bindings)
        this.data.start(next.dataSources)
      } else if (next.dataSources !== previous.dataSources) this.data.start(next.dataSources)
      this.scheduleAutosave()
    }
    const ids = new Set(next.nodes.map(node => node.id))
    if (this.selection.value.some(id => !ids.has(id))) this.select(this.selection.value.filter(id => ids.has(id)))
  }

  node(id: string): SceneNodeV2 | undefined {
    return nodeById(this.doc.value, id)
  }

  get selectedNodes(): SceneNodeV2[] {
    return this.selection.value.flatMap(id => this.node(id) ?? [])
  }

  // ================================================================ persistence

  async save(): Promise<boolean> {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer)
    this.autosaveTimer = null
    const current = this.store.document
    this.ui.saveState = 'saving'
    try {
      // Never persist a document the loader would reject: that would lock the project.
      const { document } = loadSceneDocument({
        ...current,
        metadata: { ...current.metadata, name: this.deps.projectName, updatedAt: new Date().toISOString() },
      })
      await this.scenes.save(document)
      if (this.store.document === current) this.store.markSaved()
      this.ui.saveState = this.store.isDirty ? 'unsaved' : 'saved'
      this.ui.saveError = ''
      this.ui.lastSaved = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      const opening = this.store.document.cameraView
      void (opening ? this.captureFrom(opening, 480) : this.captureClean(480)).then(
        cover => cover && this.deps.onCover?.(cover),
      )
      return true
    } catch (error) {
      this.ui.saveState = 'error'
      this.ui.saveError =
        error instanceof DOMException && error.name === 'QuotaExceededError'
          ? '浏览器本地存储空间不足，请导出项目包备份后清理旧项目'
          : error instanceof Error
            ? error.message
            : String(error)
      return false
    }
  }

  private scheduleAutosave(): void {
    this.ui.saveState = 'unsaved'
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer)
    this.autosaveTimer = setTimeout(() => void this.save(), 1500)
  }

  /** A clean JPEG from a given view, without moving the user's camera. */
  captureFrom(view: CameraView, width: number): Promise<string | null> {
    return this.withCleanFrame(() => this.engine.renderView(view, width))
  }

  /** Renders thumbnails for bookmarks that have none (e.g. from templates), one per idle moment. */
  async fillBookmarkThumbnails(): Promise<void> {
    for (const bookmark of this.doc.value.bookmarks) {
      if (this.disposed) return
      if (bookmark.thumbnail || this.thumbnails[bookmark.id]) continue
      await new Promise(resolve => setTimeout(resolve, 120))
      const image = await this.captureFrom(bookmark.view, 240)
      if (image) this.thumbnails[bookmark.id] = image
    }
  }

  /** A JPEG of the scene without editor helpers (grid, gizmo, selection). */
  captureClean(width: number): Promise<string | null> {
    return this.withCleanFrame(() => this.engine.screenshot(width))
  }

  private async withCleanFrame(render: () => Promise<Blob | null>): Promise<string | null> {
    const helpers = this.doc.value.settings.helpers
    this.engine.setHelpers({ grid: false, axes: false })
    this.gizmo.setVisible(false)
    this.engine.setOutlined('selection', [])
    this.engine.setOutlined('hover', [])
    this.drawTool.setPreviewHidden(true)
    try {
      const blob = await render()
      if (!blob) return null
      return await new Promise<string>(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.readAsDataURL(blob)
      })
    } finally {
      if (this.ui.mode === 'edit') this.engine.setHelpers(helpers)
      this.drawTool.setPreviewHidden(false)
      this.refreshSelectionVisuals()
    }
  }

  // ================================================================ selection

  select(ids: readonly string[], mode: 'replace' | 'toggle' | 'add' = 'replace'): void {
    let next: string[]
    if (mode === 'replace') next = [...new Set(ids)]
    else {
      next = [...this.selection.value]
      for (const id of ids) {
        const at = next.indexOf(id)
        if (at >= 0 && mode === 'toggle') next.splice(at, 1)
        else if (at < 0) next.push(id)
      }
    }
    const same = next.length === this.selection.value.length && next.every((id, i) => id === this.selection.value[i])
    if (!same) this.selection.value = next
    this.refreshSelectionVisuals()
  }

  selectAll(): void {
    this.select(this.doc.value.nodes.filter(node => node.parentId === null && !node.locked).map(node => node.id))
  }

  clearSelection(): void {
    this.select([])
  }

  private refreshSelectionVisuals(): void {
    if (this.disposed) return
    const editing = this.ui.mode === 'edit'
    const objects = this.selection.value.flatMap(id => this.sync.objectFor(id) ?? [])
    this.engine.setOutlined('selection', objects)
    const ids = topmost(this.doc.value, this.selection.value)
    const movable = ids.filter(id => !isLockedOrHidden(this.doc.value, id).locked)
    this.gizmoIds = this.ui.tool === 'select' || !editing ? [] : movable
    this.gizmo.attach(this.gizmoIds.flatMap(id => this.sync.objectFor(id) ?? []))
    this.gizmo.setVisible(editing && this.gizmoIds.length > 0)
  }

  setTool(tool: EditorTool): void {
    this.ui.tool = tool
    if (tool !== 'select') this.gizmo.setMode(tool)
    this.refreshSelectionVisuals()
  }

  setSpace(space: 'world' | 'local'): void {
    this.ui.space = space
    this.gizmo.setSpace(space)
  }

  setSnap(enabled: boolean): void {
    this.ui.snap.enabled = enabled
    this.gizmo.setSnap(this.ui.snap)
    this.drawTool.snapStep = enabled ? this.ui.snap.translate : 0
  }

  async focusSelection(): Promise<void> {
    const objects = this.selection.value.flatMap(id => this.sync.objectFor(id) ?? [])
    if (objects.length) await this.engine.focus(objects)
    else await this.engine.fitAll()
  }

  /** Standard views around the scene. */
  async viewFrom(direction: 'top' | 'front' | 'right' | 'perspective'): Promise<void> {
    const box = new Box3()
    for (const object of this.sync.roots) box.expandByObject(object, true)
    if (box.isEmpty()) box.set(new Vector3(-20, 0, -20), new Vector3(20, 10, 20))
    const directions = {
      top: new Vector3(0, 1, 0.0001),
      front: new Vector3(0, 0.25, 1),
      right: new Vector3(1, 0.25, 0),
      perspective: new Vector3(1, 0.8, 1),
    }
    await this.engine.rig.fitBox(box, { direction: directions[direction], duration: 0.6, padding: 1.05 })
  }

  private applyGizmo(worlds: Matrix4[]): void {
    const ids = this.gizmoIds
    this.edit(
      this.ui.tool === 'rotate' ? '旋转' : this.ui.tool === 'scale' ? '缩放' : '移动',
      draft => {
        ids.forEach((id, index) => {
          const node = nodeById(draft, id)
          const world = worlds[index]
          if (!node || !world) return
          const parentInverse = worldMatrixOf(draft, node.parentId).invert()
          node.transform = transformOf(parentInverse.multiply(world))
        })
      },
      { coalesceKey: `gizmo:${ids.join(',')}` },
    )
  }

  // ================================================================ pointer (edit mode)

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointer = { x: event.clientX, y: event.clientY, button: event.button }
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const start = this.pointer
    this.pointer = null
    if (!start || start.button !== 0 || this.ui.mode !== 'edit' || !this.ui.ready) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return
    if (event.target !== this.canvas || this.gizmo.active) return
    if (this.drawTool.active) {
      this.drawTool.click(event.clientX, event.clientY)
      return
    }
    const id = this.pickNode(event.clientX, event.clientY, event.altKey)
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    if (!id) {
      if (!additive) this.clearSelection()
      return
    }
    this.select([id], additive ? 'toggle' : 'replace')
  }

  private readonly onDoubleClick = (event: MouseEvent): void => {
    if (this.ui.mode !== 'edit' || this.drawTool.active) return
    const id = this.pickNode(event.clientX, event.clientY, true)
    if (id) {
      this.select([id])
      void this.focusSelection()
    }
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.drawTool.active) this.drawTool.move(event.clientX, event.clientY)
    if (this.hoverFrame !== null) return
    const { clientX, clientY } = event
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = null
      if (this.disposed || !this.ui.ready) return
      const ndc = this.engine.toNdc(clientX, clientY)
      const ground = ndc ? this.engine.raycastGround(ndc) : null
      this.ui.cursor = ground ? [ground.x, ground.y, ground.z] : null
      if (this.ui.mode !== 'edit' || this.pointer || this.gizmo.dragging || this.drawTool.active) return
      const id = this.pickNode(clientX, clientY, false)
      this.setHovered(id)
    })
  }

  private readonly onPointerLeave = (): void => {
    this.setHovered(null)
    this.ui.cursor = null
  }

  setHovered(id: string | null): void {
    if (this.hovered.value === id) return
    this.hovered.value = id
    const object = id && !this.selection.value.includes(id) ? this.sync.objectFor(id) : null
    this.engine.setOutlined('hover', object ? [object] : [])
  }

  /**
   * Which node a click means: the outermost group under the cursor, or one level deeper when that group is
   * already selected (like entering a group); `deep` picks the innermost node. Locked nodes are skipped.
   */
  private pickNode(clientX: number, clientY: number, deep: boolean): string | null {
    const hit = this.engine.pick(clientX, clientY)
    if (!hit) return null
    const deepest = this.sync.nodeIdOf(hit.object)
    if (!deepest) return null
    const doc = this.doc.value
    if (isLockedOrHidden(doc, deepest).locked) return null
    const chain = [...ancestorIds(doc, deepest), deepest]
    if (deep) return deepest
    const current = this.selection.value.length === 1 ? this.selection.value[0]! : null
    const index = current ? chain.indexOf(current) : -1
    if (index < 0) return chain[0]!
    if (nodeById(doc, current!)?.kind === 'group' && index < chain.length - 1) return chain[index + 1]!
    return current
  }

  // ================================================================ creating nodes

  /** Where new things go: the dropped point, else the point the camera looks at. */
  private placement(at?: Vector3 | null): Vector3 {
    if (at) return at.clone()
    const target = this.engine.rig.controls.getTarget(new Vector3())
    return new Vector3(target.x, 0, target.z)
  }

  private insert(label: string, nodes: SceneNodeV2[]): void {
    if (!nodes.length) return
    const parentId = this.insertionParent()
    this.edit(label, draft => {
      for (const node of nodes) {
        if (node.parentId === null && parentId) {
          // Drop into the selected group, keeping the world position.
          const local = worldMatrixOf(draft, parentId).invert().multiply(worldMatrixOfTransform(node))
          node.transform = transformOf(local)
          node.parentId = parentId
        }
        draft.nodes.push(node)
      }
    })
    this.select(nodes.map(node => node.id))
  }

  /** New nodes join the selected group (or the group of the selected node). */
  private insertionParent(): string | null {
    if (this.selection.value.length !== 1) return null
    const node = this.node(this.selection.value[0]!)
    if (!node) return null
    return node.kind === 'group' ? node.id : node.parentId
  }

  async addModel(assetId: string, at?: Vector3 | null): Promise<string | null> {
    const asset = await this.assets.get(assetId)
    if (!asset) throw new Error('资产不存在')
    const url = this.sync.resources.getOrCreate(asset).objectUrl
    // Measure the model once (the loader caches it) so it lands on the ground, not half inside it.
    const probe = await this.engine.loadGLTFModel(url)
    const bounds = new Box3().setFromObject(probe)
    const position = this.placement(at)
    const lift = bounds.isEmpty() ? 0 : -bounds.min.y
    const node: SceneNodeV2 = {
      id: newId('instance'),
      kind: 'model',
      parentId: null,
      name: uniqueName(this.doc.value, asset.name.replace(/\.glb$/i, '') || '模型'),
      transform: { ...identityTransform(), position: [position.x, position.y + lift, position.z] },
      visible: true,
      locked: false,
      model: { assetId, overrides: {}, deleted: [] },
    }
    this.insert('添加模型', [node])
    return node.id
  }

  addPrimitive(shape: PrimitiveShape, at?: Vector3 | null): string {
    const position = this.placement(at)
    const node: SceneNodeV2 = {
      id: newId('node'),
      kind: 'primitive',
      parentId: null,
      name: uniqueName(this.doc.value, primitiveNames[shape]),
      transform: { ...identityTransform(), position: [position.x, position.y, position.z] },
      visible: true,
      locked: false,
      primitive: { ...primitiveDefaults[shape] },
    }
    this.insert(`添加${primitiveNames[shape]}`, [node])
    return node.id
  }

  addGroup(): string | null {
    const ids = this.selection.value
    if (ids.length) return this.groupSelection()
    const position = this.placement()
    const node: SceneNodeV2 = {
      id: newId('group'),
      kind: 'group',
      parentId: null,
      name: uniqueName(this.doc.value, '分组'),
      transform: { ...identityTransform(), position: [position.x, 0, position.z] },
      visible: true,
      locked: false,
    }
    this.insert('新建分组', [node])
    return node.id
  }

  startDrawing(kind: DrawKind): void {
    if (this.ui.mode !== 'edit') return
    this.drawTool.snapStep = this.ui.snap.enabled ? this.ui.snap.translate : 0
    this.drawTool.start(kind)
    this.clearSelection()
  }

  cancelDrawing(): void {
    this.drawTool.cancel()
  }

  finishDrawingNow(): void {
    this.drawTool.finish()
  }

  undoDrawPoint(): void {
    this.drawTool.undoPoint()
  }

  private finishDrawing({ kind, points }: DrawResult): void {
    const base = { parentId: null, visible: true, locked: false }
    if (kind === 'label' || kind === 'light') {
      const at = points[0]!
      const node: SceneNodeV2 =
        kind === 'label'
          ? {
              ...base,
              id: newId('node'),
              kind: 'label',
              name: uniqueName(this.doc.value, '标签'),
              transform: { ...identityTransform(), position: [at.x, at.y + 4, at.z] },
              label: { text: '新标签', style: 'tag', color: '#f0a050', background: '#14171b', size: 1, leader: true },
            }
          : {
              ...base,
              id: newId('node'),
              kind: 'light',
              name: uniqueName(this.doc.value, '灯光'),
              transform: { ...identityTransform(), position: [at.x, at.y + 6, at.z] },
              light: { type: 'point', color: '#ffd9a8', intensity: 300, distance: 40, angle: 35, castShadow: false },
            }
      this.insert(kind === 'label' ? '添加标签' : '添加灯光', [node])
      return
    }
    const origin =
      kind === 'area'
        ? points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length)
        : points[0]!.clone()
    origin.y = kind === 'area' ? 0 : origin.y
    const local = points.map(
      p =>
        [round(p.x - origin.x), round(kind === 'area' ? 0 : p.y - origin.y), round(p.z - origin.z)] as [
          number,
          number,
          number,
        ],
    )
    const node: SceneNodeV2 =
      kind === 'path'
        ? {
            ...base,
            id: newId('node'),
            kind: 'path',
            name: uniqueName(this.doc.value, '能流线'),
            transform: { ...identityTransform(), position: [origin.x, origin.y, origin.z] },
            path: {
              points: local,
              closed: false,
              style: 'flow',
              color: '#38d6ff',
              width: 0.6,
              speed: 1.5,
              opacity: 0.95,
            },
          }
        : {
            ...base,
            id: newId('node'),
            kind: 'area',
            name: uniqueName(this.doc.value, '区域'),
            transform: { ...identityTransform(), position: [origin.x, 0, origin.z] },
            area: { points: local, color: '#35c6b4', opacity: 0.55, wallHeight: 3, label: '' },
          }
    this.insert(kind === 'path' ? '绘制能流线' : '绘制区域', [node])
  }

  // ================================================================ editing nodes

  updateNode(id: string, recipe: (node: SceneNodeV2) => void, label = '修改属性', coalesceKey?: string): void {
    this.edit(
      label,
      draft => {
        const node = nodeById(draft, id)
        if (node) recipe(node)
      },
      { coalesceKey },
    )
  }

  /** Applies a change to every selected node (multi-edit in the inspector). */
  updateSelected(recipe: (node: SceneNodeV2) => void, label = '修改属性', coalesceKey?: string): void {
    const ids = this.selection.value
    this.edit(
      label,
      draft => {
        for (const id of ids) {
          const node = nodeById(draft, id)
          if (node) recipe(node)
        }
      },
      { coalesceKey },
    )
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim()
    if (trimmed) this.updateNode(id, node => void (node.name = trimmed), '重命名')
  }

  setVisible(ids: readonly string[], visible: boolean): void {
    this.edit(visible ? '显示' : '隐藏', draft => {
      for (const id of ids) {
        const node = nodeById(draft, id)
        if (node) node.visible = visible
      }
    })
  }

  setLocked(ids: readonly string[], locked: boolean): void {
    this.edit(locked ? '锁定' : '解锁', draft => {
      for (const id of ids) {
        const node = nodeById(draft, id)
        if (node) node.locked = locked
      }
    })
    this.refreshSelectionVisuals()
  }

  toggleVisibilityOfSelection(): void {
    const nodes = this.selectedNodes
    if (nodes.length)
      this.setVisible(
        nodes.map(node => node.id),
        !nodes.every(node => node.visible),
      )
  }

  deleteSelection(): void {
    const ids = this.selection.value
    if (!ids.length) return
    this.edit(`删除 ${ids.length} 个对象`, draft => void removeNodes(draft, ids))
    this.clearSelection()
  }

  duplicateSelection(): void {
    const ids = this.selection.value
    if (!ids.length) return
    let created: string[] = []
    this.edit('复制', draft => {
      created = duplicateNodes(draft, ids, [2, 0, 2])
    })
    this.select(created)
  }

  copySelection(): void {
    const doc = this.doc.value
    const ids = topmost(doc, this.selection.value)
    if (!ids.length) return
    const included = new Set(ids.flatMap(id => [...subtreeIds(doc, id)]))
    this.clipboard = {
      nodes: plain(doc.nodes.filter(node => included.has(node.id))) as SceneNodeV2[],
      effects: plain(doc.effects.filter(effect => included.has(targetNodeId(effect.target)))) as EffectInstance[],
    }
  }

  paste(): void {
    const clip = this.clipboard
    if (!clip) return
    const remap = new Map(clip.nodes.map(node => [node.id, newId(node.kind === 'model' ? 'instance' : 'node')]))
    const roots: string[] = []
    this.edit('粘贴', draft => {
      for (const original of clip.nodes) {
        const node = plain(original) as SceneNodeV2
        node.id = remap.get(original.id)!
        const parentInClip = original.parentId ? remap.get(original.parentId) : undefined
        node.parentId =
          parentInClip ?? (original.parentId && nodeById(draft, original.parentId) ? original.parentId : null)
        delete node.runtimeBid
        if (!parentInClip) {
          node.name = uniqueName(draft, node.name)
          node.transform.position = [
            node.transform.position[0] + 3,
            node.transform.position[1],
            node.transform.position[2] + 3,
          ]
          roots.push(node.id)
        }
        draft.nodes.push(node)
      }
      for (const effect of clip.effects) {
        const target = plain(effect.target) as TwinBindingTarget
        const id = remap.get(targetNodeId(target))
        if (!id) continue
        if (target.type === 'asset-instance' || target.type === 'asset-node') target.instanceId = id
        else target.nodeId = id
        draft.effects.push({ ...plain(effect), id: newId('effect'), target })
      }
    })
    this.select(roots)
  }

  groupSelection(): string | null {
    let id: string | null = null
    this.edit('组合', draft => {
      id = groupNodes(draft, this.selection.value)
    })
    if (id) this.select([id])
    return id
  }

  ungroupSelection(): void {
    const groups = this.selectedNodes.filter(node => node.kind === 'group').map(node => node.id)
    if (!groups.length) return
    let freed: string[] = []
    this.edit('取消组合', draft => {
      freed = ungroupNodes(draft, groups)
    })
    this.select(freed)
  }

  reparent(ids: readonly string[], parentId: string | null, beforeId?: string): void {
    this.edit('调整层级', draft => reparentNodes(draft, ids, parentId, beforeId))
  }

  /** Lines the selection up along a world axis. */
  align(axis: 0 | 1 | 2, edge: 'min' | 'center' | 'max'): void {
    const ids = topmost(this.doc.value, this.selection.value)
    const boxes = ids.map(id => {
      const object = this.sync.objectFor(id)
      return object ? new Box3().setFromObject(object, true) : null
    })
    if (boxes.filter(Boolean).length < 2) return
    const values = boxes.map(box => (box ? edgeOf(box, axis, edge) : 0))
    const goal =
      edge === 'min'
        ? Math.min(...values)
        : edge === 'max'
          ? Math.max(...values)
          : values.reduce((a, b) => a + b, 0) / values.length
    this.shiftWorld(
      '对齐',
      ids,
      ids.map((_, i) => (boxes[i] ? goal - values[i]! : 0)),
      axis,
    )
  }

  /** Spaces the selection evenly between its outermost members. */
  distribute(axis: 0 | 2): void {
    const ids = topmost(this.doc.value, this.selection.value)
    const entries = ids
      .map(id => ({
        id,
        box: this.sync.objectFor(id) ? new Box3().setFromObject(this.sync.objectFor(id)!, true) : null,
      }))
      .filter((entry): entry is { id: string; box: Box3 } => !!entry.box)
      .map(entry => ({ ...entry, center: edgeOf(entry.box, axis, 'center') }))
      .sort((a, b) => a.center - b.center)
    if (entries.length < 3) return
    const first = entries[0]!.center
    const step = (entries.at(-1)!.center - first) / (entries.length - 1)
    this.shiftWorld(
      '均匀分布',
      entries.map(entry => entry.id),
      entries.map((entry, index) => first + step * index - entry.center),
      axis,
    )
  }

  /** Sets every selected object down on the ground. */
  dropToGround(): void {
    const ids = topmost(this.doc.value, this.selection.value)
    const offsets = ids.map(id => {
      const object = this.sync.objectFor(id)
      const box = object ? new Box3().setFromObject(object, true) : null
      return box && !box.isEmpty() ? -box.min.y : 0
    })
    this.shiftWorld('落地', ids, offsets, 1)
  }

  /** Copies the selection `count` times, each `spacing` metres further along X / Z. */
  arrayDuplicate(count: number, spacing: [number, number, number]): void {
    const ids = topmost(this.doc.value, this.selection.value)
    if (!ids.length || count < 1) return
    const created: string[] = []
    this.edit(`阵列 ${count} 份`, draft => {
      for (let i = 1; i <= count; i++) {
        created.push(...duplicateNodes(draft, ids, [spacing[0] * i, spacing[1] * i, spacing[2] * i]))
      }
    })
    this.select([...ids, ...created])
  }

  private shiftWorld(label: string, ids: readonly string[], offsets: readonly number[], axis: 0 | 1 | 2): void {
    this.edit(label, draft => {
      ids.forEach((id, index) => {
        const offset = offsets[index] ?? 0
        if (Math.abs(offset) < 1e-6) return
        const node = nodeById(draft, id)
        if (!node) return
        const world = worldMatrixOf(draft, id)
        const shift = new Vector3()
        shift.setComponent(axis, offset)
        world.premultiply(new Matrix4().makeTranslation(shift.x, shift.y, shift.z))
        node.transform = transformOf(worldMatrixOf(draft, node.parentId).invert().multiply(world))
      })
    })
  }

  // ================================================================ scene settings

  updateSettings(recipe: (settings: SceneSettingsV2) => void, label = '场景设置', coalesceKey?: string): void {
    this.edit(label, draft => recipe(draft.settings), { coalesceKey })
  }

  applyPreset(id: string): void {
    const preset = scenePresets.find(item => item.id === id)
    if (preset) this.edit(`氛围：${preset.name}`, draft => void (draft.settings = preset.apply(draft.settings)))
  }

  setQuality(quality: QualitySetting): void {
    this.engine.setQuality(quality)
    this.ui.stats = this.engine.getStats()
  }

  // ================================================================ data

  bindingFor(nodeId: string): TwinBinding | undefined {
    const node = this.node(nodeId)
    if (!node) return undefined
    const key = twinBindingTargetKey(targetForNode(node))
    return this.doc.value.bindings.find(binding => twinBindingTargetKey(binding.target) === key)
  }

  setBinding(nodeId: string, update: Omit<TwinBinding, 'id' | 'target'>, coalesceKey?: string): void {
    const node = this.node(nodeId)
    if (!node) return
    const target = targetForNode(node)
    this.edit(
      '设备绑定',
      draft => {
        const key = twinBindingTargetKey(target)
        const existing = draft.bindings.find(binding => twinBindingTargetKey(binding.target) === key)
        if (existing) {
          existing.device = plain(update.device)
          existing.variables = plain(update.variables)
        } else draft.bindings.push({ id: newId('binding'), target, ...plain(update) })
      },
      { coalesceKey },
    )
  }

  removeBinding(nodeId: string): void {
    const binding = this.bindingFor(nodeId)
    if (!binding) return
    this.edit('解除绑定', draft => {
      draft.bindings = draft.bindings.filter(item => item.id !== binding.id)
      draft.visualRules = draft.visualRules.filter(rule => rule.bindingId !== binding.id)
    })
  }

  /** Binds each node to a device of the template, numbering ids from `start`. Returns how many were bound. */
  batchBind(
    nodeIds: readonly string[],
    template: DeviceTemplate,
    prefix: string,
    start: number,
    namePrefix: string,
  ): number {
    const nodes = nodeIds.flatMap(id => this.node(id) ?? [])
    if (!nodes.length) return 0
    this.edit(`批量绑定 ${nodes.length} 台${template.name}`, draft => {
      nodes.forEach((node, index) => {
        const target = targetForNode(node)
        const key = twinBindingTargetKey(target)
        const number = start + index
        const device = {
          id: deviceIdFor(prefix, number),
          name: `${namePrefix} ${String(number).padStart(2, '0')}`,
          type: template.type,
        }
        const existing = draft.bindings.find(binding => twinBindingTargetKey(binding.target) === key)
        if (existing) {
          existing.device = device
          existing.variables = deviceVariables(template)
        } else draft.bindings.push({ id: newId('binding'), target, device, variables: deviceVariables(template) })
      })
    })
    return nodes.length
  }

  setDataSource(url: string, enabled: boolean): void {
    this.edit('数据源', draft => {
      const sources: ProjectDataSource[] = draft.dataSources ?? []
      const existing = sources.find(source => source.type === 'websocket')
      if (existing && existing.type === 'websocket') {
        existing.url = url
        existing.enabled = enabled
      } else sources.push({ id: 'realtime', name: '实时设备数据', type: 'websocket', enabled, url })
      for (const source of sources) if (source.type !== 'websocket') source.enabled = false
      draft.dataSources = sources
    })
  }

  liveValue(bindingId: string, key: string): string {
    void this.twin.runtimeRevision
    const variable = this.doc.value.bindings
      .find(binding => binding.id === bindingId)
      ?.variables.find(item => item.key === key)
    return formatRuntimeValue(this.twin.getRuntimeValue(bindingId, key)?.value, variable?.unit)
  }

  private deviceLines(target: TwinBindingTarget, variables?: readonly string[]) {
    const binding = this.twin.getBindingByTarget(target)
    if (!binding) return null
    const shown = variables?.length ? binding.variables.filter(item => variables.includes(item.key)) : binding.variables
    return {
      title: binding.device.name || binding.device.id,
      rows: shown.slice(0, 8).map(item => {
        const value = this.twin.getRuntimeValue(binding.id, item.key)?.value
        return `${item.name || item.key}\t${formatRuntimeValue(value, item.unit)}`
      }),
    }
  }

  // ================================================================ effects, rules, interactions

  effectsFor(nodeId: string): EffectInstance[] {
    return this.doc.value.effects.filter(effect => targetNodeId(effect.target) === nodeId)
  }

  addEffect(nodeId: string, kind: EffectKind): void {
    const node = this.node(nodeId)
    if (!node) return
    const effect = createEffect(kind, targetForNode(node))
    if (kind === 'floating-label' || kind === 'icon-marker') effect.parameters.text = node.name
    this.edit('添加特效', draft => void draft.effects.push(effect))
  }

  updateEffect(id: string, recipe: (effect: EffectInstance) => void, coalesceKey?: string): void {
    this.edit(
      '修改特效',
      draft => {
        const effect = draft.effects.find(item => item.id === id)
        if (effect) recipe(effect)
      },
      { coalesceKey },
    )
  }

  removeEffect(id: string): void {
    this.edit('删除特效', draft => void (draft.effects = draft.effects.filter(item => item.id !== id)))
  }

  rulesFor(nodeId: string): VisualRule[] {
    return this.doc.value.visualRules.filter(rule => targetNodeId(rule.target) === nodeId)
  }

  addRule(nodeId: string): boolean {
    const binding = this.bindingFor(nodeId)
    if (!binding) return false
    const variable = binding.variables.find(item => item.dataType === 'number') ?? binding.variables[0]
    if (!variable) return false
    const templates = getBuiltinTemplates()
    const template = plain(templates.find(item => item.name.includes('告警')) ?? templates[0] ?? null)
    const condition: VisualRule['condition'] =
      variable.dataType === 'number'
        ? { dataType: 'number', operator: '>', value: 60 }
        : variable.dataType === 'boolean'
          ? { dataType: 'boolean', operator: '==', value: true }
          : { dataType: 'string', operator: '==', value: 'alarm' }
    const rule: VisualRule = {
      id: newId('rule'),
      bindingId: binding.id,
      target: binding.target,
      variableKey: variable.key,
      condition,
      enabled: true,
      priority: 10,
      template,
    }
    this.edit('添加告警规则', draft => void draft.visualRules.push(rule))
    return true
  }

  updateRule(id: string, recipe: (rule: VisualRule) => void): void {
    this.edit('修改告警规则', draft => {
      const rule = draft.visualRules.find(item => item.id === id)
      if (rule) recipe(rule)
    })
  }

  removeRule(id: string): void {
    this.edit('删除告警规则', draft => void (draft.visualRules = draft.visualRules.filter(item => item.id !== id)))
  }

  interactionsFor(nodeId: string): SceneInteraction[] {
    return this.doc.value.interactions.filter(item => targetNodeId(item.source) === nodeId)
  }

  addInteraction(nodeId: string): void {
    const node = this.node(nodeId)
    if (!node) return
    const interaction = createInteraction(targetForNode(node))
    interaction.action = { type: 'emit-event', eventName: 'device-click' }
    this.edit('添加交互', draft => void draft.interactions.push(interaction))
  }

  updateInteraction(id: string, recipe: (item: SceneInteraction) => void): void {
    this.edit('修改交互', draft => {
      const item = draft.interactions.find(entry => entry.id === id)
      if (item) recipe(item)
    })
  }

  removeInteraction(id: string): void {
    this.edit('删除交互', draft => void (draft.interactions = draft.interactions.filter(item => item.id !== id)))
  }

  // ================================================================ views and tours

  async addBookmark(name?: string): Promise<string> {
    const view = this.engine.rig.getView()
    const thumbnail = (await this.captureClean(240)) ?? undefined
    const bookmark: CameraBookmark = {
      id: newId('view'),
      name: name || `视角 ${this.doc.value.bookmarks.length + 1}`,
      view,
      ...(thumbnail ? { thumbnail } : {}),
    }
    this.edit('保存视角', draft => void draft.bookmarks.push(bookmark))
    return bookmark.id
  }

  async updateBookmarkView(id: string): Promise<void> {
    const view = this.engine.rig.getView()
    const thumbnail = (await this.captureClean(240)) ?? undefined
    this.edit('更新视角', draft => {
      const bookmark = draft.bookmarks.find(item => item.id === id)
      if (!bookmark) return
      bookmark.view = view
      if (thumbnail) bookmark.thumbnail = thumbnail
    })
  }

  renameBookmark(id: string, name: string): void {
    this.edit('重命名视角', draft => {
      const bookmark = draft.bookmarks.find(item => item.id === id)
      if (bookmark && name.trim()) bookmark.name = name.trim()
    })
  }

  removeBookmark(id: string): void {
    this.edit('删除视角', draft => {
      draft.bookmarks = draft.bookmarks.filter(item => item.id !== id)
      for (const tour of draft.tours) for (const step of tour.steps) if (step.bookmarkId === id) step.bookmarkId = null
    })
  }

  flyToBookmark(id: string): Promise<boolean> {
    const bookmark = this.doc.value.bookmarks.find(item => item.id === id)
    return bookmark ? this.engine.flyTo(bookmark.view, 1.2) : Promise.resolve(false)
  }

  /** The project opens with the current camera view. */
  setOpeningView(): void {
    const view = this.engine.rig.getView()
    this.edit('设为初始视角', draft => void (draft.cameraView = view))
  }

  addTour(fromBookmarks = false): string {
    const tour: Tour = {
      id: newId('tour'),
      name: `导览 ${this.doc.value.tours.length + 1}`,
      loop: true,
      steps: fromBookmarks
        ? this.doc.value.bookmarks.map(bookmark => createStep({ bookmarkId: bookmark.id, caption: bookmark.name }))
        : [],
    }
    this.edit('新建导览', draft => void draft.tours.push(tour))
    return tour.id
  }

  updateTour(id: string, recipe: (tour: Tour) => void, coalesceKey?: string): void {
    this.edit(
      '修改导览',
      draft => {
        const tour = draft.tours.find(item => item.id === id)
        if (tour) recipe(tour)
      },
      { coalesceKey },
    )
  }

  removeTour(id: string): void {
    this.edit('删除导览', draft => {
      draft.tours = draft.tours.filter(item => item.id !== id)
      if (draft.presentation.autoplayTourId === id) draft.presentation.autoplayTourId = null
    })
  }

  addTourStep(tourId: string, patch: Partial<TourStep> = {}): void {
    this.updateTour(tourId, tour => void tour.steps.push(createStep(patch)))
  }

  updatePresentation(recipe: (presentation: SceneDocumentV2['presentation']) => void): void {
    this.edit('放映设置', draft => recipe(draft.presentation))
  }

  playTour(id: string, from = 0): void {
    this.clearSelection()
    void this.tours.play(id, from)
  }

  stopTour(): void {
    this.tours.stop()
  }

  // ================================================================ preview mode

  enterPreview(): void {
    if (this.ui.mode === 'preview' || !this.effects) return
    this.drawTool.cancel()
    this.clearSelection()
    this.ui.mode = 'preview'
    this.engine.setHelpers({ grid: false, axes: false })
    this.gizmo.setVisible(false)
    const effects = this.effects
    const interactions = new InteractionRuntime({
      resolver: this.resolver,
      effects,
      selectTarget: target => {
        const object = this.resolver.resolve(target)
        this.engine.setOutlined('selection', object ? [object] : [])
        return !!object
      },
      clearSelection: () => this.engine.setOutlined('selection', []),
      focusTarget: async target => {
        const object = this.resolver.resolve(target)
        if (object) await this.engine.focus(object)
        return !!object
      },
      resolveDeviceId: target => this.twin.getBindingByTarget(target)?.device.id ?? null,
      emit: () => {},
      flyToBookmark: id => this.flyToBookmark(id),
      playTour: id => void this.tours.play(id),
      stopTour: () => this.tours.stop(),
    })
    interactions.setInteractions(this.doc.value.interactions)
    interactions.setPointerActive(true)
    const pointers = new ViewerPointerEvents(
      this.canvas,
      this.engine,
      () => this.sync.roots,
      this.twin,
      event => {
        const object = this.resolver.resolve(event.target)
        this.engine.setOutlined('selection', object ? [object] : [])
        void interactions.dispatch('click', event)
      },
      () => this.engine.setOutlined('selection', []),
      event => void interactions.dispatch('double-click', event),
      event => void interactions.dispatch('hover-enter', event),
      event => void interactions.dispatch('hover-leave', event),
    )
    this.preview = { interactions, pointers }
  }

  exitPreview(): void {
    if (!this.preview) return
    this.tours.stop()
    this.preview.pointers.dispose()
    this.preview.interactions.dispose()
    this.preview = null
    this.visibility.dispose()
    this.ui.mode = 'edit'
    this.engine.setOutlined('selection', [])
    this.engine.setHelpers(this.doc.value.settings.helpers)
    this.refreshSelectionVisuals()
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function edgeOf(box: Box3, axis: 0 | 1 | 2, edge: 'min' | 'center' | 'max'): number {
  const min = box.min.getComponent(axis)
  const max = box.max.getComponent(axis)
  return edge === 'min' ? min : edge === 'max' ? max : (min + max) / 2
}

function worldMatrixOfTransform(node: SceneNodeV2): Matrix4 {
  return worldMatrixOf({ nodes: [{ ...node, parentId: null }] } as unknown as SceneDocumentV2, node.id)
}

function createStep(patch: Partial<TourStep> = {}): TourStep {
  return {
    id: newId('step'),
    bookmarkId: null,
    nodeId: null,
    duration: 2.5,
    hold: 4,
    caption: '',
    show: [],
    hide: [],
    highlightNodeId: null,
    ...patch,
  }
}

export type { DrawKind } from './DrawTool'
export type ObjectLookup = (id: string) => Object3D | null
