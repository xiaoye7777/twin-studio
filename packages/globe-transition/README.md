# @twin-studio/globe-transition

切换园区时的 GTA5 式转场：相机从当前园区升空穿云 → 拉远到地球全貌 → 转到目的地 → 俯冲穿云 → 落回新场景。

**这是可选插件。** 只依赖 `three`，不引用项目其他代码；地球用自己的画布和渲染器叠在页面最上层，不进项目的场景和渲染管线。

## 怎么用

预览模式右下角点「🌐 切换园区」，选目标园区。

园区第一次用时要在地球上定位：拖动转地球，滚轮缩放，单击落点，或从城市列表里选。之后可以在菜单里的「设置当前园区的位置」修改。

位置存在浏览器 `localStorage`（`twin-studio.globe-locations`），不写进场景文件和项目包，所以换一台电脑要重新定位。插件不会替园区编造位置。

## 接入

项目里只有一处调用（`apps/editor/src/views/editor/SceneEditor.vue`）：

```ts
attachGlobeTransition(opened, {
  projectId,
  projects: () => projects.projects,
  openProject: id => router.replace('/projects').then(() => router.replace(`/editor/${id}`)),
})
```

`opened` 只要结构上符合 `GlobeHost`（见 `src/host.ts`）就行，插件不需要项目为它改任何接口。

`openProject` 先跳到列表页，是因为 `SceneEditor` 只在挂载时读一次 `projectId`；这时画面已被地球盖住，看不到列表页。

## 摘除

1. 删掉 `SceneEditor.vue` 里的 import 和上面这段调用
2. 删掉 `apps/editor/package.json` 里的 `@twin-studio/globe-transition`
3. 把根 `package.json` 的 `test:unit` 改回只跑 core，删掉 `scripts/e2e.mjs` 的 `globe` 一行
4. 删掉 `packages/globe-transition/`，运行 `pnpm install`

场景数据里没有它留下的任何东西。

## 调手感

节奏和高度都在 `src/flightPlan.ts` 的 `TIMING`：

| 参数                    | 含义                     |
| ----------------------- | ------------------------ |
| `lift`                  | 从场景升空到被云盖住     |
| `pull`                  | 从近地拉到全貌           |
| `turn` `turnPerHalfEarth` | 转地球的时长，距离越远越久 |
| `dive`                  | 从全貌俯冲到近地         |
| `land`                  | 穿出云层，落回场景       |

目标场景没加载完时，时钟停在全貌（屏幕显示「正在载入场景」），加载完再俯冲，所以不会露出半成品。最多等 25 秒。

## 失败时

| 情况             | 结果                     |
| ---------------- | ------------------------ |
| 贴图或 WebGL 失败 | 不播动画，直接跳到目标项目 |
| 路由跳转失败     | 落回原场景               |
| 目标场景打不开   | 最多等 25 秒，把画面还给页面（编辑器自己显示错误） |

## 测试

```bash
pnpm --filter @twin-studio/globe-transition test
node scripts/e2e.mjs --only globe
```
