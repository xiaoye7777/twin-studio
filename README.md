# Twin Studio

零碳园区数字孪生低代码平台 monorepo。

| 目录 | 包名 | 说明 |
| --- | --- | --- |
| `apps/editor` | `@twin-studio/editor` | 3D 场景编辑器，导出 `.twin.zip` |
| `packages/viewer` | `@twin-studio/viewer` | 对外交付的 Vue 3 Viewer SDK，加载 `.twin.zip` |
| `apps/dashboard-demo` | `@twin-studio/dashboard-demo` | 模拟大屏项目，验证 SDK 接入 |
| `vendor/meteor3d-core` | `@meteor3d/core` | Meteor3D Core 源码快照（见 UPSTREAM.md） |

## 开发

Node.js `20.16.0+`、pnpm `10.20.0`。

```bash
pnpm install
pnpm dev:editor      # 编辑器
pnpm dev:dashboard   # 构建 viewer 后启动大屏 demo（含 8787 测试数据服务）
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
