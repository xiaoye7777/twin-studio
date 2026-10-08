import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import type { TwinEngine } from '@twin-studio/core'

export type DrawKind = 'path' | 'area' | 'label' | 'light'

export interface DrawResult {
  kind: DrawKind
  points: Vector3[]
}

/**
 * Click-to-place drawing on the ground (or on top of objects): paths and areas collect points until a
 * double-click or Enter, labels and lights take one click. A live preview follows the cursor.
 */
export class DrawTool {
  private kind: DrawKind | null = null
  private points: Vector3[] = []
  private cursor: Vector3 | null = null
  private readonly preview = new Group()
  private readonly line: Line<BufferGeometry, LineBasicMaterial>
  private readonly marker: Mesh<SphereGeometry, MeshBasicMaterial>
  private lastClick = 0
  snapStep = 0

  constructor(
    private readonly engine: TwinEngine,
    private readonly onFinish: (result: DrawResult) => void,
    private readonly onChange: (state: { kind: DrawKind | null; points: number }) => void = () => {},
  ) {
    this.line = new Line(new BufferGeometry(), new LineBasicMaterial({ color: 0xf0a050, depthTest: false }))
    this.line.renderOrder = 20
    this.line.frustumCulled = false
    this.marker = new Mesh(
      new SphereGeometry(0.25, 16, 8),
      new MeshBasicMaterial({ color: 0xf0a050, depthTest: false }),
    )
    this.marker.renderOrder = 21
    this.preview.add(this.line, this.marker)
    this.preview.visible = false
    this.preview.userData.editorInternal = true
    engine.overlay.add(this.preview)
  }

  /** Hides the preview for clean captures. */
  setPreviewHidden(hidden: boolean): void {
    this.preview.visible = !hidden && this.kind !== null
  }

  get active(): DrawKind | null {
    return this.kind
  }

  start(kind: DrawKind): void {
    this.kind = kind
    this.points = []
    this.cursor = null
    this.preview.visible = true
    this.redraw()
    this.onChange({ kind, points: 0 })
  }

  cancel(): void {
    this.kind = null
    this.points = []
    this.preview.visible = false
    this.onChange({ kind: null, points: 0 })
  }

  /** Removes the last point (Backspace). */
  undoPoint(): void {
    this.points.pop()
    this.redraw()
    this.onChange({ kind: this.kind, points: this.points.length })
  }

  move(clientX: number, clientY: number): void {
    if (!this.kind) return
    this.cursor = this.locate(clientX, clientY)
    this.redraw()
  }

  click(clientX: number, clientY: number): void {
    if (!this.kind) return
    const point = this.locate(clientX, clientY)
    if (!point) return
    const now = performance.now()
    const double = now - this.lastClick < 320
    this.lastClick = now
    if (this.kind === 'label' || this.kind === 'light') {
      this.finishWith([point])
      return
    }
    if (double) {
      this.finish()
      return
    }
    const last = this.points.at(-1)
    if (!last || last.distanceTo(point) > 0.05) this.points.push(point)
    this.redraw()
    this.onChange({ kind: this.kind, points: this.points.length })
  }

  /** Enter / double-click: completes the shape if it has enough points. */
  finish(): void {
    if (!this.kind) return
    const needed = this.kind === 'area' ? 3 : 2
    if (this.points.length >= needed) this.finishWith(this.points)
  }

  private finishWith(points: Vector3[]): void {
    const kind = this.kind!
    this.cancel()
    this.onFinish({ kind, points: points.map(point => point.clone()) })
  }

  private locate(clientX: number, clientY: number): Vector3 | null {
    const point = this.engine.pointAt(clientX, clientY)
    if (!point) return null
    if (this.snapStep > 0) {
      point.x = Math.round(point.x / this.snapStep) * this.snapStep
      point.z = Math.round(point.z / this.snapStep) * this.snapStep
    }
    point.y = Math.max(0, point.y)
    return point
  }

  private redraw(): void {
    const points = [...this.points, ...(this.cursor ? [this.cursor] : [])]
    if (this.kind === 'area' && points.length > 2) points.push(points[0]!)
    const positions = points.flatMap(point => [point.x, point.y + 0.08, point.z])
    this.line.geometry.dispose()
    this.line.geometry = new BufferGeometry()
    this.line.geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    this.marker.visible = !!this.cursor
    if (this.cursor) this.marker.position.copy(this.cursor)
  }

  dispose(): void {
    this.preview.removeFromParent()
    this.line.geometry.dispose()
    this.line.material.dispose()
    this.marker.geometry.dispose()
    this.marker.material.dispose()
  }
}
