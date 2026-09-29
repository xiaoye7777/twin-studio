# 项目数据源

SceneDocumentV1 新增可选 dataSources 字段，ZIP 原样保存 scene.json，独立 SDK 和 Editor 使用相同字段及校验。

```json
{"dataSources":[{"id":"realtime","name":"实时设备数据","type":"websocket","enabled":true,"url":"ws://127.0.0.1:8787/realtime"}]}
```

**实时值只来自 WebSocket。** 缺字段、[]、全部禁用或旧版 `type: "mock"` 条目都表示“未配置”（`dataSourceStatus: 'unconfigured'`），不产生任何值；连接断开或出错时立即清空实时值，并以 1s→10s 退避自动重连。新项目默认连接本地设备模拟器 `ws://127.0.0.1:8787/realtime`（`tools/device-simulator`）。最多启用一个来源，ID 不重复，ws/wss URL 不含用户名密码，不允许额外凭据字段。

Editor：顶部场景设置 → 实时数据源 → 名称 / URL / 启用 → 应用 → 保存（导出读取已保存版本，未保存的配置在数据大屏中显示为“未配置”）。应用操作进入 History；草稿不会连接。Runtime 值不产生 Dirty。
Viewer：load SceneDocument → 恢复场景和 Binding → TwinDataRuntime.start(document.dataSources) → WebSocket → 现有 RuntimeValue → Rule / Effect / Host。

WebSocket transport 在 infrastructure/data/WebSocketDataSource.ts，消息映射函数独立于连接管理，支持单个对象/数组和 values 字段。重复 deviceId 的多个绑定均收到对应变量值。未知 key 和错误类型忽略。

Dashboard 只加载 ZIP 和消费只读 Runtime State；SDK 0.2.0 移除 dataSource prop/setDataSource，保留只读连接 diagnostics 和全部 selection/focus 事件能力。

数据源编辑停止旧来源再启动新来源；卸载与切项目停止来源。无自动重连、认证、历史数据、多来源并行。项目包应来自可信来源：加载启用的 WebSocket 配置会向该地址建立连接。请勿把长期 Token 放进 URL，HTTPS 页面需使用 wss。

验证入口：dashboard-viewer-demo/tests/project-data-source.mjs。


## 浏览器内 Mock（仅限 QA）

`MockDataSource` 只为回归测试保留：开发服务器上设置 `window.__TWIN_QA_MOCK__ = true` 时，TwinDataRuntime 用它替代 WebSocket（测试脚本通过 `addInitScript` 设置）。该分支受 `import.meta.env.DEV` 保护，Editor 生产构建和 Viewer SDK dist 中不包含任何 Mock 代码，产品界面也没有入口。
