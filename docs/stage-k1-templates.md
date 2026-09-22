# Stage K1 — Effect templates

## Data and ownership

`EffectTemplate` is a versioned local resource, not a runtime effect:

```json
{
  "version": 1,
  "id": "template_example",
  "origin": "local",
  "name": "Device warning",
  "description": "Reusable visual configuration",
  "category": "告警",
  "effects": [{
    "id": "atom_example",
    "kind": "child-highlight",
    "target": { "mode": "asset-node", "assetNodeId": "legacy:root/0/1" },
    "parameters": {
      "color": "#ff3030", "opacity": 0.65, "speed": 1,
      "padding": 0.2, "text": "设备标注"
    }
  }]
}
```

The ordered atom array contains no concrete instanceId/nodeId, Three object,
UUID, BID, or runtime animation state. It reuses Stage J's EffectKind,
EffectParameters, defaults, validation and EffectDefinition.fields. Both the
existing Inspector and template editor now use EffectParameterFields.

LocalTemplateRepository implements list/get/save/remove. Local user templates
are stored under `digital-twin-studio:effect-templates:v1` in localStorage and
shared across projects on the same origin. This matches reusable resources better
than embedding them in a scene. Built-in templates are supplied by code, have
reserved `builtin:` IDs and are protected in both UI and repository. Copy creates
an independent local template. There is no account/backend or resource history.
Storage failures are surfaced; corrupt data is not silently overwritten.

## Expansion and history

`instantiateTemplate(template, target, targetExists)` is a pure domain function:

- current-target: clone the selected stable target (including Primitive).
- root-instance: use the selected root/child's instanceId; Primitive is rejected.
- asset-node: combine selected instanceId with template assetNodeId.

Editor's prepareTemplateApplication supplies an existence check from current
scene roots, including deleted-node state. Missing targets and duplicate resolved
target/kind pairs reject the entire application before any scene mutation.

Each atom expands to a normal EffectInstance with a new id and optional scalar
sourceTemplateId. Provenance is informational only: template edits/deletion never
change applied effects. EffectRuntime is unchanged and does not import templates.

effectsStore.applyBatch replaces existing effects for each target/kind pair,
preserves unrelated effects and submits one existing FunctionalCommand snapshot.
One Undo restores the full pre-application state (including replaced effects),
one Redo restores the same generated IDs. Template resource editing never enters
Scene History or marks a scene dirty. Existing target deletion/undo and effect
editing remain Stage J operations.

SceneDocumentV1 still saves only `effects`; sourceTemplateId is optional and
backward compatible. Viewer reads those instances without a TemplateRepository,
so an absent/deleted/corrupt template resource cannot break saved scene playback.

## UI

Bottom resource area → 模板. Cards offer 应用, 查看/编辑, 复制, 删除; built-ins
are read-only. 新建模板 opens a draft editor with name, description, category,
ordered effect atoms, relative targets, shared parameter controls, add/remove,
move up/down, save/cancel. Saving a draft does not affect the 3D scene. Select a
scene object then click 应用 to commit all generated effects together.

## Verification

`tests/stage-k1-templates.mjs` extends the actual Chrome Stage I/J harness. Run
Vite on :5173, then `node tests/stage-i-viewer.mjs` with Playwright available via
NODE_PATH (CHROME_PATH may override the Chrome executable).

Coverage: built-in read-only and repository guard; UI create/edit/copy/delete;
parameters and reload; resources do not dirty Scene or add history; four-atom
application and conflict replacement; exact snapshot Undo/Redo; relative root
from a child and asset-node across two uploaded GLB instances; independent
materials; Primitive application and incompatible-selector rejection; missing
node and duplicate rejection; resource edits/deletion do not synchronize scene;
Delete Object/Undo; cross-project resources with isolated scene effects; saved
scene Viewer playback with deliberately corrupt template storage and no template
module request. Existing Stage I/J scene, binding, Mock, camera, effect and
three-cycle lifecycle tests remain in the same run.

## Limits and future entry

- Outline remains Meteor3D's shared amber style, explicitly indicated in UI.
- assetNodeId is entered manually and must match the asset structure; cross-asset
  semantic matching and node pickers are not implemented. No partial application.
- One atom per resolved target/kind. Parameter defaults include inactive fields
  for compatibility with Stage J; only applicable fields are rendered.
- Browser-local resources are not account-synced, exported, or multi-tab live
  synchronized. Scene History does not undo resource edits.
- No new RAF, timer, or runtime resource owner is added. Stage J owns all effects.
- Future rules should use TemplateRepository.get and instantiateTemplate, then
  feed transient instances to EffectRuntime separately from saved Scene effects.
  No rule evaluation/template auto-sync is implemented in K1.

## Changed files

- domain/effectTemplates/index.ts, builtins.ts
- infrastructure/effectTemplates/TemplateRepository.ts
- stores/effectTemplates.ts, stores/effects.ts
- editor/services/applyEffectTemplate.ts
- components/editor/EffectTemplateLibrary.vue, EffectParameterFields.vue
- components/editor/EditorResourcePanel.vue, EffectInspector.vue
- domain/effects/index.ts (shared validation/defaults, optional provenance)
- tests/stage-k1-templates.mjs, tests/stage-i-viewer.mjs
- docs/stage-k1-templates.md

No Scene schema version change, Viewer/EffectRuntime/Core rewrite, backend,
VisualRuleEngine or decorative effect implementation.
