import type { Object3D } from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import type { MeteorScene } from '@/infrastructure/meteor3d'
import { MathUtils } from 'three'
import type { TransformMode } from '@/stores/editor'

interface TransformManagerOptions {
  onAxisChange?: (axis: string | null) => void
  onDraggingChange?: (dragging: boolean) => void
  onObjectChange?: (object: Object3D) => void
}

function currentTime(): number {
  return globalThis.performance?.now() ?? Date.now()
}

export class TransformManager {
  private readonly controls: TransformControls
  private readonly helper: Object3D
  private readonly meteorScene: MeteorScene
  private readonly onAxisChange?: (axis: string | null) => void
  private readonly onDraggingChange?: (dragging: boolean) => void
  private readonly onObjectChange?: (object: Object3D) => void
  private restoreCameraControls: boolean | null = null
  private suppressSelectionUntil = 0
  private snapValue: number | null = null

  constructor(meteorScene: MeteorScene, options: TransformManagerOptions = {}) {
    this.meteorScene = meteorScene
    this.onAxisChange = options.onAxisChange
    this.onDraggingChange = options.onDraggingChange
    this.onObjectChange = options.onObjectChange
    this.controls = new TransformControls(
      meteorScene.getCamera(),
      meteorScene.getDomElement(),
    )
    this.helper = this.controls.getHelper()
    meteorScene.getScene().add(this.helper)

    this.controls.addEventListener('axis-changed', this.handleAxisChanged)
    this.controls.addEventListener('dragging-changed', this.handleDraggingChanged)
    this.controls.addEventListener('mouseDown', this.handleMouseDown)
    this.controls.addEventListener('mouseUp', this.handleMouseUp)
    this.controls.addEventListener('objectChange', this.handleObjectChange)
  }

  attach(object: Object3D): void {
    this.controls.attach(object)
  }

  detach(): void {
    this.controls.detach()
  }

  setMode(mode: TransformMode): void {
    this.controls.setMode(mode)
    this.applySnap(mode)
  }

  setSnap(value: number | null): void { this.snapValue = value; this.applySnap(this.controls.getMode()) }

  isPointerInteractionActive(): boolean {
    return (
      this.controls.dragging ||
      this.controls.axis !== null ||
      currentTime() < this.suppressSelectionUntil
    )
  }

  dispose(): void {
    this.controls.removeEventListener('axis-changed', this.handleAxisChanged)
    this.controls.removeEventListener('dragging-changed', this.handleDraggingChanged)
    this.controls.removeEventListener('mouseDown', this.handleMouseDown)
    this.controls.removeEventListener('mouseUp', this.handleMouseUp)
    this.controls.removeEventListener('objectChange', this.handleObjectChange)

    if (this.restoreCameraControls !== null) {
      this.meteorScene.setCameraControlsEnabled(this.restoreCameraControls)
      this.restoreCameraControls = null
    }

    this.controls.detach()
    this.helper.removeFromParent()
    this.controls.dispose()
  }

  private readonly handleDraggingChanged = (event: { value: unknown }): void => {
    const dragging = event.value === true

    if (dragging) {
      this.restoreCameraControls = this.meteorScene.isCameraControlsEnabled()
      this.meteorScene.setCameraControlsEnabled(false)
    } else if (this.restoreCameraControls !== null) {
      this.meteorScene.setCameraControlsEnabled(this.restoreCameraControls)
      this.restoreCameraControls = null
      this.suppressSelectionUntil = currentTime() + 100
    }

    this.onDraggingChange?.(dragging)
  }

  private readonly handleAxisChanged = (): void => {
    this.onAxisChange?.(this.controls.axis)
  }

  private readonly handleMouseDown = (): void => {
    this.suppressSelectionUntil = currentTime() + 100
  }

  private readonly handleMouseUp = (): void => {
    this.suppressSelectionUntil = currentTime() + 100
  }

  private readonly handleObjectChange = (): void => {
    if (this.controls.object) this.onObjectChange?.(this.controls.object)
  }

  private applySnap(mode: TransformMode): void {
    this.controls.setTranslationSnap(mode === 'translate' ? this.snapValue : null)
    this.controls.setRotationSnap(mode === 'rotate' && this.snapValue !== null ? MathUtils.degToRad(this.snapValue) : null)
    this.controls.setScaleSnap(mode === 'scale' ? this.snapValue : null)
  }
}
