import { Vector2 } from 'three'
import type { Object3D } from 'three'
import type { MeteorScene } from '@/infrastructure/meteor3d'
import type { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>

interface PointerStart {
  pointerId: number
  x: number
  y: number
  moved: boolean
}

interface SelectionManagerOptions {
  canvas: HTMLCanvasElement
  meteorScene: MeteorScene
  editorStore: EditorStore
  getSelectableRoots: () => readonly Object3D[]
  shouldIgnorePointer?: () => boolean
  clickMoveThreshold?: number
}

export class SelectionManager {
  private readonly canvas: HTMLCanvasElement
  private readonly meteorScene: MeteorScene
  private readonly editorStore: EditorStore
  private readonly getSelectableRoots: () => readonly Object3D[]
  private readonly shouldIgnorePointer: () => boolean
  private readonly clickMoveThresholdSquared: number
  private pointerStart: PointerStart | null = null

  constructor(options: SelectionManagerOptions) {
    this.canvas = options.canvas
    this.meteorScene = options.meteorScene
    this.editorStore = options.editorStore
    this.getSelectableRoots = options.getSelectableRoots
    this.shouldIgnorePointer = options.shouldIgnorePointer ?? (() => false)
    const threshold = options.clickMoveThreshold ?? 5
    this.clickMoveThresholdSquared = threshold * threshold

    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    window.addEventListener('pointermove', this.handlePointerMove)
    window.addEventListener('pointerup', this.handlePointerUp)
    window.addEventListener('pointercancel', this.handlePointerCancel)
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    window.removeEventListener('pointermove', this.handlePointerMove)
    window.removeEventListener('pointerup', this.handlePointerUp)
    window.removeEventListener('pointercancel', this.handlePointerCancel)
    this.pointerStart = null
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return

    this.pointerStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    }
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const start = this.pointerStart
    if (!start || event.pointerId !== start.pointerId) return

    if (this.distanceSquared(start, event) > this.clickMoveThresholdSquared) {
      start.moved = true
    }
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart
    if (!start || event.pointerId !== start.pointerId) return

    this.pointerStart = null
    const moved = start.moved || this.distanceSquared(start, event) > this.clickMoveThresholdSquared
    if (moved || this.shouldIgnorePointer()) return

    this.selectAt(event.clientX, event.clientY)
  }

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.pointerStart?.pointerId === event.pointerId) this.pointerStart = null
  }

  private selectAt(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      this.editorStore.clearSelection()
      return
    }

    const screenPosition = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    const roots = this.getSelectableRoots()
    const intersections = this.meteorScene.raycastObjects(screenPosition, {
      recursive: true,
      includeTileMap: false,
    })

    for (const intersection of intersections) {
      const target = this.findSelectionTarget(intersection.object, roots)
      if (target) {
        this.editorStore.selectObject(target)
        return
      }
    }

    this.editorStore.clearSelection()
  }

  private findSelectionTarget(
    object: Object3D,
    selectableRoots: readonly Object3D[],
  ): Object3D | null {
    let current: Object3D | null = object
    let nearestEditableNode: Object3D | null = null

    while (current) {
      if (typeof current.userData.bid === 'string' && !nearestEditableNode) {
        nearestEditableNode = current
      }
      if (selectableRoots.includes(current)) return nearestEditableNode ?? current
      current = current.parent
    }

    return null
  }

  private distanceSquared(start: PointerStart, event: PointerEvent): number {
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    return deltaX * deltaX + deltaY * deltaY
  }
}
