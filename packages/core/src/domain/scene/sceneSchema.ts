import { z } from 'zod'
import { ProjectDataSourcesSchema } from '../dataSources'
import { EffectInstanceSchema } from '../effects'
import { SceneInteractionSchema } from '../interactions'
import { uniqueBy } from '../schemaHelpers'
import { TwinBindingSchema } from '../twin'
import { VisualRuleSchema } from '../visualRules'

// Zod numbers are finite: NaN and ±Infinity are rejected, as the v1 validators required.
export const Vector3TupleSchema = z.tuple([z.number(), z.number(), z.number()])

export const SceneTransformSchemaV1 = z.object({
  position: Vector3TupleSchema,
  rotation: Vector3TupleSchema,
  scale: Vector3TupleSchema,
})

export const SceneSettingsSchemaV1 = z.object({
  gridEnabled: z.boolean(),
  axesEnabled: z.boolean(),
  ground: z.object({
    enabled: z.boolean(),
    size: z.number().positive(),
    color: z.string(),
  }),
  lighting: z.object({
    ambientIntensity: z.number().min(0),
    directionalIntensity: z.number().min(0),
    directionalPosition: Vector3TupleSchema,
  }),
  /** Required key: null means "no environment map". */
  environmentAssetId: z.string().nullable(),
})

export const SceneCameraViewSchemaV1 = z.object({
  position: Vector3TupleSchema,
  target: Vector3TupleSchema,
  fov: z.number().positive().optional(),
})

export const SceneNodeOverrideSchemaV1 = z.object({
  assetNodeId: z.string(),
  name: z.string(),
  transform: SceneTransformSchemaV1,
  runtimeBid: z.string().optional(),
  visible: z.boolean().optional(),
})

export const SceneAssetInstanceSchemaV1 = z.object({
  assetId: z.string(),
  instanceId: z.string(),
  name: z.string(),
  transform: SceneTransformSchemaV1,
  nodeOverrides: z.array(SceneNodeOverrideSchemaV1),
  runtimeBid: z.string().optional(),
  visible: z.boolean().optional(),
  deletedAssetNodeIds: z.array(z.string()).optional(),
})

export const SceneBoxPropertiesSchemaV1 = z.object({
  color: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  depth: z.number().optional(),
  radiusTop: z.number().optional(),
  radiusBottom: z.number().optional(),
  radialSegments: z.number().optional(),
})

export const ScenePrimitiveSchemaV1 = z.object({
  nodeId: z.string(),
  type: z.enum(['box', 'plane', 'cylinder']),
  name: z.string(),
  transform: SceneTransformSchemaV1,
  properties: SceneBoxPropertiesSchemaV1,
  runtimeBid: z.string().optional(),
  visible: z.boolean().optional(),
})

export const SceneDocumentSchemaV1 = z.object({
  version: z.literal(1),
  dataSources: ProjectDataSourcesSchema.optional(),
  projectId: z.string(),
  metadata: z.object({
    name: z.string().optional(),
    updatedAt: z.string(),
  }),
  instances: z.array(SceneAssetInstanceSchemaV1),
  primitives: z.array(ScenePrimitiveSchemaV1),
  sceneSettings: SceneSettingsSchemaV1.optional(),
  cameraView: SceneCameraViewSchemaV1.optional(),
  // Binding ids are not required to be unique in v1; effects, rules and interactions are.
  bindings: z.array(TwinBindingSchema).optional(),
  effects: z
    .array(EffectInstanceSchema)
    .superRefine(uniqueBy(effect => effect.id, '特效 ID'))
    .optional(),
  visualRules: z
    .array(VisualRuleSchema)
    .superRefine(uniqueBy(rule => rule.id, '规则 ID'))
    .optional(),
  interactions: z
    .array(SceneInteractionSchema)
    .superRefine(uniqueBy(interaction => interaction.id, '交互 ID'))
    .optional(),
})

export function isSceneDocumentV1(value: unknown): value is z.infer<typeof SceneDocumentSchemaV1> {
  return SceneDocumentSchemaV1.safeParse(value).success
}
