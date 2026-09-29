# Reference Dashboard Demo

Vue 3 + TypeScript 示例，通过 `workspace:*` 引用 monorepo 内的 @twin-studio/viewer（使用其 dist 构建产物，与外部安装 tgz 的效果一致）。Node 20.16+ / pnpm 10.20.0。

在仓库根目录：

```bash
pnpm install
pnpm dev:dashboard   # 先构建 viewer，再启动本 demo
```

pnpm dev 启动前端 5200 和独立测试数据服务 8787。若服务已经单独启动，使用 pnpm dev:frontend --port 5200。SDK 本身不启动 server。

默认加载 zero-carbon-demo.twin.zip（旧包，自动回退 Mock）。
加载 Editor 配置并导出的 WebSocket 示例：
http://127.0.0.1:5200/?package=/project-websocket.twin.zip

Dashboard 只传 source，通过 getRuntimeState() 展示设备值和只读连接状态。没有 URL 配置、Mock/WebSocket 切换按钮或消息解析逻辑。
要改数据源，请在 Editor 场景设置中修改、保存、重新导出项目包。

测试服务每秒推送 8 个设备，ESS-003 周期性达到 75℃，触发项目规则特效。

端到端测试（需要 Editor 在 5190、Dashboard 在 5200、数据服务在 8787）：
```bash
pnpm test:integration
```
测试创建隔离浏览器项目，通过 Editor UI 配置、保存、导出，更新 public/project-websocket.twin.zip，再验证独立 SDK 网络值、规则、事件及卸载。不会更改日常浏览器项目。

修改 viewer 源码后需重新执行 `pnpm build:viewer`（或重新运行 `pnpm dev:dashboard`）。
