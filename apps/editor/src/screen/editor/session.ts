import { type InjectionKey, inject, reactive, shallowRef } from 'vue'
import { type DocumentChange, DocumentStore } from '@twin-studio/core'
import { newScreenId, type ScreenDocument, type ScreenPage, type Widget } from '../model'
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
  private clipboard: Widget[] | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  /** A coalesced edit (drag, slider) is still open: saving now would split it into two undo steps. */
  private openEdit = false
  private saveDeferredSince = 0
  private disposed = false

  constructor(
    document: ScreenDocument,
    private readonly repository: ScreenRepository = screenRepository,
  ) {
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
    if (change.origin !== 'reset') this.scheduleSave()
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
      await this.repository.save({ ...current, updatedAt: new Date().toISOString() })
      if (this.store.document === current) this.store.markSaved()
      this.ui.saveState = this.store.isDirty ? 'unsaved' : 'saved'
      this.ui.lastSaved = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      return true
    } catch (error) {
      this.ui.saveState = 'error'
      this.ui.saveError = error instanceof Error ? error.message : String(error)
      return false
    }
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
    this.edit(
      `删除 ${ids.size} 个组件`,
      draft => void (draft.widgets = draft.widgets.filter(widget => !ids.has(widget.id))),
    )
    this.clearSelection()
  }

  private cloneWidgets(widgets: readonly Widget[], offset: number): Widget[] {
    return widgets.map(widget => ({
      ...JSON.parse(JSON.stringify(widget)),
      id: newScreenId('widget'),
      x: widget.x + offset,
      y: widget.y + offset,
      events: widget.events?.map(event => ({ ...JSON.parse(JSON.stringify(event)), id: newScreenId('event') })),
    }))
  }

  duplicateSelected(): void {
    const widgets = this.orderedSelection()
    if (!widgets.length) return
    const copies = this.cloneWidgets(widgets, 20)
    this.edit('创建副本', draft => void draft.widgets.push(...copies))
    this.select(copies.map(widget => widget.id))
  }

  copy(): void {
    const widgets = this.orderedSelection()
    if (widgets.length) this.clipboard = JSON.parse(JSON.stringify(widgets))
  }

  paste(): void {
    if (!this.clipboard?.length) return
    const copies = this.cloneWidgets(this.clipboard, 20)
    this.clipboard = JSON.parse(JSON.stringify(copies))
    this.edit('粘贴', draft => void draft.widgets.push(...copies))
    this.select(copies.map(widget => widget.id))
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
