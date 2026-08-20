import { Color, Mesh } from 'three'
import type { Object3D } from 'three'
import { findAssetInstanceRoot, getEditorMetadata } from '@/editor/editorMetadata'
import type {
  SceneAssetInstanceV1,
  SceneDocumentV1,
  SceneNodeOverrideV1,
  ScenePrimitiveV1,
  SceneTransformV1,
} from './sceneTypes'

function runtimeBid(object: Object3D): string | undefined {
  return typeof object.userData.bid === 'string' ? object.userData.bid : undefined
}
export function serializeTransform(object: Object3D): SceneTransformV1 {
  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: [object.scale.x, object.scale.y, object.scale.z],
  }
}

export function applySceneTransform(object: Object3D, transform: SceneTransformV1): void {
  object.position.fromArray(transform.position)
  object.rotation.fromArray([...transform.rotation, object.rotation.order])
  object.scale.fromArray(transform.scale)
  object.updateMatrix()
  object.updateMatrixWorld(true)
}

function serializePrimitive(root: Object3D): ScenePrimitiveV1 | null {
  const metadata = getEditorMetadata(root)
  if (metadata?.kind !== 'primitive' || metadata.primitiveType !== 'box') return null

  const color = root instanceof Mesh && root.material && !Array.isArray(root.material)
    && 'color' in root.material && root.material.color instanceof Color
    ? `#${root.material.color.getHexString()}`
    : '#3b82f6'

  return {
    nodeId: metadata.nodeId,
    type: 'box',
    name: root.name,
    transform: serializeTransform(root),
    properties: { color },
    runtimeBid: runtimeBid(root),
    visible: root.visible,
  }
}

export function serializeSceneDocument(options: {
  projectId: string
  projectName?: string
  roots: readonly Object3D[]
  modifiedObjects: readonly Object3D[]
}): SceneDocumentV1 {
  const overridesByRoot = new Map<Object3D, SceneNodeOverrideV1[]>()

  for (const object of options.modifiedObjects) {
    const root = findAssetInstanceRoot(object)
    const assetNodeId = object.userData.assetNodeId
    if (!root || object === root || typeof assetNodeId !== 'string') continue

    const overrides = overridesByRoot.get(root) ?? []
    overrides.push({
      assetNodeId,
      name: object.name,
      transform: serializeTransform(object),
      runtimeBid: runtimeBid(object),
      visible: object.visible,
    })
    overridesByRoot.set(root, overrides)
  }

  const instances: SceneAssetInstanceV1[] = []
  const primitives: ScenePrimitiveV1[] = []

  for (const root of options.roots) {
    const metadata = getEditorMetadata(root)
    if (metadata?.kind === 'assetInstance') {
      instances.push({
        assetId: metadata.assetId,
        instanceId: metadata.instanceId,
        name: root.name,
        transform: serializeTransform(root),
        nodeOverrides: overridesByRoot.get(root) ?? [],
        runtimeBid: runtimeBid(root),
        visible: root.visible,
        deletedAssetNodeIds: metadata.deletedAssetNodeIds,
      })
      continue
    }
    const primitive = serializePrimitive(root)
    if (primitive) primitives.push(primitive)
  }

  return {
    version: 1,
    projectId: options.projectId,
    metadata: {
      name: options.projectName,
      updatedAt: new Date().toISOString(),
    },
    instances,
    primitives,
  }
}
