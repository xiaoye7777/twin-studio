# @twin-studio/viewer 0.5.0

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

可选属性（0.4.0 起）：`quality`（`'auto' | 'low' | 'medium' | 'high'`，默认 `auto`，按设备性能和屏幕分辨率自适应）、`idle-seconds`（覆盖项目里的无人值守空闲时间）、`captions`（是否显示导览字幕，默认 `true`）。

## 大屏联动（0.4.0 起）

场景 → 大屏（事件）：

| 事件 | 时机 |
| --- | --- |
| `selection-change` / `device-click` / `interaction-event` | 与此前相同 |
| `tour-change` | 导览开始、换步、暂停、结束；带当前步骤和字幕 |
| `alarm-change` | 告警规则触发或解除；带设备、变量和当前值 |
| `hover-change` | 鼠标移入 / 移出对象 |

大屏 → 场景（`ref` 上的方法）：

```ts
viewer.value?.getBookmarks()               // 编辑器中保存的视角
viewer.value?.flyToBookmark(id)            // 飞到视角
viewer.value?.resetView()                  // 回到初始视角
viewer.value?.getTours()                   // 导览列表
viewer.value?.playTour(id)                 // 播放；pauseTour / resumeTour / stopTour / nextTourStep / previousTourStep
viewer.value?.getNodes()                   // 场景对象（分组可当作图层）
viewer.value?.setNodeVisible(id, false)    // 显示 / 隐藏图层，不修改项目
viewer.value?.getAlarms()                  // 当前告警
viewer.value?.setQuality('medium')         // 画质
viewer.value?.getPerformance()             // 帧率、当前档位
viewer.value?.screenshot()                 // 当前画面 PNG
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

### 0.5.0

- **模型动画**：自动播放模型自带的动画片段（编辑器里可选片段、速度、循环）；风机叶片等部件可以旋转，转速可跟随实时数据（例如 `rotorSpeed`）。
- **标签防遮挡**：文字标签、数据标牌、告警标牌重叠时自动错开或淡出，告警优先显示。
- **部件材质**：编辑器里给模型或其中部件设置的颜色、透明度（如玻璃、透视效果）、金属度、自发光会在大屏中呈现。绑定在部件上的设备，单击该部件即可选中（`selection-change` 中 `bindingTarget.type` 为 `asset-node`）。
- **压缩模型**：支持 Draco 网格压缩和 KTX2 贴图。解码器已打包在 SDK 内，只在项目用到时按需加载（`dist/` 下多了两个按需加载的文件，宿主的构建工具会自动处理），不依赖 CDN，离线可用。
- **表面图案**：基本体和区域可以带图案（科技网格、地砖、斜纹、草坪、沥青、流动的水面），贴图在本地生成，不增加项目包体积。
- **镜头范围**：项目可开启「限制镜头」（编辑器 → 放映），观众拖动、缩放时不会把场景拖丢、拉得太远或钻到地面以下，保存的视角和导览始终可达。
- 接口和事件没有变化，替换 tgz 即可。0.4.0 也能打开新的项目包，只是模型不会动，部件材质、表面图案和镜头范围不生效。

### 0.4.0

- **需要升级**：编辑器从此导出场景格式 v2 的项目包，0.3.x 打不开（会提示升级 SDK）。0.4.0 同时兼容旧的 v1 项目包。
- **全新渲染引擎**：阴影、泛光、抗锯齿、真实天空与昼夜、雨雪；画质自动适配设备，帧率不足时自动降低渲染分辨率；WebGL 上下文丢失后自动恢复。SDK 体积从约 397 KB 降到约 220 KB（gzip）。
- **任意屏幕比例**：编辑器保存的视角记录了构图比例，窄屏自动拉远保证画面完整，超宽屏展示更多两侧内容；导览字幕随屏幕大小缩放。
- **新内容**：能流线、区域、文字标签、灯光；扩散波纹、雷达、电子围栏、光柱、数据标牌、定位图标特效；选中对象有描边。
- **导览与无人值守**：项目可配置自动导览，大屏空闲指定秒数后自动循环播放，有人操作立即停止。
- **新增事件与 API**（见上方「大屏联动」），全部为新增，原有接口和事件不变。
- `LoadedTwinPackage.document` 现在是 v2 场景（`SceneDocumentV2`）；旧版包会自动升级。
- 连接建立后会向数据网关发送一条可选的订阅消息（`{"type":"subscribe","devices":[…]}`），不需要的网关忽略即可。

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
