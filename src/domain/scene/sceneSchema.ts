import type { SceneDocumentV1, SceneTransformV1 } from './sceneTypes'
import { isTwinBinding } from '@/domain/twin'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isNumberTuple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  )
}

function isTransform(value: unknown): value is SceneTransformV1 {
  return (
    isRecord(value) &&
    isNumberTuple(value.position) &&
    isNumberTuple(value.rotation) &&
    isNumberTuple(value.scale)
  )
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isSceneSettings(value: unknown): boolean {
  if (!isRecord(value) || typeof value.gridEnabled !== 'boolean' || typeof value.axesEnabled !== 'boolean') return false
  const ground = value.ground
  const lighting = value.lighting
  return (
    isRecord(ground) &&
    typeof ground.enabled === 'boolean' &&
    isPositiveFinite(ground.size) &&
    typeof ground.color === 'string' &&
    isRecord(lighting) &&
    typeof lighting.ambientIntensity === 'number' && Number.isFinite(lighting.ambientIntensity) && lighting.ambientIntensity >= 0 &&
    typeof lighting.directionalIntensity === 'number' && Number.isFinite(lighting.directionalIntensity) && lighting.directionalIntensity >= 0 &&
    isNumberTuple(lighting.directionalPosition) &&
    (value.environmentAssetId === null || typeof value.environmentAssetId === 'string')
  )
}

function isCameraView(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumberTuple(value.position) &&
    isNumberTuple(value.target) &&
    (value.fov === undefined || isPositiveFinite(value.fov))
  )
}

export function isSceneDocumentV1(value: unknown): value is SceneDocumentV1 {
  if (!isRecord(value) || value.version !== 1 || typeof value.projectId !== 'string') {
    return false
  }
  if (!isRecord(value.metadata) || typeof value.metadata.updatedAt !== 'string') return false
  if (!Array.isArray(value.instances) || !Array.isArray(value.primitives)) return false
  if (value.sceneSettings !== undefined && !isSceneSettings(value.sceneSettings)) return false
  if (value.cameraView !== undefined && !isCameraView(value.cameraView)) return false
  if (value.bindings !== undefined && (!Array.isArray(value.bindings) || !value.bindings.every(isTwinBinding))) return false

  const validInstances = value.instances.every((instance) => {
    if (
      !isRecord(instance) ||
      typeof instance.assetId !== 'string' ||
      typeof instance.instanceId !== 'string' ||
      typeof instance.name !== 'string' ||
      !isTransform(instance.transform) ||
      !Array.isArray(instance.nodeOverrides)
    ) {
      return false
    }
    if (instance.deletedAssetNodeIds !== undefined && (!Array.isArray(instance.deletedAssetNodeIds) || !instance.deletedAssetNodeIds.every((id) => typeof id === 'string'))) return false
    return instance.nodeOverrides.every(
      (override) =>
        isRecord(override) &&
        typeof override.assetNodeId === 'string' &&
        typeof override.name === 'string' &&
        isTransform(override.transform),
    )
  })

  const validPrimitives = value.primitives.every(
    (primitive) =>
      isRecord(primitive) &&
      (primitive.type === 'box' || primitive.type === 'plane' || primitive.type === 'cylinder') &&
      typeof primitive.nodeId === 'string' &&
      typeof primitive.name === 'string' &&
      isTransform(primitive.transform) &&
      isRecord(primitive.properties) &&
      typeof primitive.properties.color === 'string',
  )

  return validInstances && validPrimitives
}
