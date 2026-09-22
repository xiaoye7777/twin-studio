# Stage J — Atomic effects

## Architecture

`domain/effects` defines the supported atoms and JSON-only instances. Targets reuse
TwinBindingTarget (instanceId, instanceId + assetNodeId, or nodeId). Optional
`SceneDocumentV1.effects` is validated and serialized; older scenes still load.
An instance contains `id`, `kind`, `target`, and `parameters`. No Three objects,
animation phase, runtime values, UUID or BID business keys are persisted.

Editor uses the effects Pinia store and existing FunctionalCommand history.
Viewer has its own EffectRuntime, no editor store or editing controls. Both use
the same EffectRuntime after the shared SceneRuntimeLoader restores objects.
BindingTargetResolver resolves stable targets and uses Meteor findObjectByBid.

## Atoms

| Kind | Implementation |
| --- | --- |
| Box Glow | World Box3, translucent box and edges, animated opacity |
| Ground Pulse | Rectangular ring at bounds.min.y, expanding and fading |
| Outline | MeteorScene wrapper around Core enableOutline / disableOutline |
| Child Highlight | Clone each affected mesh material and material array; child wins over ancestor |
| Floating Label | CanvasTexture on camera-facing Three Sprite |

Original material references are restored before cloned materials are disposed.
Shared textures are never disposed by highlight. Helpers live outside business
roots, never enter Core's business object/BID list, and have no-op raycast. They
do not enter Hierarchy, business bounds, selection, bindings or serialization.
One effect animation loop per scene updates all animated helpers and follows
world bounds. Removal/unmount cancels the loop and releases geometry/material/
label texture. Editor removes target effects before unregistering objects and
restores configurations on Undo Delete. Configuration commands mark dirty;
animation does not. Duplication does not copy effects.

## Files

- New: domain/effects/index.ts, stores/effects.ts, runtime/effects/EffectRuntime.ts
- New UI: components/editor/EffectLibrary.vue, EffectInspector.vue
- Integration: EditorResourcePanel.vue, InspectorPanel.vue, ThreeViewport.vue
- Viewer: runtime/twin/TwinSceneRuntime.ts
- Persistence: domain/scene/sceneTypes.ts, sceneSchema.ts, sceneSerializer.ts
- Adapter: infrastructure/meteor3d/MeteorScene.ts, types/meteor3d-core.d.ts
- Regression: tests/stage-i-viewer.mjs (covers Stage I and J)

The same publication includes the previously uncommitted Stage I implementation;
see stage-i-viewer.md. No vendored or upstream Core source is modified.

## Validation

Run Vite on :5173 and `node tests/stage-i-viewer.mjs` with Playwright available
via NODE_PATH and Chrome installed (CHROME_PATH may override its location).
The test creates an isolated project and uploads a generated GLB through the UI.
It covers two instances, all five effects, Inspector edits, add/edit/remove
Undo/Redo, target deletion/undo, save/reload, Viewer without EditorStore, child
and array material isolation/restoration, overlapping parent/child highlights,
effect following transforms, and Three resource dispose events. Stage I camera,
raycast/emit, settings/HDR, overrides, deleted children, binding/Mock, asynchronous
load cancellation, and project switch checks also run. Three Viewer and three
Editor mount/unmount cycles verify RAF and Object URLs return to zero; Viewer
checks also verify Mock timers and window pointer listeners. This is bounded
browser instrumentation, not proof of zero GPU/driver leaks on every device.

## Constraints and next boundary

- Core Outline has one shared style, so v1 uses fixed amber outlines. The adapter
  resizes its composer and disposes passes omitted by Core's composer disposal.
- Label uses fixed world size, single-line canvas text, and depth occlusion; no
  collision layout. Pulse follows target bottom rather than terrain raycast.
- Configuration changes rebuild effects; bounds are evaluated per frame. Intended
  for modest effect counts, not yet benchmarked for large/skinned scenes.
- Missing targets remain in configuration, are skipped, and appear in runtime
  diagnostics as unresolved. No visual-rule system is implemented.
- A future template/rule layer can compose EffectInstance arrays and call
  EffectRuntime.setEffects. Keep transient rule activation separate from saved
  Editor configuration; do not write runtime values into history or SceneDocument.
