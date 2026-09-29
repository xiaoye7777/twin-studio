import type { SceneBoxPropertiesV1, Vector3Tuple } from '@/domain/scene'
import type { PrimitiveType } from '@/stores/editor'

export interface PrimitivePreset {
  id: string
  label: string
  description: string
  category: '基础几何' | '园区构件'
  type: PrimitiveType
  properties: SceneBoxPropertiesV1
  rotation?: Vector3Tuple
}

export const primitivePresets: readonly PrimitivePreset[] = [
  { id: 'box', label: 'Box', description: '1 × 1 × 1', category: '基础几何', type: 'box', properties: { color: '#3b82f6', width: 1, height: 1, depth: 1 } },
  { id: 'plane', label: 'Plane', description: '10 × 10', category: '基础几何', type: 'plane', properties: { color: '#64748b', width: 10, height: 10 } },
  { id: 'cylinder', label: 'Cylinder', description: 'Ø1 × 1', category: '基础几何', type: 'cylinder', properties: { color: '#10b981', height: 1, radiusTop: 0.5, radiusBottom: 0.5, radialSegments: 32 } },
  { id: 'storage-cabinet', label: '储能柜', description: '设备机柜', category: '园区构件', type: 'box', properties: { color: '#7dd3fc', width: 1.2, height: 2.4, depth: 1 } },
  { id: 'distribution-room', label: '配电房', description: '设备用房', category: '园区构件', type: 'box', properties: { color: '#cbd5e1', width: 4, height: 3, depth: 3 } },
  { id: 'office-building', label: '办公楼', description: '建筑体块', category: '园区构件', type: 'box', properties: { color: '#94a3b8', width: 6, height: 5, depth: 4 } },
  { id: 'solar-panel', label: '光伏板', description: '低矮面板', category: '园区构件', type: 'box', properties: { color: '#1d4ed8', width: 2.8, height: 0.12, depth: 1.8 } },
  { id: 'equipment-base', label: '设备基座', description: '3 × 0.25 × 2', category: '园区构件', type: 'box', properties: { color: '#475569', width: 3, height: 0.25, depth: 2 } },
  { id: 'road-module', label: '道路模块', description: '8 × 3', category: '园区构件', type: 'box', properties: { color: '#263445', width: 8, height: 0.08, depth: 3 } },
  { id: 'light-pole', label: '灯杆', description: '高 4 米', category: '园区构件', type: 'cylinder', properties: { color: '#94a3b8', height: 4, radiusTop: 0.1, radiusBottom: 0.14, radialSegments: 16 } },
  { id: 'pipe-segment', label: '管道', description: '水平管段', category: '园区构件', type: 'cylinder', properties: { color: '#f59e0b', height: 4, radiusTop: 0.16, radiusBottom: 0.16, radialSegments: 20 }, rotation: [0, 0, Math.PI / 2] },
]

export function getPrimitivePreset(id: string): PrimitivePreset | null {
  return primitivePresets.find((preset) => preset.id === id) ?? null
}
