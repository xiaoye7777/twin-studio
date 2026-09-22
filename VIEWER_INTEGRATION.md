# TwinSceneViewer 接入说明

## 1. Viewer 是什么

`TwinSceneViewer` 根据 `projectId` 恢复已保存的 SceneDocument、模型、相机、Binding、Rule 和 Effect，并运行实时数据源。宿主页面只需了解设备 ID、稳定业务 Target 和下面的公共类型，无需操作 Three.js / Meteor3D。

组件：`src/components/twin/TwinSceneViewer.vue`。公共类型：`src/components/twin/viewerContract.ts`。

## 2. 最小接入示例

```vue
<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import TwinSceneViewer from '@/components/twin/TwinSceneViewer.vue'
import type {
  TwinSceneViewerPublicApi, ViewerInteractionEvent, ViewerSelection, ViewerRuntimeState,
} from '@/components/twin/viewerContract'

const props = defineProps<{ projectId: string }>()
const viewerRef = ref<TwinSceneViewerPublicApi | null>(null)
const runtime = shallowRef<ViewerRuntimeState | null>(null)
const selectedDeviceId = ref<string | null>(null)

function handleSelection(selection: ViewerSelection) {
  selectedDeviceId.value = selection?.deviceId ?? null
}
function handleLoaded() {
  runtime.value = viewerRef.value?.getRuntimeState() ?? null
}
function handleInteraction(event: ViewerInteractionEvent) {
  if (event.eventName === 'open-device-detail') {
    // 由 Dashboard 决定打开抽屉、切换图表或跳转；Viewer 不控制宿主 UI。
    console.info(event.deviceId, event.metadata)
  }
}
async function chooseDevice(deviceId: string) {
  if (viewerRef.value?.selectDevice(deviceId)) {
    await viewerRef.value.focusDevice(deviceId)
  }
}
watch(() => props.projectId, () => {
  runtime.value = null
  selectedDeviceId.value = null
})

// 同一 deviceId 可有多个 Binding；变量通过 bindingId + key 查询，避免混淆。
const variables = computed(() => {
  const state = runtime.value
  if (!state || selectedDeviceId.value === null) return []
  return state.bindings
    .filter(binding => binding.device.id === selectedDeviceId.value)
    .flatMap(binding => binding.variables.map(definition => ({
      id: `${binding.id}:${definition.key}`,
      name: definition.name,
      unit: definition.unit,
      value: state.getRuntimeValue(binding.id, definition.key)?.value,
    })))
})
</script>

<template>
  <div style="height: 600px; position: relative">
    <TwinSceneViewer
      ref="viewerRef"
      :project-id="props.projectId"
      @loaded="handleLoaded"
      @selection-change="handleSelection"
      @interaction-event="handleInteraction"
      @error="message => console.error(message)"
    />
  </div>
  <button @click="chooseDevice('ESS-002')">定位 ESS-002</button>
  <div v-for="variable in variables" :key="variable.id">
    {{ variable.name }}：{{ variable.value ?? '—' }} {{ variable.unit }}
  </div>
</template>
```

容器必须有实际高度。Viewer 自动观察尺寸变化。先在 Editor 保存项目，收到 `loaded` 后再读取数据、选择或聚焦。

## 3. Viewer → Dashboard 事件

主要选择事件：`selection-change`，参数是 `ViewerSelection`：

```ts
type ViewerSelection = Readonly<{
  target: Readonly<TwinBindingTarget>
  bindingTarget: Readonly<TwinBindingTarget> | null
  bindingId: string | null
  deviceId: string | null
  deviceName: string | null
}> | null
```

- 点击设备：`target` 是实际点击的业务节点；`bindingTarget` 是最近祖先（含自身）的绑定节点，包含设备信息。
- 点击无 Binding 的业务对象：`target` 有值，设备相关字段为 `null`。
- 点击空白（包括非业务网格、地面）：整个 payload 为 `null`。
- 拖动相机不会产生点击选择。相同选择不重复发送。Host 调用选择 API 也触发这个事件。

其他事件：

| 事件 | 参数 | 用途 |
| --- | --- | --- |
| `loaded` | `{ projectId, objectCount, bindingCount, warnings: string[] }` | 场景与数据已启动；warnings 表示可恢复的问题 |
| `error` | `string` | 加载失败 |
| `target-click` | `{ target, bindingTarget?, bindingId?, device? }` | 兼容旧调用；只在真实业务对象点击时发送 |
| `device-click` | 同上，含 `device: { id, name, type? }` | 兼容旧调用；只在点击解析到设备时发送 |
| `interaction-event` | `ViewerInteractionEvent` | Scene Interaction 的 `emit-event` Action 发出的业务事件 |

新宿主优先监听 `selection-change`。兼容点击事件可重复发送，但不会重复发送相同 selection。公共事件不包含 Object3D、uuid、BID、相机或内部 Store。

`interaction-event` 是配置驱动的宿主业务事件：

```ts
interface ViewerInteractionEvent {
  eventName: string
  interactionId: string
  trigger: 'click' | 'double-click' | 'hover-enter' | 'hover-leave'
  sourceTarget: Readonly<TwinBindingTarget>
  triggerTarget: Readonly<TwinBindingTarget>
  actionTarget: Readonly<TwinBindingTarget>
  deviceId: string | null
  metadata: Readonly<Record<string, JSONValue>>
}
```

