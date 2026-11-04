import {
  cloneTemplate,
  createEffect,
  createInteraction,
  getBuiltinTemplates,
  groupNodes,
  isSceneDocumentV2,
  migrateSceneV1ToV2,
  newId,
  type ProjectDataSource,
  type SceneDocumentV2,
  type SceneNodeV2,
  type TwinBindingTarget,
  type TwinVariableDefinition,
  type Vector3Tuple,
} from '@twin-studio/core'
import { getBuiltinModel, importBuiltinModel } from '@/editor/builtinModels'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { LocalSceneRepository } from '@/infrastructure/scenes'
import type { Project } from '@/stores/project'

/*
 * 储能电站案例：一座工商业储能电站，模型全部是真实比例（米）。
 * 所有读数都是写在静态数据源里的示例值（数据源名称里标明了），不连接真实设备。
 */

const assetKeys = [
  'essCabinet',
  'essCabinetLite',
  'boxTransformer',
  'mainTransformer',
  'switchgearCabin',
  'controlRoom',
  'pvCarport',
  'evCharger',
  'cableTray',
  'stationFence',
  'stationFenceLong',
  'lightMast',
  'boomBarrier',
  'stationSign',
  'hvBay',
  'towerA',
  'coveredCar',
  'hydrant',
  'manhole',
] as const
type AssetKey = (typeof assetKeys)[number]

const ROWS = [9, 4.5, 0] // 三排储能柜的 z，柜门都朝 +Z
const COLUMNS = 7
const PITCH = 2.1
const firstX = -19.3

/** 面板和地面的配色放在一起，调整整体气质时只改这里。 */
const LABEL_SCALE = 0.5
const LOOK = {
  lawn: '#737a60',
  lawnLine: '#787f65',
  paving: '#a3a39b',
  pavingLine: '#979790',
  asphalt: '#4b4d50',
  asphaltGrain: '#55575a',
  concrete: '#b6b6ae',
  concreteLine: '#a8a8a0',
  plinth: '#c4c4bc',
  gravel: '#8f897c',
  gravelGrain: '#a39d8f',
  hedge: '#44603c',
  hedgeLine: '#527047',
  parking: '#5a5d5e',
  parkingGrain: '#646768',
}

const variable = (key: string, name: string, dataType: TwinVariableDefinition['dataType'], unit?: string) => ({
  id: newId('var'),
  key,
  name,
  dataType,
  ...(unit ? { unit } : {}),
})

/** 示例读数：按序号算出来，每次生成都一样，不是随机数。 */
const wave = (index: number, center: number, spread: number, decimals = 1): number =>
  Number((center + Math.sin(index * 2.399) * spread).toFixed(decimals))

