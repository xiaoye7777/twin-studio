import { Group, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { TextSprite, type TwinEngine } from '@twin-studio/core'

export type MeasureMode = 'distance' | 'area'

export interface MeasureReadout {
  mode: MeasureMode | null
  points: number
  /** Polyline length (distance) or perimeter (area), metres. */
  length: number
  /** Ground-plane area of the polygon, m² (area mode, 3+ points). */
  area: number
  /** The segment being drawn or the last one: straight, horizontal and vertical. */
  segment: { length: number; horizontal: number; height: number } | null
  done: boolean
}

const COLOR = 0x5ec8ff
const LABEL = { style: 'tag' as const, color: '#ffffff', background: '#0b2233', size: 0.75 }

export function formatLength(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(2)} km` : `${metres.toFixed(metres < 10 ? 2 : 1)} m`
}

export function formatArea(squareMetres: number): string {
  return squareMetres >= 1e6 ? `${(squareMetres / 1e6).toFixed(3)} km²` : `${squareMetres.toFixed(1)} m²`
}

/** Area of a polygon projected onto the ground (shoelace on X/Z). */
export function groundArea(points: readonly Vector3[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    sum += a.x * b.z - b.x * a.z
  }
  return Math.abs(sum) / 2
}

/**
 * Measures distances and ground areas by clicking on the scene (surfaces or ground). Nothing is saved: the
 * measurement stays on screen until the next one starts or the tool is closed.
 */
export class MeasureTool {
  private mode: MeasureMode | null = null
  private points: Vector3[] = []
  private cursor: Vector3 | null = null
  private done = false
  private lastClick = 0
  private readonly group = new Group()
  /** Screen-space width, so the line reads at any distance. */
  private readonly line = new Line2(
    new LineGeometry(),
    new LineMaterial({ color: COLOR, linewidth: 2.5, depthTest: false, transparent: true }),
  )
  private readonly dotGeometry = new SphereGeometry(0.18, 12, 8)
  private readonly dotMaterial = new MeshBasicMaterial({ color: COLOR, depthTest: false })
  private readonly dots: Mesh[] = []
  private readonly labels: TextSprite[] = []
  snapStep = 0

  constructor(
    private readonly engine: TwinEngine,
    private readonly onChange: (readout: MeasureReadout) => void,
  ) {
    this.line.renderOrder = 22
    this.line.frustumCulled = false
    this.line.raycast = () => {}
    this.group.add(this.line)
    this.group.visible = false
    this.group.userData.editorInternal = true
    engine.overlay.add(this.group)
  }

  get active(): MeasureMode | null {
    return this.mode
  }

  start(mode: MeasureMode): void {
    this.mode = mode
    this.reset()
    this.group.visible = true
  }

  stop(): void {
    this.mode = null
    this.reset()
    this.group.visible = false
    this.emit()
  }

  /** Hides the overlay for clean captures. */
  setHidden(hidden: boolean): void {
    this.group.visible = !hidden && this.mode !== null
  }

  move(clientX: number, clientY: number): void {
    if (!this.mode || this.done) return
    this.cursor = this.locate(clientX, clientY)
    this.redraw()
  }

  click(clientX: number, clientY: number): void {
    if (!this.mode) return
    const point = this.locate(clientX, clientY)
    if (!point) return
    const now = performance.now()
    const double = now - this.lastClick < 320
    this.lastClick = now
    if (double && !this.done) return this.finish()
    // A click after a finished measurement starts the next one.
    if (this.done) this.reset()
    const last = this.points.at(-1)
    if (!last || last.distanceTo(point) > 0.01) this.points.push(point)
    this.redraw()
  }

  /** Enter / double-click: freezes the measurement. */
  finish(): void {
    if (!this.mode || this.points.length < (this.mode === 'area' ? 3 : 2)) return
    this.done = true
    this.cursor = null
    this.redraw()
  }

  undoPoint(): void {
    if (this.done) this.done = false
    this.points.pop()
    this.redraw()
  }

  clear(): void {
    this.reset()
  }

  dispose(): void {
    this.reset()
    this.labels.forEach(label => label.dispose())
    this.group.removeFromParent()
    this.line.geometry.dispose()
    this.line.material.dispose()
    this.dotGeometry.dispose()
    this.dotMaterial.dispose()
  }

  private reset(): void {
    this.points = []
    this.cursor = null
    this.done = false
    this.redraw()
  }

  private locate(clientX: number, clientY: number): Vector3 | null {
    const point = this.engine.pointAt(clientX, clientY)
    if (!point) return null
    if (this.snapStep > 0) {
      point.x = Math.round(point.x / this.snapStep) * this.snapStep
      point.z = Math.round(point.z / this.snapStep) * this.snapStep
    }
    return point
  }

  private redraw(): void {
    const area = this.mode === 'area'
    const points = [...this.points, ...(this.cursor ? [this.cursor] : [])]
    const loop = area && points.length > 2 ? [...points, points[0]!] : points
    this.line.visible = loop.length > 1
    if (this.line.visible) {
      this.line.geometry.dispose()
      this.line.geometry = new LineGeometry()
      this.line.geometry.setPositions(loop.flatMap(p => [p.x, p.y + 0.05, p.z]))
    }

    while (this.dots.length < points.length) {
      const dot = new Mesh(this.dotGeometry, this.dotMaterial)
      dot.renderOrder = 23
      dot.raycast = () => {}
      this.group.add(dot)
      this.dots.push(dot)
    }
    this.dots.forEach((dot, index) => {
      dot.visible = index < points.length
      if (dot.visible) dot.position.copy(points[index]!)
    })

    // One label per segment, plus the area in the middle of a polygon.
    const texts: Array<{ at: Vector3; text: string; priority: number }> = []
    for (let i = 1; i < loop.length; i++) {
      const a = loop[i - 1]!
      const b = loop[i]!
      texts.push({ at: a.clone().add(b).multiplyScalar(0.5), text: formatLength(a.distanceTo(b)), priority: 6 })
    }
    if (area && points.length > 2) {
      const center = points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length)
      texts.push({ at: center, text: `面积 ${formatArea(groundArea(points))}`, priority: 7 })
    }
    while (this.labels.length < texts.length) {
      const label = new TextSprite(undefined, 6)
      this.group.add(label)
      this.labels.push(label)
    }
    this.labels.forEach((label, index) => {
      const item = texts[index]
      label.visible = !!item
      if (!item) return
      label.priority = item.priority
      label.position.copy(item.at).add(new Vector3(0, 0.4, 0))
      label.setContent({ ...LABEL, lines: [item.text] })
    })
    this.emit()
  }

  private emit(): void {
    const points = [...this.points, ...(this.cursor ? [this.cursor] : [])]
    const area = this.mode === 'area'
    const loop = area && points.length > 2 ? [...points, points[0]!] : points
    let length = 0
    for (let i = 1; i < loop.length; i++) length += loop[i - 1]!.distanceTo(loop[i]!)
    const a = points.at(-2)
    const b = points.at(-1)
    this.onChange({
      mode: this.mode,
      points: this.points.length,
      length,
      area: area && points.length > 2 ? groundArea(points) : 0,
      segment:
        a && b
          ? {
              length: a.distanceTo(b),
              horizontal: Math.hypot(b.x - a.x, b.z - a.z),
              height: b.y - a.y,
            }
          : null,
      done: this.done,
    })
  }
}
