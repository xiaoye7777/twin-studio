# 项目数据源

场景文件的 `dataSources` 字段保存设备数据的来源，编辑器与 Viewer SDK 使用相同字段和校验。最多启用一个，三种类型：

| 类型 | 用途 | 说明 |
| --- | --- | --- |
| `websocket` 推送 | 生产环境 | 网关实时推送，下文「消息」的格式 |
| `http` 定时请求 | 没有推送服务时 | 每隔 `interval` 秒请求 `url`，在 `resultPath`（如 `data`）处读取与推送消息相同格式的数组；`POST` 且请求体为空时，自动发送下文的订阅消息，后端可只返回这些设备 |
| `static` 静态数据 | 调试、演示 | `values: { 设备编号: { 变量: 值 } }`，在编辑器里直接填写，改完立即生效 |

场景文件会随项目包分发，所以三种配置都不能包含账号、密码或 Token（地址中的账号密码会被拒绝）；需要登录的 HTTP 接口请与大屏同域部署，或打开 `withCredentials` 带上浏览器 Cookie。使用 `http` / `static` 的项目需要 Viewer SDK 0.6.0 及以上。

```json
{"dataSources":[{"id":"http","name":"定时请求","type":"http","enabled":true,"url":"https://park.example.com/api/devices/latest","method":"GET","interval":5,"resultPath":"data","withCredentials":false}]}
```

WebSocket 配置示例：

```json
{"dataSources":[{"id":"realtime","name":"实时设备数据","type":"websocket","enabled":true,"url":"ws://127.0.0.1:8787/realtime"}]}
```

缺字段、空数组、全部禁用或旧版 `type: "mock"` 条目都表示“未配置”（`dataSourceStatus: 'unconfigured'`），不产生任何值；连接断开或请求出错时立即清空数值。WebSocket 以 1s → 10s 退避自动重连，HTTP 按间隔照常重试。新项目默认连接本地设备模拟器 `ws://127.0.0.1:8787/realtime`。最多启用一个来源；ws/wss 地址不能包含用户名、密码或 #；HTTPS 页面需使用 wss。

## 编辑器

未选中对象时，检查器「数据」页顶部选择来源：不启用 / 推送 / 定时请求 / 静态数据。
- 推送：填写 WebSocket 地址。
- 定时请求：方法、地址、间隔、数据位置、请求体、是否带登录态；「试请求一次」显示返回了几台本场景绑定的设备。
- 静态数据：设备列表里每个变量都有输入框；选中对象后，它「数据」页签的变量表也可以直接改值。「记下当前数值」把正在收到的实时值存为静态数据，方便先连网关再切到离线演示。

修改是普通的文档编辑（可撤销、自动保存），导出项目包时随场景一起带出。

## 消息

网关推送单个对象或数组，按 `deviceId` 匹配所有绑定，按变量 key 和类型写入；未知设备、字段和类型不匹配的值忽略：

```json
[{"deviceId":"ESS-003","soc":72,"temperature":75,"power":108,"alarm":true,"status":"running"}]
```

也支持把变量放在 `values` 对象中。连接建立后，编辑器和 SDK 会先发送一条可选的订阅消息（`{"type":"subscribe","devices":[…]}`），列出本项目的设备与变量；不需要的网关忽略即可，设备模拟器据此为任意项目生成数据。

## 仅限测试的 Mock

`MockDataSource` 只为浏览器回归测试保留：开发服务器上设置 `window.__TWIN_QA_MOCK__ = true` 时替代 WebSocket。该分支受 `import.meta.env.DEV` 保护，生产构建和 SDK dist 中不包含任何 Mock 代码，产品界面也没有入口。
