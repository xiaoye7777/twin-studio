import { reactive, shallowRef } from 'vue'
import { Box3, Matrix4, type Object3D, Vector3 } from 'three'
import {
  applyCameraLimits,
  type AssetRepository,
  BindingTargetResolver,
  type CameraView,
  createEffect,
  createEmptyDocument,
  createTwinState,
  type DocumentChange,
  DocumentStore,
  EffectRuntime,
  type EngineStats,
  idleTourState,
  InteractionRuntime,
  isLockedOrHidden,
  loadSceneDocument,
  MODEL_ROOT_PART,
  nodeById,
  plain,
  type QualitySetting,
  RuntimeVisibilityLayer,
  type SceneDocumentV2,
  type SceneNodeV2,
  scenePresets,
  type SceneRepository,
  type SceneSettingsV2,
  SceneSync,
  targetForNode,
  topmost,
  TourPlayer,
  type TourState,
  transformOf,
  TwinDataRuntime,
  TwinEngine,
  ViewerPointerEvents,
  VisualRuleRuntime,
  worldMatrixOf,
} from '@twin-studio/core'
import { type DrawKind, DrawTool } from './DrawTool'
import { type SceneHistoryRepository, type SnapshotKind } from '@/infrastructure/history/SceneHistoryRepository'
import { MeasureTool, type MeasureReadout } from './MeasureTool'
import { type GizmoMode, TransformGizmo } from './TransformGizmo'
import { sceneSourceHeaders } from '@/screen/datasources/sceneSource'
import { DeviceData } from './session/DeviceData'
import { DrawingTools } from './session/DrawingTools'
import { ModelParts } from './session/ModelParts'
import { NodeCreation } from './session/NodeCreation'
import { NodeEditing } from './session/NodeEditing'
import { NodeEffects } from './session/NodeEffects'
import { ViewportPointer } from './session/ViewportPointer'
import { ViewsAndTours } from './session/ViewsAndTours'

export type EditorTool = 'select' | GizmoMode

/** A part inside a model node, selected by entering the model (click it again, or double-click). */
export interface PartRef {
  nodeId: string
  assetNodeId: string
}
export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

export interface EditorSessionDeps {
  projectId: string
  projectName: string
  assets: AssetRepository
  scenes: SceneRepository
  /** Called after each save with a small JPEG of the scene for the project card. */
  onCover?: (dataUrl: string, saved: boolean) => void
  /** Saved versions; saving keeps one at most every ten minutes, and on every manual save. */
  history?: SceneHistoryRepository
  quality?: QualitySetting
}

