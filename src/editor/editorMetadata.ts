import type { Object3D } from 'three'

export interface AssetInstanceEditorMetadata {
  kind: 'assetInstance'
  assetRoot: true
  assetId: string
  instanceId: string
  deletedAssetNodeIds: string[]
}
export interface PrimitiveEditorMetadata {
  kind: 'primitive'
  nodeId: string
  primitiveType: 'box' | 'plane' | 'cylinder'
}

export type EditorObjectMetadata = AssetInstanceEditorMetadata | PrimitiveEditorMetadata

export function setEditorMetadata(object: Object3D, metadata: EditorObjectMetadata): void {
  object.userData.editor = metadata
}

export function getEditorMetadata(object: Object3D): EditorObjectMetadata | null {
  const value: unknown = object.userData.editor
  if (typeof value !== 'object' || value === null || !('kind' in value)) return null

  if (
    value.kind === 'assetInstance' &&
    'assetId' in value &&
    typeof value.assetId === 'string' &&
    'instanceId' in value &&
    typeof value.instanceId === 'string'
  ) {
    return value as AssetInstanceEditorMetadata
  }
  if (
    value.kind === 'primitive' &&
    'nodeId' in value &&
    typeof value.nodeId === 'string' &&
    'primitiveType' in value &&
    (value.primitiveType === 'box' || value.primitiveType === 'plane' || value.primitiveType === 'cylinder')
  ) {
    return value as PrimitiveEditorMetadata
  }
  return null
}

export function findAssetInstanceRoot(object: Object3D): Object3D | null {
  let current: Object3D | null = object
  while (current) {
    if (getEditorMetadata(current)?.kind === 'assetInstance') return current
    current = current.parent
  }
  return null
}
