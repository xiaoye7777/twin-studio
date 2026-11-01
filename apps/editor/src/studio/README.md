# 三维场景编辑器（studio）

路由 `/editor/:projectId`，入口 `views/editor/SceneEditor.vue`。整体思路见 [docs/architecture.md](../../../../docs/architecture.md)。

## 结构

```
SceneEditor.vue                       打开项目：读场景 → 创建 EditorSession → provide 给所有面板
├─ TopBar.vue                         菜单（文件/编辑/添加/视图）、编辑/预览切换、撤销重做、主题、导出
├─ LeftPanel.vue
│   ├─ SceneTree.vue                  场景树：层级、拖拽改父子、右键菜单、模型部件
│   └─ AssetLibrary.vue               资源：模型、组件，拖进视口
├─ StudioViewport.vue                 三维视口：画布、工具栏、框选、绘制 / 测量提示、右键菜单（ViewportMenu）
├─ BottomDock.vue                     视角与导览
├─ InspectorPanel.vue                 右侧检查器：未选中时是场景页签，选中时是对象页签
│   ├─ 场景：SceneEnvironment（环境）/ SceneData（数据源与设备）/ ScenePresentation（放映）
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

## EditorSession 的分区

`EditorSession.ts` 很长，但按功能分成了连续的区块（文件里以 `// ====` 分隔）。找功能时直接搜区块名：

| 区块 | 内容 |
| --- | --- |
| lifecycle | 打开项目：创建引擎、SceneSync、数据运行时、特效 / 规则 / 交互运行时；关闭时释放 |
| document plumbing | `edit()`：所有修改的入口；文档变化后同步到三维、更新撤销状态、安排自动保存 |
| persistence / versions | 保存（含封面截图）、历史版本 |
| selection | 选择、悬停、聚焦、全选、选父级 |
| pointer (edit mode) | 视口里的鼠标：点选、框选、拖动手柄、绘制、测量、右键菜单 |
| model parts | 进入模型编辑部件：覆盖材质 / 显隐 / 位置，恢复部件 |
| creating nodes | 添加基本体、模型、组件、标签、灯光、路径、区域、分组 |
| editing nodes | 改属性、变换、复制粘贴、阵列、组合、删除、对齐、放到地面 |
| scene settings | 环境、画质 |
| data | 设备绑定、批量绑定、**数据源（推送 / 定时请求 / 静态数据）**、实时值显示 |
| effects, rules, interactions | 特效、告警规则、点击交互 |
| views and tours | 视角（书签）、导览编辑与播放 |
| preview mode | 编辑 / 预览切换 |

一条修改从界面到画面的路径（以「改颜色」为例）：
`NodeProperties.vue` 调 `session.updateNode(id, recipe)` → `edit()` → `DocumentStore.transaction` → 文档变化回调 →
`SceneSync.update()` 只更新这一个节点的材质。撤销时 DocumentStore 应用反向补丁，走同样的回调。

## 后续拆分计划（尚未进行）

`EditorSession` 可以按上表拆成几个「功能模块」类（如 `NodeCommands`、`DataSources`、`Tours`、`ViewportPointer`），
session 只保留文档、选择和 `edit()`，各模块通过构造参数拿到它们。拆分会改动大量面板里的调用（`session.xxx()` →
`session.nodes.xxx()`）和 e2e 测试中的 `window.__studio.xxx()`，建议单独做一次，并在每拆一个模块后跑全部测试。
`pointer (edit mode)` 一块最独立，适合先拆。
