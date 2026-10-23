<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { Widget } from '../model'
import ScreenPage from '../render/ScreenPage.vue'
import { WIDGET_DRAG_MIME } from './dnd'
import { boundsOf, type Guide, type Rect, useScreenSession } from './session'

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type Drag =
  | { kind: 'move'; origin: { x: number; y: number }; start: Map<string, Rect>; moved: boolean }
  | { kind: 'resize'; origin: { x: number; y: number }; id: string; handle: Handle; start: Rect }
  /** Several widgets (a group or a selection) scale together inside their bounding box. */
  | { kind: 'resize-many'; origin: { x: number; y: number }; handle: Handle; start: Rect; rects: Map<string, Rect> }
  /** A ruler guide: an existing one (index) or a new one pulled out of a ruler (index -1). */
  | { kind: 'guide'; axis: 'x' | 'y'; index: number }
  | { kind: 'marquee'; origin: { x: number; y: number }; additive: boolean }
  | { kind: 'pan'; origin: { x: number; y: number }; panX: number; panY: number }

const session = useScreenSession()
const ui = session.ui
const viewport = ref<HTMLDivElement>()
const doc = computed(() => session.doc.value)
const page = computed(() => doc.value.page)
const selected = computed(() => new Set(session.selection.value))
const spaceDown = ref(false)
const panning = ref(false)
let drag: Drag | null = null
const menu = reactive({ open: false, x: 0, y: 0 })

const stageStyle = computed(() => ({
  transform: `translate(${ui.panX}px, ${ui.panY}px) scale(${ui.zoom})`,
  width: `${page.value.width}px`,
  height: `${page.value.height}px`,
  '--zoom': ui.zoom,
}))
const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const single = computed(() => (session.selectedWidgets.length === 1 ? session.selectedWidgets[0]! : null))
const selectionBox = computed(() => (session.selectedWidgets.length > 1 ? boundsOf(session.selectedWidgets) : null))
const canResizeMany = computed(() => !!selectionBox.value && session.selectedWidgets.every(widget => !widget.locked))
/** The selection is exactly one group: its name is shown on the box. */
const selectedGroup = computed(() => {
  const widgets = session.selectedWidgets
  const groupId = widgets[0]?.groupId
  if (!groupId || widgets.length < 2 || widgets.some(widget => widget.groupId !== groupId)) return null
  return session.group(groupId) ?? null
})

// ---------------------------------------------------------------- coordinates

function toPage(clientX: number, clientY: number): { x: number; y: number } {
  const rect = viewport.value!.getBoundingClientRect()
  return { x: (clientX - rect.left - ui.panX) / ui.zoom, y: (clientY - rect.top - ui.panY) / ui.zoom }
}

let resizeObserver: ResizeObserver | null = null
let fitted = false
onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    ui.viewport = { width: entry!.contentRect.width, height: entry!.contentRect.height }
    if (!fitted && entry!.contentRect.width > 0) {
      fitted = true
      session.fit()
    }
  })
  resizeObserver.observe(viewport.value!)
  session.attachPage(viewport.value!.querySelector<HTMLElement>('[data-testid="screen-page"]'))
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
})
onBeforeUnmount(() => {
  session.attachPage(null)
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKey)
})

function onKey(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return
  if (event.code === 'Space') {
    spaceDown.value = event.type === 'keydown'
    if (event.type === 'keydown') event.preventDefault()
  }
}

// ---------------------------------------------------------------- snapping

/** Edges and centres of other widgets and of the page that a moving rectangle snaps to. */
function snapTargets(exclude: ReadonlySet<string>): { xs: number[]; ys: number[] } {
  const xs = [0, page.value.width / 2, page.value.width, ...(doc.value.guides?.x ?? [])]
  const ys = [0, page.value.height / 2, page.value.height, ...(doc.value.guides?.y ?? [])]
  for (const widget of doc.value.widgets) {
    if (exclude.has(widget.id) || widget.hidden) continue
    xs.push(widget.x, widget.x + widget.w / 2, widget.x + widget.w)
    ys.push(widget.y, widget.y + widget.h / 2, widget.y + widget.h)
  }
  return { xs, ys }
}

