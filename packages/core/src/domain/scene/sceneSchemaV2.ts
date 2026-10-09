import { z } from 'zod'
import { ProjectDataSourcesSchema } from '../dataSources'
import { EffectInstanceSchema } from '../effects'
import { SceneInteractionSchema } from '../interactions'
import { nonEmptyString, uniqueBy } from '../schemaHelpers'
import { TwinBindingSchema } from '../twin'
import { VisualRuleSchema } from '../visualRules'
import { SceneTransformSchemaV1, Vector3TupleSchema } from './sceneSchema'
import { SceneSettingsSchemaV2 } from './sceneSettingsV2'

/**
 * Scene format v2: one ordered node list (models, primitives, groups, paths, areas, labels, lights). Every
 * node has a stable id and a parent, so grouping, locking and multi-selection need no further format change.
 * Node ids are the ids binding targets use (a model node's id is the v1 instanceId, a primitive's its nodeId).
 */

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, { message: '颜色必须是 #RRGGBB 格式' })

/** The model's root in `overrides`: only `material` applies to it (the node itself carries the transform). */
export const MODEL_ROOT_PART = '__asset_root__'

/**
 * A look applied to every mesh under a part (the nearest part with a material wins). Unset fields keep the
 * model's own material.
 */
export const PartMaterialSchema = z.object({
  /** Base colour; multiplies the texture unless `texture` is false. */
  color: hexColor.optional(),
  /** false removes the base colour texture, so `color` shows as is. */
  texture: z.boolean().optional(),
  opacity: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  roughness: z.number().min(0).max(1).optional(),
  emissive: hexColor.optional(),
  emissiveIntensity: z.number().min(0).max(20).optional(),
})

/** Edits to a node inside an imported model, keyed by its stable assetNodeId. */
export const ModelNodeOverrideSchemaV2 = z.object({
  name: z.string().optional(),
  transform: SceneTransformSchemaV1.optional(),
  visible: z.boolean().optional(),
  runtimeBid: z.string().optional(),
  material: PartMaterialSchema.optional(),
})

export const ModelAnimationSchema = z.object({
  /** Clip name in the model file; null plays nothing. */
  clip: z.string().nullable(),
  speed: z.number().min(0).max(10),
  loop: z.boolean(),
})

export const PartMotionSchema = z.object({
  id: nonEmptyString,
  /** The part that moves (an assetNodeId of the model). */
  assetNodeId: z.string(),
  /** Spin around the part's own axis. */
  axis: z.enum(['x', 'y', 'z']),
  /** Degrees per second when no live value drives it. */
  speed: z.number().min(-3600).max(3600),
  /** A variable of the node's device binding that sets the speed (speed = value × factor). */
  speedVariable: z.string().nullable(),
  factor: z.number().min(-1000).max(1000),
})

const nodeBase = {
  id: nonEmptyString,
  /** null for a top-level node; otherwise the id of a group node. */
  parentId: nonEmptyString.nullable(),
  name: z.string(),
  transform: SceneTransformSchemaV1,
  visible: z.boolean(),
  locked: z.boolean(),
  /** Persisted engine id from v1 scenes; kept for round-tripping only. */
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
    /** The model's own animation clip. Absent: the first clip plays in a loop (if the file has any). */
    animation: ModelAnimationSchema.optional(),
    /** Procedural part motion, e.g. turbine blades spinning, optionally driven by live data. */
    motions: z.array(PartMotionSchema).max(20).optional(),
  }),
})

export const PrimitiveShapeSchema = z.enum(['box', 'plane', 'cylinder', 'sphere', 'cone'])

export const PrimitiveNodeSchemaV2 = z.object({
  ...nodeBase,
  kind: z.literal('primitive'),
  primitive: z.object({
    shape: PrimitiveShapeSchema,
    color: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
    depth: z.number().optional(),
    radiusTop: z.number().optional(),
    radiusBottom: z.number().optional(),
    radialSegments: z.number().optional(),
    /** 0–1; below 1 the surface is see-through. */
    opacity: z.number().min(0).max(1).optional(),
    /** 0–1 glow of the surface colour (shows best at night with bloom). */
    emissive: z.number().min(0).max(1).optional(),
    metalness: z.number().min(0).max(1).optional(),
    roughness: z.number().min(0).max(1).optional(),
  }),
})

export const GroupNodeSchemaV2 = z.object({ ...nodeBase, kind: z.literal('group') })

/** A polyline in the node's local space, drawn on the ground: pipes, cables, energy flow, routes. */
export const PathNodeSchemaV2 = z.object({
  ...nodeBase,
  kind: z.literal('path'),
  path: z.object({
    points: z.array(Vector3TupleSchema).min(2).max(500),
    closed: z.boolean(),
    style: z.enum(['flow', 'tube', 'line']),
    color: hexColor,
    /** Metres. */
    width: z.number().min(0.02).max(50),
    /** Flow speed; 0 is static. Negative reverses the direction. */
    speed: z.number().min(-20).max(20),
    opacity: z.number().min(0).max(1),
  }),
})

/** A polygon zone on the ground: plots, functional areas, restricted zones. */
export const AreaNodeSchemaV2 = z.object({
  ...nodeBase,
  kind: z.literal('area'),
  area: z.object({
    points: z.array(Vector3TupleSchema).min(3).max(500),
    color: hexColor,
    opacity: z.number().min(0).max(1),
    /** Height of the glowing border wall in metres; 0 draws only the outline. */
    wallHeight: z.number().min(0).max(200),
    /** Optional caption shown at the centre. */
    label: z.string().max(80),
  }),
})

