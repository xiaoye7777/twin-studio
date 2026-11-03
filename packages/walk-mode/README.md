# 漫游模式（可选插件）

在预览模式里放一个第三人称小人，用键盘鼠标在场景里走、跑、跳、飞。为了好玩做的，所以做成随时能摘掉的独立包。

| 操作 | 按键 |
| --- | --- |
| 移动 | W A S D |
| 疾跑 | 按住 Shift |
| 跳（轻点矮、按住高） | 空格 |
| 转视角 / 远近 | 鼠标 / 滚轮 |
| 开关飞行 | F 或双击空格 |
| 飞行升降 | 空格升、C 降；朝看的方向飞，Shift 加速；下降碰到地面自动落地 |
| 退出 | Esc |

## 怎么做到不污染项目

这个包只依赖 `three`，不引用项目的任何代码。它要的东西都写在 `WalkModeHost` 接口里（`scene`、`camera`、`canvas`、`content`、`onFrame`……），项目的引擎本来就符合，不用改。按钮和提示也是它自己创建的 DOM，不用项目的组件和样式。

## 怎么摘除

1. 删掉 `packages/walk-mode/`
2. `apps/editor/src/views/editor/SceneEditor.vue`：删掉 `import { attachWalkMode }` 和 `attachWalkMode(opened)` 两行
3. `apps/editor/package.json`：删掉 `@twin-studio/walk-mode` 依赖
4. 根目录 `package.json` 的 `test:unit` 和 `scripts/e2e.mjs`：各删掉一处 `walk` 测试
5. 运行 `pnpm install`

场景文件、项目包里不会存任何漫游数据，摘除后所有项目照常打开。

## 调手感

全部参数在 `src/CharacterController.ts` 顶部的 `TUNING`：

- 觉得笨重：调大 `startResponse`、`stopResponse`（速度响应）
- 觉得太飘：调大 `gravity`、`fallMultiplier`
- 跳得高低：`jumpHeight`
- 速度：`walkSpeed`、`sprintSpeed`、`flySpeed`
- 个子：`height`，人物会按它整体缩放

相机在 `src/ThirdPersonCamera.ts`，鼠标灵敏度是 `SENSITIVITY`。

## 放到别的地方用

`WalkMode` 不依赖编辑器：任何符合 `WalkModeHost` 的宿主都能 `new WalkMode(host).start()`。比如以后要放进数据大屏，把 Viewer 的引擎传进去，再自己放一个按钮。

## 已知限制

- 碰撞用射线近似，人物是圆柱体：能走上 0.55 米以内的台阶，极细的东西（比如导线）不算障碍。
- 目前只接在编辑器的预览模式，没有接进 Viewer SDK 和数据大屏。
