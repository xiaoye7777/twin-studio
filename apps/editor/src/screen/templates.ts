import type { SceneDocumentV2 } from '@twin-studio/core'
import { LocalSceneRepository } from '@/infrastructure/scenes'
import { type DataBinding, type ScreenDocument, staggerEntrances, type Widget } from './model'
import { createWidget } from './widgets'

export const templates = [
  {
    id: 'park',
    name: '园区运营监控',
    description: '中央三维场景，两侧能源指标、设备图表与告警，顶部标题与时间',
    defaultName: '零碳园区运营大屏',
  },
  { id: 'blank', name: '空白大屏', description: '从空白画布开始，自由拖入组件', defaultName: '未命名大屏' },
] as const

/** Fills a new screen from a template. The park template binds to the linked scene's devices. */
export async function buildTemplate(id: string, base: ScreenDocument): Promise<ScreenDocument> {
  if (id !== 'park') return base
  const scene = base.sceneProjectId
    ? await new LocalSceneRepository().load(base.sceneProjectId).catch(() => null)
    : null
  return {
    ...base,
    page: { ...base.page, background: { ...base.page.background, style: 'glow' } },
    widgets: parkWidgets(base, scene),
  }
}

/** Device types of a scene, found by what they are called (ids differ between projects). */
function findType(
  scene: SceneDocumentV2 | null,
  pattern: RegExp,
): { type: string; ids: string[]; variables: string[] } | null {
  const bindings = scene?.bindings.filter(binding => pattern.test(binding.device.type ?? '')) ?? []
  if (!bindings.length) return null
  return {
    type: bindings[0]!.device.type ?? '',
    ids: bindings.map(binding => binding.device.id),
    variables: [...new Set(bindings.flatMap(binding => binding.variables.map(variable => variable.key)))],
  }
}

