import type { z } from 'zod'
import type {
  SceneAssetInstanceSchemaV1,
  SceneBoxPropertiesSchemaV1,
  SceneCameraViewSchemaV1,
  SceneDocumentSchemaV1,
  SceneNodeOverrideSchemaV1,
  ScenePrimitiveSchemaV1,
  SceneSettingsSchemaV1,
  SceneTransformSchemaV1,
  Vector3TupleSchema,
} from './sceneSchema'
import type {
  AreaNodeSchemaV2,
  CameraBookmarkSchema,
  CameraViewSchemaV2,
  GroupNodeSchemaV2,
  LabelNodeSchemaV2,
  LightNodeSchemaV2,
  ModelAnimationSchema,
  ModelNodeOverrideSchemaV2,
  PartMotionSchema,
  PartMaterialSchema,
  CameraLimitsSchema,
  SurfacePatternSchema,
  ModelNodeSchemaV2,
  PathNodeSchemaV2,
  PresentationSchema,
  PrimitiveNodeSchemaV2,
  PrimitiveShapeSchema,
  SceneDocumentSchemaV2,
  SceneNodeKindSchema,
  SceneNodeSchemaV2,
  TourSchema,
  TourStepSchema,
} from './sceneSchemaV2'

export type Vector3Tuple = z.infer<typeof Vector3TupleSchema>
export type SceneSettingsV1 = z.infer<typeof SceneSettingsSchemaV1>
export type SceneGroundSettingsV1 = SceneSettingsV1['ground']
export type SceneLightingSettingsV1 = SceneSettingsV1['lighting']
export type SceneCameraViewV1 = z.infer<typeof SceneCameraViewSchemaV1>
export type SceneTransformV1 = z.infer<typeof SceneTransformSchemaV1>
export type SceneNodeOverrideV1 = z.infer<typeof SceneNodeOverrideSchemaV1>
export type SceneAssetInstanceV1 = z.infer<typeof SceneAssetInstanceSchemaV1>
export type SceneBoxPropertiesV1 = z.infer<typeof SceneBoxPropertiesSchemaV1>
export type ScenePrimitiveV1 = z.infer<typeof ScenePrimitiveSchemaV1>
export type SceneDocumentV1 = z.infer<typeof SceneDocumentSchemaV1>

// Scene format v2
export type SceneDocumentV2 = z.infer<typeof SceneDocumentSchemaV2>
export type SceneNodeV2 = z.infer<typeof SceneNodeSchemaV2>
export type ModelNodeV2 = z.infer<typeof ModelNodeSchemaV2>
export type PrimitiveNodeV2 = z.infer<typeof PrimitiveNodeSchemaV2>
export type GroupNodeV2 = z.infer<typeof GroupNodeSchemaV2>
export type ModelNodeOverrideV2 = z.infer<typeof ModelNodeOverrideSchemaV2>
export type PathNodeV2 = z.infer<typeof PathNodeSchemaV2>
export type AreaNodeV2 = z.infer<typeof AreaNodeSchemaV2>
export type LabelNodeV2 = z.infer<typeof LabelNodeSchemaV2>
export type LightNodeV2 = z.infer<typeof LightNodeSchemaV2>
export type SceneNodeKind = z.infer<typeof SceneNodeKindSchema>
export type PrimitiveShape = z.infer<typeof PrimitiveShapeSchema>
export type CameraViewV2 = z.infer<typeof CameraViewSchemaV2>
export type CameraBookmark = z.infer<typeof CameraBookmarkSchema>
export type Tour = z.infer<typeof TourSchema>
export type TourStep = z.infer<typeof TourStepSchema>
export type Presentation = z.infer<typeof PresentationSchema>
export type ModelAnimation = z.infer<typeof ModelAnimationSchema>
export type PartMotion = z.infer<typeof PartMotionSchema>
export type PartMaterial = z.infer<typeof PartMaterialSchema>
export type CameraLimits = z.infer<typeof CameraLimitsSchema>
export type SurfacePatternV2 = z.infer<typeof SurfacePatternSchema>
