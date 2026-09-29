import {
  type AssetRepository,
  cloneTemplate,
  createEffect,
  defaultDataSources,
  getBuiltinTemplates,
  isSceneDocumentV1,
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

type DemoAssetKey = BuiltinModelKey

/** Ordinary saved scene configuration: no demo runtime or special data source; models are regular assets. */
export function buildZeroCarbonPark(projectId: string, assets: Record<DemoAssetKey, string>): SceneDocumentV1 {
  const scene: SceneDocumentV1 = {
    dataSources: defaultDataSources(),
    version: 1, projectId, metadata: { name: '零碳智慧园区 Demo', updatedAt: new Date().toISOString() },
    instances: [], primitives: [], bindings: [], effects: [], visualRules: [], interactions: [],
    sceneSettings: { gridEnabled: false, axesEnabled: false, ground: { enabled: false, size: 40, color: '#273e48' },
      lighting: { ambientIntensity: 1.8, directionalIntensity: 2.5, directionalPosition: [12, 25, 18] }, environmentAssetId: null },
    cameraView: { position: [27, 30, 36], target: [0, 0, 0], fov: 42 },
  }
  function box(id: string, name: string, position: Vector3Tuple, size: Vector3Tuple, color: string): ScenePrimitiveV1 {
    const primitive: ScenePrimitiveV1 = { nodeId: id, name, type: 'box', transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
      properties: { color, width: size[0], height: size[1], depth: size[2] } }
    scene.primitives.push(primitive)
    return primitive
  }
  function model(key: DemoAssetKey, id: string, name: string, position: Vector3Tuple, scale: number, rotationY = 0): TwinBindingTarget {
    const instance: SceneAssetInstanceV1 = {
      assetId: assets[key], instanceId: `instance_${id}`, name, nodeOverrides: [],
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
  floor.type = 'plane'; floor.properties.height = 24
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
    const id = `ess-${i + 1}`, number = String(i + 1).padStart(2, '0'), deviceId = `ESS-0${number}`
    // Focus frames an object from its local +Z ("front"): turn the back row to face the road so
    // focusing it never places the camera inside the container in front.
    const backRow = i < 4
    const target = model('container', id, `储能柜 ${number}`, [-11.2 + (i % 4) * 2.5, 0.28, backRow ? 4.25 : 8.55], 4.4, backRow ? Math.PI : 0)
    label(target, deviceId)
    const bindingId = `binding-${id}`
    scene.bindings!.push({ id: bindingId, target, device: { id: deviceId, name: `储能柜 ${number}`, type: 'energy-storage-cabinet' },
      variables: [
        { id: `${id}-soc`, key: 'soc', name: 'SOC', dataType: 'number', unit: '%' },
        { id: `${id}-temperature`, key: 'temperature', name: '温度', dataType: 'number', unit: '℃' },
        { id: `${id}-power`, key: 'power', name: '功率', dataType: 'number', unit: 'kW' },
        { id: `${id}-alarm`, key: 'alarm', name: '告警', dataType: 'boolean' },
        { id: `${id}-status`, key: 'status', name: '状态', dataType: 'string' },
      ] })
    scene.visualRules!.push(
      { id: `${id}-hot`, bindingId, target, variableKey: 'temperature', condition: { dataType: 'number', operator: '>', value: 60 }, enabled: true, priority: 10, template: cloneTemplate(templates[1]!) },
      { id: `${id}-alarm`, bindingId, target, variableKey: 'alarm', condition: { dataType: 'boolean', operator: '==', value: true }, enabled: true, priority: 20, template: cloneTemplate(templates[0]!) },
    )
    const actions: [SceneInteraction['trigger'], SceneInteraction['action']][] = [
      ['click', { type: 'select' }], ['double-click', { type: 'focus' }], ['hover-enter', { type: 'highlight' }],
      ['click', { type: 'emit-event', eventName: 'open-device-detail', metadata: { zone: '储能区', demo: 'zero-carbon-park' } }],
    ]
    actions.forEach(([trigger, action], index) => scene.interactions!.push({ id: `${id}-interaction-${index}`, enabled: true, source: target, trigger, action }))
  }

  // Solar field and wind turbines.
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
    model('solar', `pv-${row}-${col}`, '光伏阵列', [4.3 + col * 2.2, 0.28, 3.7 + row * 2.7], 2)
  }
  // Rotor sits on the model's local -X side; 2.2 rad turns it towards the default camera.
  for (let i = 0; i < 3; i++) model('turbine', `wind-${i + 1}`, `风力发电机 ${String(i + 1).padStart(2, '0')}`, [13.8, 0, 3.4 + i * 3.4], 2.6, 2.2)

  // Buildings: energy centre with rooftop PV, green office tower, supporting plant.
  label(model('energyCenter', 'energy-center', '综合能源站', [-8, 0, -5.5], 4), '综合能源站')
  model('tank', 'thermal-tank', '储热罐', [-13, 0, -2.6], 1.6)
  label(model('office', 'office', '绿色办公楼', [5.5, 0, -6], 2.2), '绿色办公楼')
  model('factory', 'factory', '低碳制造车间', [11.2, 0, -8], 3)
  model('warehouse', 'warehouse', '智慧仓储中心', [11.5, 0, -3.8], 3)

  for (let i = 0; i < 6; i++) {
    const tree = box(`tree-${i}`, '园区绿化', [-13.7, 0.1, -10.5 + i * 1.3], [1, 1.3, 1], '#39846f')
    tree.type = 'cylinder'; tree.properties = { color: '#39846f', height: 1.3, radiusTop: 0.6, radiusBottom: 0.6, radialSegments: 12 }
  }
  if (!isSceneDocumentV1(scene)) throw new Error('园区示例配置校验失败')
  return scene
}

/** Uses the editor's built-in models; identical files de-duplicate to the same library asset. */
async function importDemoAssets(repository: AssetRepository): Promise<Record<DemoAssetKey, string>> {
  const records = await Promise.all(builtinModels.map(async model => [model.key, (await importBuiltinModel(model, repository)).id] as const))
  return Object.fromEntries(records) as Record<DemoAssetKey, string>
}

/** Always creates a fresh copy; never overwrites a colleague's edited demo. */
export async function createZeroCarbonPark(publish: (project: Project) => void): Promise<Project> {
  const id = `zero-carbon-${crypto.randomUUID()}`
  const scene = buildZeroCarbonPark(id, await importDemoAssets(new IndexedDbAssetRepository()))
  const project: Project = { id, name: scene.metadata.name!, createdAt: scene.metadata.updatedAt, updatedAt: scene.metadata.updatedAt,
    cover: 'linear-gradient(135deg, #123d42 0%, #278d84 55%, #91dbc0 100%)' }
  const repository = new LocalSceneRepository()
  await repository.save(scene)
  try { publish(project) } catch (error) { await repository.remove(id); throw error }
  return project
}
