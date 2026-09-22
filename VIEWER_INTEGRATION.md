# TwinSceneViewer SDK 接入说明

`@twin-studio/viewer` 是独立 Vue 3 Viewer SDK。它直接加载 Twin Studio 导出的 `.twin.zip`，恢复 SceneDocument、GLB/HDR、Binding、Mock RuntimeValue、Effect、Visual Rule 和 Interaction。Dashboard 不需要 Editor 的 Store、Repository 或源码，也不需要了解 Three.js / Meteor3D 内部对象。

## 1. 安装

当前离线交付包：

```text
/Users/xiaoye/codexfolder/twin-viewer-sdk/twin-studio-viewer-0.1.0.tgz
```

把 tgz 放入 Dashboard 的 `vendor/` 后安装：

```bash
pnpm add ./vendor/twin-studio-viewer-0.1.0.tgz
```

Dashboard 需要安装 SDK 的 peer dependencies：`vue@^3.5` 与 `three@0.184.0`。Meteor3D、ZIP Loader 和 Runtime 已打进 SDK，不会再请求本地 Meteor3D package。请通过 Vite `resolve.dedupe: ['three', 'vue']` 保证单实例。

## 2. 最小 Vue 3 接入

把 Editor 导出的项目包放在 `public/demo.twin.zip`：

```vue
<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import {
  TwinSceneViewer,
  type TwinSceneViewerPublicApi,
  type ViewerRuntimeState,
  type ViewerSelection,
  type ViewerInteractionEvent,
} from '@twin-studio/viewer'
import '@twin-studio/viewer/style.css'

const viewerRef = ref<TwinSceneViewerPublicApi | null>(null)
const runtime = shallowRef<ViewerRuntimeState | null>(null)
const selectedDeviceId = ref<string | null>(null)

function handleLoaded() { runtime.value = viewerRef.value?.getRuntimeState() ?? null }
function handleSelection(selection: ViewerSelection) { selectedDeviceId.value = selection?.deviceId ?? null }
function handleInteraction(event: ViewerInteractionEvent) {
  if (event.eventName === 'open-device-detail') console.info(event.deviceId, event.metadata)
}
async function chooseDevice(deviceId: string) {
  if (viewerRef.value?.selectDevice(deviceId)) await viewerRef.value.focusDevice(deviceId)
}
</script>

<template>
  <div style="height: 600px">
    <TwinSceneViewer ref="viewerRef" source="/demo.twin.zip" @loaded="handleLoaded"
      @selection-change="handleSelection" @interaction-event="handleInteraction" />
  </div>
  <button @click="chooseDevice('ESS-002')">定位 ESS-002</button>
</template>
```

Viewer 容器必须有实际高度。`source` 支持 URL 字符串、`URL`、`Blob`、`ArrayBuffer` 和 `Uint8Array`。切换 `source` 会先 dispose 旧 Runtime 与 Object URL，再加载新项目。

## 3. Portable Package Loader

组件内部使用同一个公开 Loader，也可以单独做预检：

```ts
import { loadTwinPackage } from '@twin-studio/viewer'
const portable = await loadTwinPackage(fileOrUrl)
console.log(portable.projectId, portable.projectName, portable.document)
portable.dispose()
```

Loader 使用 Stage O 的 Package Format v1，不重新定义格式；它校验 manifest、SceneDocument、SHA-256、资产依赖、GLB/HDR 和 ZIP 路径。运行时资产保存在内存 Blob Repository 中，Viewer dispose 时回收全部 Object URL。

## 4. Viewer → Dashboard

- `selection-change`：点击设备返回稳定 `deviceId` / `TwinBindingTarget`；点击无绑定对象时 `deviceId` 为 null；点击空白时 payload 为 null。
- `interaction-event`：Interaction 的 `emit-event` Action，包含 `eventName`、稳定 Target、`deviceId` 和 JSON metadata。
- `loaded`：项目包与 Runtime 已就绪，随后可读取 Runtime State。
- `error`：下载、校验或运行失败信息。

兼容事件 `target-click` / `device-click` 仍保留。Dashboard 收到 selection 后只更新 UI，不必再次调用选择方法，避免事件回环。

## 5. Dashboard → Viewer

| API | 作用 |
| --- | --- |
| `selectDevice(deviceId)` | 选择设备，不移动相机 |
| `focusDevice(deviceId)` | 聚焦设备，不改变选择 |
| `selectTarget(target)` | 使用稳定 Target 选择对象 |
| `focusTarget(target)` | 使用稳定 Target 聚焦对象 |
| `clearSelection()` | 回到全场上下文 |
| `getSelection()` | 当前稳定选择快照 |
| `getRuntimeState()` | 当前只读响应式 Runtime |

常用组合：先 `selectDevice()`，成功后再 `focusDevice()`。不存在或未解析的目标返回 `false`。

## 6. Runtime Data

`getRuntimeState()` 是 Viewer 内唯一实时数据源，包含 `bindings`、`runtimeValues`、`resolutionByBindingId`、`mockRunning`、`mockTickCount` 和 `getRuntimeValue()`。

```ts
const state = viewerRef.value?.getRuntimeState()
const binding = state?.bindings.find(item => item.device.id === selectedDeviceId.value)
const soc = binding ? state?.getRuntimeValue(binding.id, 'soc')?.value : undefined
```

不要在 Dashboard 创建第二个 MockDataSource，也不要把 RuntimeValue 写回 SceneDocument。

## 7. 生命周期

组件卸载、`source` 切换或加载中止时，SDK 会停止 MockDataSource 和 Rule/Interaction Runtime，移除 Pointer Listener、停止 RAF、释放 Three 资源并 revoke GLB/HDR Object URL。宿主只需按普通 Vue 组件挂载与卸载。

## 8. 业务身份边界

Dashboard 只使用 `deviceId`、`TwinBindingTarget`、`bindingId + variableKey`。不要使用 Object3D、Three uuid 或 Meteor BID，也不要从 SDK 内部 Scene 查找对象。

## 9. Reference Dashboard Demo

完整独立参考工程：

```text
/Users/xiaoye/codexfolder/dashboard-viewer-demo
```

重点文件：

- `src/App.vue`：Viewer 放入大屏、事件监听与设备列表联动。
- `src/useTwinDashboard.ts`：Viewer Contract、Runtime State 和 KPI 投影。
- `public/zero-carbon-demo.twin.zip`：可直接运行的园区项目包。
- `vendor/twin-studio-viewer-0.1.0.tgz`：真实安装的 SDK 包。

运行 `pnpm install && pnpm dev`。当前数据源仍为 MockDataSource；无历史时序数据，也未提供 iframe/postMessage。