/**
 * 编辑器里一个打开的项目。
 *
 * 文档（DocumentStore）是唯一的真相：每次修改都是一个事务（edit），SceneSync 把文档画成三维场景，面板读 `doc`。
 * 三维对象从不被直接修改。
 *
 * 这个类只放核心：生命周期、文档与撤销、保存与历史版本、选择、场景设置、预览模式。其余功能按主题分在
 * `session/` 目录下的模块里，通过字段访问，例如 `session.nodes.duplicateSelection()`、`session.views.addTour()`，
 * 分工见 studio/README.md。
 */ export class EditorSession {
  readonly engine: TwinEngine
  readonly sync: SceneSync
  readonly store: DocumentStore<SceneDocumentV2>
  readonly doc = shallowRef<SceneDocumentV2>(createEmptyDocument('', ''))
  readonly selection = shallowRef<string[]>([])
  readonly hovered = shallowRef<string | null>(null)
  /** The model part being edited; `selection` is then exactly its model. */
  readonly part = shallowRef<PartRef | null>(null)
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
    measure: {
      mode: null,
      points: 0,
      length: 0,
      area: 0,
      segment: null,
      done: false,
    } as MeasureReadout,
    /** The viewport's right-click menu: where it opened and the scene point under it. */
    contextMenu: null as { x: number; y: number; point: [number, number, number] | null } | null,
    hasClipboard: false,
    /** Bumped when a version is stored, so the history list refreshes. */
    historyRevision: 0,
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
    /** Box selection in progress, in canvas pixels. */
    marquee: null as { left: number; top: number; width: number; height: number } | null,
    syncRevision: 0,
    dataRevision: 0,
  })

  // ---------------------------------------------------------------- 功能模块（各自一个文件，见 session/）
  /** 视口里的鼠标：点选、框选、悬停、右键菜单。 */
  readonly pointer: ViewportPointer
  /** 模型部件的覆盖：改名、位置、显隐、材质、删除。 */
  readonly modelParts = new ModelParts(this)
  /** 绘制和测量工具。 */
  readonly tools = new DrawingTools(this)
  /** 添加模型、基本体、分组、组件。 */
  readonly create = new NodeCreation(this)
  /** 编辑对象：属性、复制粘贴、组合、对齐、删除…… */
  readonly nodes = new NodeEditing(this)
  /** 设备绑定与数据源。 */
  readonly devices = new DeviceData(this)
  /** 特效、告警规则、点击交互。 */
  readonly effects = new NodeEffects(this)
  /** 视角、导览、放映设置。 */
  readonly views = new ViewsAndTours(this)

  // ---------------------------------------------------------------- 内部部件（功能模块通过 session 使用）
  readonly projectId: string
  readonly assets: AssetRepository
  private readonly scenes: SceneRepository
  private readonly resolver: BindingTargetResolver
  readonly dataRuntime: TwinDataRuntime
  private readonly visibility = new RuntimeVisibilityLayer()
  readonly gizmo: TransformGizmo
  readonly drawTool: DrawTool
  readonly measureTool: MeasureTool
  readonly tours: TourPlayer
  effectRuntime: EffectRuntime | null = null
  ruleRuntime: VisualRuleRuntime | null = null
  private preview: { interactions: InteractionRuntime; pointers: ViewerPointerEvents } | null = null
  private gizmoIds: string[] = []
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null
  /** The last document kept as a version, and when. */
  private lastSnapshot: { document: SceneDocumentV2; at: number } | null = null
  private statsTimer: ReturnType<typeof setInterval>
  /** 已关闭：模块里的异步工作（截图、悬停检测）看到它就停止。 */
  disposed = false

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly deps: EditorSessionDeps,
  ) {
    this.projectId = deps.projectId
    this.assets = deps.assets
    this.scenes = deps.scenes
    this.engine = new TwinEngine(canvas, { quality: deps.quality ?? 'auto', preserveDrawingBuffer: true })
    this.sync = new SceneSync(this.engine, this.assets, undefined, { editor: true })
    this.sync.motionValue = (nodeId, key) => {
      const node = this.node(nodeId)
      const binding = node ? this.twin.getBindingByTarget(targetForNode(node)) : null
      return binding ? this.twin.getRuntimeValue(binding.id, key)?.value : undefined
    }
    this.store = new DocumentStore(createEmptyDocument(deps.projectId, deps.projectName), 300)
    this.resolver = new BindingTargetResolver(id => this.sync.objectFor(id))
    this.dataRuntime = new TwinDataRuntime(this.twin, this.resolver, { requestHeaders: sceneSourceHeaders })
    this.gizmo = new TransformGizmo(this.engine, {
      onStart: () => {},
      onChange: ({ worlds }) => this.applyGizmo(worlds),
      onEnd: () => this.store.seal(),
    })
    this.gizmo.setMode('translate')
    this.drawTool = new DrawTool(
      this.engine,
      result => this.create.finishDrawing(result),
      state => {
        this.ui.draw = state.kind
        this.ui.drawPoints = state.points
      },
    )
    this.measureTool = new MeasureTool(this.engine, readout => (this.ui.measure = readout))
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
            this.effectRuntime?.setTransientEffects('tour', [
              { ...createEffect('outline', { type: 'node', nodeId: id }), id: 'tour:highlight' },
            ])
          else this.effectRuntime?.clearTransientEffects('tour')
        },
      },
      state => (this.ui.tour = state),
    )
    this.store.subscribe(change => this.onDocumentChange(change))
    this.pointer = new ViewportPointer(this)
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
      this.effectRuntime = new EffectRuntime(this.engine, this.resolver)
      this.effectRuntime.dataProvider = (target, variables) => this.devices.deviceLines(target, variables)
      this.dataRuntime.initialize(this.projectId, document.bindings)
      this.dataRuntime.start(document.dataSources)
      this.ruleRuntime = new VisualRuleRuntime(
        this.effectRuntime,
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
      // Projects get a card picture as soon as they are opened, not only after the first save.
      setTimeout(() => !this.disposed && this.refreshCover(), 2500)
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
    this.pointer.dispose()
    this.exitPreview()
    this.tours.dispose()
    this.ruleRuntime?.dispose()
    this.effectRuntime?.dispose()
    this.dataRuntime.stop()
    this.visibility.dispose()
    this.gizmo.dispose()
    this.drawTool.dispose()
    this.measureTool.dispose()
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
      this.dataRuntime.refresh()
      this.effectRuntime?.refresh()
      this.refreshSelectionVisuals()
    })
    if (change.origin !== 'reset') {
      if (next.bindings !== previous.bindings) {
        this.dataRuntime.initialize(this.projectId, next.bindings)
        this.dataRuntime.start(next.dataSources)
      } else if (next.dataSources !== previous.dataSources) this.dataRuntime.start(next.dataSources)
      this.scheduleAutosave()
    }
    const ids = new Set(next.nodes.map(node => node.id))
    if (this.selection.value.some(id => !ids.has(id))) this.select(this.selection.value.filter(id => ids.has(id)))
    const part = this.part.value
    const owner = part ? nodeById(next, part.nodeId) : null
    if (part && owner?.kind === 'model' && owner.model.deleted.includes(part.assetNodeId)) this.select([part.nodeId])
  }

  node(id: string): SceneNodeV2 | undefined {
    return nodeById(this.doc.value, id)
  }

  get selectedNodes(): SceneNodeV2[] {
    return this.selection.value.flatMap(id => this.node(id) ?? [])
  }

  // ================================================================ persistence

  /** Saves now; `manual` (Ctrl/⌘ + S, the save button) also keeps a version. */
  async save(manual = false): Promise<boolean> {
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
      this.refreshCover(true)
      const due = !this.lastSnapshot || Date.now() - this.lastSnapshot.at > 10 * 60_000
      if (manual || due) void this.snapshot(manual ? '手动保存' : '自动保存', manual ? 'manual' : 'auto')
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

  // ================================================================ versions

  /** Keeps the current document as a version (skipped when it equals the last one kept). */
  async snapshot(label: string, kind: SnapshotKind = 'manual'): Promise<boolean> {
    const history = this.deps.history
    const document = this.store.document
    if (!history || this.lastSnapshot?.document === document) return false
    this.lastSnapshot = { document, at: Date.now() }
    const thumbnail = (await this.captureClean(200)) ?? undefined
    await history.add(
      { projectId: this.projectId, label, kind, nodeCount: document.nodes.length, thumbnail },
      JSON.stringify(document),
    )
    this.ui.historyRevision++
    return true
  }

  /** Brings back a saved version as one undoable edit, keeping the current state as a version first. */
  async restoreSnapshot(id: string): Promise<void> {
    const json = await this.deps.history?.document(id)
    if (!json) throw new Error('这个版本已不存在')
    const { document } = loadSceneDocument(JSON.parse(json))
    await this.snapshot('恢复前的版本', 'restore')
    this.edit('恢复历史版本', draft => {
      const target = draft as unknown as Record<string, unknown>
      const source = plain(document) as unknown as Record<string, unknown>
      for (const key of Object.keys(target)) if (!(key in source)) delete target[key]
      for (const [key, value] of Object.entries(source)) if (key !== 'projectId') target[key] = value
    })
    this.select([])
  }

  /** The project card's picture: the opening view (or the current one); `saved` after a save. */
  private refreshCover(saved = false): void {
    const opening = this.store.document.cameraView
    void (opening ? this.captureFrom(opening, 480) : this.captureClean(480)).then(
      cover => cover && !this.disposed && this.deps.onCover?.(cover, saved),
    )
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
    this.measureTool.setHidden(true)
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
      this.measureTool.setHidden(false)
      this.refreshSelectionVisuals()
    }
  }

  // ================================================================ selection

  select(ids: readonly string[], mode: 'replace' | 'toggle' | 'add' = 'replace'): void {
    this.part.value = null
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

  /** Selects a part of a model node (its model becomes the selection). */
  selectPart(nodeId: string, assetNodeId: string): void {
    if (assetNodeId === MODEL_ROOT_PART) return this.select([nodeId])
    this.selection.value = [nodeId]
    this.part.value = { nodeId, assetNodeId }
    this.refreshSelectionVisuals()
  }

  /** Esc: from a part back to its model, otherwise clear the selection. */
  selectParent(): void {
    const part = this.part.value
    if (part) this.select([part.nodeId])
    else this.clearSelection()
  }

  selectAll(): void {
    this.select(this.doc.value.nodes.filter(node => node.parentId === null && !node.locked).map(node => node.id))
  }

  clearSelection(): void {
    this.select([])
  }

  refreshSelectionVisuals(): void {
    if (this.disposed) return
    const editing = this.ui.mode === 'edit'
    const part = this.part.value
    const partObject = part ? this.sync.partObject(part.nodeId, part.assetNodeId) : null
    if (part && partObject) {
      this.engine.setOutlined('selection', [partObject])
      const movable = !isLockedOrHidden(this.doc.value, part.nodeId).locked
      this.gizmoIds = this.ui.tool !== 'select' && editing && movable ? [part.nodeId] : []
      this.gizmo.attach(this.gizmoIds.length ? [partObject] : [])
      this.gizmo.setVisible(this.gizmoIds.length > 0)
      return
    }
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
    const part = this.part.value
    const partObject = part ? this.sync.partObject(part.nodeId, part.assetNodeId) : null
    const objects = partObject ? [partObject] : this.selection.value.flatMap(id => this.sync.objectFor(id) ?? [])
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
    const part = this.part.value
    if (part) {
      // Part overrides are local to the part's parent inside the model.
      const parent = this.sync.partObject(part.nodeId, part.assetNodeId)?.parent
      if (!parent || !worlds[0]) return
      parent.updateWorldMatrix(true, false)
      const local = parent.matrixWorld.clone().invert().multiply(worlds[0])
      this.modelParts.updatePart(
        part.nodeId,
        part.assetNodeId,
        override => void (override.transform = transformOf(local)),
        this.ui.tool === 'rotate' ? '旋转部件' : this.ui.tool === 'scale' ? '缩放部件' : '移动部件',
        `gizmo:${part.nodeId}:${part.assetNodeId}`,
      )
      return
    }
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

  // ================================================================ preview mode

  enterPreview(): void {
    if (this.ui.mode === 'preview' || !this.effectRuntime) return
    this.drawTool.cancel()
    this.measureTool.stop()
    this.clearSelection()
    this.ui.mode = 'preview'
    this.engine.setHelpers({ grid: false, axes: false })
    const doc = this.doc.value
    applyCameraLimits(this.engine.rig, doc.presentation.cameraLimits, this.sync.roots, [
      ...(doc.cameraView ? [doc.cameraView] : []),
      ...doc.bookmarks.map(bookmark => bookmark.view),
    ])
    this.gizmo.setVisible(false)
    const effects = this.effectRuntime
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
      flyToBookmark: id => this.views.flyToBookmark(id),
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
    this.engine.rig.setLimits(null)
    this.ui.mode = 'edit'
    this.engine.setOutlined('selection', [])
    this.engine.setHelpers(this.doc.value.settings.helpers)
    this.refreshSelectionVisuals()
  }
}

export type { DrawKind } from './DrawTool'
export type ObjectLookup = (id: string) => Object3D | null
