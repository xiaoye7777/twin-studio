import type { SceneDocumentV1, SceneTransformV1 } from './sceneTypes'

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

export function isSceneDocumentV1(value: unknown): value is SceneDocumentV1 {
  if (!isRecord(value) || value.version !== 1 || typeof value.projectId !== 'string') {
    return false
  }
  if (!isRecord(value.metadata) || typeof value.metadata.updatedAt !== 'string') return false
  if (!Array.isArray(value.instances) || !Array.isArray(value.primitives)) return false

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
      primitive.type === 'box' &&
      typeof primitive.nodeId === 'string' &&
      typeof primitive.name === 'string' &&
      isTransform(primitive.transform) &&
      isRecord(primitive.properties) &&
      typeof primitive.properties.color === 'string',
  )

  return validInstances && validPrimitives
}