function parkWidgets(base: ScreenDocument, scene: SceneDocumentV2 | null): Widget[] {
  const { width, height } = base.page
  // Laid out on 1920 × 1080 and scaled to the page; text scales with the smaller side.
  const sx = width / 1920
  const sy = height / 1080
  const sf = Math.min(sx, sy)
  const storage = findType(scene, /storage|ess|储能/i)
  const solar = findType(scene, /photovoltaic|solar|pv|光伏/i)
  const wind = findType(scene, /wind|风/i)
  const has = (kind: typeof storage, key: string) => !!kind && kind.variables.includes(key)
  const widgets: Widget[] = []

  function place(
    type: string,
    rect: [number, number, number, number],
    props: Record<string, unknown> = {},
    data?: DataBinding,
    name?: string,
  ): Widget {
    const widget = createWidget(type, { x: 0, y: 0 }, width)
    widget.x = Math.round(rect[0] * sx)
    widget.y = Math.round(rect[1] * sy)
    widget.w = Math.round(rect[2] * sx)
    widget.h = Math.round(rect[3] * sy)
    for (const [key, value] of Object.entries(props))
      widget.props[key] = typeof value === 'number' && /size/i.test(key) ? Math.round(value * sf) : value
    if (data) widget.data = data
    if (name) widget.name = name
    widgets.push(widget)
    return widget
  }
  const panel = (title: string, rect: [number, number, number, number]) =>
    place(
      'decor-border',
      rect,
      { style: 'panel', title, color: '#38bdf8', fill: 'rgba(6, 18, 36, 0.62)' },
      undefined,
      `面板：${title}`,
    )

  // Header
  place('decor-header', [0, 0, 1920, 96], { text: '零碳园区运营监控中心', fontSize: 40 }, undefined, '标题栏')
  place('clock', [1480, 22, 410, 40], { fontSize: 22, align: 'right' }, undefined, '时间')
  place(
    'text',
    [30, 26, 420, 36],
    {
      text: scene ? '园区设备 {value} 台 · 实时监测中' : '零碳智慧园区 · 实时监测',
      fontSize: 18,
      color: '#7dd3fc',
      decimals: 0,
    },
    scene ? { source: 'stat', stat: 'devices' } : { source: 'static', json: '' },
    '设备总数',
  )

  // Left column: energy figures, storage bars, storage trend
  panel('能源概览', [24, 110, 460, 300])
  const kpi = (
    title: string,
    unit: string,
    color: string,
    rect: [number, number, number, number],
    data: DataBinding,
    decimals = 1,
  ) => place('kpi', rect, { title, unit, color, decimals, fontSize: 36, titleSize: 15, style: 'card' }, data, title)
  kpi(
    '光伏总功率',
    'kW',
    '#fbbf24',
    [40, 162, 212, 110],
    has(solar, 'power')
      ? { source: 'aggregate', deviceType: solar!.type, variable: 'power', aggregate: 'sum' }
      : { source: 'static', json: '0' },
  )
  kpi(
    '风电总功率',
    'kW',
    '#38bdf8',
    [260, 162, 212, 110],
    has(wind, 'power')
      ? { source: 'aggregate', deviceType: wind!.type, variable: 'power', aggregate: 'sum' }
      : { source: 'static', json: '0' },
  )
  kpi(
    '储能平均 SOC',
    '%',
    '#34d399',
    [40, 284, 212, 110],
    has(storage, 'soc')
      ? { source: 'aggregate', deviceType: storage!.type, variable: 'soc', aggregate: 'avg' }
      : { source: 'static', json: '0' },
  )
  kpi(
    '在线设备',
    '台',
    '#a78bfa',
    [260, 284, 212, 110],
    scene ? { source: 'stat', stat: 'online' } : { source: 'static', json: '0' },
    0,
  )

  panel('储能柜 SOC 与温度', [24, 424, 460, 300])
  place(
    'chart-bar',
    [36, 470, 436, 244],
    { unit: '', fontSize: 13, palette: ['#34d399', '#f97316'] },
    has(storage, 'soc')
      ? {
          source: 'devices',
          deviceType: storage!.type,
          variables: ['soc', ...(has(storage, 'temperature') ? ['temperature'] : [])],
        }
      : undefined,
    '储能柱状图',
  )

  panel('储能 SOC 实时趋势', [24, 738, 460, 318])
  place(
    'chart-line',
    [36, 784, 436, 262],
    { unit: '%', fontSize: 13, palette: ['#38bdf8', '#34d399', '#fbbf24'] },
    has(storage, 'soc')
      ? {
          source: 'history',
          deviceType: storage!.type,
          deviceIds: storage!.ids.slice(0, 3),
          variables: ['soc'],
          window: 300,
        }
      : undefined,
    'SOC 趋势',
  )

  // Center: views, the 3D scene, layers, today's energy
  place('view-buttons', [508, 110, 904, 46], { fontSize: 15 }, undefined, '视角切换')
  place('scene', [508, 164, 904, 610], { border: true, radius: 4 }, undefined, '三维场景')
  place('layer-toggles', [508, 784, 904, 46], { fontSize: 14 }, undefined, '图层开关')
  place(
    'counter',
    [540, 852, 560, 130],
    { title: has(solar, 'energyToday') ? '今日光伏发电量' : '累计发电量', unit: 'kWh', digits: 6, fontSize: 56 },
    has(solar, 'energyToday')
      ? { source: 'aggregate', deviceType: solar!.type, variable: 'energyToday', aggregate: 'sum' }
      : undefined,
    '发电量翻牌器',
  )
  place('tour-control', [1150, 890, 240, 54], { fontSize: 15 }, undefined, '导览控制')
  place(
    'marquee',
    [508, 1010, 904, 40],
    { text: '零碳智慧园区 · 光伏、风电、储能协同运行 · 点击三维场景中的设备或右侧列表查看实时详情', fontSize: 18 },
    undefined,
    '跑马灯',
  )

  // Right column: alarms, the selected device, storage table
  panel('实时告警', [1436, 110, 460, 300])
  const alarms = place('alarm-list', [1452, 160, 428, 236], { fontSize: 15 }, { source: 'alarms' }, '告警列表')
  alarms.events = [{ id: 'event-alarm', trigger: 'click', action: { type: 'select-device', deviceId: '$item' } }]

  panel('设备详情', [1436, 424, 460, 300])
  place('device-panel', [1452, 470, 428, 240], { fontSize: 15, title: '当前设备' }, { source: 'selected' }, '设备详情')

  panel('储能柜运行状态', [1436, 738, 460, 318])
  const table = place(
    'table',
    [1452, 784, 428, 262],
    { fontSize: 14, rowHeight: 36, rank: false },
    storage
      ? {
          source: 'devices',
          deviceType: storage.type,
          variables: ['soc', 'power', 'temperature', 'status'].filter(key => storage.variables.includes(key)),
        }
      : undefined,
    '储能表格',
  )
  table.events = [{ id: 'event-table', trigger: 'click', action: { type: 'select-device', deviceId: '$item' } }]
  staggerEntrances(widgets)
  return widgets
}
