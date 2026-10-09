import type { DeepReadonly, DefineComponent } from 'vue'

export type TwinPackageSource = string | URL | Blob | ArrayBuffer | Uint8Array
export type TwinBindingTarget =
  | { type: 'asset-instance'; instanceId: string }
  | { type: 'asset-node'; instanceId: string; assetNodeId: string }
  | { type: 'primitive'; nodeId: string }
  /** Any scene node by id (groups, paths, areas, labels…). Since 0.4.0. */
  | { type: 'node'; nodeId: string }
export interface TwinDevice {
  id: string
  name: string
  type?: string
}
export interface TwinVariableDefinition {
  id: string
  key: string
  name: string
  dataType: 'number' | 'boolean' | 'string'
  unit?: string
}
export interface TwinBinding {
  id: string
  target: TwinBindingTarget
  device: TwinDevice
  variables: TwinVariableDefinition[]
}
export interface TwinRuntimeValue {
  bindingId: string
  variableKey: string
  value: number | boolean | string
  updatedAt: string
}
export type ViewerSelection = Readonly<{
  target: Readonly<TwinBindingTarget>
  bindingTarget: Readonly<TwinBindingTarget> | null
  bindingId: string | null
  deviceId: string | null
  deviceName: string | null
}> | null
export interface ViewerLoadedEvent {
  projectId: string
  projectName: string
  objectCount: number
  bindingCount: number
  warnings: string[]
}
export interface ViewerInteractionEvent {
  eventName: string
  interactionId: string
  trigger: 'click' | 'double-click' | 'hover-enter' | 'hover-leave'
  sourceTarget: Readonly<TwinBindingTarget>
  triggerTarget: Readonly<TwinBindingTarget>
  actionTarget: Readonly<TwinBindingTarget>
  deviceId: string | null
  metadata: Readonly<Record<string, unknown>>
}
export interface ViewerTargetClick {
  target: TwinBindingTarget
  bindingTarget?: TwinBindingTarget
  device?: TwinDevice
  bindingId?: string
}
/** A guided tour's playback state. Since 0.4.0. */
export interface ViewerTourState {
  tourId: string | null
  tourName: string
  stepIndex: number
  stepCount: number
  playing: boolean
  paused: boolean
  /** Caption of the current step ('' when none). */
  caption: string
}
/** A visual rule currently firing. Since 0.4.0. */
export interface ViewerAlarm {
  ruleId: string
  bindingId: string
  deviceId: string | null
  deviceName: string | null
  variableKey: string
  value: number | boolean | string | null
}
export interface ViewerHoverEvent {
  target: Readonly<TwinBindingTarget> | null
  deviceId: string | null
  deviceName: string | null
}
export interface ViewerBookmark {
  id: string
  name: string
}
export interface ViewerTour {
  id: string
  name: string
  stepCount: number
  loop: boolean
}
export interface ViewerNode {
  id: string
  name: string
  kind: 'model' | 'primitive' | 'group' | 'path' | 'area' | 'label' | 'light'
  parentId: string | null
  visible: boolean
}
export type ViewerQuality = 'auto' | 'low' | 'medium' | 'high'
export interface ViewerPerformance {
  fps: number
  quality: 'low' | 'medium' | 'high'
  setting: ViewerQuality
  pixelRatio: number
}
export type DataSourceType = 'mock' | 'websocket'
/** 'unconfigured': the package has no enabled WebSocket source — no runtime values will ever appear. */
export type DataSourceConnectionStatus = 'unconfigured' | 'connecting' | 'connected' | 'disconnected' | 'error'
export type ViewerRuntimeState = DeepReadonly<{
  projectId: string | null
  bindings: TwinBinding[]
  runtimeValues: Record<string, TwinRuntimeValue>
  resolutionByBindingId: Record<string, 'resolved' | 'unresolved'>
  bindingRevision: number
  runtimeRevision: number
  resolutionRevision: number
  mockRunning: boolean
  mockTickCount: number
  dataSourceType: DataSourceType
  dataSourceStatus: DataSourceConnectionStatus
  dataSourceMessageCount: number
  dataSourceError: string | null
}> & { getRuntimeValue(bindingId: string, variableKey: string): DeepReadonly<TwinRuntimeValue> | null }
export interface ViewerDiagnostics {
  dataSource: { type: DataSourceType; status: DataSourceConnectionStatus; messageCount: number; error: string | null }
  visualRules: { activations: number; activeRules: number }
  effects: { effects: number; transientOwners: number; helpers: number; outlined: number }
}
export interface TwinSceneViewerPublicApi {
  focusDevice(deviceId: string): Promise<boolean>
  focusTarget(target: TwinBindingTarget): Promise<boolean>
  selectDevice(deviceId: string): boolean
  selectTarget(target: TwinBindingTarget): boolean
  clearSelection(): void
  getSelection(): ViewerSelection
  getRuntimeState(): ViewerRuntimeState | null
  getDiagnostics(): ViewerDiagnostics
  /** Camera views saved in the editor. Since 0.4.0. */
  getBookmarks(): ViewerBookmark[]
  flyToBookmark(bookmarkId: string, durationSeconds?: number): Promise<boolean>
  /** Back to the project's opening view. */
  resetView(durationSeconds?: number): Promise<boolean>
  getTours(): ViewerTour[]
  /** Resolves when the tour ends (true) or is stopped / interrupted (false). */
  playTour(tourId: string, fromStep?: number): Promise<boolean>
  pauseTour(): void
  resumeTour(): void
  stopTour(): void
  nextTourStep(): void
  previousTourStep(): void
  getTourState(): ViewerTourState
  /** Scene nodes, for building layer switches. */
  getNodes(): ViewerNode[]
  /** Shows or hides a node (and its children) without changing the project. */
  setNodeVisible(nodeId: string, visible: boolean): boolean
  getAlarms(): ViewerAlarm[]
  setQuality(quality: ViewerQuality): void
  getPerformance(): ViewerPerformance
  /** A PNG of the current view. */
  screenshot(): Promise<Blob | null>
}
export interface LoadedTwinPackage {
  readonly projectId: string
  readonly projectName: string
  /** Always in the current format: packages from older editors are upgraded on load. */
  readonly document: Readonly<SceneDocumentV2>
  dispose(): void
}
/** Newest scene format this SDK can open; packages from a newer editor are rejected with an upgrade hint. */
export declare const SCENE_DOCUMENT_VERSION: number
export function loadTwinPackage(
  source: TwinPackageSource,
  options?: { signal?: AbortSignal },
): Promise<LoadedTwinPackage>
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
export interface ScenePrimitiveV1 {
  nodeId: string
  type: 'box' | 'plane' | 'cylinder'
  name: string
  transform: SceneTransformV1
  properties: {
    color: string
    width?: number
    height?: number
    depth?: number
    radiusTop?: number
    radiusBottom?: number
    radialSegments?: number
  }
  runtimeBid?: string
  visible?: boolean
}
export interface SceneSettingsV1 {
  gridEnabled: boolean
  axesEnabled: boolean
  ground: { enabled: boolean; size: number; color: string }
  lighting: { ambientIntensity: number; directionalIntensity: number; directionalPosition: Vector3Tuple }
  environmentAssetId: string | null
}
export interface EffectParameters {
  color: string
  opacity: number
  speed: number
  padding: number
  text: string
  height?: number
  scale?: number
  variables?: string[]
}
export type EffectKind =
  | 'box-glow'
  | 'ground-pulse'
  | 'outline'
  | 'child-highlight'
  | 'floating-label'
  | 'fence'
  | 'radar'
  | 'ripple'
  | 'beam'
  | 'data-label'
  | 'icon-marker'
