export type Vector3Tuple = [number, number, number]

export interface SceneTransformV1 {
  position: Vector3Tuple
  rotation: Vector3Tuple
  scale: Vector3Tuple
}
export interface SceneNodeOverrideV1 {
  assetNodeId: string
  name: string
  transform: SceneTransformV1
  runtimeBid?: string
  visible?: boolean
}

export interface SceneAssetInstanceV1 {
  assetId: string
  instanceId: string
  name: string
  transform: SceneTransformV1
  nodeOverrides: SceneNodeOverrideV1[]
  runtimeBid?: string
  visible?: boolean
  deletedAssetNodeIds?: string[]
}

export interface SceneBoxPropertiesV1 {
  color: string
  width?: number
  height?: number
  depth?: number
  radiusTop?: number
  radiusBottom?: number
  radialSegments?: number
}

export interface ScenePrimitiveV1 {
  nodeId: string
  type: 'box' | 'plane' | 'cylinder'
  name: string
  transform: SceneTransformV1
  properties: SceneBoxPropertiesV1
  runtimeBid?: string
  visible?: boolean
}

export interface SceneDocumentV1 {
  version: 1
  projectId: string
  metadata: {
    name?: string
    updatedAt: string
  }
  instances: SceneAssetInstanceV1[]
  primitives: ScenePrimitiveV1[]
}