/** A text label anchored in the scene (always faces the camera). */
export const LabelNodeSchemaV2 = z.object({
  ...nodeBase,
  kind: z.literal('label'),
  label: z.object({
    text: z.string().max(200),
    style: z.enum(['tag', 'title', 'pin']),
    color: hexColor,
    background: hexColor,
    /** Size multiplier. */
    size: z.number().min(0.2).max(10),
    /** Draws a leader line down to the ground. */
    leader: z.boolean(),
  }),
})

export const LightNodeSchemaV2 = z.object({
  ...nodeBase,
  kind: z.literal('light'),
  light: z.object({
    type: z.enum(['point', 'spot']),
    color: hexColor,
    intensity: z.number().min(0).max(1000),
    /** Metres; 0 is unlimited. */
    distance: z.number().min(0).max(5000),
    /** Spot lights: cone angle in degrees. */
    angle: z.number().min(1).max(89),
    castShadow: z.boolean(),
  }),
})

export const SceneNodeSchemaV2 = z.discriminatedUnion('kind', [
  ModelNodeSchemaV2,
  PrimitiveNodeSchemaV2,
  GroupNodeSchemaV2,
  PathNodeSchemaV2,
  AreaNodeSchemaV2,
  LabelNodeSchemaV2,
  LightNodeSchemaV2,
])

export const SceneNodeKindSchema = z.enum(['model', 'primitive', 'group', 'path', 'area', 'label', 'light'])

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

export const CameraViewSchemaV2 = z.object({
  position: Vector3TupleSchema,
  target: Vector3TupleSchema,
  fov: z.number().min(5).max(120).optional(),
  /** Viewport width / height the view was composed in; narrower screens back off to keep the width. */
  aspect: z.number().min(0.1).max(10).optional(),
})

export const CameraBookmarkSchema = z.object({
  id: nonEmptyString,
  name: z.string().max(80),
  view: CameraViewSchemaV2,
  /** Small JPEG data URL for the editor's bookmark list. */
  thumbnail: z.string().max(80_000).optional(),
})

export const TourStepSchema = z.object({
  id: nonEmptyString,
  /** Where the camera goes: a bookmark, or a node it frames. Neither keeps the current view. */
  bookmarkId: z.string().nullable(),
  nodeId: z.string().nullable(),
  /** Seconds the camera takes to get there. */
  duration: z.number().min(0).max(60),
  /** Seconds it stays before the next step. */
  hold: z.number().min(0).max(600),
  /** On-screen caption while the step plays. */
  caption: z.string().max(300),
  /** Nodes shown or hidden when the step starts (layers). */
  show: z.array(z.string()).max(200),
  hide: z.array(z.string()).max(200),
  /** Node to highlight while the step plays. */
  highlightNodeId: z.string().nullable(),
})

export const TourSchema = z.object({
  id: nonEmptyString,
  name: z.string().max(80),
  loop: z.boolean(),
  steps: z
    .array(TourStepSchema)
    .max(200)
    .superRefine(uniqueBy(step => step.id, '导览步骤 ID')),
})

/** Keeps viewers from losing the scene on a big screen: the camera stays around and above it. */
export const CameraLimitsSchema = z.object({
  enabled: z.boolean(),
  /** Farthest zoom, as a multiple of the scene's size (saved views farther out still work). */
  maxDistance: z.number().min(0.3).max(10),
  /** Nearest zoom in metres. */
  minDistance: z.number().min(0.1).max(500),
  /** Lowest camera angle above the ground in degrees, so the view never skims along the floor. */
  minElevation: z.number().min(0).max(80),
})

export const PresentationSchema = z.object({
  /** Tour played automatically when the Viewer has been idle (kiosk / cinema mode). */
  autoplayTourId: z.string().nullable(),
  /** Seconds without input before the autoplay tour starts; 0 disables idle autoplay. */
  idleSeconds: z.number().min(0).max(3600),
  /** Slow orbit when idle and no tour is configured. */
  autoRotate: z.boolean(),
  /** Absent: free camera, as before. */
  cameraLimits: CameraLimitsSchema.optional(),
})

export const SceneDocumentSchemaV2 = z.object({
  version: z.literal(2),
  projectId: z.string(),
  metadata: z.object({ name: z.string().optional(), updatedAt: z.string() }),
  /** Absent means "no data source configured", exactly as in v1. */
  dataSources: ProjectDataSourcesSchema.optional(),
  settings: SceneSettingsSchemaV2,
  /** The opening view. */
  cameraView: CameraViewSchemaV2.optional(),
  nodes: z.array(SceneNodeSchemaV2).superRefine(checkHierarchy),
  bindings: z.array(TwinBindingSchema),
  effects: z.array(EffectInstanceSchema).superRefine(uniqueBy(effect => effect.id, '特效 ID')),
  visualRules: z.array(VisualRuleSchema).superRefine(uniqueBy(rule => rule.id, '规则 ID')),
  interactions: z.array(SceneInteractionSchema).superRefine(uniqueBy(item => item.id, '交互 ID')),
  bookmarks: z
    .array(CameraBookmarkSchema)
    .max(200)
    .superRefine(uniqueBy(item => item.id, '视角 ID')),
  tours: z
    .array(TourSchema)
    .max(50)
    .superRefine(uniqueBy(item => item.id, '导览 ID')),
  presentation: PresentationSchema,
})

export function isSceneDocumentV2(value: unknown): value is z.infer<typeof SceneDocumentSchemaV2> {
  return SceneDocumentSchemaV2.safeParse(value).success
}

export function createDefaultPresentation(): z.infer<typeof PresentationSchema> {
  return { autoplayTourId: null, idleSeconds: 0, autoRotate: false }
}

export function createDefaultCameraLimits(): z.infer<typeof CameraLimitsSchema> {
  return { enabled: true, maxDistance: 1.5, minDistance: 2, minElevation: 8 }
}
