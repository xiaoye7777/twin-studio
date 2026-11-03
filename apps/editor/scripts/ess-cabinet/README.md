# 储能柜模型

`public/demo-assets/ess-cabinet.glb` 由这里的脚本生成，不含任何第三方资源。调尺寸、改电池包数量、换颜色都改 `build.mjs` 后重新生成：

```bash
cd apps/editor
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/ess-cabinet/build.mjs
```

没有装 Playwright 的 Chromium 时才需要 `CHROME_PATH`。模型变了之后，删掉 `public/demo-assets/thumbs/ess-cabinet.webp`，再运行一次 `scripts/render-builtin-thumbnails.mjs` 更新缩略图。

## 动画片段

放进场景时已经预设好两条交互：预览和大屏中**单击开关门，双击爆炸和复位**，可以在「交互」面板里改或删。选中部件（双击模型）再添加交互，就能做到点哪个部件播哪段，比如点 05 号电池包播放 `Pack_Pull`。模型上的交互对它的每个部件都生效，所以想让部件只做自己的动作，要先删掉模型上的「单击」那条。大屏按钮用点击动作「播放模型动画」。

「属性 → 动画」里配置的是打开场景就自动播放的片段，默认是 `Fans_Run`。交互触发的片段和它同时播放，风扇不会停。

| 片段 | 内容 |
| --- | --- |
| `Fans_Run` | 风扇持续运转。文件里的第一段，没有配置时默认循环播放它 |
| `Doors_Open` / `Doors_Close` | 两扇柜门开到 110° / 关上 |
| `Explode` / `Assemble` | 完整爆炸图：线缆收起，外壳散开，设备抽出，电池包拉开并掀盖露出电芯 / 复位 |
| `Pack_Pull` / `Pack_Insert` | 05 号电池包抽出 / 推回，用于展示维护 |

## 部件

`assetNodeId` 不随模型重新生成而变化，绑定设备、改材质都用它识别部件。门的节点原点在门轴上，风扇的节点原点在转轴上，都可以直接旋转。

| assetNodeId | 部件 |
| --- | --- |
| `ess.door.battery`、`ess.door.electrical` | 电池仓门、电气仓门 |
| `ess.frame`、`ess.base`、`ess.roof` | 框架、底座、顶盖 |
| `ess.panel.left`、`ess.panel.right`、`ess.panel.back` | 三面外板 |
| `ess.rack` | 电池架 |
| `ess.pack01` … `ess.pack09` | 电池包，子部件 `.tray` 外壳、`.cells` 电芯模组、`.cover` 上盖、`.front` 前面板 |
| `ess.hvbox` | 高压箱 |
| `ess.pcs`、`ess.pcs.fan1`、`ess.pcs.fan2` | 储能变流器和它的风扇 |
| `ess.ems` | 能量管理器 |
| `ess.breakers`、`ess.busbars` | 交流配电单元、铜排 |
| `ess.fire.cylinder`、`ess.fire.panel`、`ess.fire.pipe` | 消防气瓶、控制器、管路 |
| `ess.ceiling` | 照明灯带、烟感和喷头 |
| `ess.cooling`、`ess.cooling.fan1`、`ess.cooling.fan2` | 液冷机组和它的风扇 |
| `ess.cables.power`、`ess.cables.signal`、`ess.cables.coolant` | 动力线、通信线、液冷管路 |
