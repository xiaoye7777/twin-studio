# 三维场景编辑器（studio）

路由 `/editor/:projectId`，入口 `views/editor/SceneEditor.vue`。整体思路见 [docs/architecture.md](../../../../docs/architecture.md)。

## 结构

```
SceneEditor.vue                       打开项目：读场景 → 创建 EditorSession → provide 给所有面板
├─ TopBar.vue                         菜单（文件/编辑/添加/视图）、编辑/预览切换、撤销重做、主题、导出
├─ LeftPanel.vue
│   ├─ SceneTree.vue                  场景树：层级、拖拽改父子、右键菜单、模型部件
│   └─ ViewsPanel.vue                 视角（书签）+ TourEditor.vue（导览），都可折叠
├─ StudioViewport.vue                 三维视口：画布、工具栏、框选、绘制 / 测量提示、右键菜单（ViewportMenu）
├─ BottomDock.vue → AssetLibrary.vue  资源：按标签分类的模型、组件、基本体、绘制工具，拖进视口（数据在 useAssetLibrary.ts，内置模型清单在 editor/builtinModels.ts）
├─ InspectorPanel.vue                 右侧检查器：未选中时是场景页签，选中时是对象页签
│   ├─ 场景：SceneEnvironment（环境）/ SceneData（数据接口与设备，组件在 inspector/data/）/ ScenePresentation（放映）
│   └─ 对象：NodeProperties（属性）/ NodeData（设备绑定）/ NodeEffects（特效与规则）/ NodeInteractions（交互）
│        选中模型部件时：PartProperties / PartMaterial
├─ StatusBar.vue                      底部状态栏
└─ StudioDialogs.vue                  各种对话框（批量绑定、阵列、替换模型、历史版本、性能报告、快捷键）
```

`studio/` 目录下是非界面的逻辑：

| 文件 | 做什么 |
| --- | --- |
| `EditorSession.ts` | **一个打开的项目**：文档、选择、所有编辑操作、保存、数据、导览……面板只调它的方法 |
| `context.ts` | `useSession()`：面板里拿到当前 session |
| `shell.ts` | 界面外壳状态：面板宽度、当前页签、打开的对话框（不进文档、不进撤销） |
| `useShortcuts.ts` | 键盘快捷键 |
| `TransformGizmo.ts` | 移动 / 旋转 / 缩放的手柄 |
| `DrawTool.ts` / `MeasureTool.ts` | 在地面上画路径、区域；测距离、面积 |
| `deviceTemplates.ts` | 设备类型模板（储能柜、光伏、电表……及其变量） |
| `saveComponent.ts` | 把选中的对象存为可复用组件 |
| `sceneAnalysis.ts` | 性能报告：面数、贴图、建议 |
| `studio.css` | 编辑器通用控件样式（`s-btn`、`s-input`…），颜色来自 `theme/tokens.css` |

## EditorSession 与功能模块

`EditorSession.ts` 只放核心，其余功能按主题分在 `session/` 下，通过字段访问：

| 访问方式 | 文件 | 内容 |
| --- | --- | --- |
| `session.*` | `EditorSession.ts` | 生命周期、`edit()` 与撤销重做、保存、历史版本、截图、选择、场景设置、预览模式 |
| `session.pointer` | `session/ViewportPointer.ts` | 视口里的鼠标：点选（分组逐层进入）、Shift 框选、双击进部件、悬停描边、右键菜单 |
| `session.modelParts` | `session/ModelParts.ts` | 模型部件的覆盖：改名、位置、显隐、材质、删除、恢复；替换模型文件 |
| `session.tools` | `session/DrawingTools.ts` | 绘制（路径 / 区域 / 标签 / 灯光）与测量（距离 / 面积） |
| `session.create` | `session/NodeCreation.ts` | 添加模型、基本体、分组、组件；把绘制结果变成节点 |
| `session.nodes` | `session/NodeEditing.ts` | 改属性、显隐锁定、删除、复制粘贴、组合、层级、对齐分布、落地、阵列、方向键微调 |
| `session.devices` | `session/DeviceData.ts` | 设备绑定、批量绑定、数据接口的增删改（可以同时启用多个）、试请求、实时值显示 |
| `session.effects` | `session/NodeEffects.ts` | 特效、告警规则、点击交互 |
| `session.views` | `session/ViewsAndTours.ts` | 视角（书签）、导览编辑、放映设置；播放由 `session.tours`（core 的 TourPlayer）负责 |

每个模块都是 `constructor(private readonly session: EditorSession)` 的普通类，通过 `this.session` 使用核心
（`edit`、`select`、`doc`、`engine`、`sync`……）和其他模块。新增功能时放进对应主题的模块；主题都不合适就新建一个模块，
在 `EditorSession` 里加一个字段。

一条修改从界面到画面的路径（以「改颜色」为例）：
`NodeProperties.vue` 调 `session.nodes.updateNode(id, recipe)` → `session.edit()` → `DocumentStore.transaction` →
文档变化回调 → `SceneSync.update()` 只更新这一个节点的材质。撤销时 DocumentStore 应用反向补丁，走同样的回调。

## 场景的数据接口（inspector/data/）

`SceneData.vue` 分两块：「数据源」每个接口一个 `SourceCard`，「设备」是 `DeviceList`。

| 文件 | 做什么 |
| --- | --- |
| `SourceCard.vue` | 一个接口的折叠区：状态、开关、更多操作 |
| `HttpSourceFields` / `WebSocketSourceFields` / `StaticSourceFields` | 三种接口各自的配置 |
| `SourceParsing.vue` | 数据解析：数据位置、数据格式、字段对照 |
| `SourceDevices.vue` | 涉及设备：全部 / 指定，每台设备可只勾部分变量 |
| `SourceProbe.vue` + `useSourceProbe.ts` | 试请求：结果只在内存里，改解析设置时立即重算 |
| `DeviceList.vue` | 全部设备：每个变量的值和来源接口 |

运行逻辑在 core（见 `packages/core/README.md` 的「数据」一节）。需要认证的接口通过 `screen/datasources/sceneSource.ts`
从「数据接口」页面登记的数据服务取请求头，Token 不进场景文件。

调试：开发环境下浏览器控制台里的 `window.__studio` 就是当前 session，例如 `__studio.nodes.dropToGround()`。
