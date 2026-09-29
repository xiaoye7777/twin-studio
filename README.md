# Twin Studio

零碳园区数字孪生低代码平台 monorepo。

| 目录 | 包名 | 说明 |
| --- | --- | --- |
| `apps/editor` | `@twin-studio/editor` | 3D 场景编辑器，导出 `.twin.zip` |
| `packages/core` | `@twin-studio/core` | 内部共享层：场景数据模型、包格式、运行时（数据/特效/规则/交互）。不单独发布 |
| `packages/viewer` | `@twin-studio/viewer` | 对外交付的 Vue 3 Viewer SDK，加载 `.twin.zip`；构建时把 core 打包进 dist |
| `apps/dashboard-demo` | `@twin-studio/dashboard-demo` | 模拟大屏项目，验证 SDK 接入 |
| `tools/device-simulator` | `@twin-studio/device-simulator` | WebSocket 设备模拟器，代替真实 IoT 网关供演示与测试 |
| `vendor/meteor3d-core` | `@meteor3d/core` | Meteor3D Core 源码快照（见 UPSTREAM.md） |

## 依赖关系

```
apps/editor ──┬─> packages/core ──> vendor/meteor3d-core
              └─> packages/viewer ──> packages/core      （编辑器「数据大屏」页 = 导出 zip 后用 SDK 加载）
apps/dashboard-demo ──> packages/viewer（dist，与外部项目安装 tgz 一致）
```

编辑器和 viewer 共享同一份 core 代码，新增规则/特效/数据源能力只需改 core 一处。
viewer 的 `index.d.ts` 为对外手写声明，`packages/viewer/src/publicTypes.check.ts` 会在 `pnpm type-check` 时校验它与 core 真实类型一致。

## 实时数据原则

界面上的所有实时值只来自项目配置的 WebSocket。没有连接（未配置、连接中、断开、出错）时不显示任何数值，规则特效也不会触发。
产品代码不包含模拟数据；演示时由设备模拟器扮演数据网关，接真实设备时只需在编辑器中把地址换成真实网关并重新导出。

## 开发

Node.js `20.16.0+`、pnpm `10.20.0`。

```bash
pnpm install
pnpm dev:editor      # 编辑器
pnpm dev:dashboard   # 构建 viewer 后启动大屏 demo（含 8787 设备模拟器）
pnpm simulator       # 单独启动设备模拟器；可加 -- --package xxx.twin.zip 按项目设备生成数据
pnpm type-check
pnpm build
```

## 交付 Viewer SDK

```bash
pnpm pack:viewer     # 生成 release/twin-studio-viewer-<version>.tgz
```

把 tgz 发给大屏项目，对方执行 `pnpm add ./twin-studio-viewer-<version>.tgz`，peer dependencies 为 `vue@^3.5` 与 `three@0.184.0`。发版前请先更新 `packages/viewer/package.json` 的 version。

## 历史

三个子项目通过 `git subtree` 从原独立仓库导入，保留了完整提交历史：
twin-studio（编辑器）、twin-viewer-sdk、dashboard-viewer-demo。
