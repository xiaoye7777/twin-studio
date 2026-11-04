# 数据大屏（screen）

路由：`/screens`（列表）、`/screens/:id/edit`（编辑器）、`/screens/:id/preview`（草稿预览）、`/screens/:id/play`（放映已发布版本）。
功能说明见 [docs/data-screens.md](../../docs/data-screens.md)，接口数据见 [docs/data-api.md](../../docs/data-api.md)。

## 目录

```
screen/
  model.ts          大屏文档 ScreenDocument：页面、组件、变量、组合、参考线、发布状态；版本 ScreenVersion
  templates.ts      新建大屏的模板（园区运营监控、空白）
  themes.ts         大屏内容的配色主题（科技蓝、能源绿…，一键改所有组件颜色）——注意不是编辑器界面主题
  storage/          IndexedDB：大屏、历史版本；Pinia store
  widgets/          组件库：每个组件 = 一个 Vue 组件 + 一份定义（尺寸、默认属性、样式字段、数据形态）
    registry.ts       注册表：createWidget、propsOf
    types.ts          WidgetDefinition、FieldDef、WidgetData（组件收到的统一数据格式）
    basic / charts / extra / filters / scene   各类组件
  runtime/          ScreenRuntime：给每个组件算数据、执行点击动作、管理大屏变量、连接三维场景
  datasources/      数据接口（后端 HTTP 接口）：模型、请求、导入（OpenAPI / 清单 / cURL）、字段映射、请求管理
  render/           ScreenPage（画页面）、WidgetHost（包一层：定位、入场动画、出错隔离）、capture（缩略图）
  editor/           编辑器界面
    session.ts        ScreenEditorSession：文档事务、撤销、保存、选择、组合、参考线、版本与发布
    canvas/           画布：ScreenCanvas（布局）、useCanvasPointer（拖动缩放框选平移）、snapping（吸附）、
                      CanvasRulers（标尺参考线）、ResizeFrame（选中框）
    Inspector.vue     右侧检查器：样式 / 数据 / 交互；未选中时页面设置
    DataPanel.vue     数据来源选择；接口数据的配置在 ApiBindingPanel.vue
    ……               图层、组件库、顶栏、发布、历史版本、快捷键
```

## 一个组件的数据从哪来

`WidgetHost` 调 `runtime.dataFor(widget, shape)`，返回统一的 `WidgetData`（一个值，或多行数据 + 分类列 + 数值列）：

- 静态数据：解析组件里写的 JSON
- 接口数据：`ApiDataManager` 发请求（同接口同参数只请求一次、定时刷新、失败重试），`mapping.ts` 按组件选的字段转换
- 设备数据：读关联三维场景的实时值（`ScreenRuntime` 里有一份独立的 `TwinDataRuntime`），每秒最多刷新一次

组件只管显示 `WidgetData`，不关心数据从哪来；新增数据来源只改 `ScreenRuntime.dataFor`。

## 新增一个组件

1. 在 `widgets/` 某个分类下写一个 Vue 组件，props 是 `WidgetComponentProps`（`widget`、`data`、`editing`）。
2. 在同目录的 `*.ts` 里加一份定义：`type`、名称、分类、图标、默认尺寸、默认属性、`fields`（样式面板会按它自动生成）、
   `data`（数据形态和可选的来源）。
3. 需要点击交互时设 `clickable: true`，组件里 `emit('action', { item })`。

## 联动的三条路

- 三维 → 大屏：三维场景组件里点设备 → `runtime.selectedDeviceId` → 「选中设备」数据和内置变量随之变化。
- 大屏 → 三维：点击动作（选中设备、飞到视角、导览、图层）→ `runtime.run(action)` → 调 Viewer SDK。
- 组件 → 组件：筛选控件或点击动作设置大屏变量 → 参数跟随该变量的接口组件自动重新请求。