export interface EffectInstance {
  id: string
  kind: EffectKind
  target: TwinBindingTarget
  parameters: EffectParameters
  sourceTemplateId?: string
}
export type RelativeEffectTarget =
  { mode: 'current-target' } | { mode: 'root-instance' } | { mode: 'asset-node'; assetNodeId: string }
export interface EffectTemplate {
  version: 1
  id: string
  origin: 'builtin' | 'local'
  name: string
  description: string
  category: string
  effects: { id: string; kind: EffectKind; parameters: EffectParameters; target: RelativeEffectTarget }[]
}
export type RuleOperator = '>' | '>=' | '<' | '<=' | '==' | '!='
export type RuleCondition =
  | { dataType: 'number'; operator: RuleOperator; value: number }
  | { dataType: 'boolean'; operator: '==' | '!='; value: boolean }
  | { dataType: 'string'; operator: '==' | '!='; value: string }
export interface VisualRule {
  id: string
  bindingId: string
  target: TwinBindingTarget
  variableKey: string
  condition: RuleCondition
  enabled: boolean
  priority: number
  template: EffectTemplate | null
}
export type InteractionTrigger = 'click' | 'double-click' | 'hover-enter' | 'hover-leave'
export type InteractionAction =
  | { type: 'select' | 'focus' | 'show' | 'hide' | 'toggle' | 'highlight'; target?: TwinBindingTarget }
  | { type: 'clear-selection' | 'stop-tour'; target?: TwinBindingTarget }
  | { type: 'emit-event'; eventName: string; metadata?: Record<string, unknown>; target?: TwinBindingTarget }
  | { type: 'fly-to-bookmark'; bookmarkId: string; target?: TwinBindingTarget }
  | { type: 'play-tour'; tourId: string; target?: TwinBindingTarget }
