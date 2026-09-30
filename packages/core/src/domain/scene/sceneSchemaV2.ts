import { z } from 'zod'
import { ProjectDataSourcesSchema } from '../dataSources'
import { EffectInstanceSchema } from '../effects'
import { SceneInteractionSchema } from '../interactions'
import { nonEmptyString, uniqueBy } from '../schemaHelpers'
import { TwinBindingSchema } from '../twin'
import { VisualRuleSchema } from '../visualRules'
import { SceneCameraViewSchemaV1, SceneSettingsSchemaV1, SceneTransformSchemaV1 } from './sceneSchema'

/**
 * Scene format v2: one ordered node list replaces v1's separate instances and primitives. Every node has a
 * stable id and a parent, so grouping, locking and multi-selection need no further format change. Node ids
 * are the ids binding targets already use (a model node's id is the v1 instanceId, a primitive's its nodeId).
 */

/** Edits to a node inside an imported model, keyed by its stable assetNodeId. */
export const ModelNodeOverrideSchemaV2 = z.object({
  name: z.string().optional(),
  transform: SceneTransformSchemaV1.optional(),
  visible: z.boolean().optional(),
  runtimeBid: z.string().optional(),
})

const nodeBase = {
  id: nonEmptyString,
  /** null for a top-level node; otherwise the id of a group node. */
  parentId: nonEmptyString.nullable(),
  name: z.string(),
  transform: SceneTransformSchemaV1,
  visible: z.boolean(),
  locked: z.boolean(),
  /** Engine object id persisted for stable picking across reloads. */
  runtimeBid: z.string().optional(),
}

export const ModelNodeSchemaV2 = z.object({
  ...nodeBase,
  kind: z.literal('model'),
  model: z.object({
    assetId: z.string(),
    overrides: z.record(z.string(), ModelNodeOverrideSchemaV2),
    /** assetNodeIds removed from this instance. */
    deleted: z.array(z.string()),
  }),
})

export const PrimitiveNodeSchemaV2 = z.object({
  ...nodeBase,
  kind: z.literal('primitive'),
  primitive: z.object({
    shape: z.enum(['box', 'plane', 'cylinder']),
    color: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
    depth: z.number().optional(),
    radiusTop: z.number().optional(),
    radiusBottom: z.number().optional(),
    radialSegments: z.number().optional(),
  }),
})

export const GroupNodeSchemaV2 = z.object({ ...nodeBase, kind: z.literal('group') })

export const SceneNodeSchemaV2 = z.discriminatedUnion('kind', [
  ModelNodeSchemaV2,
  PrimitiveNodeSchemaV2,
  GroupNodeSchemaV2,
])

type NodeLike = { id: string; parentId: string | null; kind: string }

/** Unique ids; parents must exist and be groups; no cycles. Array order is sibling order. */
function checkHierarchy(nodes: readonly NodeLike[], ctx: z.RefinementCtx): void {
  const byId = new Map<string, NodeLike>()
  nodes.forEach((node, index) => {
    if (byId.has(node.id)) ctx.addIssue({ code: 'custom', path: [index, 'id'], message: `节点 ID 重复：${node.id}` })
    byId.set(node.id, node)
  })
  nodes.forEach((node, index) => {
    if (node.parentId === null) return
    const parent = byId.get(node.parentId)
    if (!parent) {
      ctx.addIssue({ code: 'custom', path: [index, 'parentId'], message: `父节点不存在：${node.parentId}` })
      return
    }
    if (parent.kind !== 'group') {
      ctx.addIssue({ code: 'custom', path: [index, 'parentId'], message: `父节点必须是组：${node.parentId}` })
      return
    }
    const seen = new Set([node.id])
    for (let current: NodeLike | undefined = parent; current; current = byId.get(current.parentId ?? '')) {
      if (seen.has(current.id)) {
        ctx.addIssue({ code: 'custom', path: [index, 'parentId'], message: `节点层级存在循环：${node.id}` })
        return
      }
      seen.add(current.id)
      if (current.parentId === null) break
    }
  })
}

export const SceneDocumentSchemaV2 = z.object({
  version: z.literal(2),
  projectId: z.string(),
  metadata: z.object({ name: z.string().optional(), updatedAt: z.string() }),
  /** Absent means "no data source configured", exactly as in v1. */
  dataSources: ProjectDataSourcesSchema.optional(),
  sceneSettings: SceneSettingsSchemaV1,
  cameraView: SceneCameraViewSchemaV1.optional(),
  nodes: z.array(SceneNodeSchemaV2).superRefine(checkHierarchy),
  bindings: z.array(TwinBindingSchema),
  effects: z.array(EffectInstanceSchema).superRefine(uniqueBy(effect => effect.id, '特效 ID')),
  visualRules: z.array(VisualRuleSchema).superRefine(uniqueBy(rule => rule.id, '规则 ID')),
  interactions: z.array(SceneInteractionSchema).superRefine(uniqueBy(item => item.id, '交互 ID')),
})

export function isSceneDocumentV2(value: unknown): value is z.infer<typeof SceneDocumentSchemaV2> {
  return SceneDocumentSchemaV2.safeParse(value).success
}
