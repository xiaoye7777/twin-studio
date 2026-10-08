// Compile-time guard: index.d.ts is hand-written for hosts, so `pnpm type-check` fails when the
// real runtime types drift away from it. Values the SDK produces must fit the published types;
// values hosts pass in must fit both ways. Never imported at runtime.
import type * as Core from '@twin-studio/core'
import type * as Public from '../index'

type Fits<A, B> = [A] extends [B] ? true : false
type Same<A, B> = Fits<A, B> extends true ? Fits<B, A> : false
type Assert<T extends true> = T

export type PublicTypeChecks = [
  Assert<Same<Core.TwinBindingTarget, Public.TwinBindingTarget>>,
  Assert<Same<Core.TwinPackageSource, Public.TwinPackageSource>>,
  Assert<Same<Core.ProjectDataSource, Public.ProjectDataSource>>,
  Assert<Same<Core.DataSourceConnectionStatus, Public.DataSourceConnectionStatus>>,
  Assert<Fits<Core.ViewerSelection, Public.ViewerSelection>>,
  Assert<Fits<Core.ViewerLoadedEvent, Public.ViewerLoadedEvent>>,
  Assert<Fits<Core.ViewerInteractionEvent, Public.ViewerInteractionEvent>>,
  Assert<Fits<Core.ViewerTargetClick, Public.ViewerTargetClick>>,
  Assert<Fits<Core.ViewerRuntimeState, Public.ViewerRuntimeState>>,
  Assert<Fits<Core.ViewerDiagnostics, Public.ViewerDiagnostics>>,
  Assert<Fits<Core.TwinSceneViewerPublicApi, Public.TwinSceneViewerPublicApi>>,
  Assert<Fits<Core.SceneDocumentV1, Public.SceneDocumentV1>>,
  Assert<Fits<Core.SceneDocumentV2, Public.SceneDocumentV2>>,
  Assert<Fits<Core.ViewerTourState, Public.ViewerTourState>>,
  Assert<Fits<Core.ViewerAlarm, Public.ViewerAlarm>>,
  Assert<Fits<Core.ViewerHoverEvent, Public.ViewerHoverEvent>>,
  Assert<Fits<Core.ViewerNode, Public.ViewerNode>>,
  Assert<Same<Core.ViewerQuality, Public.ViewerQuality>>,
  Assert<Fits<typeof Core.SCENE_DOCUMENT_VERSION, typeof Public.SCENE_DOCUMENT_VERSION>>,
]