其中 `metadata` 来自 Editor 中保存的 JSON 配置，`deviceId` 解析自 Interaction 配置的 `sourceTarget` Binding。Host 必须按 `eventName` 白名单处理；它不是脚本，不会执行任意 JavaScript。Interaction 还支持 `select`、`clear-selection`、`focus`、`show`、`hide` 和 Hover `highlight`。`show/hide/highlight` 仅改变当前 Runtime，不写回 SceneDocument。

## 4. Dashboard → Viewer API

使用 `ref<TwinSceneViewerPublicApi | null>` 获取类型提示。

| 方法 | 返回值 | 语义 |
| --- | --- | --- |
| `focusDevice(deviceId)` | `Promise<boolean>` | 聚焦该设备第一个可解析 Binding，不改变选择 |
| `focusTarget(target)` | `Promise<boolean>` | 聚焦指定稳定 Target，不改变选择 |
| `selectDevice(deviceId)` | `boolean` | 选择设备第一个可解析 Binding；不移动相机 |
| `selectTarget(target)` | `boolean` | 选择目标，并解析最近祖先 Binding；不移动相机 |
| `clearSelection()` | `void` | 清空选择；已为空时不再通知 |
| `getSelection()` | `ViewerSelection` | 冻结的稳定身份快照；初始/清空后为 null |
| `getRuntimeState()` | `ViewerRuntimeState \| null` | 当前 session 的只读响应式视图 |

```ts
viewerRef.value?.selectTarget({ type: 'primitive', nodeId: 'node_xxx' })
await viewerRef.value?.focusTarget({
  type: 'asset-node', instanceId: 'instance_xxx', assetNodeId: 'node_path',
})
viewerRef.value?.clearSelection()
const selection = viewerRef.value?.getSelection() ?? null
```

不存在、未解析、未就绪或已销毁的对象返回 `false`，保留原选择。`true` 表示目标已解析并接受操作，包括重复选择同一目标。选择是业务状态，本阶段不增加选择描边，不覆盖用户配置的 Rule/Effect。

## 5. Runtime Data

`getRuntimeState()` 在同一 session 中返回相同的只读响应式对象；它通过 getter 读取原 Twin Runtime，无独立 Device/RuntimeValue Store。字段包括 `projectId`、`bindings`、`runtimeValues`、`resolutionByBindingId`、三类 revision、`mockRunning` 和 `mockTickCount`。

查询：`state.getRuntimeValue(bindingId, variableKey)` 返回只读 `{ bindingId, variableKey, value, updatedAt }` 或 `null`。定义来自 `binding.variables`，设备来自 `binding.device`。上面的 `variables` computed 可直接随数据变化更新 UI。

不要启动第二份 MockDataSource，也不要修改返回数据。公共视图不提供 set/reset/start/stop 方法。重载/切换项目后须在新的 `loaded` 中重新取得视图；旧视图在 dispose 后被清空，不再更新。组件内的 watch/computed 会随 Vue 卸载清理；宿主自行创建的外部订阅须自行停止。

## 6. 典型双向联动

3D 点击 ESS-001 → `selection-change` → 宿主更新 `selectedDeviceId` → 图表/表格切换设备。

宿主点击 ESS-002 → `selectDevice('ESS-002')` → 同一个选择事件更新宿主 → `focusDevice('ESS-002')` 移动相机。

事件处理函数只更新 UI 状态即可，不必再调用选择 API。即使重复调用相同 Target，Viewer 也不会重复通知。设备根节点与子节点是不同 Target，切换它们会产生一次真实状态变化。

## 7. 全场 / 单设备上下文

`selectedDeviceId === null` 时宿主展示全场聚合上下文；非 null 时展示指定设备。未绑定对象可以有 Target selection，但仍处于无设备上下文。Viewer 不决定 KPI、表格或图表内容。

## 8. 注意事项

- Dashboard 业务身份使用 `deviceId` / `TwinBindingTarget`。禁止使用 Three uuid、Meteor BID 或 Object3D 作为业务主键。
- Target：资产根节点用 `{ type: 'asset-instance', instanceId }`；子节点用 `{ type: 'asset-node', instanceId, assetNodeId }`；Primitive 用 `{ type: 'primitive', nodeId }`。
- RuntimeValue 与 selection 都是运行态，不写回 SceneDocument，不进入 History/Dirty。
- Interaction 配置保存在 SceneDocument；Interaction 触发状态、Hover 高亮和运行时显隐不保存。无配置时仍保持“单击选择、空白清除”的默认行为。
- 单击 Action 会等待短暂的双击判定窗口；识别为双击后只执行 `double-click` Action，不再执行前置 `click` Action。
- 切换同一个组件的 projectId 会清空选择并通知 null（若原先非空）；卸载静默销毁，不再发送选择事件。Host 使用 `:key` 重新挂载时应在自身项目切换逻辑中清空 UI。
- `getRuntimeObject` / `getRuleDiagnostics` 为已有开发诊断入口，保留兼容但不属于 `TwinSceneViewerPublicApi`，业务宿主不要依赖。

## 9. 当前限制

当前使用本浏览器 SceneRepository / IndexedDB Assets 和 MockDataSource，无历史时序数据。API 面向同一个 Vue 应用的组件引用，尚无 iframe/postMessage SDK。多个 Binding 可指向同一 deviceId；设备级 select/focus 按存档顺序取第一个可解析目标，精确定位请使用 Target API。Selection 提供业务状态与事件，暂不额外创建视觉高亮。Interaction 第一版仅支持单个 Trigger → 单个 Action，不包含条件表达式、动作链或任意脚本。
