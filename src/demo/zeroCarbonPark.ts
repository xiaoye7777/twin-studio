import { isSceneDocumentV1, type SceneDocumentV1, type ScenePrimitiveV1, type Vector3Tuple } from '@/domain/scene'
import { createEffect } from '@/domain/effects'
import { getBuiltinTemplates } from '@/domain/effectTemplates/builtins'
import { cloneTemplate } from '@/domain/effectTemplates'
import type { TwinBindingTarget } from '@/domain/twin'
import type { SceneInteraction } from '@/domain/interactions'
import { LocalSceneRepository } from '@/infrastructure/scenes'
import type { Project } from '@/stores/project'

/** Ordinary saved scene configuration: no demo runtime, assets, or special data source. */
export function buildZeroCarbonPark(projectId: string): SceneDocumentV1 {
  const scene: SceneDocumentV1 = {
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
  function label(nodeId: string, text: string, color = '#b9f6ef'): void {
    const effect = createEffect('floating-label', { type: 'primitive', nodeId })
    effect.parameters = { ...effect.parameters, text, color, padding: 0.55, opacity: 1 }
    scene.effects!.push(effect)
  }
  const floor = box('park-ground', '园区地面', [0, 0, 0], [30, 0.1, 24], '#334d53')
  floor.type = 'plane'; floor.properties.height = 24
  box('road-main', '中央主干道', [0, 0.02, 0], [3, 0.08, 24], '#1e2b38')
  box('road-cross', '园区环通道路', [0, 0.03, 1], [30, 0.08, 2.2], '#1e2b38')
  for (let i = 0; i < 8; i++) box(`road-line-${i}`, '道路引导线', [0, 0.12, -10 + i * 3], [0.08, 0.02, 1.2], '#cfddc9')
  box('storage-pad', '储能区基座', [-7, 0.1, 6.4], [11, 0.18, 8], '#567378')
  box('solar-pad', '光伏区基座', [7.5, 0.1, 6.4], [10, 0.18, 8], '#42655b')
  for (let i = 0; i < 8; i++) {
    const id = `ess-${i + 1}`, deviceId = `ESS-${String(i + 1).padStart(3, '0')}`
    box(id, `储能柜 ${String(i + 1).padStart(2, '0')}`, [-10.7 + (i % 4) * 2.5, 0.28, 4.4 + Math.floor(i / 4) * 3.7], [1.35, 2.1, 1.3], i % 2 ? '#76bbb2' : '#bedbd5')
    label(id, deviceId)
    const target: TwinBindingTarget = { type: 'primitive', nodeId: id }
    const bindingId = `binding-${id}`
    scene.bindings!.push({ id: bindingId, target, device: { id: deviceId, name: `储能柜 ${String(i + 1).padStart(2, '0')}`, type: 'energy-storage-cabinet' },
      variables: [
        { id: `${id}-soc`, key: 'soc', name: 'SOC', dataType: 'number', unit: '%' },
        { id: `${id}-temperature`, key: 'temperature', name: '温度', dataType: 'number', unit: '℃' },
        { id: `${id}-power`, key: 'power', name: '功率', dataType: 'number', unit: 'kW' },
        { id: `${id}-alarm`, key: 'alarm', name: '告警', dataType: 'boolean' },
        { id: `${id}-status`, key: 'status', name: '状态', dataType: 'string' },
      ] })
    const templates = getBuiltinTemplates()
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
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
    const panel = box(`pv-${row}-${col}`, '光伏发电板', [4.2 + col * 2.1, 0.65, 4 + row * 2.2], [1.8, 0.12, 1.5], '#244f86')
    panel.transform.rotation[0] = -0.22
  }
  box('energy-station', '综合能源站', [-8, 0.1, -5.3], [7, 2.8, 5], '#819fa7')
  box('energy-roof', '能源站屋顶', [-8, 2.9, -5.3], [7.3, 0.25, 5.3], '#40616a')
  label('energy-roof', '综合能源站')
  box('office', '绿色办公楼', [7.5, 0.1, -5.5], [6, 5, 5], '#a5bcc7')
  box('office-roof', '办公楼屋顶', [7.5, 5.1, -5.5], [6.3, 0.25, 5.3], '#526a7c')
  label('office-roof', '绿色办公楼')
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) box(`window-${row}-${col}`, '办公楼节能幕墙', [5.25 + col * 1.5, 1 + row * 1.25, -2.98], [1, 0.8, 0.08], '#34647b')
  label('solar-pad', '光伏发电区', '#88c4ff')
  for (let i = 0; i < 6; i++) {
    const tree = box(`tree-${i}`, '园区绿化', [-13.7, 0.1, -9 + i * 1.5], [1, 1.3, 1], '#39846f')
    tree.type = 'cylinder'; tree.properties = { color: '#39846f', height: 1.3, radiusTop: 0.65, radiusBottom: 0.65, radialSegments: 12 }
  }
  if (!isSceneDocumentV1(scene)) throw new Error('园区示例配置校验失败')
  return scene
}

/** Always creates a fresh copy; never overwrites a colleague's edited demo. */
export async function createZeroCarbonPark(publish: (project: Project) => void): Promise<Project> {
  const id = `zero-carbon-${crypto.randomUUID()}`
  const scene = buildZeroCarbonPark(id)
  const project: Project = { id, name: scene.metadata.name!, createdAt: scene.metadata.updatedAt, updatedAt: scene.metadata.updatedAt,
    cover: 'linear-gradient(135deg, #123d42 0%, #278d84 55%, #91dbc0 100%)' }
  const repository = new LocalSceneRepository()
  await repository.save(scene)
  try { publish(project) } catch (error) { await repository.remove(id); throw error }
  return project
}