/** The smallest correction that brings one of `values` onto a target, within the threshold. */
function snapAxis(values: number[], targets: number[]): { delta: number; at: number | null } {
  const threshold = 6 / ui.zoom
  let best = { delta: 0, at: null as number | null, distance: threshold }
  for (const value of values)
    for (const target of targets) {
      const distance = Math.abs(target - value)
      if (distance < best.distance) best = { delta: target - value, at: target, distance }
    }
  return { delta: best.delta, at: best.at }
}

function guidesFor(rect: Rect, x: number | null, y: number | null): Guide[] {
  const guides: Guide[] = []
  if (x !== null)
    guides.push({ axis: 'x', at: x, from: Math.min(0, rect.y), to: Math.max(page.value.height, rect.y + rect.h) })
  if (y !== null)
    guides.push({ axis: 'y', at: y, from: Math.min(0, rect.x), to: Math.max(page.value.width, rect.x + rect.w) })
  return guides
}

// ---------------------------------------------------------------- pointer

function onWidgetDown(event: PointerEvent, widget: Widget): void {
  menu.open = false
  if (event.button === 1 || spaceDown.value) return startPan(event)
  if (event.button !== 0) return
  event.stopPropagation()
  const additive = event.shiftKey || event.metaKey || event.ctrlKey
  // A grouped widget brings its group (double-click picks it alone).
  const ids = session.groupOf(widget.id)
  if (additive) return session.select(ids, 'toggle')
  if (!selected.value.has(widget.id)) session.select(ids)
  const start = new Map(
    session.selectedWidgets
      .filter(item => !item.locked)
      .map(item => [item.id, { x: item.x, y: item.y, w: item.w, h: item.h }]),
  )
  if (!start.size) return
  drag = { kind: 'move', origin: { x: event.clientX, y: event.clientY }, start, moved: false }
  capture(event)
}

function onHandleDown(event: PointerEvent, handle: Handle): void {
  if (event.button !== 0) return
  const box = selectionBox.value
  if (box) {
    event.stopPropagation()
    drag = {
      kind: 'resize-many',
      origin: { x: event.clientX, y: event.clientY },
      handle,
      start: box,
      rects: new Map(session.selectedWidgets.map(item => [item.id, { x: item.x, y: item.y, w: item.w, h: item.h }])),
    }
    return capture(event)
  }
  const widget = single.value
  if (!widget) return
  event.stopPropagation()
  drag = {
    kind: 'resize',
    origin: { x: event.clientX, y: event.clientY },
    id: widget.id,
    handle,
    start: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
  }
  capture(event)
}

function onViewportDown(event: PointerEvent): void {
  menu.open = false
  if (event.button === 1 || spaceDown.value) return startPan(event)
  if (event.button !== 0) return
  const additive = event.shiftKey || event.metaKey || event.ctrlKey
  if (!additive) session.clearSelection()
  drag = { kind: 'marquee', origin: { x: event.clientX, y: event.clientY }, additive }
  capture(event)
}

function startPan(event: PointerEvent): void {
  event.preventDefault()
  drag = { kind: 'pan', origin: { x: event.clientX, y: event.clientY }, panX: ui.panX, panY: ui.panY }
  panning.value = true
  capture(event)
}

function capture(event: PointerEvent): void {
  viewport.value?.setPointerCapture(event.pointerId)
}

