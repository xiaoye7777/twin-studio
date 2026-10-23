import { type InjectionKey, inject, reactive, shallowRef } from 'vue'
import { type DocumentChange, DocumentStore } from '@twin-studio/core'
import {
  contentSignature,
  newScreenId,
  type ScreenDocument,
  type ScreenGroup,
  type ScreenPage,
  type ScreenVersion,
  type Widget,
} from '../model'
import { captureScreen } from '../render/capture'
import { ScreenRuntime } from '../runtime/ScreenRuntime'
import { type ScreenRepository, screenRepository } from '../storage/ScreenRepository'
import { createWidget } from '../widgets'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** A snapping line shown while dragging, in page coordinates. */
export interface Guide {
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
}

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'
const ZOOM = { min: 0.05, max: 4 }

/**
 * One data screen open in the editor. Every change is a DocumentStore transaction (undo/redo), the canvas
 * and panels read `doc`, and changes are saved shortly after they happen.
 */
export class ScreenEditorSession {
  readonly store: DocumentStore<ScreenDocument>
  readonly doc
  readonly selection = shallowRef<string[]>([])
  readonly runtime = new ScreenRuntime(true)
  readonly ui = reactive({
    zoom: 0.5,
    panX: 40,
    panY: 40,
    viewport: { width: 0, height: 0 },
    guides: [] as Guide[],
    /** Box selection in viewport pixels. */
    marquee: null as Rect | null,
    hovered: null as string | null,
    snap: true,
    rulers: readSetting('screen-editor:rulers', true),
    shortcuts: false,
    versions: false,
    publishing: false,
    /** Bumped when versions change, so the history list reloads. */
    versionsRevision: 0,
    canUndo: false,
    canRedo: false,
    undoLabel: '',
    redoLabel: '',
    saveState: 'saved' as SaveState,
    saveError: '',
    lastSaved: '',
    leftTab: 'widgets' as 'widgets' | 'layers',
    inspectorTab: 'style' as 'style' | 'data' | 'events',
  })
  private clipboard: { widgets: Widget[]; groups: ScreenGroup[] } | null = null
  /** The rendered page in the canvas (set by the canvas), for thumbnails. */
  pageElement: HTMLElement | null = null
  private cover: string | undefined
  /** What the big screen shows; kept outside the edit history like the cover. */
  readonly published = shallowRef<ScreenDocument['published']>(undefined)
  /** Something was edited in this session: leaving keeps an automatic version. */
  private edited = false
  private coverAt = 0
  private capturing: Promise<void> | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  /** A coalesced edit (drag, slider) is still open: saving now would split it into two undo steps. */
  private openEdit = false
  private saveDeferredSince = 0
  private disposed = false

  constructor(
    document: ScreenDocument,
    private readonly repository: ScreenRepository = screenRepository,
  ) {
    this.cover = document.cover
    this.published.value = document.published
    this.store = new DocumentStore(document, 200)
    this.doc = shallowRef(this.store.document)
    this.runtime.setDocument(this.store.document)
    this.store.subscribe(change => this.onChange(change))
  }

  // ================================================================ document plumbing

  edit(label: string, recipe: (draft: ScreenDocument) => void, coalesceKey?: string): boolean {
    this.openEdit = coalesceKey !== undefined
    return this.store.transaction(label, recipe, { coalesceKey })
  }

  /** Ends a run of coalesced edits (drag end, slider release). */
  commit(): void {
    this.openEdit = false
    this.store.seal()
  }

  undo(): void {
    this.store.undo()
  }

  redo(): void {
    this.store.redo()
  }

  private onChange(change: DocumentChange<ScreenDocument>): void {
    this.doc.value = change.document
    this.runtime.setDocument(change.document)
    this.ui.canUndo = this.store.canUndo
    this.ui.canRedo = this.store.canRedo
    this.ui.undoLabel = this.store.undoLabel ?? ''
    this.ui.redoLabel = this.store.redoLabel ?? ''
    const ids = new Set(change.document.widgets.map(widget => widget.id))
    if (this.selection.value.some(id => !ids.has(id)))
      this.selection.value = this.selection.value.filter(id => ids.has(id))
    if (change.origin !== 'reset') {
      this.edited = true
      this.scheduleSave()
    }
  }

