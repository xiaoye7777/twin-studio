# @twin-studio/viewer 0.2.1

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

缺少 dataSources 的旧包默认使用 Mock；空数组或全部禁用表示停止采集。第一版最多启用一个数据源，不做重连和鉴权。配置不应包含密码、Token 等秘密；URL 中用户名密码会被拒绝。部署时需保证 URL 对浏览器可达，HTTPS 宿主使用 wss。

消息接受单个对象或数组：
```json
{"deviceId":"ESS-003","soc":72,"temperature":75,"power":108,"alarm":true,"status":"running"}
```
也支持将变量放在 values 对象中。按 deviceId 定位所有对应绑定，按变量 key/dataType 校验并写入同一 RuntimeValue。未知设备/字段和不匹配类型忽略。实时值不保存到场景。

宿主通过 getRuntimeState() 读取只读响应式数据，包括 dataSourceType、dataSourceStatus、dataSourceMessageCount、dataSourceError；通过 getDiagnostics() 查看规则和特效计数。selection-change、interaction-event 以及 selectDevice/focusDevice 等 API 保持不变。

切换 source 或卸载组件会关闭旧连接、停止 Mock，并清理场景资源。SDK 不依赖测试 server；server 只是 demo 的外部数据服务。

## 更新记录

### 0.2.1

- 包体积从约 2.2 MB 降到约 0.37 MB：移除了 Viewer 用不到的 Gaussian Splat 渲染库（项目包只包含 GLB/HDR）。
- 内部改为与 Editor 共享同一份运行时代码，同一项目包的渲染、数据、规则、特效与交互行为与 Editor 预览一致。
- 公开 API、事件、类型与 0.2.0 相同，升级无需修改代码：替换 tgz 后重新执行 `pnpm add ./vendor/twin-studio-viewer-0.2.1.tgz`。
