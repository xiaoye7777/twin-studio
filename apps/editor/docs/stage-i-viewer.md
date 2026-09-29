# Stage I — TwinSceneViewer

Open `/dev/viewer?projectId=<saved-project-id>` on the same origin where the
Editor saved the scene. Scenes remain in localStorage and assets in IndexedDB;
this stage does not publish or transfer local projects between browsers.

## Responsibilities

- `SceneRuntimeLoader`: the shared SceneDocumentV1 interpreter. Restores asset
  instances, primitives, transforms, node overrides, deleted children, visibility,
  ground, lights, grid/axes, HDR environment and camera. Returns roots, modified
  nodes and warnings without accessing stores. The Editor registers returned
  modified nodes so subsequent saves retain restored overrides.
- `createScenePrimitive`: one geometry/material/identity implementation for new
  Editor primitives and restored Editor/Viewer primitives.
- `createTwinState`: independent reactive binding and runtime-value state.
  Editor's Pinia store supplies a configuration-change callback to mark Dirty.
  Viewer creates one state per session without importing EditorStore.
- `TwinDataRuntime`: shared binding initialization, stable target resolution and
  MockDataSource lifecycle. Unresolved bindings remain visible as warnings and
  are excluded from mock generation.
- `TwinSceneRuntime`: owns a MeteorScene, loader, resolver, Twin state and pointer
  notifications. SceneRepository/AssetRepository interfaces are injected.
- `TwinSceneViewer.vue`: canvas, project changes, loading/errors, lifecycle and
  Vue events. It creates an independent runtime for each mount/project change.
- Editor retains SelectionManager, TransformManager, History and editor UI.

The existing `userData.editor` metadata format and pure metadata helpers are
reused for identity compatibility. Their historical names do not imply an
EditorStore dependency. No second schema or UUID/BID business identity is added.

## Component contract

```vue
<TwinSceneViewer
  ref="viewer"
  :project-id="projectId"
  @target-click="onTargetClick"
  @device-click="onDeviceClick"
/>
```

Exposed methods:

- `getRuntimeObject(target): Object3D | null`
- `focusTarget(target): Promise<boolean>`
- `focusDevice(deviceId): Promise<boolean>` (first resolved binding if repeated)
- `getRuntimeState()` exposes readonly reactive binding/value state for consumers.

`target` is the existing TwinBindingTarget union. Resolution first matches
instanceId, instanceId + assetNodeId, or nodeId; the current runtime BID may then
be passed to MeteorScene.findObjectByBid/focusObject internally.

Events: `loaded`, `error`, `target-click`, `device-click`.
Click events contain `{ target, bindingTarget?, bindingId?, device? }`.
`target` is the hit node; `bindingTarget` may be its nearest bound ancestor.
The event payload has no Object3D, UUID or BID. Pointer movement above five pixels,
multi-touch and invisible ancestors are excluded from clicks.

## Load and dispose

SceneRepository.load → MeteorScene.initialize → SceneRuntimeLoader.restore →
TwinDataRuntime.initialize/start → ViewerPointerEvents.

Dispose stops MockDataSource and removes pointer listeners, invalidates pending
loads, revokes Object URLs, disposes MeteorScene and clears per-session data.
Project changes replace the canvas because the previous WebGL context was lost.
The Core GLTF loader has no cancellation API: the Adapter prevents late models
from entering a disposed scene and defers PersistenceManager cache disposal
until pending model loads settle. Network decoding itself is not abortable here.

The known Core Mesh.prototype.raycast global BVH patch is unchanged.

## Verification

`tests/stage-i-viewer.mjs` uses Playwright and a separate temporary browser profile.
It uploads a generated cabinet GLB through the Editor file input, creates two
instances plus Box/Plane/Cylinder, configures overrides/deletion/settings/bindings,
and saves through the Editor UI. It then validates Editor restore/history and
Viewer restore against that saved document. A generated HDR checks environment
loading. Further checks cover camera, raycast/device events, focus, orbit, resize,
direct Viewer loading without EditorStore, project changes, three SPA unmount
cycles, runtime values versus persistence, and disposal during a GLTF load.

Run Vite first, make Playwright available via NODE_PATH (or a local installation),
then run `node tests/stage-i-viewer.mjs`. Set CHROME_PATH for non-macOS Chrome and
TEST_BASE_URL for a different server address. The test does not use personal
browser storage. `pnpm type-check`, `pnpm build`, `git diff --check` are separate
checks. Playwright is optional QA tooling, not a production dependency.

## Next stage boundaries

A VisualRuleEngine can consume `TwinSceneRuntime.twin.runtimeValues` and resolve
targets through `getRuntimeObject`. An EffectManager should accept MeteorScene
from the runtime composition layer, own its resources, and dispose before
MeteorScene. An InteractionManager can replace/extend ViewerPointerEvents while
keeping the Vue target/device event contract. No such engines are implemented
in this stage.
