# 项目数据源

场景文件的 `dataSources` 字段保存实时数据来源，编辑器与 Viewer SDK 使用相同字段和校验：

```json
{"dataSources":[{"id":"realtime","name":"实时设备数据","type":"websocket","enabled":true,"url":"ws://127.0.0.1:8787/realtime"}]}
```

**实时值只来自 WebSocket。** 缺字段、空数组、全部禁用或旧版 `type: "mock"` 条目都表示“未配置”（`dataSourceStatus: 'unconfigured'`），不产生任何值；连接断开或出错时立即清空实时值，并以 1s → 10s 退避自动重连。新项目默认连接本地设备模拟器 `ws://127.0.0.1:8787/realtime`。最多启用一个来源；ws/wss 地址不能包含用户名、密码或 #；HTTPS 页面需使用 wss。

## 编辑器

未选中对象时，检查器「数据」页：填写 WebSocket 地址、开关「启用」、查看连接状态和消息数，下方列出所有已绑定设备及其实时数据。修改是普通的文档编辑（可撤销、自动保存），导出项目包时随场景一起带出。

## 消息

网关推送单个对象或数组，按 `deviceId` 匹配所有绑定，按变量 key 和类型写入；未知设备、字段和类型不匹配的值忽略：

```json
[{"deviceId":"ESS-003","soc":72,"temperature":75,"power":108,"alarm":true,"status":"running"}]
```

也支持把变量放在 `values` 对象中。连接建立后，编辑器和 SDK 会先发送一条可选的订阅消息（`{"type":"subscribe","devices":[…]}`），列出本项目的设备与变量；不需要的网关忽略即可，设备模拟器据此为任意项目生成数据。

## 仅限测试的 Mock

`MockDataSource` 只为浏览器回归测试保留：开发服务器上设置 `window.__TWIN_QA_MOCK__ = true` 时替代 WebSocket。该分支受 `import.meta.env.DEV` 保护，生产构建和 SDK dist 中不包含任何 Mock 代码，产品界面也没有入口。
