import { Vector2 } from 'three'
import type { Object3D } from 'three'
import type { TwinBindingTarget, TwinDevice } from '@/domain/twin'
import type { MeteorScene } from '@/infrastructure/meteor3d'
import { bindingTargetFromObject } from '@/editor/services/BindingTargetResolver'
import type { TwinRuntimeState } from './TwinDataRuntime'

export interface ViewerTargetClick {
  target: TwinBindingTarget
  bindingTarget?: TwinBindingTarget
  device?: TwinDevice
  bindingId?: string
}

/** Click notification only; never changes selection or editing state. */
export class ViewerPointerEvents {
  private start: { id: number; x: number; y: number; moved: boolean } | null = null
  private readonly pointers = new Set<number>()
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly runtime: MeteorScene,
    private readonly roots: readonly Object3D[],
    private readonly twin: TwinRuntimeState,
    private readonly emit: (event: ViewerTargetClick) => void,
  ) {
    canvas.addEventListener('pointerdown', this.down)
    window.addEventListener('pointermove', this.move)
    window.addEventListener('pointerup', this.up)
    window.addEventListener('pointercancel', this.cancel)
  }
  private readonly down = (event: PointerEvent): void => {
    this.pointers.add(event.pointerId)
    if (this.pointers.size > 1) { this.start = null; return }
    if (event.button === 0) this.start = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
  }
  private readonly move = (event: PointerEvent): void => {
    if (this.start?.id === event.pointerId && Math.hypot(event.clientX - this.start.x, event.clientY - this.start.y) > 5) this.start.moved = true
  }
  private readonly cancel = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId)
    if (this.start?.id === event.pointerId) this.start = null
  }
  private readonly up = (event: PointerEvent): void => {
    const start = this.start
    this.cancel(event)
    if (!start || start.id !== event.pointerId || start.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return
    const hits = this.runtime.raycastObjects(new Vector2(
      (event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2,
    ), { recursive: true, includeTileMap: false })
    for (const hit of hits) {
      const chain: Object3D[] = []
      let node: Object3D | null = hit.object
      while (node) { chain.push(node); if (this.roots.includes(node)) break; node = node.parent }
      if (!node || chain.some((item) => !item.visible)) continue
      const target = chain.map(bindingTargetFromObject).find((item) => item !== null)
      if (!target) continue
      // A child click can resolve the nearest ancestor's device binding.
      const binding = chain.map(bindingTargetFromObject).map((item) => item ? this.twin.getBindingByTarget(item) : null).find((item) => item !== null)
      this.emit({ target, bindingTarget: binding?.target, device: binding?.device, bindingId: binding?.id })
      return
    }
  }
  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.down)
    window.removeEventListener('pointermove', this.move)
    window.removeEventListener('pointerup', this.up)
    window.removeEventListener('pointercancel', this.cancel)
    this.start = null
    this.pointers.clear()
  }
}