export function buildStorageStation(projectId: string, assets: Record<AssetKey, string>): SceneDocumentV2 {
  const doc = migrateSceneV1ToV2({
    version: 1,
    projectId,
    metadata: { name: '储能电站示例', updatedAt: new Date().toISOString() },
    instances: [],
    primitives: [],
    bindings: [],
    effects: [],
    visualRules: [],
    interactions: [],
    sceneSettings: {
      gridEnabled: false,
      axesEnabled: false,
      ground: { enabled: false, size: 40, color: '#4b5a48' },
      lighting: { ambientIntensity: 1, directionalIntensity: 2.5, directionalPosition: [12, 25, 18] },
      environmentAssetId: null,
    },
    dataSources: [],
  })

  doc.settings = {
    ...doc.settings,
    helpers: { grid: false, axes: false },
    ground: { enabled: false, size: 40, color: '#4b5a48' },
    sky: { ...doc.settings.sky, mode: 'physical', hdrAssetId: null, environmentIntensity: 0.22 },
    time: { hour: 14.2, azimuth: 8 },
    lighting: { ambientIntensity: 0.55, sunIntensity: 3.4, shadows: true },
    fog: { enabled: true, density: 0.1 },
    post: {
      exposure: 1,
      bloom: { enabled: true, intensity: 0.45, threshold: 1 },
      vignette: true,
      contrast: 0.1,
      saturation: 0.06,
    },
  }

  const base = (name: string, position: Vector3Tuple, rotationY = 0) => ({
    id: newId('node'),
    parentId: null,
    name,
    transform: { position, rotation: [0, rotationY, 0] as Vector3Tuple, scale: [1, 1, 1] as Vector3Tuple },
    visible: true,
    locked: false,
  })

  // ---------------------------------------------------------------- 地面
  type PrimitiveOptions = Partial<Extract<SceneNodeV2, { kind: 'primitive' }>['primitive']>
  const slab = (
    name: string,
    center: [number, number],
    size: [number, number],
    y: number,
    height: number,
    options: PrimitiveOptions,
  ) => {
    const node: SceneNodeV2 = {
      ...base(name, [center[0], y + height / 2, center[1]]),
      kind: 'primitive',
      primitive: {
        shape: 'box',
        color: '#888',
        width: size[0],
        height,
        depth: size[1],
        roughness: 0.92,
        metalness: 0,
        ...options,
      },
    }
    doc.nodes.push(node)
    return node.id
  }
  const groundIds = [
    slab('草地', [0, 0], [900, 900], -0.2, 0.2, {
      color: LOOK.lawn,
      pattern: { kind: 'lawn', scale: 14, color: LOOK.lawnLine },
      roughness: 1,
    }),
    slab('站区地坪', [1, 2.5], [66, 49], 0, 0.06, {
      color: LOOK.paving,
      pattern: { kind: 'tiles', scale: 6, color: LOOK.pavingLine },
    }),
  ]
  const asphalt = {
    color: LOOK.asphalt,
    pattern: { kind: 'asphalt', scale: 3, color: LOOK.asphaltGrain },
    roughness: 0.95,
  }
  groundIds.push(
    slab('前环路', [1, 19.5], [66, 6], 0.06, 0.03, asphalt),
    slab('站内横路', [-9.5, -6.5], [45, 4.5], 0.06, 0.03, asphalt),
    slab('左环路', [-28.5, 6.5], [7, 26], 0.06, 0.03, asphalt),
    slab('中路', [6.5, 6.5], [4.5, 22], 0.06, 0.03, asphalt),
    slab('进站路', [0, 76], [12, 100], -0.01, 0.1, asphalt),
  )
  // 道路标线
  const paint = { color: '#d9dcd8', roughness: 0.8 }
  for (let x = -30; x < 34; x += 6) groundIds.push(slab('车道线', [x, 19.5], [3, 0.14], 0.09, 0.006, paint))
  for (let z = 30; z < 126; z += 6) groundIds.push(slab('车道线', [0, z], [0.16, 3], 0.09, 0.006, paint))
  const safety = { color: '#d8a81e', roughness: 0.7 }
  groundIds.push(
    slab('道路边线', [1, 16.7], [66, 0.12], 0.09, 0.006, paint),
    slab('道路边线', [1, 22.3], [66, 0.12], 0.09, 0.006, paint),
  )

  // 储能区基础：抬高的混凝土平台，排与排之间是黄线标出的检修通道
  const concrete = { color: LOOK.concrete, pattern: { kind: 'tiles', scale: 4, color: LOOK.concreteLine } }
  groundIds.push(slab('储能区基础', [-9, 4.8], [28, 15.4], 0.06, 0.28, concrete))
  for (const z of ROWS) {
    groundIds.push(slab('安全线', [-13, z + 1.25], [16, 0.08], 0.34, 0.005, safety))
    groundIds.push(slab('柜基', [-13, z], [16, 1.7], 0.34, 0.1, { color: LOOK.plinth }))
  }
  // 电缆沟盖板：能流线就沿着它走
  const trench = { color: LOOK.plinth, pattern: { kind: 'tiles', scale: 1, color: LOOK.concreteLine } }
  groundIds.push(
    slab('电缆沟', [0.6, -7], [1, 8], 0.06, 0.06, trench),
    slab('电缆沟', [8, -11], [15, 1], 0.06, 0.06, trench),
    slab('电缆沟', [8.6, 3.4], [1, 13.8], 0.06, 0.06, trench),
    slab('电缆沟', [5.8, -3.4], [6.6, 1], 0.06, 0.06, trench),
  )
  // 样机展示区：深色台面，一圈发光边
  const padLine = { color: '#35e0d0', emissive: 0.8, roughness: 0.4 }
  groundIds.push(
    slab('样机台面', [-8, -14.6], [10, 8.6], 0.06, 0.14, { color: '#3b4448', metalness: 0.2, roughness: 0.55 }),
    slab('样机台面边线', [-8, -10.3], [10, 0.05], 0.2, 0.006, padLine),
    slab('样机台面边线', [-8, -18.9], [10, 0.05], 0.2, 0.006, padLine),
    slab('样机台面边线', [-13, -14.6], [0.05, 8.6], 0.2, 0.006, padLine),
    slab('样机台面边线', [-3, -14.6], [0.05, 8.6], 0.2, 0.006, padLine),
  )
  // 升压区：碎石场地
  groundIds.push(
    slab('升压区碎石', [21.5, -7.5], [23, 28], 0.06, 0.05, {
      color: LOOK.gravel,
      pattern: { kind: 'asphalt', scale: 1.2, color: LOOK.gravelGrain },
    }),
  )
  // 绿篱：沿前路和进站路，给大片硬地收个边
  const hedge = { color: LOOK.hedge, pattern: { kind: 'lawn', scale: 1.2, color: LOOK.hedgeLine }, roughness: 1 }
  groundIds.push(
    slab('绿篱', [-17, 25], [22, 1], 0.06, 0.9, hedge),
    slab('绿篱', [20, 25], [22, 1], 0.06, 0.9, hedge),
    slab('绿篱', [-8, 58], [0.9, 50], 0, 0.8, hedge),
    slab('绿篱', [8, 58], [0.9, 50], 0, 0.8, hedge),
  )
  // 车棚车位
  groundIds.push(
    slab('充电车位', [20, 12.6], [17, 7], 0.06, 0.025, {
      color: LOOK.parking,
      pattern: { kind: 'asphalt', scale: 3, color: LOOK.parkingGrain },
    }),
  )
  for (let i = 0; i <= 4; i++) groundIds.push(slab('车位线', [12 + i * 4, 12.6], [0.1, 6.4], 0.09, 0.006, paint))

  // ---------------------------------------------------------------- 模型
  const model = (key: AssetKey, name: string, position: Vector3Tuple, rotationY = 0): SceneNodeV2 => {
    const node: SceneNodeV2 = {
      ...base(name, position, rotationY),
      kind: 'model',
      model: { assetId: assets[key], overrides: {}, deleted: [] },
    }
    node.id = newId('instance')
    doc.nodes.push(node)
    return node
  }
  const target = (node: SceneNodeV2): TwinBindingTarget => ({ type: 'asset-instance', instanceId: node.id })
  const bind = (
    node: SceneNodeV2,
    id: string,
    name: string,
    type: string,
    variables: ReturnType<typeof variable>[],
  ) => {
    const binding = { id: newId('binding'), target: target(node), device: { id, name, type }, variables }
    doc.bindings.push(binding)
    return binding
  }
  const dataLabel = (node: SceneNodeV2, variables: string[], color: string, padding = 0.5, scale = 1) => {
    const effect = createEffect('data-label', target(node))
    effect.parameters = { ...effect.parameters, color, variables, padding, scale }
    doc.effects.push(effect)
  }

  // ---------------------------------------------------------------- 示例数据：三个静态接口
  const storageValues: Record<string, Record<string, string | number | boolean>> = {}
  const gridValues: typeof storageValues = {}
  const siteValues: typeof storageValues = {}

  // ---------------------------------------------------------------- 储能区
  // 高温预警：内置方案，告警牌收小一点，全景里不压住设备
  /** 单击开关门，双击爆炸和复位：和资源库里放一台储能柜时的预设一致。 */
  const cabinetActions = (node: SceneNodeV2) => {
    for (const [trigger, clip] of [
      ['click', 'Doors_Open'],
      ['double-click', 'Explode'],
    ] as const) {
      doc.interactions.push({
        ...createInteraction(target(node)),
        trigger,
        action: { type: 'play-animation', clip, mode: 'toggle' },
      })
    }
  }
  const warning = cloneTemplate(getBuiltinTemplates()[1]!)
  for (const atom of warning.effects) if (atom.kind === 'floating-label') atom.parameters.scale = LABEL_SCALE
  const cabinets: string[] = []
  let number = 0
  ROWS.forEach(z => {
    for (let col = 0; col < COLUMNS; col++) {
      number += 1
      const code = String(number).padStart(2, '0')
      const node = model('essCabinetLite', `储能柜 ${code}`, [firstX + col * PITCH, 0.44, z])
      cabinets.push(node.id)
      const deviceId = `ESS-${code}`
      const binding = bind(node, deviceId, `储能柜 ${code}`, 'energy-storage', [
        variable('soc', 'SOC', 'number', '%'),
        variable('power', '功率', 'number', 'kW'),
        variable('temperature', '电池温度', 'number', '℃'),
        variable('status', '状态', 'string'),
        variable('alarm', '告警', 'boolean'),
      ])
      // 13 号柜示范一条高温预警
      const hot = number === 13
      storageValues[deviceId] = {
        soc: wave(number, 74, 12),
        power: wave(number, 98, 14),
        temperature: hot ? 47.6 : wave(number, 29, 3),
        status: hot ? '高温预警' : '放电中',
        alarm: false,
      }
      doc.visualRules.push({
        id: newId('rule'),
        bindingId: binding.id,
        target: target(node),
        variableKey: 'temperature',
        condition: { dataType: 'number', operator: '>', value: 45 },
        enabled: true,
        priority: 10,
        template: warning,
      })
      cabinetActions(node)
    }
  })

  // 样机展示区：完整模型单独放在一块空地上，四周留足爆炸的空间
  const showcase = model('essCabinet', '储能柜样机', [-8, 0.2, -14.6])
  bind(showcase, 'ESS-SAMPLE', '储能柜样机', 'energy-storage', [
    variable('soc', 'SOC', 'number', '%'),
    variable('power', '功率', 'number', 'kW'),
    variable('temperature', '电池温度', 'number', '℃'),
  ])
  storageValues['ESS-SAMPLE'] = { soc: 81.5, power: 96.2, temperature: 27.8 }
  dataLabel(showcase, ['soc', 'power', 'temperature'], '#7ee0ff', 0.3, LABEL_SCALE * 0.8)
  cabinetActions(showcase)

  // 每排一段桥架接到箱变
  const trays: string[] = []
  for (const z of ROWS)
    for (let i = 0; i < 4; i++) trays.push(model('cableTray', '电缆桥架', [-20 + i * 6, 0.34, z - 1.3]).id)

  const boxes = ROWS.map((z, index) => {
    const node = model('boxTransformer', `${index + 1}# 箱变`, [0.6, 0.34, z - 0.2])
    const id = `TX-0${index + 1}`
    bind(node, id, `${index + 1}# 箱变`, 'transformer', [
      variable('power', '有功功率', 'number', 'kW'),
      variable('load', '负载率', 'number', '%'),
      variable('temperature', '绕组温度', 'number', '℃'),
    ])
    gridValues[id] = {
      power: wave(index + 3, 680, 40, 0),
      load: wave(index + 3, 62, 6),
      temperature: wave(index + 3, 58, 4),
    }
    return node
  })
  dataLabel(boxes[0]!, ['power', 'load'], '#ffd08a', 0.5, LABEL_SCALE)

  // ---------------------------------------------------------------- 升压区
  const mains = [16, 27].map((x, index) => {
    const node = model('mainTransformer', `${index + 1}# 主变`, [x, 0.11, -3])
    const id = `MTX-0${index + 1}`
    bind(node, id, `${index + 1}# 主变`, 'transformer', [
      variable('power', '有功功率', 'number', 'MW'),
      variable('voltage', '高压侧电压', 'number', 'kV'),
      variable('oilTemp', '油温', 'number', '℃'),
    ])
    gridValues[id] = { power: index ? 0.98 : 1.06, voltage: 35.2, oilTemp: index ? 49.8 : 52.3 }
    return node
  })
  const main = mains[0]!
  dataLabel(main, ['power', 'voltage', 'oilTemp'], '#ffd08a', 1.2, LABEL_SCALE)
  const bays = [16, 27].map((x, index) => model('hvBay', `${index + 1}# 出线间隔`, [x, 0.11, -13]))
  const tower = model('towerA', '输电铁塔', [21.5, -0.2, -62])
  const towerFar = model('towerA', '输电铁塔', [21.5, -0.2, -150])

  // 导线：间隔到铁塔、铁塔到铁塔，再从隔离开关落到主变套管
  const wire = (name: string, points: Vector3Tuple[], width = 0.03, color = '#23262a') => {
    const [ox, oy, oz] = points[0]!
    const node: SceneNodeV2 = {
      ...base(name, [ox, oy, oz]),
      kind: 'path',
      path: {
        points: points.map(([x, y, z]) => [x - ox, y - oy, z - oz]),
        closed: false,
        style: 'tube',
        color,
        width,
        speed: 0,
        opacity: 1,
      },
    }
    doc.nodes.push(node)
    return node.id
  }
  const sag = (from: Vector3Tuple, to: Vector3Tuple, drop: number, steps = 10): Vector3Tuple[] =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps
      return [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t - drop * 4 * t * (1 - t),
        from[2] + (to[2] - from[2]) * t,
      ] as Vector3Tuple
    })
  const wires: string[] = []
  ;[-3, 0, 3].forEach((dx, phase) => {
    for (const x of [16, 27]) {
      wires.push(wire('导线', sag([x + dx, 8.1, -13], [21.5 + dx * 1.2, 26, -62], 1.6)))
      // 悬垂线夹 → 隔离开关 → 主变套管
      wires.push(wire('引下线', sag([x + dx, 8.1, -13], [x + dx, 3.95, -9.9], 0.4), 0.04, '#b0793f'))
      wires.push(
        wire('引下线', sag([x + dx, 3.95, -9.9], [x + [-1.15, 0, 1.15][phase]!, 5.0, -3.45], 0.3), 0.04, '#b0793f'),
      )
    }
    wires.push(wire('导线', sag([21.5 + dx * 1.2, 26, -62], [21.5 + dx * 1.2, 26, -150], 4)))
  })

  // ---------------------------------------------------------------- 控制区
  const control = model('controlRoom', '站控室', [-20, 0.06, -14])
  const switchgear = model('switchgearCabin', '35kV 开关舱', [4, 0.06, -14])
  bind(control, 'SYS-01', '电站总览', 'station', [
    variable('soc', '全站 SOC', 'number', '%'),
    variable('power', '全站功率', 'number', 'MW'),
    variable('discharge', '今日放电', 'number', 'MWh'),
    variable('availability', '可用率', 'number', '%'),
  ])
  siteValues['SYS-01'] = { soc: 74.2, power: 2.04, discharge: 8.6, availability: 99.4 }
  dataLabel(control, ['soc', 'power', 'discharge', 'availability'], '#7ee0ff', 0.8, LABEL_SCALE * 1.1)
  bind(switchgear, 'SG-01', '35kV 开关舱', 'switchgear', [
    variable('current', '进线电流', 'number', 'A'),
    variable('status', '状态', 'string'),
  ])
  gridValues['SG-01'] = { current: 33.6, status: '合闸' }

  // ---------------------------------------------------------------- 光储充
  const carport = model('pvCarport', '光伏车棚', [20, 0.06, 12.6])
  bind(carport, 'PV-01', '光伏车棚', 'photovoltaic', [
    variable('power', '发电功率', 'number', 'kW'),
    variable('energyToday', '今日发电', 'number', 'kWh'),
  ])
  siteValues['PV-01'] = { power: 41.8, energyToday: 236 }
  dataLabel(carport, ['power', 'energyToday'], '#9be7a8', 0.8, LABEL_SCALE)
  for (let i = 0; i < 4; i++) {
    const charger = model('evCharger', `充电桩 ${i + 1}`, [14 + i * 4, 0.06, 10.1])
    const id = `EV-0${i + 1}`
    bind(charger, id, `充电桩 ${i + 1}`, 'charger', [
      variable('power', '充电功率', 'number', 'kW'),
      variable('status', '状态', 'string'),
    ])
    siteValues[id] = i === 1 ? { power: 58.4, status: '充电中' } : { power: 0, status: '空闲' }
  }
  model('coveredCar', '车辆', [18, 0.09, 13])
  model('coveredCar', '车辆', [26, 0.09, 13.2])

  // ---------------------------------------------------------------- 周界
  const fences: string[] = []
  const fenceLine = (from: number, to: number, fixed: number, axis: 'x' | 'z') => {
    const length = Math.abs(to - from)
    const direction = Math.sign(to - from)
    let done = 0
    const add = (key: AssetKey, size: number) => {
      const center = from + direction * (done + size / 2)
      const position: Vector3Tuple = axis === 'x' ? [center, 0, fixed] : [fixed, 0, center]
      fences.push(model(key, '围栏', position, axis === 'x' ? 0 : Math.PI / 2).id)
      done += size
    }
    while (length - done >= 16) add('stationFenceLong', 16)
    while (length - done >= 4) add('stationFence', 4)
  }
  fenceLine(-32, -6, 27, 'x')
  fenceLine(6, 34, 27, 'x')
  fenceLine(-32, 34, -22, 'x')
  fenceLine(-22, 27, -32, 'z')
  fenceLine(-22, 27, 34, 'z')
  // 升压区内围栏
  fenceLine(10, 34, 6.5, 'x')
  fenceLine(6.5, -21.5, 10, 'z')

  const lights = [
    [-30.5, -20.5],
    [32.5, -20.5],
    [-30.5, 25.5],
    [32.5, 25.5],
    [-24, 12.5],
    [9, -19],
    [11.5, 8],
  ].map(([x, z]) => model('lightMast', '高杆灯', [x!, 0.06, z!], Math.atan2(-x!, -z!)).id)
  const gate = [
    model('boomBarrier', '道闸', [-6.2, 0.05, 27]).id,
    model('boomBarrier', '道闸', [6.2, 0.05, 27], Math.PI).id,
  ]
  const sign = model('stationSign', '电站标识', [-15, 0, 31], 0.2)
  const hydrants = [
    model('hydrant', '消防栓', [-23.5, 0.06, 12.8]).id,
    model('hydrant', '消防栓', [9.4, 0.06, 12]).id,
    model('manhole', '井盖', [-26, 0.095, 19.5]).id,
    model('manhole', '井盖', [14, 0.095, 19.5]).id,
  ]

  // ---------------------------------------------------------------- 能流线：柜 → 箱变 → 主变 → 电网
  const flow = (name: string, color: string, points: Vector3Tuple[], speed = 2.4) => {
    const [ox, oy, oz] = points[0]!
    const node: SceneNodeV2 = {
      ...base(name, [ox, oy, oz]),
      kind: 'path',
      path: {
        points: points.map(([x, y, z]) => [x - ox, y - oy, z - oz]),
        closed: false,
        style: 'flow',
        color,
        width: 0.07,
        speed,
        opacity: 0.75,
      },
    }
    doc.nodes.push(node)
    return node.id
  }
  const flows = [
    ...ROWS.map((z, i) =>
      flow(`${i + 1} 排 → 箱变`, '#35e0d0', [
        [-20.5, 3.3, z - 1.3],
        [-2, 3.3, z - 1.3],
      ]),
    ),
    flow('箱变 → 开关舱', '#ffb347', [
      [0.6, 0.2, -3.2],
      [0.6, 0.2, -11],
    ]),
    flow('开关舱 → 主变', '#ffb347', [
      [2, 0.2, -11],
      [15.4, 0.2, -11],
      [15.4, 0.2, -5.5],
    ]),
    flow(
      '光伏 → 母线',
      '#9be7a8',
      [
        [12, 0.2, 10.2],
        [8.6, 0.2, 10.2],
        [8.6, 0.2, -3.4],
        [2.6, 0.2, -3.4],
      ],
      1.4,
    ),
  ]

  // ---------------------------------------------------------------- 区域标注
  const label = (text: string, position: Vector3Tuple) => {
    const node: SceneNodeV2 = {
      ...base(text, position),
      kind: 'label',
      label: { text, style: 'pin', color: '#e8f6f6', background: '#14505f', size: 0.62, leader: true },
    }
    doc.nodes.push(node)
    return node.id
  }
  const zones = [
    label('储能区', [-23, 6, 4.5]),
    label('升压区', [21.5, 12, -18]),
    label('控制区', [-20, 6.5, -14]),
    label('样机展示', [-8, 5.5, -18.2]),
    label('光储充', [20, 6.5, 12.6]),
  ]

  // ---------------------------------------------------------------- 夜间照明（白天不显眼）
  const lamp = (x: number, z: number) => {
    const node: SceneNodeV2 = {
      ...base('投光灯', [x, 11.4, z]),
      kind: 'light',
      light: { type: 'point', color: '#ffe9c9', intensity: 90, distance: 42, angle: 45, castShadow: false },
    }
    doc.nodes.push(node)
    return node.id
  }
  const lamps = [lamp(-24, 12.5), lamp(9, -19), lamp(11.5, 8)]

  // ---------------------------------------------------------------- 数据源：明确标注是示例
  const staticSource = (id: string, name: string, values: typeof storageValues): ProjectDataSource => ({
    id,
    name,
    type: 'static',
    enabled: true,
    values,
  })
  doc.dataSources = [
    staticSource('demo-storage', '示例静态数据 · 储能系统', storageValues),
    staticSource('demo-grid', '示例静态数据 · 升压与配电', gridValues),
    staticSource('demo-site', '示例静态数据 · 站控与光储充', siteValues),
  ]

  // ---------------------------------------------------------------- 分组：同时也是图层
  const groups: Array<[string, string[]]> = [
    ['储能区', [...cabinets, showcase.id, ...trays, ...boxes.map(node => node.id)]],
    ['升压区', [...mains.map(node => node.id), ...bays.map(node => node.id), tower.id, towerFar.id, ...wires]],
    ['控制区', [control.id, switchgear.id]],
    [
      '光储充',
      doc.nodes
        .filter(
          node =>
            node.kind === 'model' &&
            (node.name.startsWith('充电桩') || node.name === '光伏车棚' || node.name === '车辆'),
        )
        .map(node => node.id),
    ],
    ['周界与照明', [...fences, ...lights, ...gate, sign.id, ...hydrants, ...lamps]],
    ['能流', flows],
    ['区域标注', zones],
    ['地面', groundIds],
  ]
  const groupIds: Record<string, string> = {}
  for (const [name, ids] of groups) groupIds[name] = groupNodes(doc, ids, name)!
  const ground = doc.nodes.find(node => node.id === groupIds['地面'])
  if (ground) ground.locked = true

  // ---------------------------------------------------------------- 视角和导览
  const view = (position: Vector3Tuple, viewTarget: Vector3Tuple) => ({
    position,
    target: viewTarget,
    fov: 38,
    aspect: 16 / 9,
  })
  const bookmarks = [
    { id: newId('view'), name: '电站全景', view: view([44, 25, 52], [1, 0, 1]) },
    { id: newId('view'), name: '储能区', view: view([8, 7.5, 24], [-11, 1.4, 4]) },
    { id: newId('view'), name: '储能柜近景', view: view([-7.5, 2.7, 15.4], [-13.5, 1.45, 9]) },
    { id: newId('view'), name: '样机爆炸', view: view([-3.2, 4.2, -7], [-8, 2.3, -14.6]) },
    { id: newId('view'), name: '升压区', view: view([40, 11, 13], [21, 3.5, -7]) },
    { id: newId('view'), name: '控制区', view: view([-11, 7, 3], [-14, 1.6, -14]) },
    { id: newId('view'), name: '光储充', view: view([27, 4.6, 26], [20, 1.8, 10.5]) },
  ]
  doc.bookmarks = bookmarks
  doc.cameraView = bookmarks[0]!.view
  const step = (index: number, caption: string, highlight: string | null = null) => ({
    id: newId('step'),
    bookmarkId: bookmarks[index]!.id,
    nodeId: null,
    duration: 2.8,
    hold: 5,
    caption,
    show: [],
    hide: [],
    highlightNodeId: highlight,
  })
  doc.tours = [
    {
      id: newId('tour'),
      name: '储能电站导览',
      loop: true,
      steps: [
        step(0, '储能电站示例：储能系统、升压并网、站控和光储充一体化（读数为示例数据）'),
        step(1, '储能区：21 台一体化储能柜分三排布置，电缆桥架汇入箱式变压器', groupIds['储能区'] ?? null),
        step(2, '单击储能柜开关柜门，双击向前展开，看里面的电池模组和变流器'),
        step(3, '样机展示：双击查看完整爆炸图，电池包、电芯、变流器和消防系统一目了然', showcase.id),
        step(4, '升压区：主变压器把电能升压到 35kV，经出线间隔接入电网', main.id),
        step(5, '控制区：站控室统一调度，35kV 开关舱负责并网开断', control.id),
        step(6, '光储充：车棚光伏发电，就地供给充电桩，余电进入储能', carport.id),
      ],
    },
  ]
  doc.presentation = {
    autoplayTourId: doc.tours[0]!.id,
    idleSeconds: 60,
    autoRotate: false,
    cameraLimits: { enabled: false, maxDistance: 1.5, minDistance: 3, minElevation: 3 },
  }
  if (!isSceneDocumentV2(doc)) throw new Error('储能电站案例配置校验失败')
  return doc
}

/** 每次都生成一份新的，不会覆盖同事改过的案例。 */
export async function createStorageStation(publish: (project: Project) => void): Promise<Project> {
  const id = `storage-station-${crypto.randomUUID()}`
  const repository = new IndexedDbAssetRepository()
  const records = await Promise.all(
    assetKeys.map(async key => [key, (await importBuiltinModel(getBuiltinModel(key)!, repository)).id] as const),
  )
  const scene = buildStorageStation(id, Object.fromEntries(records) as Record<AssetKey, string>)
  const project: Project = {
    id,
    name: scene.metadata.name!,
    createdAt: scene.metadata.updatedAt,
    updatedAt: scene.metadata.updatedAt,
    cover: 'linear-gradient(135deg, #17303c 0%, #1d6f86 55%, #8fc7d0 100%)',
  }
  const scenes = new LocalSceneRepository()
  await scenes.save(scene)
  try {
    publish(project)
  } catch (error) {
    await scenes.remove(id)
    throw error
  }
  return project
}