function onMove(event: PointerEvent): void {
  if (!drag) return
  if (drag.kind === 'guide') return moveGuide(event, drag)
  const dx = event.clientX - drag.origin.x
  const dy = event.clientY - drag.origin.y
  if (drag.kind === 'pan') {
    ui.panX = drag.panX + dx
    ui.panY = drag.panY + dy
    return
  }
  if (drag.kind === 'marquee') {
    const rect = viewport.value!.getBoundingClientRect()
    ui.marquee = {
      x: Math.min(event.clientX, drag.origin.x) - rect.left,
      y: Math.min(event.clientY, drag.origin.y) - rect.top,
      w: Math.abs(dx),
      h: Math.abs(dy),
    }
    return
  }
  if (drag.kind === 'move') {
    if (!drag.moved && Math.hypot(dx, dy) < 3) return
    drag.moved = true
    let mx = dx / ui.zoom
    let my = dy / ui.zoom
    const box = boundsOf([...drag.start.values()])
    let snapX: number | null = null
    let snapY: number | null = null
    if (ui.snap && !event.altKey) {
      const targets = snapTargets(new Set(drag.start.keys()))
      const sx = snapAxis([box.x + mx, box.x + mx + box.w / 2, box.x + mx + box.w], targets.xs)
      const sy = snapAxis([box.y + my, box.y + my + box.h / 2, box.y + my + box.h], targets.ys)
      mx += sx.delta
      my += sy.delta
      snapX = sx.at
      snapY = sy.at
    }
    const rects = new Map<string, Rect>()
    for (const [id, rect] of drag.start)
      rects.set(id, { ...rect, x: Math.round(rect.x + mx), y: Math.round(rect.y + my) })
    ui.guides = guidesFor({ ...box, x: box.x + mx, y: box.y + my }, snapX, snapY)
    session.setRects(rects, '移动', `move:${[...drag.start.keys()].join(',')}`)
    return
  }
  // Resize: the dragged edges follow the pointer (and snap); Shift keeps the proportions.
  const { start, handle } = drag
  const resizing = new Set(drag.kind === 'resize' ? [drag.id] : drag.rects.keys())
  let left = start.x
  let top = start.y
  let right = start.x + start.w
  let bottom = start.y + start.h
  const px = dx / ui.zoom
  const py = dy / ui.zoom
  if (handle.includes('w')) left += px
  if (handle.includes('e')) right += px
  if (handle.includes('n')) top += py
  if (handle.includes('s')) bottom += py
  const guides: Guide[] = []
  if (ui.snap && !event.altKey) {
    const targets = snapTargets(resizing)
    if (handle.includes('w') || handle.includes('e')) {
      const edge = handle.includes('w') ? left : right
      const snap = snapAxis([edge], targets.xs)
      if (handle.includes('w')) left += snap.delta
      else right += snap.delta
      if (snap.at !== null) guides.push({ axis: 'x', at: snap.at, from: 0, to: page.value.height })
    }
    if (handle.includes('n') || handle.includes('s')) {
      const edge = handle.includes('n') ? top : bottom
      const snap = snapAxis([edge], targets.ys)
      if (handle.includes('n')) top += snap.delta
      else bottom += snap.delta
      if (snap.at !== null) guides.push({ axis: 'y', at: snap.at, from: 0, to: page.value.width })
    }
  }
  // Groups keep their proportions from the corners, so their contents do not distort.
  if ((event.shiftKey || drag.kind === 'resize-many') && handle.length === 2) {
    const ratio = start.w / start.h
    const width = right - left
    const height = width / ratio
    if (handle.includes('n')) top = bottom - height
    else bottom = top + height
  }
  const min = 8
  if (right - left < min) {
    if (handle.includes('w')) left = right - min
    else right = left + min
  }
  if (bottom - top < min) {
    if (handle.includes('n')) top = bottom - min
    else bottom = top + min
  }
  ui.guides = guides
  if (drag.kind === 'resize-many') {
    const sx = (right - left) / start.w
    const sy = (bottom - top) / start.h
    const rects = new Map<string, Rect>()
    for (const [id, rect] of drag.rects)
      rects.set(id, {
        x: Math.round(left + (rect.x - start.x) * sx),
        y: Math.round(top + (rect.y - start.y) * sy),
        w: Math.max(8, Math.round(rect.w * sx)),
        h: Math.max(8, Math.round(rect.h * sy)),
      })
    session.setRects(rects, '调整大小', `resize:${[...drag.rects.keys()].join(',')}`)
    return
  }
  session.setRects(
    new Map([
      [drag.id, { x: Math.round(left), y: Math.round(top), w: Math.round(right - left), h: Math.round(bottom - top) }],
    ]),
    '调整大小',
    `resize:${drag.id}`,
  )
}

