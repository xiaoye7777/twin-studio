# 项目数据源

场景文件的 `dataSources` 字段保存设备数据的来源，编辑器与 Viewer SDK 使用相同字段和校验。一个场景可以**同时启用多个接口**（最多 64 个），大园区通常每个系统一个，三种类型：

| 类型 | 用途 | 说明 |
| --- | --- | --- |
| `websocket` 推送 | 有网关时 | 网关实时推送 |
| `http` 定时请求 | 没有推送服务时 | 每隔 `interval` 秒请求 `url` |
| `static` 静态数据 | 调试、演示 | `values: { 设备编号: { 变量: 值 } }`，在编辑器里直接填写，改完立即生效 |

## 多个接口如何配合

- **一台设备的数据可以来自多个接口**：用接口的 `devices` 限定它提供哪些设备、哪些变量；不写 `devices` 表示全部设备（按返回数据里的设备编号自动匹配）。
- **同一个变量有多个接口提供时，以列表靠前的为准**；靠前的断开、它的值被清空后，靠后的接管。静态数据放在后面就是兜底值。
- **接口之间互不影响**：一个断开或出错，只清空它提供的值，不留过期的值；其他接口照常。
- **改配置只重启改过的接口**，其他接口不断线。

汇总状态 `dataSourceStatus`：只要有一个接口连着就是 `connected`，详情看 `dataSourceStates`（每个接口的状态、错误、消息数）。缺字段、空数组、全部停用或旧版 `type: "mock"` 条目都表示“未配置”（`unconfigured`），不产生任何值。WebSocket 以 1s → 10s 退避自动重连，HTTP 按间隔照常重试。新项目默认连接本地设备模拟器 `ws://127.0.0.1:8787/realtime`。

## 接口配置

定时请求（`http`）：

| 字段 | 说明 |
| --- | --- |
| `url`、`method` | `http(s)://` 或以 `/` 开头的同域路径；GET / POST |
| `interval`、`timeout` | 请求间隔、超时（秒）；不写超时则不超过间隔，也不超过 15 秒 |
| `params`、`headers` | 查询参数、请求头，`[{ key, value }]` |
| `body` | POST 请求体；留空时发送下文的订阅消息（本接口涉及的设备清单），后端可只返回这些设备 |
| `resultPath` | 设备数据在返回值中的位置，如 `data.list`；空表示整个返回值 |
| `envelope` | 默认 `auto`：`{ code, msg, data }` 风格的失败（HTTP 200 但 code 表示错误）按错误处理并显示 msg；`off` 关闭 |
| `withCredentials`、`authRef` | 认证，见下 |

推送（`websocket`）：`url`、`resultPath`（消息里设备数据的位置）、`subscribe`（连上后发送的第一条消息，留空发送设备清单）、`heartbeat`（`{ interval, message }`，定时发送，防止网关断开空闲连接）。

两者都有 `mapping`，说明返回数据的格式，见下文「消息」。

### 认证

场景文件会随项目包分发，所以不能包含账号、密码或 Token：地址里的账号密码、名字像 Token 的查询参数和请求头（`Authorization`、`token`、`api-key`……）都会被拒绝。需要认证的接口有三种做法：

- 与大屏同域部署，或用 `withCredentials` 带上浏览器的登录 Cookie；
- 编辑器里引用「数据接口」页面登记的数据服务：场景只保存它的 ID（`authRef`），Token 留在本机；
- SDK 集成时，由集成方的 `dataRequestHeaders` 按 `authRef` 返回请求头（见 Viewer README）。

使用 `http` / `static` 或多个启用接口的项目需要 Viewer SDK 0.6.0 及以上。

```json
{"dataSources":[
  {"id":"energy","name":"能耗接口","type":"http","enabled":true,"url":"https://park.example.com/api/energy","method":"GET","interval":5,"resultPath":"data.list","withCredentials":false,"authRef":"conn_1","params":[{"key":"site","value":"east"}],"devices":[{"deviceId":"EM-001","variables":["power"]}]},
  {"id":"realtime","name":"实时网关","type":"websocket","enabled":true,"url":"wss://park.example.com/realtime"},
  {"id":"backup","name":"演示兜底","type":"static","enabled":true,"values":{"EM-001":{"power":120}}}
]}
```

## 编辑器

未选中对象时，检查器「数据」页有两个折叠区：

- **数据源**：每个接口一个折叠区，标题行显示状态和摘要，可以直接开关；「更多」里可以调整顺序（优先级）、复制、删除。展开后是接口配置，定时请求可以从「数据接口」页面已登记的接口导入（后端的接口只需登记一次，支持 Swagger / YApi）。
  - **数据解析**：数据位置、数据格式、设备编号字段、字段对照。
  - **涉及设备**：全部设备，或指定设备（每台还可以只勾部分变量）。
  - **试请求**：不影响运行中的接口，告诉你认出了几台设备、解析出几个值，可以查看原始返回并点选数据位置；改解析设置时结果立即按新设置重算。
- **设备**：场景的全部设备，展开后看每个变量现在的值、来自哪个接口；没有接口提供时会提示。

静态数据的值可以在接口里、设备列表里填，也可以在选中对象后的「数据」页签里改。「记下当前数值」把正在收到的实时值存为静态数据，方便先连网关再做离线演示。

修改是普通的文档编辑（可撤销、自动保存），导出项目包时随场景一起带出。

## 消息

接口返回（或推送）单个对象或数组，默认格式是每条一台设备，按 `deviceId` 匹配所有绑定，按变量 key 写入：

```json
[{"deviceId":"ESS-003","soc":72,"temperature":75,"power":108,"alarm":true,"status":"running"}]
```

也支持把变量放在 `values` 对象中。未知设备和字段会被忽略；文本形式的数字（`"72.5"`）、0 / 1 形式的布尔值按变量类型转换，转换不了的值忽略。

后端格式不一样时，用接口的 `mapping` 说明：

| `format` | 数据长什么样 | 相关字段 |
| --- | --- | --- |
| `device-row`（默认） | `[{ "deviceId": "ESS-001", "soc": 72 }]` | `deviceField`（默认 `deviceId`）、`valuesPath` |
| `metric-row` | `[{ "deviceId": "ESS-001", "metric": "soc", "value": 72 }]` | `deviceField`、`metricField`（默认 `metric`）、`valueField`（默认 `value`） |
| `device-map` | `{ "ESS-001": { "soc": 72 } }` | `valuesPath` |

- `deviceField` 设为空字符串：接口专门返回一台设备的数据，返回里没有设备编号（用 `devices` 指定是哪台）。
- `fields`：变量键 → 接口字段名，名字不一样时才需要，如 `{ "soc": "stateOfCharge" }`。
- 字段都支持路径，如 `meta.code`。

连接建立后（POST 请求体为空时也一样），编辑器和 SDK 会发送一条可选的订阅消息（`{"type":"subscribe","devices":[…]}`），列出本接口涉及的设备与变量；不需要的后端忽略即可，设备模拟器据此为任意项目生成数据。

## 仅限测试的 Mock

`MockDataSource` 只为浏览器回归测试保留：开发服务器上设置 `window.__TWIN_QA_MOCK__ = true` 时替代 WebSocket。该分支受 `import.meta.env.DEV` 保护，生产构建和 SDK dist 中不包含任何 Mock 代码，产品界面也没有入口。
