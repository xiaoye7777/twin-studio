/**
 * 画布上的鼠标操作：拖动组件、拖手柄缩放（单个或多个一起）、框选、平移画布。
 *
 * 一次操作 = 按下（start…）→ 移动（onMove）→ 松开（onUp）。按下时记下这次操作的种类和起点（drag），
 * 移动时按种类分别处理。拖动和缩放每一帧都写进文档，但用同一个 coalesceKey 合并成一步撤销，
 * 松开时 commit() 结束这一步。
 */
import { type Ref, ref } from 'vue'
import type { Widget } from '../../model'
import { boundsOf, type Guide, type Rect, type ScreenEditorSession } from '../session'
import { snapAxis, snapLines, snapTargets } from './snapping'

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

type Point = { x: number; y: number }
type Drag =
  | { kind: 'move'; origin: Point; start: Map<string, Rect>; moved: boolean }
  | { kind: 'resize'; origin: Point; handle: Handle; start: Rect; rects: Map<string, Rect> }
  | { kind: 'marquee'; origin: Point; additive: boolean }
  | { kind: 'pan'; origin: Point; panX: number; panY: number }

/** 组件最小尺寸（页面像素）。 */
const MIN_SIZE = 8

export function useCanvasPointer(
  session: ScreenEditorSession,
  viewport: Ref<HTMLElement | undefined>,
  spaceDown: Ref<boolean>,
) {
  const ui = session.ui
  const panning = ref(false)
  let drag: Drag | null = null

  /** 屏幕坐标 → 页面坐标。 */
  function toPage(clientX: number, clientY: number): Point {
    const rect = viewport.value!.getBoundingClientRect()
    return { x: (clientX - rect.left - ui.panX) / ui.zoom, y: (clientY - rect.top - ui.panY) / ui.zoom }
  }

  function capture(event: PointerEvent): void {
    viewport.value?.setPointerCapture(event.pointerId)
  }

  const rectOf = (widget: Widget): Rect => ({ x: widget.x, y: widget.y, w: widget.w, h: widget.h })
  const additiveKey = (event: PointerEvent) => event.shiftKey || event.metaKey || event.ctrlKey

  // ---------------------------------------------------------------- 按下

  /** 按下组件：选中它（组合中的组件会选中整组），准备拖动。 */
  function onWidgetDown(event: PointerEvent, widget: Widget): void {
    if (event.button === 1 || spaceDown.value) return startPan(event)
    if (event.button !== 0) return
    event.stopPropagation()
    const ids = session.groupOf(widget.id)
    if (additiveKey(event)) return session.select(ids, 'toggle')
    if (!session.selection.value.includes(widget.id)) session.select(ids)
    const start = new Map(session.selectedWidgets.filter(item => !item.locked).map(item => [item.id, rectOf(item)]))
    if (!start.size) return
    drag = { kind: 'move', origin: { x: event.clientX, y: event.clientY }, start, moved: false }
    capture(event)
  }

  /** 按下缩放手柄：单选时缩放这个组件，多选或组合时整体等比缩放。 */
  function onHandleDown(event: PointerEvent, handle: Handle): void {
    if (event.button !== 0) return
    const widgets = session.selectedWidgets
    if (!widgets.length || widgets.some(widget => widget.locked)) return
    event.stopPropagation()
    drag = {
      kind: 'resize',
      origin: { x: event.clientX, y: event.clientY },
      handle,
      start: boundsOf(widgets),
      rects: new Map(widgets.map(widget => [widget.id, rectOf(widget)])),
    }
    capture(event)
  }

  /** 按下空白处：开始框选（不按 Shift / ⌘ 时先清空选择）。 */
  function onViewportDown(event: PointerEvent): void {
    if (event.button === 1 || spaceDown.value) return startPan(event)
    if (event.button !== 0) return
    const additive = additiveKey(event)
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

  // ---------------------------------------------------------------- 移动

  function onMove(event: PointerEvent): void {
    if (!drag) return
    const dx = event.clientX - drag.origin.x
    const dy = event.clientY - drag.origin.y
    if (drag.kind === 'pan') {
      ui.panX = drag.panX + dx
      ui.panY = drag.panY + dy
    } else if (drag.kind === 'marquee') updateMarquee(event, drag)
    else if (drag.kind === 'move') moveSelection(event, drag, dx, dy)
    else resizeSelection(event, drag, dx, dy)
  }

  function updateMarquee(event: PointerEvent, current: Extract<Drag, { kind: 'marquee' }>): void {
    const rect = viewport.value!.getBoundingClientRect()
    ui.marquee = {
      x: Math.min(event.clientX, current.origin.x) - rect.left,
      y: Math.min(event.clientY, current.origin.y) - rect.top,
      w: Math.abs(event.clientX - current.origin.x),
      h: Math.abs(event.clientY - current.origin.y),
    }
  }

  /** 拖动：整体平移选中的组件，外框的边和中线吸附到附近的位置（按住 Alt 关闭吸附）。 */
  function moveSelection(event: PointerEvent, current: Extract<Drag, { kind: 'move' }>, dx: number, dy: number): void {
    // 移动不到 3 像素算点击，不算拖动。
    if (!current.moved && Math.hypot(dx, dy) < 3) return
    current.moved = true
    let mx = dx / ui.zoom
    let my = dy / ui.zoom
    const box = boundsOf([...current.start.values()])
    let snapX: number | null = null
    let snapY: number | null = null
    if (ui.snap && !event.altKey) {
      const targets = snapTargets(session.doc.value, new Set(current.start.keys()))
      const sx = snapAxis([box.x + mx, box.x + mx + box.w / 2, box.x + mx + box.w], targets.xs, ui.zoom)
      const sy = snapAxis([box.y + my, box.y + my + box.h / 2, box.y + my + box.h], targets.ys, ui.zoom)
      mx += sx.delta
      my += sy.delta
      snapX = sx.at
      snapY = sy.at
    }
    const rects = new Map<string, Rect>()
    for (const [id, rect] of current.start)
      rects.set(id, { ...rect, x: Math.round(rect.x + mx), y: Math.round(rect.y + my) })
    ui.guides = snapLines(session.doc.value, { ...box, x: box.x + mx, y: box.y + my }, snapX, snapY)
    session.setRects(rects, '移动', `move:${[...current.start.keys()].join(',')}`)
  }

  /**
   * 缩放：被拖的边跟着鼠标走并吸附；按住 Shift（多选时始终）从角上缩放保持比例。
   * 多个组件时先算出外框的新位置，再把每个组件按外框的比例放大缩小。
   */
  function resizeSelection(
    event: PointerEvent,
    current: Extract<Drag, { kind: 'resize' }>,
    dx: number,
    dy: number,
  ): void {
    const { start, handle } = current
    let left = start.x
    let top = start.y
    let right = start.x + start.w
    let bottom = start.y + start.h
    if (handle.includes('w')) left += dx / ui.zoom
    if (handle.includes('e')) right += dx / ui.zoom
    if (handle.includes('n')) top += dy / ui.zoom
    if (handle.includes('s')) bottom += dy / ui.zoom

    const lines: Guide[] = []
    if (ui.snap && !event.altKey) {
      const { width, height } = session.doc.value.page
      const targets = snapTargets(session.doc.value, new Set(current.rects.keys()))
      if (handle.includes('w') || handle.includes('e')) {
        const snap = snapAxis([handle.includes('w') ? left : right], targets.xs, ui.zoom)
        if (handle.includes('w')) left += snap.delta
        else right += snap.delta
        if (snap.at !== null) lines.push({ axis: 'x', at: snap.at, from: 0, to: height })
      }
      if (handle.includes('n') || handle.includes('s')) {
        const snap = snapAxis([handle.includes('n') ? top : bottom], targets.ys, ui.zoom)
        if (handle.includes('n')) top += snap.delta
        else bottom += snap.delta
        if (snap.at !== null) lines.push({ axis: 'y', at: snap.at, from: 0, to: width })
      }
    }

    const many = current.rects.size > 1
    if ((event.shiftKey || many) && handle.length === 2) {
      const height = (right - left) / (start.w / start.h)
      if (handle.includes('n')) top = bottom - height
      else bottom = top + height
    }
    if (right - left < MIN_SIZE) {
      if (handle.includes('w')) left = right - MIN_SIZE
      else right = left + MIN_SIZE
    }
    if (bottom - top < MIN_SIZE) {
      if (handle.includes('n')) top = bottom - MIN_SIZE
      else bottom = top + MIN_SIZE
    }
    ui.guides = lines

    const sx = (right - left) / start.w
    const sy = (bottom - top) / start.h
    const rects = new Map<string, Rect>()
    for (const [id, rect] of current.rects)
      rects.set(id, {
        x: Math.round(left + (rect.x - start.x) * sx),
        y: Math.round(top + (rect.y - start.y) * sy),
        w: Math.max(MIN_SIZE, Math.round(rect.w * sx)),
        h: Math.max(MIN_SIZE, Math.round(rect.h * sy)),
      })
    session.setRects(rects, '调整大小', `resize:${[...current.rects.keys()].join(',')}`)
  }

  // ---------------------------------------------------------------- 松开

  function onUp(event: PointerEvent): void {
    if (!drag) return
    const ended = drag
    drag = null
    panning.value = false
    ui.guides = []
    if (ended.kind === 'move' || ended.kind === 'resize') session.commit()
    if (ended.kind === 'marquee' && ui.marquee) selectInMarquee(ended.additive)
    ui.marquee = null
    viewport.value?.releasePointerCapture(event.pointerId)
  }

  /** 框选：选中与框相交的组件（连同它们的组合）。 */
  function selectInMarquee(additive: boolean): void {
    const box = ui.marquee!
    const rect = viewport.value!.getBoundingClientRect()
    const a = toPage(box.x + rect.left, box.y + rect.top)
    const b = { x: a.x + box.w / ui.zoom, y: a.y + box.h / ui.zoom }
    const hits = session.doc.value.widgets
      .filter(w => !w.locked && !w.hidden && w.x < b.x && w.x + w.w > a.x && w.y < b.y && w.y + w.h > a.y)
      .map(w => w.id)
    session.select(session.withGroups(hits), additive ? 'add' : 'replace')
  }

  return { panning, toPage, onWidgetDown, onHandleDown, onViewportDown, onMove, onUp }
}