function onUp(event: PointerEvent): void {
  if (!drag) return
  const ended = drag
  drag = null
  panning.value = false
  ui.guides = []
  if (ended.kind === 'move' || ended.kind === 'resize' || ended.kind === 'resize-many') session.commit()
  if (ended.kind === 'guide') endGuide(event, ended)
  if (ended.kind === 'marquee' && ui.marquee) {
    const box = ui.marquee
    const a = toPage(
      box.x + viewport.value!.getBoundingClientRect().left,
      box.y + viewport.value!.getBoundingClientRect().top,
    )
    const b = { x: a.x + box.w / ui.zoom, y: a.y + box.h / ui.zoom }
    const hits = doc.value.widgets
      .filter(w => !w.locked && !w.hidden && w.x < b.x && w.x + w.w > a.x && w.y < b.y && w.y + w.h > a.y)
      .map(w => w.id)
    session.select(session.withGroups(hits), ended.additive ? 'add' : 'replace')
  }
  ui.marquee = null
  viewport.value?.releasePointerCapture(event.pointerId)
}

function onWheel(event: WheelEvent): void {
  event.preventDefault()
  const rect = viewport.value!.getBoundingClientRect()
  if (event.ctrlKey || event.metaKey) {
    session.zoomTo(ui.zoom * Math.exp(-event.deltaY * 0.0025), {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  } else {
    ui.panX -= event.deltaX
    ui.panY -= event.deltaY
  }
}

// ---------------------------------------------------------------- rulers and guides

const RULER = 20
const rulerX = ref<HTMLCanvasElement>()
const rulerY = ref<HTMLCanvasElement>()
/** A guide being pulled out of a ruler (not in the document until released on the canvas). */
const pending = ref<{ axis: 'x' | 'y'; at: number } | null>(null)
const guideLines = computed(() => [
  ...(doc.value.guides?.x ?? []).map((at, index) => ({ axis: 'x' as const, at, index })),
  ...(doc.value.guides?.y ?? []).map((at, index) => ({ axis: 'y' as const, at, index })),
])
const guideOffset = (axis: 'x' | 'y', at: number) => (axis === 'x' ? ui.panX + at * ui.zoom : ui.panY + at * ui.zoom)

function startGuide(event: PointerEvent, axis: 'x' | 'y', index = -1): void {
  if (event.button !== 0) return
  event.stopPropagation()
  menu.open = false
  drag = { kind: 'guide', axis, index }
  if (index < 0) pending.value = { axis, at: pagePoint(event)[axis] }
  capture(event)
}

function pagePoint(event: PointerEvent): { x: number; y: number } {
  const point = toPage(event.clientX, event.clientY)
  return { x: Math.round(point.x), y: Math.round(point.y) }
}

function moveGuide(event: PointerEvent, current: Extract<Drag, { kind: 'guide' }>): void {
  const at = pagePoint(event)[current.axis]
  if (current.index < 0) pending.value = { axis: current.axis, at }
  else session.moveGuide(current.axis, current.index, at)
}

/** Released over the ruler: the guide goes away (or is never made). */
function endGuide(event: PointerEvent, ended: Extract<Drag, { kind: 'guide' }>): void {
  const rect = viewport.value!.getBoundingClientRect()
  const onRuler = ended.axis === 'x' ? event.clientX - rect.left < RULER + 4 : event.clientY - rect.top < RULER + 4
  if (ended.index < 0) {
    if (pending.value && !onRuler) session.addGuide(ended.axis, pending.value.at)
    pending.value = null
  } else if (onRuler) {
    session.commit()
    session.removeGuide(ended.axis, ended.index)
  } else session.commit()
}

/** Ticks every 1/2/5 × 10ⁿ page pixels, labelled where they are at least ~70 screen pixels apart. */
function drawRuler(canvas: HTMLCanvasElement | undefined, axis: 'x' | 'y'): void {
  if (!canvas) return
  const length = axis === 'x' ? ui.viewport.width : ui.viewport.height
  if (!length) return
  const ratio = window.devicePixelRatio || 1
  const width = axis === 'x' ? length : RULER
  const height = axis === 'x' ? RULER : length
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const g = canvas.getContext('2d')
  if (!g) return
  g.setTransform(ratio, 0, 0, ratio, 0, 0)
  g.fillStyle = '#17181b'
  g.fillRect(0, 0, width, height)
  const pan = axis === 'x' ? ui.panX : ui.panY
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
  const major = steps.find(step => step * ui.zoom >= 70) ?? 5000
  const minor = major / (String(major).startsWith('5') ? 5 : 10)
  // The selection's extent, so positions read off the ruler.
  const box = selectionBox.value ?? (single.value ? { ...single.value } : null)
  if (box) {
    const from = pan + (axis === 'x' ? box.x : box.y) * ui.zoom
    const size = (axis === 'x' ? box.w : box.h) * ui.zoom
    g.fillStyle = 'rgba(232, 137, 74, 0.22)'
    if (axis === 'x') g.fillRect(from, 0, size, height)
    else g.fillRect(0, from, width, size)
  }
  g.strokeStyle = '#4a4b50'
  g.fillStyle = '#8a8780'
  g.font = '10px ui-monospace, monospace'
  g.lineWidth = 1
  g.beginPath()
  const first = Math.floor(-pan / ui.zoom / minor) * minor
  const last = (length - pan) / ui.zoom
  for (let value = first; value <= last; value += minor) {
    const at = Math.round(pan + value * ui.zoom) + 0.5
    const isMajor = Math.abs(value / major - Math.round(value / major)) < 1e-6
    const tick = isMajor ? RULER : RULER / 4
    if (axis === 'x') {
      g.moveTo(at, RULER - tick)
      g.lineTo(at, RULER)
      if (isMajor) g.fillText(String(Math.round(value)), at + 3, 10)
    } else {
      g.moveTo(RULER - tick, at)
      g.lineTo(RULER, at)
      if (isMajor) {
        g.save()
        g.translate(10, at + 3)
        g.rotate(-Math.PI / 2)
        g.fillText(String(Math.round(value)), 0, 0)
        g.restore()
      }
    }
  }
  g.stroke()
  g.fillStyle = '#26272b'
  if (axis === 'x') g.fillRect(0, RULER - 1, width, 1)
  else g.fillRect(RULER - 1, 0, 1, height)
}

let rulerFrame = 0
function redrawRulers(): void {
  if (rulerFrame || !ui.rulers) return
  rulerFrame = requestAnimationFrame(() => {
    rulerFrame = 0
    drawRuler(rulerX.value, 'x')
    drawRuler(rulerY.value, 'y')
  })
}
watch(
  () => [ui.rulers, ui.zoom, ui.panX, ui.panY, ui.viewport.width, ui.viewport.height, selectionBox.value, single.value],
  redrawRulers,
  { flush: 'post' },
)
onMounted(redrawRulers)

// ---------------------------------------------------------------- drop & menu

const dropping = ref(false)
function onDragOver(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes(WIDGET_DRAG_MIME)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
  dropping.value = true
}
function onDrop(event: DragEvent): void {
  dropping.value = false
  const type = event.dataTransfer?.getData(WIDGET_DRAG_MIME)
  if (!type) return
  event.preventDefault()
  session.addWidget(type, toPage(event.clientX, event.clientY))
}

function onContextMenu(event: MouseEvent, widget?: Widget): void {
  event.preventDefault()
  if (widget && !selected.value.has(widget.id)) session.select([widget.id])
  const rect = viewport.value!.getBoundingClientRect()
  menu.open = true
  menu.x = event.clientX - rect.left
  menu.y = event.clientY - rect.top
}

const menuItems = computed(() => {
  const widgets = session.selectedWidgets
  if (!widgets.length) return [{ label: '全选', key: '⌘A', run: () => session.selectAll() }]
  const ids = widgets.map(widget => widget.id)
  const locked = widgets.every(widget => widget.locked)
  const hidden = widgets.every(widget => widget.hidden)
  const grouped = widgets.some(widget => widget.groupId)
  return [
    ...(widgets.length > 1 ? [{ label: '组合', key: '⌘G', run: () => session.groupSelected() }] : []),
    ...(grouped ? [{ label: '取消组合', key: '⇧⌘G', run: () => session.ungroupSelected() }] : []),
    { label: '置于顶层', key: '', run: () => session.arrange('front') },
    { label: '上移一层', key: ']', run: () => session.arrange('forward') },
    { label: '下移一层', key: '[', run: () => session.arrange('backward') },
    { label: '置于底层', key: '', run: () => session.arrange('back') },
    { label: '复制', key: '⌘C', run: () => session.copy() },
    { label: '创建副本', key: '⌘D', run: () => session.duplicateSelected() },
    { label: locked ? '解锁' : '锁定', key: '', run: () => session.setLocked(ids, !locked) },
    { label: hidden ? '显示' : '隐藏', key: '', run: () => session.setHidden(ids, !hidden) },
    { label: '删除', key: 'Del', run: () => session.removeSelected(), danger: true },
  ]
})
</script>

<template>
  <div
    ref="viewport"
    class="canvas"
    :class="{ 'is-panning': panning, 'is-space': spaceDown, 'is-dropping': dropping }"
    data-testid="screen-canvas"
    @pointerdown="onViewportDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @wheel="onWheel"
    @dragover="onDragOver"
    @dragleave="dropping = false"
    @drop="onDrop"
    @contextmenu="onContextMenu($event)"
  >
    <div class="stage" :style="stageStyle">
      <ScreenPage :screen="doc" editing />
      <!-- Hit areas, in drawing order, so the topmost widget takes the click. -->
      <div
        v-for="widget in doc.widgets"
        v-show="!widget.hidden && !widget.locked"
        :key="widget.id"
        class="hit"
        :class="{ 'is-hovered': ui.hovered === widget.id && !selected.has(widget.id) }"
        :style="{ left: `${widget.x}px`, top: `${widget.y}px`, width: `${widget.w}px`, height: `${widget.h}px` }"
        :data-testid="`hit-${widget.name}`"
        @pointerdown="onWidgetDown($event, widget)"
        @dblclick.stop="widget.groupId && session.select([widget.id])"
        @pointerenter="ui.hovered = widget.id"
        @pointerleave="ui.hovered === widget.id && (ui.hovered = null)"
        @contextmenu.stop="onContextMenu($event, widget)"
      />
      <!-- Selection -->
      <div
        v-for="widget in session.selectedWidgets"
        :key="`sel-${widget.id}`"
        class="selected"
        :class="{ 'is-locked': widget.locked }"
        :style="{ left: `${widget.x}px`, top: `${widget.y}px`, width: `${widget.w}px`, height: `${widget.h}px` }"
      />
      <div
        v-if="selectionBox"
        class="selection-box"
        :class="{ 'is-group': selectedGroup }"
        :style="{
          left: `${selectionBox.x}px`,
          top: `${selectionBox.y}px`,
          width: `${selectionBox.w}px`,
          height: `${selectionBox.h}px`,
        }"
      >
        <span v-if="selectedGroup" class="selection-box__name">{{ selectedGroup.name }}</span>
        <template v-if="canResizeMany">
          <span
            v-for="handle in handles"
            :key="handle"
            class="handle"
            :class="`is-${handle}`"
            :data-testid="`group-handle-${handle}`"
            @pointerdown="onHandleDown($event, handle)"
          />
        </template>
      </div>
      <template v-if="single && !single.locked">
        <div
          class="frame"
          :style="{ left: `${single.x}px`, top: `${single.y}px`, width: `${single.w}px`, height: `${single.h}px` }"
        >
          <span
            v-for="handle in handles"
            :key="handle"
            class="handle"
            :class="`is-${handle}`"
            :data-testid="`handle-${handle}`"
            @pointerdown="onHandleDown($event, handle)"
          />
          <span class="frame__size">{{ single.w }} × {{ single.h }}</span>
        </div>
      </template>
      <!-- Guides -->
      <div
        v-for="(guide, index) in ui.guides"
        :key="index"
        class="guide"
        :class="`is-${guide.axis}`"
        :style="
          guide.axis === 'x'
            ? { left: `${guide.at}px`, top: `${guide.from}px`, height: `${guide.to - guide.from}px` }
            : { top: `${guide.at}px`, left: `${guide.from}px`, width: `${guide.to - guide.from}px` }
        "
      />
    </div>
    <!-- Ruler guides span the whole canvas, in screen pixels. -->
    <template v-if="ui.rulers">
      <div
        v-for="line in guideLines"
        :key="`${line.axis}${line.index}`"
        class="ruler-guide"
        :class="`is-${line.axis}`"
        :style="
          line.axis === 'x' ? { left: `${guideOffset('x', line.at)}px` } : { top: `${guideOffset('y', line.at)}px` }
        "
        :data-testid="`guide-${line.axis}-${line.at}`"
        :title="`${line.at} px（拖回标尺删除）`"
        @pointerdown="startGuide($event, line.axis, line.index)"
      />
      <div
        v-if="pending"
        class="ruler-guide is-pending"
        :class="`is-${pending.axis}`"
        :style="
          pending.axis === 'x'
            ? { left: `${guideOffset('x', pending.at)}px` }
            : { top: `${guideOffset('y', pending.at)}px` }
        "
      >
        <span>{{ pending.at }}</span>
      </div>
      <canvas
        ref="rulerX"
        class="ruler is-x"
        data-testid="ruler-x"
        title="按住拖出参考线"
        @pointerdown="startGuide($event, 'y')"
      />
      <canvas
        ref="rulerY"
        class="ruler is-y"
        data-testid="ruler-y"
        title="按住拖出参考线"
        @pointerdown="startGuide($event, 'x')"
      />
      <button class="ruler-corner" title="清除全部参考线" @pointerdown.stop @click="session.clearGuides()" />
    </template>
    <div
      v-if="ui.marquee"
      class="marquee"
      :style="{
        left: `${ui.marquee.x}px`,
        top: `${ui.marquee.y}px`,
        width: `${ui.marquee.w}px`,
        height: `${ui.marquee.h}px`,
      }"
    />
    <div v-if="menu.open" class="menu s-float" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }" @pointerdown.stop>
      <button
        v-for="item in menuItems"
        :key="item.label"
        :class="{ 'is-danger': 'danger' in item && item.danger }"
        @click="(item.run(), (menu.open = false))"
      >
        <span>{{ item.label }}</span
        ><kbd v-if="item.key">{{ item.key }}</kbd>
      </button>
    </div>
  </div>
