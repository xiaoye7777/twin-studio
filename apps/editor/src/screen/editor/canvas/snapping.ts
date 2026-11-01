/**
 * 吸附：拖动或缩放组件时，让它的边或中线自动对齐到页面、其他组件或参考线上。
 * 这里都是纯函数，方便单独阅读和测试。
 */
import type { ScreenDocument } from '../../model'
import type { Guide, Rect } from '../session'

/** 吸附距离：屏幕上 6 像素以内就吸过去（换算成页面像素要除以缩放）。 */
const SNAP_SCREEN_PX = 6

/** 能吸附到的位置：页面的边和中线、参考线，以及其他组件的边和中线。 */
export function snapTargets(doc: ScreenDocument, exclude: ReadonlySet<string>): { xs: number[]; ys: number[] } {
  const { width, height } = doc.page
  const xs = [0, width / 2, width, ...(doc.guides?.x ?? [])]
  const ys = [0, height / 2, height, ...(doc.guides?.y ?? [])]
  for (const widget of doc.widgets) {
    if (exclude.has(widget.id) || widget.hidden) continue
    xs.push(widget.x, widget.x + widget.w / 2, widget.x + widget.w)
    ys.push(widget.y, widget.y + widget.h / 2, widget.y + widget.h)
  }
  return { xs, ys }
}

/**
 * 在一个方向上找最近的吸附：`values` 是正在拖动的边（如左边、中线、右边），`targets` 是可吸附的位置。
 * 返回需要再挪动多少（delta），以及吸到了哪里（at，没吸附时为 null）。
 */
export function snapAxis(values: number[], targets: number[], zoom: number): { delta: number; at: number | null } {
  let best = { delta: 0, at: null as number | null, distance: SNAP_SCREEN_PX / zoom }
  for (const value of values)
    for (const target of targets) {
      const distance = Math.abs(target - value)
      if (distance < best.distance) best = { delta: target - value, at: target, distance }
    }
  return { delta: best.delta, at: best.at }
}

/** 吸附时画出的提示线：贯穿页面，并延伸到组件超出页面的部分。 */
export function snapLines(doc: ScreenDocument, rect: Rect, x: number | null, y: number | null): Guide[] {
  const { width, height } = doc.page
  const lines: Guide[] = []
  if (x !== null) lines.push({ axis: 'x', at: x, from: Math.min(0, rect.y), to: Math.max(height, rect.y + rect.h) })
  if (y !== null) lines.push({ axis: 'y', at: y, from: Math.min(0, rect.x), to: Math.max(width, rect.x + rect.w) })
  return lines
}
