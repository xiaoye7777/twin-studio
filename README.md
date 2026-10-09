# Twin Studio

零碳园区数字孪生低代码平台 monorepo：编辑器搭建三维场景、配置设备数据与告警、编排导览，导出 `.twin.zip`；数据大屏通过 Viewer SDK 加载并与场景双向联动。

| 目录 | 包名 | 说明 |
| --- | --- | --- |
| `apps/editor` | `@twin-studio/editor` | 三维场景编辑器（使用说明见 [apps/editor/README.md](apps/editor/README.md)） |
| `packages/core` | `@twin-studio/core` | 内部共享层：渲染引擎、场景格式与迁移、文档仓库、场景同步、数据 / 特效 / 规则 / 交互 / 导览运行时。不单独发布 |
| `packages/viewer` | `@twin-studio/viewer` | 对外交付的 Vue 3 Viewer SDK（接入说明见 [packages/viewer/README.md](packages/viewer/README.md)） |
| `apps/dashboard-demo` | `@twin-studio/dashboard-demo` | 模拟大屏项目，验证 SDK 接入，也是接入示例 |
| `tools/device-simulator` | `@twin-studio/device-simulator` | WebSocket 设备模拟器，代替真实 IoT 网关供演示与测试 |

## 架构

```
apps/editor ──┬─> packages/core（引擎 + 文档 + 运行时）
              └─> packages/viewer ──> packages/core   （编辑器「大屏预览」= 导出 zip 后用 SDK 加载）
apps/dashboard-demo ──> packages/viewer（dist，与外部项目安装 tgz 一致）
```

- **文档为准**：场景就是一份 JSON 文档（[场景格式 v2](docs/schema/)）。编辑器的每次修改都是 DocumentStore 中的一个事务（天然支持撤销 / 重做），SceneSync 按引用差异把文档同步到三维场景。编辑器与 Viewer 使用同一套引擎和运行时，所见即所得。
- **渲染引擎**（`packages/core/src/engine`）：基于 three.js，含后期处理（泛光、抗锯齿、描边）、昼夜天空、阴影、天气，以及按设备自动选择的画质档位和自适应分辨率。
- **格式演进**：`loadSceneDocument` 校验并逐版本迁移旧文件；新格式只能被新 SDK 打开，旧 SDK 会提示升级。
- viewer 的 `index.d.ts` 为对外手写声明，`packages/viewer/src/publicTypes.check.ts` 在 `pnpm type-check` 时校验它与真实类型一致。

## 实时数据原则

界面上的实时值只来自项目配置的 WebSocket。没有连接时不显示任何数值，规则特效也不会触发。产品代码不包含模拟数据；演示时由设备模拟器扮演数据网关。

## 开发

Node.js `20.16.0+`、pnpm `10.20.0`。

```bash
pnpm install
pnpm dev:editor      # 编辑器
pnpm simulator       # 设备模拟器（ws://127.0.0.1:8787/realtime），自动为连接的项目生成设备数据
pnpm dev:dashboard   # 构建 SDK 后启动大屏 demo（含模拟器）
```

## 检查与测试

```bash
pnpm lint && pnpm format:check && pnpm type-check
pnpm test:unit       # core 单元测试（场景格式、迁移、文档仓库、场景同步、编辑操作、导览…）
pnpm test:e2e        # 浏览器端到端：editor / demo / dashboard 三套，可用 -- --only <名称> 单独运行
pnpm build
```

## 交付 Viewer SDK

```bash
pnpm pack:viewer     # 生成 release/twin-studio-viewer-<version>.tgz
```

把 tgz 发给大屏项目，对方执行 `pnpm add ./twin-studio-viewer-<version>.tgz`，peer dependencies 为 `vue@^3.5` 与 `three@0.184.0`。发版前更新 `packages/viewer/package.json` 的 version 和 README 更新记录。

## 模型

建模规范见 [docs/modeling-guide.md](docs/modeling-guide.md)。内置演示模型为 Kenney CC0 资源（`apps/editor/public/demo-assets/CREDITS.md`）。
