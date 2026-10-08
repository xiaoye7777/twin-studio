import { createDefaultPresentation, SceneDocumentSchemaV2 } from './sceneSchemaV2'
import { createDefaultSceneSettings } from './sceneSettings'
import { sceneSettingsFromV1 } from './sceneSettingsV2'
import type { SceneDocumentV1, SceneDocumentV2, SceneNodeV2 } from './sceneTypes'

/**
 * v1 → v2, lossless: primitives then instances become one node list (the order v1 restored them in), node
 * ids reuse instanceId / nodeId so every binding, effect, rule and interaction target stays valid, and
 * model node overrides become a map keyed by assetNodeId. Absent v1 collections become empty arrays and an
 * absent sceneSettings the defaults the v1 loader applied; dataSources stays absent (meaning unconfigured).
 * The v1 light direction becomes a time of day (see sceneSettingsFromV1); v2-only collections start empty.
 */
export function migrateSceneV1ToV2(v1: SceneDocumentV1): SceneDocumentV2 {
  const nodes: SceneNodeV2[] = [
    ...v1.primitives.map((primitive): SceneNodeV2 => ({
      id: primitive.nodeId,
      kind: 'primitive',
      parentId: null,
      name: primitive.name,
      transform: primitive.transform,
      visible: primitive.visible ?? true,
      locked: false,
      ...(primitive.runtimeBid === undefined ? {} : { runtimeBid: primitive.runtimeBid }),
      primitive: { shape: primitive.type, ...primitive.properties },
    })),
    ...v1.instances.map((instance): SceneNodeV2 => ({
      id: instance.instanceId,
      kind: 'model',
      parentId: null,
      name: instance.name,
      transform: instance.transform,
      visible: instance.visible ?? true,
      locked: false,
      ...(instance.runtimeBid === undefined ? {} : { runtimeBid: instance.runtimeBid }),
      model: {
        assetId: instance.assetId,
        overrides: Object.fromEntries(
          instance.nodeOverrides.map(({ assetNodeId, ...override }) => [assetNodeId, override]),
        ),
        deleted: instance.deletedAssetNodeIds ?? [],
      },
    })),
  ]
  const v2: SceneDocumentV2 = {
    version: 2,
    projectId: v1.projectId,
    metadata: v1.metadata,
    ...(v1.dataSources === undefined ? {} : { dataSources: v1.dataSources }),
    settings: sceneSettingsFromV1(v1.sceneSettings ?? createDefaultSceneSettings()),
    ...(v1.cameraView === undefined ? {} : { cameraView: v1.cameraView }),
    nodes,
    bindings: v1.bindings ?? [],
    effects: v1.effects ?? [],
    visualRules: v1.visualRules ?? [],
    interactions: v1.interactions ?? [],
    bookmarks: [],
    tours: [],
    presentation: createDefaultPresentation(),
  }
  // A v1 document that passed validation always yields a valid v2 one; checked here so a migration bug
  // surfaces at load time instead of as a broken scene.
  return SceneDocumentSchemaV2.parse(v2)
}
