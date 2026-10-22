import type { ScreenDocument } from './model'

export const templates = [
  {
    id: 'park',
    name: '园区运营监控',
    description: '中央三维场景，两侧能源指标、设备图表与告警，顶部标题与时间',
    defaultName: '零碳园区运营大屏',
  },
  { id: 'blank', name: '空白大屏', description: '从空白画布开始，自由拖入组件', defaultName: '未命名大屏' },
] as const

/** Fills a new screen from a template (widgets arrive with the widget library). */
export async function buildTemplate(_id: string, base: ScreenDocument): Promise<ScreenDocument> {
  return base
}