export interface SceneInteraction {
  id: string
  enabled: boolean
  source: TwinBindingTarget
  trigger: InteractionTrigger
  action: InteractionAction
}
/** Scene format v1 (packages exported before 0.4.0); loaders upgrade it to v2. */
export interface SceneDocumentV1 {
  version: 1
  dataSources?: ProjectDataSource[]
  projectId: string
  metadata: { name?: string; updatedAt: string }
  instances: SceneAssetInstanceV1[]
  primitives: ScenePrimitiveV1[]
  sceneSettings?: SceneSettingsV1
  cameraView?: { position: Vector3Tuple; target: Vector3Tuple; fov?: number }
  bindings?: TwinBinding[]
  effects?: EffectInstance[]
  visualRules?: VisualRule[]
  interactions?: SceneInteraction[]
}
export interface SceneSettingsV2 {
  helpers: { grid: boolean; axes: boolean }
  ground: { enabled: boolean; size: number; color: string }
  sky: {
    mode: 'physical' | 'gradient' | 'color' | 'hdr'
    color: string
    hdrAssetId: string | null
    environmentIntensity: number
  }
  time: { hour: number; azimuth: number }
  lighting: { ambientIntensity: number; sunIntensity: number; shadows: boolean }
  fog: { enabled: boolean; density: number }
  post: {
    exposure: number
    bloom: { enabled: boolean; intensity: number; threshold: number }
    vignette: boolean
    contrast: number
    saturation: number
  }
  weather: { kind: 'none' | 'rain' | 'snow'; intensity: number }
}
export interface CameraViewV2 {
  position: Vector3Tuple
  target: Vector3Tuple
  fov?: number
  /** Viewport width / height the view was composed in. */
  aspect?: number
}
interface SceneNodeBaseV2 {
  id: string
  parentId: string | null
  name: string
  transform: SceneTransformV1
  visible: boolean
  locked: boolean
  runtimeBid?: string
}
export type SceneNodeV2 = SceneNodeBaseV2 &
  (
    | {
        kind: 'model'
        model: {
          assetId: string
          /** Part edits by assetNodeId; `'__asset_root__'` holds the whole-model material. */
          overrides: Record<
            string,
            {
              name?: string
              transform?: SceneTransformV1
              visible?: boolean
              runtimeBid?: string
              /** Since 0.5.0. */
              material?: {
                color?: string
                texture?: boolean
                opacity?: number
                metalness?: number
                roughness?: number
                emissive?: string
                emissiveIntensity?: number
              }
            }
          >
          deleted: string[]
          /** Clip playback; absent = play the model's first clip, looping. Since 0.5.0. */
          animation?: { clip: string | null; speed: number; loop: boolean }
          /** Spinning parts (turbine blades…); speed in °/s, or a live variable × factor. Since 0.5.0. */
          motions?: {
            id: string
            assetNodeId: string
            axis: 'x' | 'y' | 'z'
            speed: number
            speedVariable: string | null
            factor: number
          }[]
        }
      }
    | {
        kind: 'primitive'
        primitive: {
          shape: 'box' | 'plane' | 'cylinder' | 'sphere' | 'cone'
          color: string
          width?: number
          height?: number
          depth?: number
          radiusTop?: number
          radiusBottom?: number
          radialSegments?: number
          opacity?: number
          emissive?: number
          metalness?: number
          roughness?: number
        }
      }
    | { kind: 'group' }
    | {
        kind: 'path'
        path: {
          points: Vector3Tuple[]
          closed: boolean
          style: 'flow' | 'tube' | 'line'
          color: string
          width: number
          speed: number
          opacity: number
        }
      }
    | {
        kind: 'area'
        area: { points: Vector3Tuple[]; color: string; opacity: number; wallHeight: number; label: string }
      }
    | {
        kind: 'label'
        label: {
          text: string
          style: 'tag' | 'title' | 'pin'
          color: string
          background: string
          size: number
          leader: boolean
        }
      }
    | {
        kind: 'light'
        light: {
          type: 'point' | 'spot'
          color: string
          intensity: number
          distance: number
          angle: number
          castShadow: boolean
        }
      }
  )
export interface CameraBookmark {
  id: string
  name: string
  view: CameraViewV2
  thumbnail?: string
}
export interface TourStep {
  id: string
  bookmarkId: string | null
  nodeId: string | null
  duration: number
  hold: number
  caption: string
  show: string[]
  hide: string[]
  highlightNodeId: string | null
}
export interface Tour {
  id: string
  name: string
  loop: boolean
  steps: TourStep[]
}
/** Scene format v2 (current). */
export interface SceneDocumentV2 {
  version: 2
  projectId: string
  metadata: { name?: string; updatedAt: string }
  dataSources?: ProjectDataSource[]
  settings: SceneSettingsV2
  cameraView?: CameraViewV2
  nodes: SceneNodeV2[]
  bindings: TwinBinding[]
  effects: EffectInstance[]
  visualRules: VisualRule[]
  interactions: SceneInteraction[]
  bookmarks: CameraBookmark[]
  tours: Tour[]
  presentation: { autoplayTourId: string | null; idleSeconds: number; autoRotate: boolean }
}
export const TwinSceneViewer: DefineComponent<{
  source: TwinPackageSource
  /** Render quality; 'auto' (default) adapts to the device and screen. Since 0.4.0. */
  quality?: ViewerQuality
  /** Kiosk mode: seconds without input before the project's autoplay tour starts. Since 0.4.0. */
  idleSeconds?: number
  /** Show tour captions over the scene (default true). Since 0.4.0. */
  captions?: boolean
}>

export type ProjectDataSource = { id: string; name: string; enabled: boolean } & (
  { type: 'mock' } | { type: 'websocket'; url: string }
)
