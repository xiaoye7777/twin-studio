# Stage K2 — Visual rules

## Saved domain

SceneDocumentV1 adds optional `visualRules`. Old documents still load. Each rule
contains a stable target, bindingId, variableKey, typed condition, enabled flag,
integer priority (0–100), and a complete independent EffectTemplate snapshot:

```text
{
  id: "visualRule_...",
  bindingId: "binding_ESS-001",
  target: { type: "asset-instance", instanceId: "instance_..." },
  variableKey: "temperature",
  condition: { dataType: "number", operator: ">", value: 60 },
  enabled: true,
  priority: 20,
  template: { version: 1, id: "builtin:critical", origin: "builtin",
              name: "严重告警", description: "...", category: "告警",
              effects: [ /* K1 relative atoms and their parameters */ ] }
}
```

No uuid/BID business key, current value, active state, generated effect, or
animation phase is saved. `effects` remains manual persistent configuration.
Template edits/deletion do not update snapshots. Editing a rule defaults to
keeping its snapshot; explicitly selecting a library template replaces it.
Viewer imports pure template expansion but never TemplateRepository/store/UI.
A missing snapshot can be represented as null and becomes unresolved; malformed
rule structures are rejected by the existing scene validator.

## Shared runtime

Both Editor and TwinSceneRuntime compose the same VisualRuleRuntime with:

- the existing TwinRuntimeState and its runtimeRevision/bindings/source status;
- BindingTargetResolver for stable target resolution;
- saved rule configuration and separate manual effect configuration getters;
- the existing EffectRuntime.

One Vue watch per runtime responds to state changes, not a timer per rule. It is
explicitly stopped on dispose. Mock still uses one 1000 ms timer; demo numeric
ranges now include SOC 10–90 and temperature 25–75 so the example conditions can
actually transition. Boolean/string values retain their existing generation.

Condition comparison is typed, strict, and finite for numbers. Numbers support
>, >=, <, <=, ==, !=; boolean/string support == and !=. No coercion or eval.
Missing binding/target/variable/value/snapshot or incompatible variable type
becomes unresolved, with a diagnostic reason. Disabled rules are disabled;
stopping the source deactivates generated effects and reports stopped. No stale
value TTL is implemented.

false→true expands the embedded recipe with K1 instantiateTemplate and stores
transient instances in a per-rule map. true→true reuses them. true→false removes
only that map entry. False rules do nothing. Relative selectors are checked
against current runtime objects, including missing/deleted children.

## Ownership and conflict

Transient IDs are namespaced by rule ID and atom index. A composition pass merges
manual effects and active rule effects without modifying either configuration.
The channel is (stable target, effect kind):

1. Rules override manual effects in the same channel while active.
2. Higher priority wins among rules; equal priority uses lexically smallest ID.
3. Other channels coexist. A suppressed active rule remains active, with zero or
   fewer visibleEffects in diagnostics. It resumes when the winner exits.
4. On rule exit, the next rule or original manual effect reappears unchanged.

This is per-channel, not an all-or-nothing template priority. Existing highlight
parent/child specificity still applies across different targets. Outline retains
Meteor3D's one shared amber style. No scheduling, scope, debounce or hysteresis.

EffectRuntime still only understands EffectInstance. Its small reconciliation
extension reuses unchanged helpers/material clones, disposes removed/changed
resources, and maintains its single animation loop. Unchanged data evaluations
do not call setEffects. This avoids recreation of still-active effects when
another rule changes. Core remains unmodified.

## Editor and lifecycle

Inspector → 数字孪生 binding → 可视化规则 → 添加规则: variable, operator,
threshold, template, priority. List supports edit, enable/disable, delete and
runtime status/count/reason. No Rule UI is mounted in Viewer.

Rule edits use the existing FunctionalCommand snapshots and mark dirty. Runtime
diagnostics are separate shallow state; automatic activation changes neither
history nor dirty. Delete Object captures/removes related rule configurations
and restores them on Undo with the object/binding. Unbinding keeps the rule as
unresolved (visible and editable/removable), and immediately clears its temporary
effects. Deleting a relative child deactivates recipes needing that child.

The adapter clears Core outlines before unregistering a removed subtree, because
Core disableOutline(bid) cannot resolve it afterwards. Re-registration refreshes
outlines on surviving objects. No Core patch or new postprocessing system.

Dispose stops the rule subscription before data/effect/scene cleanup. The rule
layer adds no RAF, timers, geometry or event listeners of its own.

## Diagnostics and tests

Per-rule diagnostics expose status, reason, generated effects and visible effects.
Runtime diagnostics expose activeRules and activation count; module diagnostics
count active subscriptions. Viewer exposes getRuleDiagnostics for integration
and development inspection without EditorStore.

`tests/stage-k2-rules.mjs` extends the existing Chrome harness. Run a fresh Vite
server and `tests/stage-i-viewer.mjs` with Playwright in NODE_PATH; TEST_BASE_URL
can choose the port. A fresh server avoids test-only dynamic import diagnostics
being duplicated by old Vite HMR timestamps.

Coverage includes UI configuration/edit/toggle/delete; numeric/boolean/string
conditions; numeric operator and no-coercion checks; repeated active state helper
identity; priority fallback; manual state preservation; no runtime dirty/history;
delete/unbind cleanup and Undo; project save/reload; actual Mock timer ticks
crossing thresholds (randomness controlled only in isolated test browser);
Viewer with corrupt external template storage; unresolved references; source
stopped state; three Viewer mount/unmount cycles with zero remaining rule
subscriptions/RAF/URLs. Stage I/J/K1 browser regression runs first, including
three Editor cycles and shared-material/resource disposal checks.

## Files and future boundary

- domain/visualRules/index.ts: types, validation, evaluator, snapshots
- runtime/effects/VisualRuleRuntime.ts: transitions, ownership, composition
- stores/visualRules.ts and components/editor/VisualRuleSection.vue: editing
- domain/scene/*: optional persistence field
- ThreeViewport.vue / TwinSceneRuntime.ts: shared runtime lifecycle
- EffectRuntime.ts: incremental resource reconciliation
- MeteorScene.ts: safe Outline teardown before unregister
- MockDataSource.ts: demo threshold-crossing ranges
- TwinSceneViewer.vue: diagnostic API; InspectorPanel.vue: section
- tests/stage-k2-rules.mjs and existing harness, K1 dependency assertion

Next useful step: profile many rules/effects and improve value freshness/status
handling before adding richer conditions. Keep future source integrations behind
TwinRuntimeState, rule compilation behind the pure domain evaluator/recipe
expansion, and all visual resource creation inside EffectRuntime. K2 adds no
scope/rule chains, real protocol sources, interaction actions or dashboards.