</template>

<style scoped>
.canvas {
  position: relative;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background-color: #0e0f11;
  background-image: radial-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px);
  background-size: 20px 20px;
  cursor: default;
  touch-action: none;
  user-select: none;
}
.canvas.is-space {
  cursor: grab;
}
.canvas.is-panning {
  cursor: grabbing;
}
.canvas.is-dropping {
  box-shadow: inset 0 0 0 2px var(--s-accent-line);
}
.stage {
  position: absolute;
  top: 0;
  left: 0;
  box-shadow: 0 10px 50px rgb(0 0 0 / 0.55);
  transform-origin: 0 0;
}
.hit {
  position: absolute;
  cursor: move;
}
.canvas.is-space .hit {
  cursor: grab;
}
.hit.is-hovered {
  outline: calc(1px / var(--zoom)) solid rgb(232 137 74 / 0.6);
}
.selected {
  position: absolute;
  outline: calc(1.5px / var(--zoom)) solid var(--s-accent);
  pointer-events: none;
}
.selected.is-locked {
  outline-style: dashed;
}
.selection-box {
  position: absolute;
  outline: calc(1px / var(--zoom)) dashed var(--s-accent);
  pointer-events: none;
}
.selection-box.is-group {
  outline-style: solid;
}
.selection-box__name {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: calc(4px / var(--zoom));
  padding: 0 calc(6px / var(--zoom));
  border-radius: calc(3px / var(--zoom));
  background: var(--s-accent);
  color: #1b130c;
  font:
    600 calc(11px / var(--zoom)) / 1.6 Inter,
    sans-serif;
  white-space: nowrap;
}
.ruler {
  position: absolute;
  z-index: 6;
  display: block;
}
.ruler.is-x {
  top: 0;
  left: 0;
  cursor: s-resize;
}
.ruler.is-y {
  top: 0;
  left: 0;
  cursor: e-resize;
}
.ruler-corner {
  position: absolute;
  z-index: 7;
  top: 0;
  left: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-right: 1px solid #26272b;
  border-bottom: 1px solid #26272b;
  background: #17181b;
  cursor: pointer;
}
.ruler-corner:hover {
  background: var(--s-hover);
}
.ruler-guide {
  position: absolute;
  z-index: 5;
}
.ruler-guide.is-x {
  top: 0;
  bottom: 0;
  width: 7px;
  margin-left: -3px;
  background: linear-gradient(90deg, transparent 3px, #22d3ee 3px, #22d3ee 4px, transparent 4px);
  cursor: ew-resize;
}
.ruler-guide.is-y {
  right: 0;
  left: 0;
  height: 7px;
  margin-top: -3px;
  background: linear-gradient(180deg, transparent 3px, #22d3ee 3px, #22d3ee 4px, transparent 4px);
  cursor: ns-resize;
}
.ruler-guide.is-pending {
  pointer-events: none;
}
.ruler-guide span {
  position: absolute;
  top: 24px;
  left: 8px;
  padding: 0 5px;
  border-radius: 3px;
  background: #0e7490;
  color: #fff;
  font:
    10.5px/1.6 ui-monospace,
    monospace;
}
.ruler-guide.is-y span {
  top: 6px;
  left: 24px;
}
.frame {
  position: absolute;
  pointer-events: none;
}
.handle {
  position: absolute;
  width: calc(9px / var(--zoom));
  height: calc(9px / var(--zoom));
  border: calc(1.5px / var(--zoom)) solid var(--s-accent);
  border-radius: calc(2px / var(--zoom));
  background: #fff;
  pointer-events: auto;
  transform: translate(-50%, -50%);
}
.handle.is-nw {
  top: 0;
  left: 0;
  cursor: nwse-resize;
}
.handle.is-n {
  top: 0;
  left: 50%;
  cursor: ns-resize;
}
.handle.is-ne {
  top: 0;
  left: 100%;
  cursor: nesw-resize;
}
.handle.is-e {
  top: 50%;
  left: 100%;
  cursor: ew-resize;
}
.handle.is-se {
  top: 100%;
  left: 100%;
  cursor: nwse-resize;
}
.handle.is-s {
  top: 100%;
  left: 50%;
  cursor: ns-resize;
}
.handle.is-sw {
  top: 100%;
  left: 0;
  cursor: nesw-resize;
}
.handle.is-w {
  top: 50%;
  left: 0;
  cursor: ew-resize;
}
.frame__size {
  position: absolute;
  top: 100%;
  left: 50%;
  margin-top: calc(8px / var(--zoom));
  padding: calc(1px / var(--zoom)) calc(6px / var(--zoom));
  border-radius: calc(3px / var(--zoom));
  background: var(--s-accent);
  color: #1b130c;
  font:
    600 calc(11px / var(--zoom)) / 1.4 ui-monospace,
    monospace;
  transform: translateX(-50%);
  white-space: nowrap;
}
.guide {
  position: absolute;
  background: #f472b6;
  pointer-events: none;
}
.guide.is-x {
  width: calc(1px / var(--zoom));
}
.guide.is-y {
  height: calc(1px / var(--zoom));
}
.marquee {
  position: absolute;
  border: 1px solid var(--s-accent);
  background: rgb(232 137 74 / 0.1);
  pointer-events: none;
}
.menu {
  position: absolute;
  z-index: 20;
  display: flex;
  min-width: 170px;
  flex-direction: column;
  padding: 4px;
}
.menu button {
  display: flex;
  height: 28px;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--s-fg);
  font-size: 12.5px;
  cursor: pointer;
}
.menu button:hover {
  background: var(--s-hover);
}
.menu button.is-danger {
  color: var(--s-danger);
}
.menu kbd {
  color: var(--s-fg-3);
  font: 11px var(--s-mono);
}
</style>
