# 数据接口（大屏接入后端 HTTP 接口）

大屏组件除了读取三维场景的实时设备数据，还可以读取业务后端的 HTTP 接口（能耗统计、告警记录、工单、排行……）。设计目标是**业务人员不看接口文档也能配置**，所以按角色分成三层：

| 角色 | 做什么 | 在哪里 |
| --- | --- | --- |
| 后端同事 | 提供接口说明，任选一种：Swagger / OpenAPI 文档（多数框架自带），或按下文「接口清单」约定提供一个地址 | 后端 |
| 技术 / 实施人员 | 登记数据服务（地址、认证），导入或登记接口，测试接口、点选返回数据中的列表、给字段起中文名和单位 | 导航栏「数据接口」 |
| 业务人员 | 在组件「数据」栏选「接口数据」，按中文名选接口，填参数（下拉 / 日期 / 数字），选字段 | 大屏编辑器右侧 |

## 概念

- **数据服务**：一个后端地址，例如 `https://park.example.com/api`。包含认证方式、公共请求头、超时和「结果检查」。
- **接口**：数据服务上的一个请求，带中文名、分组、说明、参数（显示名、类型、默认值、下拉选项）、数据位置（返回值中哪一部分是数据，如 `data.list`）和字段（显示名、类型、单位）。
- **大屏变量**：页面设置中定义的共享值。接口参数可以「跟随变量」，变量由点击动作（「设置大屏变量」）改变，从而实现组件联动。内置变量：选中设备编号 / 名称（三维或其他组件中选中的设备）、今天、本月。

## 登记接口的四种方式

1. **导入 Swagger / OpenAPI**（推荐）：「数据接口 → 导入接口」，填文档地址或留空自动查找（`/v3/api-docs`、`/openapi.json`、`/v2/api-docs`、`/swagger.json` 等），也可上传 JSON 文件。支持 OpenAPI 3 与 Swagger 2、`$ref`、`allOf`、`{ code, msg, data }` 包装；自动识别数据列表位置、字段和参数。
2. **同步接口清单**：后端按下文约定提供清单地址，带好中文名与字段说明，以后后端增加接口，点「同步」即可（按清单中的 `id` 更新，已有组件不受影响）。
3. **粘贴 cURL**：在业务系统页面打开开发者工具 → 网络，右键请求 → 复制为 cURL（bash），粘贴后自动识别地址、查询参数、JSON 请求体和认证头。
4. **手动新建**：填写方法、路径和参数，点「发送测试请求」，在返回数据树中点「用作数据列表」，字段自动识别。

### 给后端同事：让文档直接可用的写法

- 接口 `summary` 写中文名（如「建筑能耗排行」），`tags` 作为分组。
- 参数和字段的 `description` 第一句写中文名，单位写在括号里：`用电量（kWh）`、`温度(℃)`、`单位：kW` 都能识别出单位。
- 枚举参数写 `enum`，会变成下拉框；日期参数用 `format: date`。
- 数值字段返回数字（`12.5`），不要返回字符串（字符串数字也能识别，但排序、汇总前要转换）。

## 接口清单约定

`GET` 一个地址（默认 `<服务地址>/screen/datasets`），返回：

