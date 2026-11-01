import { Box3, type Object3D, Vector3 } from 'three'
import { ancestorIds, isLockedOrHidden, nodeById } from '@twin-studio/core'
import type { EditorSession, PartRef } from '../EditorSession'

/**
 * 三维视口里的鼠标（编辑模式）：单击选中、Shift 拖动框选、双击进入模型部件、悬停描边、右键菜单。
 *
 * 点选的规则（pickNode / pickPart）：
 * - 第一次点到的是最外层的分组；分组已选中时再点，进入下一层（和 Figma 的分组一样）；双击直接选最里层。
 * - 模型已选中时再点，进入它的部件；每点一次深入一层。
 * 拖动超过 4 像素算拖动（旋转相机），不算点击。
 */
export class ViewportPointer {
  /** 按下时的位置和按键，用来区分点击和拖动。 */
  private pressed: { x: number; y: number; button: number } | null = null
  private hoverFrame: number | null = null
  /** The hover outline shows a part (of the selected model) rather than a node. */
  private partHovered = false

  constructor(private readonly session: EditorSession) {
    const canvas = session.canvas
    // 捕获阶段先于相机控制和变换手柄：Shift 拖动变成框选，而不是旋转相机。
    canvas.addEventListener('pointerdown', this.onMarqueeStart, { capture: true })
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    window.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('dblclick', this.onDoubleClick)
    canvas.addEventListener('contextmenu', this.onContextMenu)
  }

  dispose(): void {
    const canvas = this.session.canvas
    if (this.hoverFrame !== null) cancelAnimationFrame(this.hoverFrame)
    canvas.removeEventListener('pointerdown', this.onMarqueeStart, { capture: true })
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerleave', this.onPointerLeave)
    window.removeEventListener('pointerup', this.onPointerUp)
    canvas.removeEventListener('dblclick', this.onDoubleClick)
    canvas.removeEventListener('contextmenu', this.onContextMenu)
  }

