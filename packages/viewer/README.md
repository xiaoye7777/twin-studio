# @twin-studio/viewer 0.3.1

Vue 3 项目运行组件。支持 Node 20.16+ 和 pnpm 10.20.0；加载 Editor 导出的 .twin.zip，恢复模型、绑定、实时数据、规则、特效和交互。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { TwinSceneViewer, type TwinSceneViewerPublicApi } from '@twin-studio/viewer'
import '@twin-studio/viewer/style.css'
const viewer = ref<TwinSceneViewerPublicApi | null>(null)
</script>
<template>
  <TwinSceneViewer ref="viewer" source="/project.twin.zip" />
</template>
```

## 项目数据源

在 Editor 的“场景设置 → 项目数据源”配置并保存。项目包 scene.json 携带配置：

```json
{"dataSources":[{"id":"realtime","name":"实时设备数据","type":"websocket","enabled":true,"url":"ws://127.0.0.1:8787/realtime"}]}
```

Viewer 自动读取配置并启动连接。宿主不传连接 URL，不解析消息，不另建 Mock 或 Runtime Store。0.2.0 移除了旧版 dataSource prop / setDataSource()；迁移时把配置移入项目。

**实时值只来自 WebSocket。** 连接未建立、断开或出错时，Runtime State 中没有任何实时值（`runtimeValues` 为空，`getRuntimeValue()` 返回 null），规则特效也会停止；页面上看到数值在变化，就说明 WebSocket 连接正常。SDK 内不包含任何模拟数据。

`dataSourceStatus` 取值：

| 值 | 含义 |
| --- | --- |
| `unconfigured` | 项目包没有启用的 WebSocket 数据源（缺少 dataSources、空数组、全部禁用或旧版 mock 配置），不会产生数据 |
| `connecting` | 正在连接或断线重连中（1s → 2s → 4s … 最长 10s 退避） |
| `connected` | 已连接，数据来自该连接 |
| `disconnected` / `error` | 连接不可用，实时值已清空，`dataSourceError` 给出原因 |

建议大屏把 `dataSourceStatus !== 'connected'` 明确展示给用户，并在没有值时显示“—”。最多启用一个数据源，不做鉴权。配置不应包含密码、Token 等秘密；URL 中用户名密码会被拒绝。部署时需保证 URL 对浏览器可达，HTTPS 宿主使用 wss。

消息接受单个对象或数组：
```json
{"deviceId":"ESS-003","soc":72,"temperature":75,"power":108,"alarm":true,"status":"running"}
```
也支持将变量放在 values 对象中。按 deviceId 定位所有对应绑定，按变量 key/dataType 校验并写入同一 RuntimeValue。未知设备/字段和不匹配类型忽略。实时值不保存到场景。

宿主通过 getRuntimeState() 读取只读响应式数据，包括 dataSourceType、dataSourceStatus、dataSourceMessageCount、dataSourceError；通过 getDiagnostics() 查看规则和特效计数。selection-change、interaction-event 以及 selectDevice/focusDevice 等 API 保持不变。

切换 source 或卸载组件会关闭旧连接并清理场景资源。演示和开发时可使用 monorepo 中的设备模拟器 `tools/device-simulator` 作为 WebSocket 服务。

## 更新记录

### 0.3.1

- **格式版本检查**：项目包由更新版本的编辑器导出时，`error` 事件和加载提示会明确说明“场景文件格式为 vN，当前程序只支持到 vM，请升级 Viewer SDK”，不再笼统地提示“损坏”。
- **更清晰的错误信息**：项目包内容有误时，提示会指出具体位置，例如 `effects[3].parameters.opacity：数值过大：期望 number <=1`。
- 新增导出常量 `SCENE_DOCUMENT_VERSION`，表示当前 SDK 支持的最新场景格式版本。
- 接口和事件没有变化，升级无需修改代码。项目包格式的完整说明见仓库 `docs/schema/`。

### 0.3.0

- **移除内置模拟数据**：实时值只来自项目配置的 WebSocket。缺少数据源配置的旧项目包不再自动使用 Mock，而是 `dataSourceStatus: 'unconfigured'` 且没有任何数据。
- 连接断开或出错时立即清空实时值，避免展示过期数据；断线后自动重连。
- `DataSourceConnectionStatus` 新增 `'unconfigured'`。若宿主代码对状态做了穷举判断，需要补上这一分支。
- 旧包迁移：在 Editor 的“场景设置 → 项目数据源”填写 WebSocket 地址并保存，再重新导出。

### 0.2.1

- 包体积从约 2.2 MB 降到约 0.37 MB：移除了 Viewer 用不到的 Gaussian Splat 渲染库（项目包只包含 GLB/HDR）。
- 内部改为与 Editor 共享同一份运行时代码，同一项目包的渲染、数据、规则、特效与交互行为与 Editor 预览一致。
- 公开 API、事件、类型与 0.2.0 相同，升级无需修改代码：替换 tgz 后重新执行 `pnpm add ./vendor/twin-studio-viewer-0.2.1.tgz`。
