import type { Object3D } from 'three'
import type { Command } from '../Command'

export interface TransformState {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

export function captureTransform(object: Object3D): TransformState {
  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: [object.scale.x, object.scale.y, object.scale.z],
  }
}

export function applyTransformState(object: Object3D, state: TransformState): void {
  object.position.fromArray(state.position)
  object.rotation.set(...state.rotation)
  object.scale.fromArray(state.scale)
  object.updateMatrix()
  object.updateMatrixWorld(true)
}

export class TransformCommand implements Command {
  readonly label = 'Transform'
  constructor(
    private readonly object: Object3D,
    private readonly before: TransformState,
    private readonly after: TransformState,
    private readonly notify: (object: Object3D) => void,
  ) {}
  execute(): void { applyTransformState(this.object, this.after); this.notify(this.object) }
  undo(): void { applyTransformState(this.object, this.before); this.notify(this.object) }
}

export class PropertyCommand<T> implements Command {
  constructor(
    readonly label: string,
    private readonly before: T,
    private readonly after: T,
    private readonly apply: (value: T) => void,
  ) {}
  execute(): void { this.apply(this.after) }
  undo(): void { this.apply(this.before) }
}

export class FunctionalCommand implements Command {
  constructor(
    readonly label: string,
    private readonly executeAction: () => void | Promise<void>,
    private readonly undoAction: () => void | Promise<void>,
  ) {}
  execute(): void | Promise<void> { return this.executeAction() }
  undo(): void | Promise<void> { return this.undoAction() }
}