  private scheduleSave(): void {
    this.ui.saveState = 'unsaved'
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      // Wait for an open drag or slider to end (but not forever).
      const now = Date.now()
      if (this.openEdit && (!this.saveDeferredSince || now - this.saveDeferredSince < 6000)) {
        this.saveDeferredSince ||= now
        return this.scheduleSave()
      }
      this.saveDeferredSince = 0
      void this.save()
    }, 800)
  }

  async save(): Promise<boolean> {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    const current = this.store.document
    this.ui.saveState = 'saving'
    try {
      await this.repository.save({
        ...current,
        cover: this.cover,
        published: this.published.value,
        updatedAt: new Date().toISOString(),
      })
      // Open previews of this screen reload it.
      screenChannel()?.postMessage({ type: 'saved', id: current.id })
      if (this.store.document === current) this.store.markSaved()
      this.ui.saveState = this.store.isDirty ? 'unsaved' : 'saved'
      this.ui.lastSaved = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      // The list thumbnail follows the page, at most every 20 s while editing.
      if (Date.now() - this.coverAt > 20_000) void this.refreshCover()
      return true
    } catch (error) {
      this.ui.saveState = 'error'
      this.ui.saveError = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  /**
   * Renders a new list thumbnail and stores it with the screen (outside the edit history). Runs when the
   * browser is idle; `now` waits for it (leaving the editor).
   */
  refreshCover(now = false): Promise<void> {
    if (this.capturing) return this.capturing
    const element = this.pageElement
    if (!element) return Promise.resolve()
    this.coverAt = Date.now()
    this.capturing = new Promise<void>(resolve => {
      const run = async () => {
        try {
          const image = await captureScreen(element, this.store.document, this.runtime.viewers, this.runtime.charts)
          if (image && !this.disposed) {
            this.cover = image
            await this.repository.save({
              ...this.store.document,
              cover: image,
              published: this.published.value,
              updatedAt: new Date().toISOString(),
            })
          } else if (image) this.cover = image
        } catch {
          // A thumbnail is a convenience; the screen itself is saved either way.
        } finally {
          this.capturing = null
          resolve()
        }
      }
      if (now || typeof requestIdleCallback === 'undefined') void run()
      else requestIdleCallback(() => void run(), { timeout: 3000 })
    })
    return this.capturing
  }

  /** The canvas has drawn the page; a screen without a thumbnail gets one once widgets have loaded. */
  attachPage(element: HTMLElement | null): void {
    this.pageElement = element
    if (element && !this.cover) setTimeout(() => !this.disposed && !this.cover && void this.refreshCover(), 6000)
  }

  /** Before leaving the editor: save, with a fresh thumbnail, and keep this session's work as a version. */
  async leave(): Promise<void> {
    await this.refreshCover(true)
    await this.save()
    if (this.edited) await this.saveVersion('编辑后自动保存', 'auto')
  }

  // ================================================================ versions and publishing

  /** Keeps the current state as a version. */
  async saveVersion(label: string, kind: ScreenVersion['kind'] = 'manual'): Promise<ScreenVersion> {
    const document: ScreenDocument = JSON.parse(
      JSON.stringify({ ...this.store.document, cover: this.cover, published: undefined }),
    )
    const version: ScreenVersion = {
      id: newScreenId('version'),
      screenId: document.id,
      kind,
      label: label.trim() || (kind === 'publish' ? '发布' : '手动保存'),
      createdAt: new Date().toISOString(),
      document,
    }
    await this.repository.saveVersion(version)
    if (kind !== 'auto') this.edited = false
    this.ui.versionsRevision++
    return version
  }

  /** Makes the current state what the big screen (放映) shows. */
  async publish(note: string): Promise<ScreenVersion> {
    await this.save()
    const version = await this.saveVersion(note, 'publish')
    this.published.value = {
      versionId: version.id,
      at: version.createdAt,
      signature: contentSignature(this.store.document),
    }
    await this.save()
    screenChannel()?.postMessage({ type: 'published', id: this.store.document.id })
    return version
  }

  /** Edits made since the last publish. */
  get unpublished(): boolean {
    const published = this.published.value
    return !published || published.signature !== contentSignature(this.doc.value)
  }

  /** Brings back a version (one undo step); the state before is kept as a version first. */
  async restore(version: ScreenVersion): Promise<void> {
    await this.saveVersion('恢复前自动保存', 'auto')
    const source = version.document
    this.edit('恢复历史版本', draft => {
      draft.name = source.name
      draft.page = JSON.parse(JSON.stringify(source.page))
      draft.sceneProjectId = source.sceneProjectId
      draft.widgets = JSON.parse(JSON.stringify(source.widgets))
      draft.variables = JSON.parse(JSON.stringify(source.variables ?? []))
      draft.groups = JSON.parse(JSON.stringify(source.groups ?? []))
      draft.guides = JSON.parse(JSON.stringify(source.guides ?? { x: [], y: [] }))
    })
    this.clearSelection()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.saveTimer) void this.save()
    this.runtime.dispose()
  }

  // ================================================================ queries

  widget(id: string): Widget | undefined {
    return this.doc.value.widgets.find(widget => widget.id === id)
  }

  get selectedWidgets(): Widget[] {
    return this.selection.value.flatMap(id => this.widget(id) ?? [])
  }

  /** The ids of a widget's whole group (just the widget when it is not grouped). */
  groupOf(id: string): string[] {
    const groupId = this.widget(id)?.groupId
    if (!groupId) return [id]
    return this.doc.value.widgets.filter(widget => widget.groupId === groupId).map(widget => widget.id)
  }

  /** Ids with their groups' other members added. */
  withGroups(ids: readonly string[]): string[] {
    return [...new Set(ids.flatMap(id => this.groupOf(id)))]
  }

  group(id: string): ScreenGroup | undefined {
    return this.doc.value.groups?.find(item => item.id === id)
  }

  // ================================================================ selection

  select(ids: readonly string[], mode: 'replace' | 'add' | 'toggle' = 'replace'): void {
    let next = mode === 'replace' ? [...new Set(ids)] : [...this.selection.value]
    if (mode !== 'replace')
      for (const id of ids) {
        const at = next.indexOf(id)
        if (at >= 0 && mode === 'toggle') next.splice(at, 1)
        else if (at < 0) next.push(id)
      }
    next = next.filter(id => this.widget(id))
    this.selection.value = next
  }

  selectAll(): void {
    this.select(this.doc.value.widgets.filter(widget => !widget.locked && !widget.hidden).map(widget => widget.id))
  }

  clearSelection(): void {
    this.select([])
  }

  // ================================================================ widgets

  /** Adds a widget centred on a page point (the visible centre by default). */
  addWidget(type: string, center?: { x: number; y: number }): Widget {
    const page = this.doc.value.page
    const at = center ?? this.visibleCenter()
    const widget = createWidget(type, at, page.width)
    widget.x = Math.max(0, Math.min(page.width - widget.w, widget.x))
    widget.y = Math.max(0, Math.min(page.height - widget.h, widget.y))
    this.edit(`添加${widget.name}`, draft => void draft.widgets.push(widget))
    this.select([widget.id])
    return widget
  }

  updateWidget(id: string, recipe: (widget: Widget) => void, label = '修改组件', coalesceKey?: string): void {
    this.edit(
      label,
      draft => {
        const widget = draft.widgets.find(item => item.id === id)
        if (widget) recipe(widget)
      },
      coalesceKey,
    )
  }

  updateSelected(recipe: (widget: Widget) => void, label = '修改组件', coalesceKey?: string): void {
    const ids = new Set(this.selection.value)
    this.edit(
      label,
      draft => {
        for (const widget of draft.widgets) if (ids.has(widget.id)) recipe(widget)
      },
      coalesceKey,
    )
  }

  /** Sets rectangles (dragging, resizing); repeated calls with one key are one undo step. */
  setRects(rects: ReadonlyMap<string, Rect>, label: string, coalesceKey: string): void {
    this.edit(
      label,
      draft => {
        for (const widget of draft.widgets) {
          const rect = rects.get(widget.id)
          if (rect) Object.assign(widget, rect)
        }
      },
      coalesceKey,
    )
  }

  /** Arrow keys: moves the selection by whole pixels; a held key is one undo step. */
  nudge(dx: number, dy: number): void {
    const ids = new Set(this.selectedWidgets.filter(widget => !widget.locked).map(widget => widget.id))
    if (!ids.size) return
    this.edit(
      '微调位置',
      draft => {
        for (const widget of draft.widgets)
          if (ids.has(widget.id)) {
            widget.x += dx
            widget.y += dy
          }
      },
      `nudge:${[...ids].join(',')}`,
    )
  }

  removeSelected(): void {
    const ids = new Set(this.selection.value)
    if (!ids.size) return
    this.edit(`删除 ${ids.size} 个组件`, draft => {
      draft.widgets = draft.widgets.filter(widget => !ids.has(widget.id))
      pruneGroups(draft)
    })
    this.clearSelection()
  }

  /** Copies with new ids; copied groups become new groups of the copies. */
  private cloneWidgets(
    widgets: readonly Widget[],
    groups: readonly ScreenGroup[],
    offset: number,
  ): { widgets: Widget[]; groups: ScreenGroup[] } {
    const groupIds = new Map<string, string>()
    const copies = widgets.map(widget => {
      const copy: Widget = {
        ...JSON.parse(JSON.stringify(widget)),
        id: newScreenId('widget'),
        x: widget.x + offset,
        y: widget.y + offset,
        events: widget.events?.map(event => ({ ...JSON.parse(JSON.stringify(event)), id: newScreenId('event') })),
      }
      if (widget.groupId) {
        if (!groupIds.has(widget.groupId)) groupIds.set(widget.groupId, newScreenId('group'))
        copy.groupId = groupIds.get(widget.groupId)
      }
      return copy
    })
    // A group copied only in part does not group its copies.
    for (const to of groupIds.values())
      if (copies.filter(widget => widget.groupId === to).length < 2)
        for (const widget of copies) if (widget.groupId === to) delete widget.groupId
    const newGroups = [...groupIds]
      .filter(([, to]) => copies.some(widget => widget.groupId === to))
      .map(([from, to]) => ({ id: to, name: `${groups.find(item => item.id === from)?.name ?? '组合'} 副本` }))
    return { widgets: copies, groups: newGroups }
  }

  private insertCopies(label: string, copies: { widgets: Widget[]; groups: ScreenGroup[] }): void {
    this.edit(label, draft => {
      draft.widgets.push(...copies.widgets)
      if (copies.groups.length) draft.groups = [...(draft.groups ?? []), ...copies.groups]
    })
    this.select(copies.widgets.map(widget => widget.id))
  }

  duplicateSelected(): void {
    const widgets = this.orderedSelection()
    if (!widgets.length) return
    this.insertCopies('创建副本', this.cloneWidgets(widgets, this.doc.value.groups ?? [], 20))
  }

  copy(): void {
    const widgets = this.orderedSelection()
    if (widgets.length) this.clipboard = JSON.parse(JSON.stringify({ widgets, groups: this.doc.value.groups ?? [] }))
  }

  paste(): void {
    const clipboard = this.clipboard
    if (!clipboard?.widgets.length) return
    const copies = this.cloneWidgets(clipboard.widgets, clipboard.groups, 20)
    // Pasting again lands further along.
    this.clipboard = JSON.parse(
      JSON.stringify({ widgets: copies.widgets, groups: [...clipboard.groups, ...copies.groups] }),
    )
    this.insertCopies('粘贴', copies)
  }

  // ================================================================ groups

  /** Groups the selection (two or more widgets); they become one block in the drawing order. */
  groupSelected(): void {
    const widgets = this.orderedSelection()
    if (widgets.length < 2) return
    const id = newScreenId('group')
    const ids = new Set(widgets.map(widget => widget.id))
    let index = 1
    while (this.doc.value.groups?.some(item => item.name === `组合 ${index}`)) index++
    this.edit('组合', draft => {
      // The block sits where the topmost member was.
      const top = Math.max(...draft.widgets.map((widget, i) => (ids.has(widget.id) ? i : -1)))
      const members = draft.widgets.filter(widget => ids.has(widget.id))
      const before = draft.widgets.slice(0, top + 1).filter(widget => !ids.has(widget.id))
      const after = draft.widgets.slice(top + 1)
      for (const widget of members) widget.groupId = id
      draft.widgets = [...before, ...members, ...after]
      draft.groups = [...(draft.groups ?? []), { id, name: `组合 ${index}` }]
      pruneGroups(draft)
    })
  }

  /** Dissolves the groups of the selected widgets. */
  ungroupSelected(): void {
    const groupIds = new Set(this.selectedWidgets.flatMap(widget => (widget.groupId ? [widget.groupId] : [])))
    if (!groupIds.size) return
    this.edit('取消组合', draft => {
      for (const widget of draft.widgets) if (widget.groupId && groupIds.has(widget.groupId)) delete widget.groupId
      pruneGroups(draft)
    })
  }

  renameGroup(id: string, name: string): void {
    const trimmed = name.trim()
    if (!trimmed) return
    this.edit('重命名组合', draft => {
      const group = draft.groups?.find(item => item.id === id)
      if (group) group.name = trimmed
    })
  }

  // ================================================================ ruler guides

  addGuide(axis: 'x' | 'y', at: number): number {
    const value = Math.round(at)
    let index = -1
    this.edit('添加参考线', draft => {
      draft.guides ??= { x: [], y: [] }
      index = draft.guides[axis].push(value) - 1
    })
    return index
  }

  /** Dragging a guide; the drag is one undo step. */
  moveGuide(axis: 'x' | 'y', index: number, at: number): void {
    this.edit(
      '移动参考线',
      draft => {
        if (draft.guides && index < draft.guides[axis].length) draft.guides[axis][index] = Math.round(at)
      },
      `guide:${axis}:${index}`,
    )
  }

  removeGuide(axis: 'x' | 'y', index: number): void {
    this.edit('删除参考线', draft => void draft.guides?.[axis].splice(index, 1))
  }

  clearGuides(): void {
    if (!this.doc.value.guides?.x.length && !this.doc.value.guides?.y.length) return
    this.edit('清除参考线', draft => void (draft.guides = { x: [], y: [] }))
  }

  toggleRulers(): void {
    this.ui.rulers = !this.ui.rulers
    writeSetting('screen-editor:rulers', this.ui.rulers)
  }

  /** Selected widgets in drawing order. */
  private orderedSelection(): Widget[] {
    const ids = new Set(this.selection.value)
    return this.doc.value.widgets.filter(widget => ids.has(widget.id))
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim()
    if (trimmed) this.updateWidget(id, widget => void (widget.name = trimmed), '重命名')
  }

  setHidden(ids: readonly string[], hidden: boolean): void {
    const set = new Set(ids)
    this.edit(hidden ? '隐藏' : '显示', draft => {
      for (const widget of draft.widgets) if (set.has(widget.id)) widget.hidden = hidden
    })
  }

  setLocked(ids: readonly string[], locked: boolean): void {
    const set = new Set(ids)
    this.edit(locked ? '锁定' : '解锁', draft => {
      for (const widget of draft.widgets) if (set.has(widget.id)) widget.locked = locked
    })
  }

  /** Layer order: front / back, or one step forward / backward. */
  arrange(direction: 'front' | 'forward' | 'backward' | 'back'): void {
    const ids = new Set(this.selection.value)
    if (!ids.size) return
    const labels = { front: '置于顶层', forward: '上移一层', backward: '下移一层', back: '置于底层' }
    this.edit(labels[direction], draft => {
      const list = draft.widgets
      const picked = list.filter(widget => ids.has(widget.id))
      const rest = list.filter(widget => !ids.has(widget.id))
      if (direction === 'front') draft.widgets = [...rest, ...picked]
      else if (direction === 'back') draft.widgets = [...picked, ...rest]
      else {
        const step = direction === 'forward' ? 1 : -1
        const order = [...list]
        const indices = order.map((widget, index) => (ids.has(widget.id) ? index : -1)).filter(index => index >= 0)
        if (step > 0) indices.reverse()
        for (const index of indices) {
          const target = index + step
          if (target < 0 || target >= order.length || ids.has(order[target]!.id)) continue
          ;[order[index], order[target]] = [order[target]!, order[index]!]
        }
        draft.widgets = order
      }
    })
  }

  /** Moves a widget to a position in the drawing order (layers panel drag). */
  moveLayer(id: string, toIndex: number): void {
    this.edit('调整图层', draft => {
      const from = draft.widgets.findIndex(widget => widget.id === id)
      if (from < 0) return
      const [widget] = draft.widgets.splice(from, 1)
      draft.widgets.splice(Math.max(0, Math.min(draft.widgets.length, toIndex)), 0, widget!)
    })
  }

  /** Lines the selection up with its bounding box (or the page, for a single widget). */
  align(edge: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'): void {
    const widgets = this.selectedWidgets.filter(widget => !widget.locked)
    if (!widgets.length) return
    const page = this.doc.value.page
    const box = widgets.length === 1 ? { x: 0, y: 0, w: page.width, h: page.height } : boundsOf(widgets)
    const ids = new Set(widgets.map(widget => widget.id))
    this.edit('对齐', draft => {
      for (const widget of draft.widgets) {
        if (!ids.has(widget.id)) continue
        if (edge === 'left') widget.x = box.x
        if (edge === 'hcenter') widget.x = Math.round(box.x + (box.w - widget.w) / 2)
        if (edge === 'right') widget.x = box.x + box.w - widget.w
        if (edge === 'top') widget.y = box.y
        if (edge === 'vcenter') widget.y = Math.round(box.y + (box.h - widget.h) / 2)
        if (edge === 'bottom') widget.y = box.y + box.h - widget.h
      }
    })
  }

  /** Spaces three or more widgets evenly. */
  distribute(axis: 'x' | 'y'): void {
    const widgets = [...this.selectedWidgets.filter(widget => !widget.locked)].sort((a, b) =>
      axis === 'x' ? a.x - b.x : a.y - b.y,
    )
    if (widgets.length < 3) return
    const size = (widget: Widget) => (axis === 'x' ? widget.w : widget.h)
    const start = axis === 'x' ? widgets[0]!.x : widgets[0]!.y
    const last = widgets.at(-1)!
    const end = (axis === 'x' ? last.x : last.y) + size(last)
    const gap = (end - start - widgets.reduce((sum, widget) => sum + size(widget), 0)) / (widgets.length - 1)
    const positions = new Map<string, number>()
    let cursor = start
    for (const widget of widgets) {
      positions.set(widget.id, Math.round(cursor))
      cursor += size(widget) + gap
    }
    this.edit('均匀分布', draft => {
      for (const widget of draft.widgets) {
        const value = positions.get(widget.id)
        if (value !== undefined) widget[axis] = value
      }
    })
  }

  // ================================================================ page

  updatePage(
    recipe: (page: ScreenPage, document: ScreenDocument) => void,
    label = '页面设置',
    coalesceKey?: string,
  ): void {
    this.edit(label, draft => recipe(draft.page, draft), coalesceKey)
  }

  renameScreen(name: string): void {
    const trimmed = name.trim()
    if (trimmed) this.edit('重命名大屏', draft => void (draft.name = trimmed))
  }

  // ================================================================ view

  /** The page point at the centre of the visible canvas. */
  visibleCenter(): { x: number; y: number } {
    const { width, height } = this.ui.viewport
    return { x: (width / 2 - this.ui.panX) / this.ui.zoom, y: (height / 2 - this.ui.panY) / this.ui.zoom }
  }

  /** Zooms keeping a viewport point (default: the centre) still. */
  zoomTo(zoom: number, anchor?: { x: number; y: number }): void {
    const next = Math.min(ZOOM.max, Math.max(ZOOM.min, zoom))
    const point = anchor ?? { x: this.ui.viewport.width / 2, y: this.ui.viewport.height / 2 }
    const pageX = (point.x - this.ui.panX) / this.ui.zoom
    const pageY = (point.y - this.ui.panY) / this.ui.zoom
    this.ui.zoom = next
    this.ui.panX = point.x - pageX * next
    this.ui.panY = point.y - pageY * next
  }

  /** Shows the whole page with a margin. */
  fit(): void {
    const { width, height } = this.ui.viewport
    const page = this.doc.value.page
    if (!width || !height) return
    const zoom = Math.min((width - 80) / page.width, (height - 80) / page.height)
    this.ui.zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, zoom))
    this.ui.panX = (width - page.width * this.ui.zoom) / 2
    this.ui.panY = (height - page.height * this.ui.zoom) / 2
  }
}

