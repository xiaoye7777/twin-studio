import {
  type AssetRepository,
  cloneTemplate,
  createEffect,
  defaultDataSources,
  getBuiltinTemplates,
  groupNodes,
  newId,
  isSceneDocumentV1,
  migrateSceneV1ToV2,
  type SceneDocumentV2,
  type SceneNodeV2,
  type SceneAssetInstanceV1,
  type SceneDocumentV1,
  type SceneInteraction,
  type ScenePrimitiveV1,
  type TwinBindingTarget,
  type Vector3Tuple,
} from '@twin-studio/core'
import { builtinModels, type BuiltinModelKey, importBuiltinModel } from '@/editor/builtinModels'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { LocalSceneRepository } from '@/infrastructure/scenes'
import type { Project } from '@/stores/project'
import { deviceTemplates, deviceVariables } from '@/studio/deviceTemplates'

type DemoAssetKey = BuiltinModelKey

/** Ordinary saved scene configuration: no demo runtime or special data source; models are regular assets. */
export function buildZeroCarbonPark(projectId: string, assets: Record<DemoAssetKey, string>): SceneDocumentV1 {
  const scene: SceneDocumentV1 = {
    dataSources: defaultDataSources(),
    version: 1,
    projectId,
    metadata: { name: '零碳智慧园区 Demo', updatedAt: new Date().toISOString() },
    instances: [],
    primitives: [],
    bindings: [],
    effects: [],
    visualRules: [],
    interactions: [],
    sceneSettings: {
      gridEnabled: false,
      axesEnabled: false,
      ground: { enabled: false, size: 40, color: '#273e48' },
      lighting: { ambientIntensity: 1.8, directionalIntensity: 2.5, directionalPosition: [12, 25, 18] },
      environmentAssetId: null,
    },
    cameraView: { position: [27, 30, 36], target: [0, 0, 0], fov: 42 },
  }
  function box(id: string, name: string, position: Vector3Tuple, size: Vector3Tuple, color: string): ScenePrimitiveV1 {
    const primitive: ScenePrimitiveV1 = {
      nodeId: id,
      name,
      type: 'box',
      transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
      properties: { color, width: size[0], height: size[1], depth: size[2] },
    }
    scene.primitives.push(primitive)
    return primitive
  }
  function model(
    key: DemoAssetKey,
    id: string,
    name: string,
    position: Vector3Tuple,
    scale: number,
    rotationY = 0,
  ): TwinBindingTarget {
    const instance: SceneAssetInstanceV1 = {
      assetId: assets[key],
      instanceId: `instance_${id}`,
      name,
      nodeOverrides: [],
      transform: { position, rotation: [0, rotationY, 0], scale: [scale, scale, scale] },
    }
    scene.instances.push(instance)
    return { type: 'asset-instance', instanceId: instance.instanceId }
  }
  function label(target: TwinBindingTarget, text: string, color = '#b9f6ef'): void {
    const effect = createEffect('floating-label', target)
    effect.parameters = { ...effect.parameters, text, color, padding: 0.55, opacity: 1 }
    scene.effects!.push(effect)
  }

  // Ground, roads and zone pads stay primitives; everything recognisable is a model.
  const floor = box('park-ground', '园区地面', [0, 0, 0], [30, 0.1, 24], '#334d53')
  floor.type = 'plane'
  floor.properties.height = 24
  box('road-main', '中央主干道', [0, 0.02, 0], [3, 0.08, 24], '#1e2b38')
  box('road-cross', '园区环通道路', [0, 0.03, 1], [30, 0.08, 2.2], '#1e2b38')
  for (let i = 0; i < 8; i++) box(`road-line-${i}`, '道路引导线', [0, 0.12, -10 + i * 3], [0.08, 0.02, 1.2], '#cfddc9')
  const storagePad = box('storage-pad', '储能区基座', [-7, 0.1, 6.4], [11, 0.18, 8], '#567378')
  const solarPad = box('solar-pad', '光伏区基座', [7.5, 0.1, 6.4], [10, 0.18, 8], '#42655b')
  label({ type: 'primitive', nodeId: storagePad.nodeId }, '储能区', '#9fe0d3')
  label({ type: 'primitive', nodeId: solarPad.nodeId }, '光伏发电区', '#88c4ff')

  // Energy storage: 8 containerised battery units, each bound to a device (the model carries a 0.27 node scale).
  const templates = getBuiltinTemplates()
  for (let i = 0; i < 8; i++) {
    const id = `ess-${i + 1}`,
      number = String(i + 1).padStart(2, '0'),
      deviceId = `ESS-0${number}`
    // Focus frames an object from its local +Z ("front"): turn the back row to face the road so
    // focusing it never places the camera inside the container in front.
    const backRow = i < 4
    const target = model(
      'container',
      id,
      `储能柜 ${number}`,
      [-11.2 + (i % 4) * 2.5, 0.28, backRow ? 4.25 : 8.55],
      4.4,
      backRow ? Math.PI : 0,
    )
    label(target, deviceId)
    const bindingId = `binding-${id}`
    scene.bindings!.push({
      id: bindingId,
      target,
      device: { id: deviceId, name: `储能柜 ${number}`, type: 'energy-storage-cabinet' },
      variables: [
        { id: `${id}-soc`, key: 'soc', name: 'SOC', dataType: 'number', unit: '%' },
        { id: `${id}-temperature`, key: 'temperature', name: '温度', dataType: 'number', unit: '℃' },
        { id: `${id}-power`, key: 'power', name: '功率', dataType: 'number', unit: 'kW' },
        { id: `${id}-alarm`, key: 'alarm', name: '告警', dataType: 'boolean' },
        { id: `${id}-status`, key: 'status', name: '状态', dataType: 'string' },
      ],
    })
    scene.visualRules!.push(
      {
        id: `${id}-hot`,
        bindingId,
        target,
        variableKey: 'temperature',
        condition: { dataType: 'number', operator: '>', value: 60 },
        enabled: true,
        priority: 10,
        template: cloneTemplate(templates[1]!),
      },
      {
        id: `${id}-alarm`,
        bindingId,
        target,
        variableKey: 'alarm',
        condition: { dataType: 'boolean', operator: '==', value: true },
        enabled: true,
        priority: 20,
        template: cloneTemplate(templates[0]!),
      },
    )
    const actions: [SceneInteraction['trigger'], SceneInteraction['action']][] = [
      ['click', { type: 'select' }],
      ['double-click', { type: 'focus' }],
      ['hover-enter', { type: 'highlight' }],
      [
        'click',
        { type: 'emit-event', eventName: 'open-device-detail', metadata: { zone: '储能区', demo: 'zero-carbon-park' } },
      ],
    ]
    actions.forEach(([trigger, action], index) =>
      scene.interactions!.push({ id: `${id}-interaction-${index}`, enabled: true, source: target, trigger, action }),
    )
  }

  // Solar field and wind turbines.
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++) {
      model('solar', `pv-${row}-${col}`, '光伏阵列', [4.3 + col * 2.2, 0.28, 3.7 + row * 2.7], 2)
    }
  // Rotor sits on the model's local -X side; 2.2 rad turns it towards the default camera.
  for (let i = 0; i < 3; i++)
    model(
      'turbine',
      `wind-${i + 1}`,
      `风力发电机 ${String(i + 1).padStart(2, '0')}`,
      [13.8, 0, 3.4 + i * 3.4],
      2.6,
      2.2,
    )

  // Buildings: energy centre with rooftop PV, green office tower, supporting plant.
  label(model('energyCenter', 'energy-center', '综合能源站', [-8, 0, -5.5], 4), '综合能源站')
  model('tank', 'thermal-tank', '储热罐', [-13, 0, -2.6], 1.6)
  label(model('office', 'office', '绿色办公楼', [5.5, 0, -6], 2.2), '绿色办公楼')
  model('factory', 'factory', '低碳制造车间', [11.2, 0, -8], 3)
  model('warehouse', 'warehouse', '智慧仓储中心', [11.5, 0, -3.8], 3)

  for (let i = 0; i < 6; i++) {
    const tree = box(`tree-${i}`, '园区绿化', [-13.7, 0.1, -10.5 + i * 1.3], [1, 1.3, 1], '#39846f')
    tree.type = 'cylinder'
    tree.properties = { color: '#39846f', height: 1.3, radiusTop: 0.6, radiusBottom: 0.6, radialSegments: 12 }
  }
  if (!isSceneDocumentV1(scene)) throw new Error('园区示例配置校验失败')
  return scene
}

