import { type DrawKind } from '../DrawTool'
import { type MeasureMode } from '../MeasureTool'
import type { EditorSession } from '../EditorSession'

/**
 * 视口里的两种工具：绘制（路径 / 区域 / 标签 / 灯光，点地面取点）和测量（距离 / 面积，不保存）。
 * 两者互斥；绘制完成后由 NodeCreation.finishDrawing 生成节点。
 */
export class DrawingTools {
  constructor(private readonly session: EditorSession) {}

  startDrawing(kind: DrawKind): void {
    if (this.session.ui.mode !== 'edit') return
    this.session.measureTool.stop()
    this.session.drawTool.snapStep = this.session.ui.snap.enabled ? this.session.ui.snap.translate : 0
    this.session.drawTool.start(kind)
    this.session.clearSelection()
  }

  cancelDrawing(): void {
    this.session.drawTool.cancel()
  }

  finishDrawingNow(): void {
    this.session.drawTool.finish()
  }

  undoDrawPoint(): void {
    this.session.drawTool.undoPoint()
  }

  /** Distance / area measuring in the viewport (not saved). */
  startMeasure(mode: MeasureMode): void {
    if (this.session.ui.mode !== 'edit') return
    this.session.drawTool.cancel()
    this.session.measureTool.snapStep = this.session.ui.snap.enabled ? this.session.ui.snap.translate : 0
    this.session.measureTool.start(mode)
  }

  stopMeasure(): void {
    this.session.measureTool.stop()
  }

  finishMeasure(): void {
    this.session.measureTool.finish()
  }

  undoMeasurePoint(): void {
    this.session.measureTool.undoPoint()
  }

  clearMeasure(): void {
    this.session.measureTool.clear()
  }
}