let channel: BroadcastChannel | null | undefined

/** Tells previews in other tabs that a screen changed. */
export function screenChannel(): BroadcastChannel | null {
  if (channel === undefined)
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('twin-studio-screens')
  return channel
}

/** Groups with fewer than two members dissolve; group entries without members go away. */
function pruneGroups(draft: ScreenDocument): void {
  const counts = new Map<string, number>()
  for (const widget of draft.widgets)
    if (widget.groupId) counts.set(widget.groupId, (counts.get(widget.groupId) ?? 0) + 1)
  for (const widget of draft.widgets) if (widget.groupId && (counts.get(widget.groupId) ?? 0) < 2) delete widget.groupId
  if (draft.groups) draft.groups = draft.groups.filter(group => (counts.get(group.id) ?? 0) >= 2)
}

/** Editor preferences kept in this browser (rulers on or off…). */
function readSetting<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : (JSON.parse(value) as T)
  } catch {
    return fallback
  }
}

function writeSetting(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private windows may refuse storage; the preference just is not remembered.
  }
}

export function boundsOf(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map(rect => rect.x))
  const y = Math.min(...rects.map(rect => rect.y))
  const right = Math.max(...rects.map(rect => rect.x + rect.w))
  const bottom = Math.max(...rects.map(rect => rect.y + rect.h))
  return { x, y, w: right - x, h: bottom - y }
}

export const ScreenSessionKey: InjectionKey<ScreenEditorSession> = Symbol('ScreenEditorSession')

export function useScreenSession(): ScreenEditorSession {
  const session = inject(ScreenSessionKey)
  if (!session) throw new Error('ScreenEditorSession is not provided')
  return session
}