/** Uses the editor's built-in models; identical files de-duplicate to the same library asset. */
async function importDemoAssets(repository: AssetRepository): Promise<Record<DemoAssetKey, string>> {
  const records = await Promise.all(
    builtinModels.map(async model => [model.key, (await importBuiltinModel(model, repository)).id] as const),
  )
  return Object.fromEntries(records) as Record<DemoAssetKey, string>
}

const flowNode = (name: string, color: string, points: Vector3Tuple[], speed = 1.6): SceneNodeV2 => {
  const [ox, oy, oz] = points[0]!
  return {
    id: newId('node'),
    kind: 'path',
    parentId: null,
    name,
    transform: { position: [ox, oy, oz], rotation: [0, 0, 0], scale: [1, 1, 1] },
    visible: true,
    locked: false,
    path: {
      points: points.map(([x, y, z]) => [x - ox, y - oy, z - oz]),
      closed: false,
      style: 'flow',
      color,
      width: 0.28,
      speed,
      opacity: 0.95,
    },
  }
}

/**
 * The v2 showcase on top of the base park: zones as groups (usable as layers), energy-flow lines between
 * generation, storage and consumption, a glowing park boundary, live data panels, saved views and an
 * auto-playing guided tour for unattended screens.
 */
export function enhanceZeroCarbonPark(base: SceneDocumentV2): SceneDocumentV2 {
  const doc = structuredClone(base)
  doc.settings = {
    ...doc.settings,
    helpers: { grid: false, axes: false },
    ground: { enabled: false, size: 40, color: '#2b3a40' },
    sky: { ...doc.settings.sky, mode: 'physical', hdrAssetId: null },
    time: { hour: 15.5, azimuth: 35 },
    lighting: { ambientIntensity: 0.9, sunIntensity: 2.8, shadows: true },
    fog: { enabled: true, density: 0.3 },
    post: {
      exposure: 1,
      bloom: { enabled: true, intensity: 0.8, threshold: 0.95 },
      vignette: true,
      contrast: 0.06,
      saturation: 0.08,
    },
  }

  // Energy flows: generation → energy centre → storage and consumers.
  const flows = [
    flowNode('光伏 → 能源站', '#38d6ff', [
      [4.2, 0.35, 2.6],
      [1.9, 0.35, 2.6],
      [1.9, 0.35, -1.2],
      [-1.9, 0.35, -1.2],
      [-1.9, 0.35, -3.6],
      [-5.6, 0.35, -3.6],
    ]),
    flowNode(
      '风电 → 能源站',
      '#52e3a4',
      [
        [12.4, 0.35, 2.4],
        [12.4, 0.35, -0.6],
        [2.3, 0.35, -0.6],
        [2.3, 0.35, -1.7],
        [-1.4, 0.35, -1.7],
        [-1.4, 0.35, -4.2],
        [-5.6, 0.35, -4.2],
      ],
      1.3,
    ),
    flowNode(
      '能源站 → 储能',
      '#ffb347',
      [
        [-7.2, 0.35, -2.6],
        [-7.2, 0.35, 2.3],
      ],
      1.1,
    ),
    flowNode(
      '能源站 → 办公楼',
      '#7fb6ff',
      [
        [-4.6, 0.35, -7.4],
        [3.4, 0.35, -7.4],
      ],
      1.4,
    ),
    flowNode(
      '能源站 → 制造与仓储',
      '#7fb6ff',
      [
        [3.4, 0.35, -7.9],
        [8.6, 0.35, -7.9],
        [8.6, 0.35, -4.4],
        [9.4, 0.35, -4.4],
      ],
      1.4,
    ),
  ]
  doc.nodes.push(...flows)

  const boundary: SceneNodeV2 = {
    id: newId('node'),
    kind: 'area',
    parentId: null,
    name: '园区边界',
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    visible: true,
    locked: true,
    area: {
      points: [
        [-15.4, 0, -12.4],
        [15.4, 0, -12.4],
        [15.4, 0, 12.4],
        [-15.4, 0, 12.4],
      ],
      color: '#3ad1c6',
      opacity: 0.18,
      wallHeight: 1.4,
      label: '',
    },
  }
  doc.nodes.push(boundary)

  // Devices beyond the storage cabinets: turbines, the PV field, the energy centre meter, the office.
  const template = (id: string) => deviceTemplates.find(item => item.id === id)!
  const bind = (
    nodeId: string,
    templateId: string,
    deviceId: string,
    name: string,
    target: SceneNodeV2['kind'] = 'model',
  ) => {
    const binding = {
      id: newId('binding'),
      target:
        target === 'model'
          ? { type: 'asset-instance' as const, instanceId: nodeId }
          : { type: 'primitive' as const, nodeId },
      device: { id: deviceId, name, type: template(templateId).type },
      variables: deviceVariables(template(templateId)),
    }
    doc.bindings.push(binding)
    return binding.target
  }
  for (let i = 1; i <= 3; i++) {
    bind(`instance_wind-${i}`, 'wind', `WT-00${i}`, `风机 0${i}`)
    // Blades spin at the live rotor speed (rpm × 6 = degrees per second), 60°/s without data.
    const turbine = doc.nodes.find(node => node.id === `instance_wind-${i}`)
    if (turbine?.kind === 'model') {
      turbine.model.motions = [
        {
          id: `blades-${i}`,
          assetNodeId: 'legacy:root/0/0',
          axis: 'x',
          speed: 60,
          speedVariable: 'rotorSpeed',
          factor: 6,
        },
      ]
    }
  }
  const pvTarget = bind('solar-pad', 'pv', 'PV-001', '光伏发电区', 'primitive')
  const meterTarget = bind('instance_energy-center', 'meter', 'EM-001', '综合能源站')
  const officeTarget = bind('instance_office', 'building', 'BLD-001', '绿色办公楼')
  const dataLabel = (target: (typeof doc.bindings)[number]['target'], variables: string[], color: string) => {
    const effect = createEffect('data-label', target)
    effect.parameters = { ...effect.parameters, color, variables, padding: 0.4, scale: 0.9 }
    doc.effects.push(effect)
  }
  dataLabel(pvTarget, ['power', 'energyToday'], '#7ee0ff')
  dataLabel(meterTarget, ['power', 'carbon'], '#ffd08a')
  dataLabel(officeTarget, ['power', 'occupancy'], '#a8c8ff')
  const radar = createEffect('radar', meterTarget)
  radar.parameters = { ...radar.parameters, color: '#42e6a4', opacity: 0.45, padding: 3, speed: 0.6 }
  doc.effects.push(radar)
  // The floating "光伏发电区" label is replaced by the live panel above, and the eight cabinet id tags give
  // way to the zone label (alarm rules still tag a cabinet when it fires).
  doc.effects = doc.effects.filter(
    effect =>
      !(
        effect.kind === 'floating-label' &&
        effect.target.type === 'primitive' &&
        effect.target.nodeId === 'solar-pad'
      ) &&
      !(
        effect.kind === 'floating-label' &&
        effect.target.type === 'asset-instance' &&
        (effect.target.instanceId.startsWith('instance_ess-') ||
          effect.target.instanceId === 'instance_energy-center' ||
          effect.target.instanceId === 'instance_office')
      ),
  )

  // Zones as groups: they double as layers for tours and the dashboard (setNodeVisible).
  const byPrefix = (prefix: string) => doc.nodes.filter(node => node.id.startsWith(prefix)).map(node => node.id)
  const zones: Array<[string, string[]]> = [
    ['储能区', ['storage-pad', ...byPrefix('instance_ess-')]],
    ['光伏区', ['solar-pad', ...byPrefix('instance_pv-')]],
    ['风电区', byPrefix('instance_wind-')],
    [
      '建筑',
      ['instance_energy-center', 'instance_thermal-tank', 'instance_office', 'instance_factory', 'instance_warehouse'],
    ],
    ['能流', flows.map(flow => flow.id)],
    ['道路与绿化', ['park-ground', 'road-main', 'road-cross', ...byPrefix('road-line-'), ...byPrefix('tree-')]],
  ]
  const groupIds: Record<string, string> = {}
  for (const [name, ids] of zones) {
    const existing = ids.filter(id => doc.nodes.some(node => node.id === id))
    const id = existing.length ? groupNodes(doc, existing, name) : null
    if (id) groupIds[name] = id
  }
  const roads = doc.nodes.find(node => node.id === groupIds['道路与绿化'])
  if (roads) roads.locked = true

  // Views and the guided tour.
  const view = (position: Vector3Tuple, target: Vector3Tuple) => ({ position, target, fov: 42, aspect: 16 / 9 })
  const bookmarks = [
    { id: newId('view'), name: '园区全景', view: view([19, 21, 26], [0.5, 0, 0.5]) },
    { id: newId('view'), name: '光伏与风电', view: view([19, 9, 15], [9, 0.5, 6]) },
    { id: newId('view'), name: '储能区', view: view([-3, 7.5, 16], [-7.5, 0.5, 6.4]) },
    { id: newId('view'), name: '综合能源站', view: view([-1, 7.5, 2.5], [-8, 1.5, -5.5]) },
    { id: newId('view'), name: '办公与制造', view: view([2, 8.5, 4.5], [8.5, 1.5, -6]) },
  ]
  doc.bookmarks = bookmarks
  doc.cameraView = bookmarks[0]!.view
  const step = (index: number, caption: string, hold = 5, highlight: string | null = null) => ({
    id: newId('step'),
    bookmarkId: bookmarks[index]!.id,
    nodeId: null,
    duration: index === 0 ? 2 : 2.6,
    hold,
    caption,
    show: [],
    hide: [],
    highlightNodeId: highlight,
  })
  const tour = {
    id: newId('tour'),
    name: '零碳园区导览',
    loop: true,
    steps: [
      step(0, '零碳智慧园区：光伏、风电、储能与综合能源站协同运行，实现园区能源自给与碳排放实时监测', 6),
      step(1, '光伏与风电：清洁能源实时发电，能流线展示电能流向', 5, groupIds['光伏区'] ?? null),
      step(2, '储能区：8 台储能柜削峰填谷，温度与 SOC 实时监测，异常自动告警', 6, groupIds['储能区'] ?? null),
      step(3, '综合能源站：统一调度源、网、荷、储，实时核算园区碳排放', 5, 'instance_energy-center'),
      step(4, '绿色办公与低碳制造：按需供能，用能数据全程可追溯', 5),
    ],
  }
  doc.tours = [tour]
  doc.presentation = { autoplayTourId: tour.id, idleSeconds: 45, autoRotate: false }
  doc.metadata = { ...doc.metadata, name: '零碳智慧园区 Demo' }
  return doc
}

/** Always creates a fresh copy; never overwrites a colleague's edited demo. */
export async function createZeroCarbonPark(publish: (project: Project) => void): Promise<Project> {
  const id = `zero-carbon-${crypto.randomUUID()}`
  const scene = enhanceZeroCarbonPark(
    migrateSceneV1ToV2(buildZeroCarbonPark(id, await importDemoAssets(new IndexedDbAssetRepository()))),
  )
  const project: Project = {
    id,
    name: scene.metadata.name!,
    createdAt: scene.metadata.updatedAt,
    updatedAt: scene.metadata.updatedAt,
    cover: 'linear-gradient(135deg, #123d42 0%, #278d84 55%, #91dbc0 100%)',
  }
  const repository = new LocalSceneRepository()
  await repository.save(scene)
  try {
    publish(project)
  } catch (error) {
    await repository.remove(id)
    throw error
  }
  return project
}