  private readonly onMarqueeStart = (event: PointerEvent): void => {
    if (
      event.button !== 0 ||
      !event.shiftKey ||
      this.session.ui.mode !== 'edit' ||
      !this.session.ui.ready ||
      this.session.drawTool.active
    )
      return
    event.stopImmediatePropagation()
    event.preventDefault()
    const rect = this.session.canvas.getBoundingClientRect()
    const start = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const additive = event.ctrlKey || event.metaKey
    let moved = false
    const move = (moveEvent: PointerEvent) => {
      const x = moveEvent.clientX - rect.left
      const y = moveEvent.clientY - rect.top
      if (!moved && Math.hypot(x - start.x, y - start.y) < 4) return
      moved = true
      this.session.ui.marquee = {
        left: Math.min(start.x, x),
        top: Math.min(start.y, y),
        width: Math.abs(x - start.x),
        height: Math.abs(y - start.y),
      }
    }
    const up = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const box = this.session.ui.marquee
      this.session.ui.marquee = null
      if (!moved || !box) {
        // A Shift-click without dragging toggles the object under the cursor, as before.
        const id = this.pickNode(upEvent.clientX, upEvent.clientY, upEvent.altKey)
        if (id) this.session.select([id], 'toggle')
        return
      }
      this.session.select(this.nodesInBox(box, rect), additive ? 'add' : 'replace')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /**
   * Nodes whose centre falls inside a screen box: equipment and other leaves (not groups), skipping locked
   * and hidden ones, so a sweep over a park picks devices rather than the ground they stand on.
   */
  private nodesInBox(box: { left: number; top: number; width: number; height: number }, rect: DOMRect): string[] {
    const doc = this.session.doc.value
    const camera = this.session.engine.camera
    const bounds = new Box3()
    const center = new Vector3()
    const result: string[] = []
    for (const node of doc.nodes) {
      if (node.kind === 'group') continue
      const state = isLockedOrHidden(doc, node.id)
      if (state.locked || state.hidden) continue
      const object = this.session.sync.objectFor(node.id)
      if (!object) continue
      bounds.setFromObject(object, true)
      if (bounds.isEmpty()) continue
      bounds.getCenter(center).project(camera)
      if (center.z > 1) continue
      const x = ((center.x + 1) / 2) * rect.width
      const y = ((1 - center.y) / 2) * rect.height
      if (x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height) result.push(node.id)
    }
    return result
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pressed = { x: event.clientX, y: event.clientY, button: event.button }
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const start = this.pressed
    this.pressed = null
    if (!start || this.session.ui.mode !== 'edit' || !this.session.ui.ready) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return
    if (start.button === 2 && event.target === this.session.canvas)
      return this.openContextMenu(event.clientX, event.clientY)
    if (start.button !== 0) return
    if (event.target !== this.session.canvas || this.session.gizmo.active) return
    if (this.session.drawTool.active) {
      this.session.drawTool.click(event.clientX, event.clientY)
      return
    }
    if (this.session.measureTool.active) {
      this.session.measureTool.click(event.clientX, event.clientY)
      return
    }
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    const part = additive ? null : this.pickPart(event.clientX, event.clientY, false)
    if (part) return this.session.selectPart(part.nodeId, part.assetNodeId)
    const id = this.pickNode(event.clientX, event.clientY, event.altKey)
    if (!id) {
      if (!additive) this.session.clearSelection()
      return
    }
    this.session.select([id], additive ? 'toggle' : 'replace')
  }

  /** Right-click without dragging (a right drag pans the camera): select what is under it and open the menu. */
  private openContextMenu(clientX: number, clientY: number): void {
    if (this.session.drawTool.active || this.session.measureTool.active) return
    const id = this.pickNode(clientX, clientY, false)
    const part = this.session.part.value
    const insidePart =
      part && id && this.session.sync.nodeIdOf(this.session.engine.pick(clientX, clientY)!.object) === part.nodeId
    if (!insidePart) {
      if (!id) this.session.clearSelection()
      else if (!this.session.selection.value.includes(id)) this.session.select([id])
    }
    const point = this.session.engine.pointAt(clientX, clientY)
    this.session.ui.contextMenu = { x: clientX, y: clientY, point: point ? [point.x, point.y, point.z] : null }
  }

  closeContextMenu(): void {
    this.session.ui.contextMenu = null
  }

  private readonly onContextMenu = (event: MouseEvent): void => {
    if (this.session.ui.mode === 'edit') event.preventDefault()
  }

  private readonly onDoubleClick = (event: MouseEvent): void => {
    if (this.session.ui.mode !== 'edit' || this.session.drawTool.active || this.session.measureTool.active) return
    // Inside a model the innermost thing is a part; the camera stays, parts can be small.
    const part = this.pickPart(event.clientX, event.clientY, true)
    if (part) return this.session.selectPart(part.nodeId, part.assetNodeId)
    const id = this.pickNode(event.clientX, event.clientY, true)
    if (id) {
      this.session.select([id])
      void this.session.focusSelection()
    }
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.session.drawTool.active) this.session.drawTool.move(event.clientX, event.clientY)
    if (this.session.measureTool.active) this.session.measureTool.move(event.clientX, event.clientY)
    if (this.hoverFrame !== null) return
    const { clientX, clientY } = event
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = null
      if (this.session.disposed || !this.session.ui.ready) return
      const ndc = this.session.engine.toNdc(clientX, clientY)
      const ground = ndc ? this.session.engine.raycastGround(ndc) : null
      this.session.ui.cursor = ground ? [ground.x, ground.y, ground.z] : null
      if (
        this.session.ui.mode !== 'edit' ||
        this.pressed ||
        this.session.gizmo.dragging ||
        this.session.drawTool.active
      )
        return
      if (this.session.measureTool.active) return
      const part = this.pickPart(clientX, clientY, false)
      if (part) {
        this.setHovered(null)
        const object = this.session.sync.partObject(part.nodeId, part.assetNodeId)
        const current = this.session.part.value
        const same = current?.nodeId === part.nodeId && current.assetNodeId === part.assetNodeId
        this.session.engine.setOutlined('hover', object && !same ? [object] : [])
        this.partHovered = true
        return
      }
      this.setHovered(this.pickNode(clientX, clientY, false), this.partHovered)
      this.partHovered = false
    })
  }

  private readonly onPointerLeave = (): void => {
    this.setHovered(null)
    this.session.ui.cursor = null
  }

  setHovered(id: string | null, force = false): void {
    if (this.session.hovered.value === id && !force) return
    this.session.hovered.value = id
    const object = id && !this.session.selection.value.includes(id) ? this.session.sync.objectFor(id) : null
    this.session.engine.setOutlined('hover', object ? [object] : [])
  }

  /**
   * Which node a click means: the outermost group under the cursor, or one level deeper when that group is
   * already selected (like entering a group); `deep` picks the innermost node. Locked nodes are skipped.
   */
  private pickNode(clientX: number, clientY: number, deep: boolean): string | null {
    const hit = this.session.engine.pick(clientX, clientY)
    if (!hit) return null
    const deepest = this.session.sync.nodeIdOf(hit.object)
    if (!deepest) return null
    const doc = this.session.doc.value
    if (isLockedOrHidden(doc, deepest).locked) return null
    const chain = [...ancestorIds(doc, deepest), deepest]
    if (deep) return deepest
    const current = this.session.selection.value.length === 1 ? this.session.selection.value[0]! : null
    const index = current ? chain.indexOf(current) : -1
    if (index < 0) return chain[0]!
    if (nodeById(doc, current!)?.kind === 'group' && index < chain.length - 1) return chain[index + 1]!
    return current
  }

  /**
   * Which part of a model a click means, when the click enters a model: the model (or one of its parts) is
   * selected and the click lands on it. Like groups, each click goes one level deeper; `deep` (double-click)
   * goes straight to the innermost part, for any model. Wrapper nodes that only hold the rest are skipped.
   */
  private pickPart(clientX: number, clientY: number, deep: boolean): PartRef | null {
    const hit = this.session.engine.pick(clientX, clientY)
    const nodeId = hit ? this.session.sync.nodeIdOf(hit.object) : null
    const node = nodeId ? this.session.node(nodeId) : null
    if (!hit || !nodeId || node?.kind !== 'model' || isLockedOrHidden(this.session.doc.value, nodeId).locked)
      return null
    const current = this.session.part.value?.nodeId === nodeId ? this.session.part.value.assetNodeId : null
    if (!deep && !current && !(this.session.selection.value.length === 1 && this.session.selection.value[0] === nodeId))
      return null
    const root = this.session.sync.objectFor(nodeId)
    const chain: Object3D[] = []
    for (let object: Object3D | null = hit.object; object && object !== root; object = object.parent)
      chain.unshift(object)
    while (chain.length > 1 && chain[0]!.parent?.children.length === 1) chain.shift()
    const ids = chain
      .map(object => object.userData.assetNodeId as unknown)
      .filter((id): id is string => typeof id === 'string')
    if (!ids.length) return null
    if (deep) return { nodeId, assetNodeId: ids.at(-1)! }
    const at = current ? ids.indexOf(current) : -1
    if (at >= 0) return { nodeId, assetNodeId: ids[Math.min(at + 1, ids.length - 1)]! }
    // Another branch of the same model: stay at the current depth.
    const depth = current ? this.partDepth(nodeId, current) : 0
    return { nodeId, assetNodeId: ids[Math.min(depth, ids.length - 1)]! }
  }

  private partDepth(nodeId: string, assetNodeId: string): number {
    const root = this.session.sync.objectFor(nodeId)
    let depth = 0
    for (
      let object = this.session.sync.partObject(nodeId, assetNodeId)?.parent;
      object && object !== root;
      object = object.parent
    )
      depth++
    return depth
  }
}
