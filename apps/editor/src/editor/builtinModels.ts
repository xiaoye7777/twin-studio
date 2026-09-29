import { type AssetRecord, type AssetRepository, validatePortableAsset } from '@twin-studio/core'

export type BuiltinModelKey =
  | 'container' | 'solar' | 'turbine' | 'energyCenter' | 'office' | 'factory' | 'warehouse' | 'tank'

export interface BuiltinModel {
  key: BuiltinModelKey
  /** File in public/demo-assets; also the asset name, so repeated imports de-duplicate by fingerprint. */
  file: string
  name: string
  category: '储能' | '新能源' | '建筑'
  description: string
}

/** CC0 Kenney models bundled with the editor (see public/demo-assets/CREDITS.md). */
export const builtinModels: readonly BuiltinModel[] = [
  { key: 'container', file: 'energy-storage-container.glb', name: '储能集装箱', category: '储能', description: '集装箱式储能单元' },
  { key: 'tank', file: 'thermal-storage-tank.glb', name: '储热罐', category: '储能', description: '热储能设施' },
  { key: 'solar', file: 'solar-array.glb', name: '光伏阵列', category: '新能源', description: '地面光伏组件' },
  { key: 'turbine', file: 'wind-turbine.glb', name: '风力发电机', category: '新能源', description: '含独立叶片节点' },
  { key: 'energyCenter', file: 'energy-center.glb', name: '综合能源站', category: '建筑', description: '屋顶光伏厂房' },
  { key: 'office', file: 'office-tower.glb', name: '办公楼', category: '建筑', description: '玻璃幕墙高层' },
  { key: 'factory', file: 'factory.glb', name: '制造车间', category: '建筑', description: '屋顶光伏车间' },
  { key: 'warehouse', file: 'warehouse.glb', name: '仓储中心', category: '建筑', description: '仓库 / 物流' },
]

export function getBuiltinModel(key: string): BuiltinModel | undefined {
  return builtinModels.find(model => model.key === key)
}

/** Adds a built-in model to the asset library on first use; later calls return the existing record. */
export async function importBuiltinModel(model: BuiltinModel, repository: AssetRepository): Promise<AssetRecord> {
  const response = await fetch(`${import.meta.env.BASE_URL}demo-assets/${model.file}`)
  if (!response.ok) throw new Error(`内置模型加载失败：${model.name}（HTTP ${response.status}）`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  validatePortableAsset(bytes, 'model')
  return repository.saveFile(new File([bytes], model.file, { type: 'model/gltf-binary', lastModified: 0 }), 'model')
}
