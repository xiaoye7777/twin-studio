# @twin-studio/core 导读

core 是编辑器和 Viewer SDK 共用的内核：场景文档的格式与校验、编辑事务、把文档渲染成三维场景、实时数据、
特效 / 告警规则 / 交互 / 导览。它不依赖编辑器界面，编辑器（`apps/editor`）和 SDK（`packages/viewer`）都只是
「组装」这些部件。整体图见 [docs/architecture.md](../../docs/architecture.md)。

## 目录：按「离界面多远」分层

```
src/
  domain/          数据长什么样：类型 + zod 校验 + 纯函数。不碰 three.js，不碰浏览器。
    scene/           场景文档（节点、变换、设置），版本与迁移
    twin/            设备绑定：哪个对象 ↔ 哪台设备、哪些变量
    dataSources/     数据源配置：WebSocket / HTTP / 静态
    effects/         特效实例（发光、描边、标牌…）的参数
    effectTemplates/ 内置特效模板（规则触发时套用）
    visualRules/     告警规则：变量 + 条件 → 特效模板
    interactions/    点击交互：点对象 → 显示 / 隐藏 / 飞到视角…
  document/        编辑文档：DocumentStore（事务、撤销）+ sceneOps（增删节点、组合、复制等纯操作）
  engine/          渲染引擎（three.js）：画布、相机、天空、天气、后期处理、模型加载
  runtime/         让文档「活」起来：
    scene/           SceneSync：把文档同步成三维对象（核心中的核心）
    twin/            运行时数据状态、数据源生命周期、Viewer 的总装（TwinSceneRuntime）
    effects/         特效渲染、告警规则求值
    interactions/    点击交互的执行、运行时显隐
    tour/            导览播放
  infrastructure/  和外界打交道：数据源实现、项目包读写、资源 / 场景仓库接口
  contract/        Viewer 对外的类型（事件、状态、API）
```

每个关键文件开头都有一段中文说明（做什么、谁在用、要点），打开文件先看那一段。

**阅读顺序建议**：`domain/scene/sceneTypes.ts`（文档长什么样）→ `document/DocumentStore.ts`（怎么改）→
`runtime/scene/SceneSync.ts`（怎么画出来）→ `runtime/twin/TwinDataRuntime.ts`（数据怎么进来）→
`runtime/effects/VisualRuleRuntime.ts`（数据怎么变成效果）→ `runtime/twin/TwinSceneRuntime.ts`（Viewer 怎么把以上拼起来）。

## 四个最难懂的机制

### 1. DocumentStore：撤销 / 重做是怎么「免费」得到的

`document/DocumentStore.ts`

- 文档是**冻结的不可变对象**。修改只能通过 `transaction(label, recipe)`：`recipe` 拿到一个 Immer 草稿随便改，
  Immer 产出新文档，以及正向补丁 `patches` 和反向补丁 `inversePatches`。
- 撤销 = 应用反向补丁，重做 = 应用正向补丁。所以任何新功能只要通过事务改文档，就自动支持撤销，不用为每个操作写撤销代码。
- **合并（coalesce）**：拖动时每帧都是一个事务，传同一个 `coalesceKey` 就会合并进同一个撤销步骤；松手时 `seal()` 结束合并。
- 新文档里没变的部分和旧文档**共享引用**——这是下面 SceneSync 能快速找出改动的前提。
- `markSaved()` / `isDirty`：记住保存时位于哪一步历史，判断有没有未保存的修改。

### 2. SceneSync：文档 → 三维对象

`runtime/scene/SceneSync.ts`、`runtime/scene/nodeObjects.ts`

- `update(doc)` 拿新文档和上次的对比：**节点对象引用没变就跳过**（得益于上面的共享引用），变了才更新对应的三维对象。
  所以改一个节点的颜色，只有那一个对象被重新设置。
