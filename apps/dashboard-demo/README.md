# Reference Dashboard Demo

Vue 3 + TypeScript 示例大屏，通过 `workspace:*` 引用 @twin-studio/viewer 的 dist 构建产物（与外部项目安装 tgz 效果一致），也是数据大屏接入 SDK 的参考代码（`src/useTwinDashboard.ts`）。Node 20.16+ / pnpm 10.20.0。

```bash
pnpm dev:dashboard   # 在仓库根目录：先构建 viewer，再启动本 demo（5200）和设备模拟器（8787）
```

若模拟器已单独启动（`pnpm simulator`），使用 `pnpm dev:frontend --port 5200`。

默认加载 `public/project-websocket.twin.zip`（零碳园区示例，场景格式 v2，连接 8787 模拟器）。其他包：`?package=/xxx.twin.zip`；`/zero-carbon-demo.twin.zip` 是未配置数据源的旧版（v1）包，始终无数据。

演示的 SDK 能力：

- 设备列表、全场汇总：`getRuntimeState()` 的只读实时值（只来自 WebSocket，断开即显示“—”）。
- 双向联动：点击列表 → `selectDevice` / `focusDevice`；点击三维对象 → `selection-change`、`interaction-event`。
- 0.4.0 新增：导览播放（`playTour` / `stopTour`、`tour-change`，字幕由 SDK 显示）、视角切换（`getBookmarks` / `flyToBookmark`）、图层开关（顶层分组，`getNodes` / `setNodeVisible`）、告警列表（`alarm-change` / `getAlarms`）。

端到端测试由仓库根目录的 `pnpm test:e2e -- --only dashboard` 运行：编辑器导出项目包 → 本 demo 加载 → 验证实时值、告警、双向选择、导览、视角、图层与连接释放。

修改 viewer 源码后需重新执行 `pnpm build:viewer`（或重新运行 `pnpm dev:dashboard`）。