```json
{
  "version": 1,
  "name": "园区业务接口",
  "datasets": [
    {
      "id": "building-consumption",
      "name": "建筑能耗排行",
      "group": "建筑",
      "description": "各建筑当月用电量、单位面积能耗与环比",
      "method": "GET",
      "path": "/api/buildings/consumption",
      "params": [
        { "key": "month", "label": "月份", "type": "month", "in": "query" },
        { "key": "top", "label": "前几名", "type": "number", "in": "query", "default": "8" },
        {
          "key": "type",
          "label": "建筑类型",
          "type": "enum",
          "in": "query",
          "options": [{ "value": "office", "label": "办公" }, { "value": "factory", "label": "厂房" }]
        }
      ],
      "resultPath": "data.list",
      "resultShape": "rows",
      "fields": [
        { "key": "building", "label": "建筑", "type": "string" },
        { "key": "kwh", "label": "用电量", "type": "number", "unit": "kWh" }
      ],
      "refresh": 600
    }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `id` | 稳定的唯一标识，重新同步时据此更新 |
| `path` | 相对服务地址的路径；`{deviceId}` 表示路径参数 |
| `params[].in` | `query`（默认）/ `path` / `body`（POST、PUT 的 JSON 请求体）/ `header` |
| `params[].type` | `string` / `number` / `boolean` / `date`（YYYY-MM-DD）/ `month`（YYYY-MM）/ `enum`（配 `options`） |
| `resultPath` | 数据在返回值中的位置，如 `data.list`；空表示整个返回值 |
| `resultShape` | `rows`（多条记录：图表、表格）/ `object`（单条记录：指标卡）/ `value`（单个值） |
| `fields[].key` | 记录中的字段，支持一层嵌套 `stats.kwh` |
| `refresh` | 建议刷新间隔（秒），0 为只加载一次；组件可单独覆盖 |

清单本身也可以放在 `{ "code": 0, "data": { "datasets": [...] } }` 中。

## 返回格式与错误

- 「结果检查」开启时（默认），返回 `{ code, msg, data }` 且 `code` 不是 `0` / `200` / `"success"` 视为失败，显示 `msg`。
- 失败时组件保留上次的数据，并按 5、10、20……最长 60 秒重试；编辑器中组件右上角显示错误原因，放映时不打扰观众。
- 常见错误都翻译成了中文：无法连接（服务未启动 / 跨域）、超时、401/403（认证）、404（地址）、5xx、返回的不是 JSON、https 页面请求 http 地址。

## 跨域、认证与部署

大屏在浏览器中直接请求接口，因此要处理跨域。两种做法任选其一：

**方案一：同域反向代理（推荐）**——大屏和接口用同一个域名，没有跨域问题，Cookie 登录态也能直接用：

```nginx
server {
  listen 80;
  server_name screen.example.com;
  location / {                       # 大屏前端
    root /var/www/twin-studio;
    try_files $uri /index.html;
  }
  location /park-api/ {              # 业务后端
    proxy_pass http://10.0.0.12:8080/api/;
  }
}
```

数据服务地址填 `https://screen.example.com/park-api`。

**方案二：后端开启 CORS**（Spring Boot 示例）：

```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {
  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/api/**")
        .allowedOrigins("https://screen.example.com")
        .allowedMethods("GET", "POST", "PUT", "OPTIONS")
        .allowedHeaders("*")
        .allowCredentials(true); // 仅「浏览器登录态」需要
  }
}
```

认证方式：无需认证 / Bearer Token / 自定义请求头（如 `X-Token`）/ 浏览器登录态（携带 Cookie，后端须允许带凭据的跨域，`Access-Control-Allow-Origin` 不能是 `*`）。

**安全**：Token 只保存在本机浏览器（IndexedDB），导出大屏文件时会带上所用接口的定义，但不带 Token 和名称像密钥的请求头值；导入方在「数据接口」中补填。建议为大屏申请只读的专用账号或 Token。

## 组件中的使用

1. 选中组件 →「数据」→ 来源选「接口数据」→ 点「选择接口」，按名称或分组搜索。
2. **参数**：按接口定义显示输入框、日期、月份或下拉框；点右侧链接图标改为「跟随大屏变量」。
3. **字段**：图表选分类字段和数值字段（系列）；表格勾选并排序要显示的列；指标卡选显示字段，多行时选合计 / 平均 / 最大 / 最小 / 第一行 / 行数。还可以按字段排序、限制条数。
4. **刷新**：跟随接口建议，或单独设置；状态行显示最近一次请求的时间和耗时，可立即刷新。

同一接口、同样参数的多个组件只发一次请求，按其中最短的刷新间隔刷新。

## 联动示例：三维中点设备，曲线显示该设备历史

1. 「设备历史曲线」接口的参数「设备编号」点链接图标，选「变量：选中设备编号」。
2. 预览中点击三维场景里的储能柜（或点击表格中的设备行），折线图立即请求该设备的历史数据。

同理，「设置大屏变量」点击动作 + 参数跟随变量，可以实现「点击建筑排行中的某栋楼 → 其他图表切换到这栋楼」。

## 演示数据服务

设备模拟器（`pnpm simulator`）同时提供一组演示业务接口，「数据接口 → 使用演示数据服务」一键添加：

| 接口 | 地址 | 形态 |
| --- | --- | --- |
| 今日能源概览 | `GET /api/energy/overview` | 单条记录 |
| 近 N 日能源趋势 | `GET /api/energy/trend?days=7` | 多条记录 |
| 能源结构占比 | `GET /api/energy/mix` | 多条记录（饼图） |
| 建筑能耗排行 | `GET /api/buildings/consumption?month=&top=` | 多条记录 |
| 设备历史曲线 | `GET /api/devices/{deviceId}/history?metric=&hours=` | 多条记录，路径参数 |
| 告警记录 | `POST /api/alarms/query`（`{ level, limit }`） | 多条记录，`data.records` |
| 累计碳减排 | `GET /api/carbon/total` | 单个值 |

接口清单在 `/screen/datasets`，OpenAPI 文档在 `/openapi.json`，可用来体验两种导入方式。