- 每个节点「挂载」为一个 `MountedNode`：三维对象 + 该节点上次应用的数据。类型变了（或模型换了文件）才重建对象，否则原地更新。
- 不同节点类型各有创建 / 更新函数，每种一个文件：`runtime/scene/nodes/`（primitive 基本体、path 路径、area 区域、label 标签、light 灯光、shared 共用工具；`nodeObjects.ts` 汇总导出）。模型走 `loadGLTFModel`。
- **模型部件**：模型内部的子物体可以单独改材质、显隐、位置（`overrides`）。SceneSync 记下每个部件导入时的原始状态（`AssetNodeState`），
  每次先恢复原样再套用覆盖，所以删掉覆盖就能回到原样。
- 结构变化时（父子关系变了）会先把整棵树从引擎摘下（`suspended`），改完再挂回去，因为引擎在挂上时建立了拾取索引。
- 更新是排队串行的（`queue`），调用方可以连续调用 `update` 不用等待。

### 3. 数据：数据源 → 运行时状态 → 规则 / 特效

`runtime/twin/createTwinState.ts`、`runtime/twin/TwinDataRuntime.ts`、`infrastructure/data/`、`runtime/effects/`

- **运行时状态**（`createTwinState`）是一个 Vue 响应式对象：设备绑定列表、每个「绑定 + 变量」的当前值、数据源状态。
  值只在内存里，**不写进文档**。`runtimeRevision` 每次有新值就加一，界面和规则靠它触发更新。
- **TwinDataRuntime** 负责数据源的生命周期：读场景的 `dataSources`，启动启用的那一个（WebSocket / HTTP 轮询 / 静态），
  断开或出错就清空所有值。三种数据源都实现同一个 `DataSource` 接口（`start` / `stop`），收到的消息都交给
  `mapWebSocketDeviceMessage` 按设备编号和变量类型筛选后写入状态。
- **VisualRuleRuntime** 监听运行时状态，对每条启用的规则求值（`evaluateCondition`），命中就生成特效实例交给 **EffectRuntime**；
  特效的三维表现在 `effectVisuals.ts`。规则没命中或数据源断开，特效自动撤掉。

### 4. 场景格式版本

`domain/scene/sceneVersioning.ts`、`sceneMigrations.ts`、`docs/schema/`

- 当前格式 v2（`SCENE_DOCUMENT_VERSION`）。读取时先按文件里的版本号用对应 schema 校验，再逐版本迁移到当前版本（v1 → v2）。
- 比程序更新的格式会报「请升级」的错误，而不是半懂不懂地打开。
- 改了 schema 要跑 `UPDATE_SCHEMAS=1 pnpm --filter @twin-studio/core vitest run` 更新 `docs/schema/` 下发布的 JSON Schema（有测试检查它是否最新）。

## 其他模块速查

| 文件 | 做什么 |
| --- | --- |
| `engine/TwinEngine.ts` | 一块画布一个引擎：渲染器、场景、相机、拾取、帧循环、截图 |
| `engine/CameraRig.ts` | 相机：轨道控制、飞到视角、聚焦对象、镜头范围限制 |
| `engine/RenderPipeline.ts` | 后期处理链：泛光、描边、调色、抗锯齿；参数变化原地更新 |
| `engine/Atmosphere.ts` / `Weather.ts` | 天空、时间、光照、雾；雨雪天气 |
| `engine/quality.ts` | 按设备性能自动选择画质档位、自适应分辨率 |
| `runtime/scene/ModelAnimator.ts` | 模型自带动画片段播放；部件旋转（可跟随数据） |
| `runtime/interactions/InteractionRuntime.ts` | 点击对象触发的交互动作 |
| `runtime/tour/TourPlayer.ts` | 导览：逐步飞到视角、显示字幕、切换图层；手动操作即打断 |
| `runtime/twin/TwinSceneRuntime.ts` | Viewer 的总装：引擎 + SceneSync + 数据 + 规则 + 交互 + 导览 + 对外事件 |
| `infrastructure/packages/` | `.twin.zip` 项目包：格式、读写、资源校验 |
| `contract/viewerContract.ts` | Viewer SDK 对外的类型；改这里要同步 `packages/viewer/index.d.ts`（类型检查会对比） |

## 测试

`test/` 下是 vitest 单元测试（场景格式、迁移、文档仓库、场景同步、编辑操作、数据源、规则…），`pnpm test:unit` 运行。
需要浏览器的流程在各 app 的 e2e 测试里。
