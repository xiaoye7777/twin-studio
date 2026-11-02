/*
 * Viewer SDK 对外的类型：事件（选中、点击、悬停、告警、导览）、运行时状态、公开 API。
 * 改这里要同步 packages/viewer/index.d.ts（手写的对外声明），pnpm type-check 会检查两者是否一致。
 */
import type { DeepReadonly } from 'vue'
import type {
  TwinBinding,
  TwinBindingResolution,
  TwinBindingTarget,
  TwinDevice,
  TwinRuntimeValue,
} from '../domain/twin'
import type { InteractionMetadata, InteractionTrigger } from '../domain/interactions'
import type { DataSourceConnectionStatus, DataSourceRuntimeState, DataSourceType } from '../infrastructure/data'

export type { TwinBindingTarget } from '../domain/twin'

/** null is the whole-scene context. target is the exact selected business object. */
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

/** Compatibility click payload; new hosts should consume selection-change. */
export interface ViewerTargetClick {
  target: TwinBindingTarget
  bindingTarget?: TwinBindingTarget
  device?: TwinDevice
  bindingId?: string
}

export interface ViewerInteractionEvent {
  eventName: string
  interactionId: string
  trigger: InteractionTrigger
  sourceTarget: Readonly<TwinBindingTarget>
  triggerTarget: Readonly<TwinBindingTarget>
  actionTarget: Readonly<TwinBindingTarget>
  deviceId: string | null
  metadata: Readonly<InteractionMetadata>
}

/** A guided tour's playback state. */
export interface ViewerTourState {
  tourId: string | null
  tourName: string
  stepIndex: number
  stepCount: number
  playing: boolean
  paused: boolean
  /** Caption of the current step ('' when none); hosts may render it in their own style. */
  caption: string
}

/** A visual rule currently firing (an alarm). */
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

/** A scene node as a host sees it (for layer toggles). */
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

export type TwinSceneViewerEvents = {
  'selection-change': [selection: ViewerSelection]
  loaded: [info: ViewerLoadedEvent]
  error: [message: string]
  'target-click': [event: ViewerTargetClick]
  'device-click': [event: ViewerTargetClick]
  'interaction-event': [event: ViewerInteractionEvent]
  'tour-change': [state: ViewerTourState]
  'alarm-change': [alarms: ViewerAlarm[]]
  'hover-change': [event: ViewerHoverEvent]
}

export type ViewerRuntimeState = DeepReadonly<{
  projectId: string | null
  bindings: TwinBinding[]
  runtimeValues: Record<string, TwinRuntimeValue>
  resolutionByBindingId: Record<string, TwinBindingResolution>
  bindingRevision: number
  runtimeRevision: number
  resolutionRevision: number
  mockRunning: boolean
  mockTickCount: number
  dataSourceType: DataSourceType
  dataSourceStatus: DataSourceConnectionStatus
  dataSourceMessageCount: number
  dataSourceError: string | null
  /** 每个数据接口的状态；上面几项是它们的汇总。 */
  dataSourceStates: DataSourceRuntimeState[]
}> & {
  getRuntimeValue(bindingId: string, variableKey: string): DeepReadonly<TwinRuntimeValue> | null
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
  /** Camera views saved in the editor. */
  getBookmarks(): ViewerBookmark[]
  flyToBookmark(bookmarkId: string, durationSeconds?: number): Promise<boolean>
  /** Back to the project's opening view. */
  resetView(durationSeconds?: number): Promise<boolean>
  getTours(): ViewerTour[]
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

export interface ViewerDiagnostics {
  dataSource: { type: DataSourceType; status: DataSourceConnectionStatus; messageCount: number; error: string | null }
  visualRules: { activations: number; activeRules: number }
  effects: { effects: number; transientOwners: number; helpers: number; outlined: number }
}
