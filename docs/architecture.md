# 架构导读：从哪里开始读代码

这份文档给新加入的同事一张「地图」：项目由哪几块组成、数据怎么流动、每块代码在哪、先读哪个文件。
细节在各目录的 README 里：

| 想了解 | 看这里 |
| --- | --- |
| 渲染引擎、场景同步、实时数据、特效规则（core） | [packages/core/README.md](../packages/core/README.md) |
| 三维场景编辑器 | [apps/editor/src/studio/README.md](../apps/editor/src/studio/README.md) |
| 数据大屏编辑器 | [apps/editor/src/screen/README.md](../apps/editor/src/screen/README.md) |
| 对外的 Viewer SDK | [packages/viewer/README.md](../packages/viewer/README.md) |
| 场景文件格式 | [docs/schema/](schema/) |

## 一、四个部分

```
apps/editor          编辑器（Vue 应用）：三维场景编辑器、数据大屏编辑器、数据接口、资源库
packages/core        核心库（不单独发布）：渲染引擎、场景文档、场景同步、数据运行时、特效/规则/交互/导览
packages/viewer      Viewer SDK：给大屏项目用的 Vue 组件，内部就是 core
tools/device-simulator  设备模拟器：扮演数据网关（WebSocket / HTTP）和演示业务后端
```

编辑器和 Viewer 用的是**同一套 core**，所以编辑器里看到什么，大屏上就是什么。

## 二、一个核心思想：文档是唯一的真相

三维场景就是一份 JSON 文档（`SceneDocumentV2`：节点、设备绑定、特效、规则、视角、导览……）。
**界面上的任何修改都不直接改三维对象，而是改文档**，再由同步层把文档「画」出来：

```
 用户操作（拖动、改属性）
        │
        ▼
 EditorSession.edit(…)            编辑器：每次修改是一个事务
        │
        ▼
 DocumentStore.transaction(…)     core：用 Immer 生成新文档 + 补丁（撤销 / 重做就是应用补丁）
        │  新文档（未变的部分和旧文档共享引用）
        ▼
 SceneSync.update(doc)            core：按引用对比新旧文档，只更新变了的节点
        │
        ▼
 TwinEngine（three.js）           core：渲染、后期处理、相机
```

好处：撤销/重做、自动保存、历史版本、导出都只和文档打交道；三维对象是文档的「投影」，随时可以重建。

## 三、实时数据怎么变成三维效果

```
 数据源（场景文档里的 dataSources，一次启用一个）
   推送 WebSocket ┐
   定时请求 HTTP  ├─▶ 设备消息 {deviceId, 变量: 值}
   静态数据       ┘
        │  按「设备编号 + 变量名」匹配设备绑定（bindings）
        ▼
 运行时状态 createTwinState()     每个绑定、每个变量的当前值（不存进文档）
        │
        ├─▶ VisualRuleRuntime    告警规则：温度 > 60 → 套用特效模板
        ├─▶ EffectRuntime        特效：发光、描边、数据标牌、告警标牌、扫描……
        └─▶ 模型部件运动          风机转速等跟随变量
```

设备绑定（binding）就是「三维里哪个对象 ↔ 哪台设备、有哪些变量」，是场景和真实数据之间唯一的连接点。
详见 [project-data-source.md](../apps/editor/docs/project-data-source.md)。

## 四、数据大屏

数据大屏是另一种文档（`ScreenDocument`：页面 + 组件列表），编辑器结构和三维编辑器类似：
`ScreenEditorSession`（事务、撤销、保存）+ `ScreenRuntime`（给组件算数据、执行点击动作）。
组件的数据可以来自：静态 JSON、后端接口（数据接口页面登记）、关联三维场景的设备数据。
三维场景组件内部就是 Viewer SDK，两边可以双向联动。

## 五、界面主题与公共组件

- 所有颜色来自 [theme/tokens.css](../apps/editor/src/theme/tokens.css)（深色 / 浅色两套变量），组件里只写 `var(--s-…)`。
  加主题：复制一段变量块改色值，再在 `theme/themes.ts` 登记一行。
- 通用控件在 `apps/editor/src/components/ui/`：
  - `UiMenu` / `UiDropdown` / `useContextMenu`（右键菜单、下拉菜单）
  - `confirmAction`（确认框）
  - `UiRow` / `UiSection` / `UiNumber` / `UiSlider` / `UiSwitch` / `UiSegmented` / `UiText` / `UiColor`（属性面板的行和输入控件）
  - `ThemeSwitcher`（主题切换）
- 编辑器通用样式类（`s-btn`、`s-input`、`s-select`、`s-hint`…）在 `studio/studio.css`。

## 六、代码约定

- 改文档只通过 session 的方法（最终都是 `edit()` / `transaction()`），不要直接改 `doc.value`。
- 连续的操作（拖动、拖滑块）用同一个 `coalesceKey` 合并成一步撤销，松手时 `commit()`。
- 新写或重构的代码用中文注释说明「做什么、为什么」；不写「怎么做」，代码本身应该看得出来。
- 每个改动都跑：`pnpm lint && pnpm format:check && pnpm type-check && pnpm test:unit && pnpm test:e2e`。
