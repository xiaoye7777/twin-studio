# 电站设备模型

储能电站案例用到的箱变、主变、出线间隔、预制舱、光伏车棚、充电桩、桥架、围栏、高杆灯、道闸和标识牌，都由 `build.mjs` 生成，和储能柜共用 `../model-kit/`（材质、标签贴图、压缩导出）。

```bash
cd apps/editor
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/station-models/build.mjs          # 全部
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/station-models/build.mjs hv-bay   # 只生成一个
```

模型变了之后，删掉 `public/demo-assets/thumbs/` 下对应的缩略图，再运行 `scripts/render-builtin-thumbnails.mjs`。标签文字在 `../model-kit/textures.mjs` 里。
