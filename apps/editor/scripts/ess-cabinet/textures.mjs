// 储能柜的贴图：警示牌、铭牌、触摸屏界面（用浏览器排版，中文和矢量图形都清晰，顺带得到每个标签的 UV 区域），
// 以及喷涂表面的细噪声纹理。触摸屏上只有占位符「--」：模型不能自带看起来像真实读数的假数据。
import { writeFile } from 'node:fs/promises'
import { launch } from '../../tests/helpers.mjs'

/** 把贴图写到 out 目录。 */
export async function renderTextures(out) {
  const SIZE = 2048
  const bolt = c => `<path d="M58 18 34 58h15l-8 26 26-40H52l6-26z" fill="${c}"/>`
  const triangle = inner =>
    `<svg viewBox="0 0 100 92" width="100%"><path d="M50 4 96 86H4z" fill="#f6c21c" stroke="#111" stroke-width="6" stroke-linejoin="round"/><g transform="translate(14 14) scale(.72)">${inner}</g></svg>`
  const sign = (title, sub, icon, bar = '#f6c21c', ink = '#111') =>
    `<div class="sign"><div class="ic">${icon}</div><div class="bar" style="background:${bar};color:${ink}"><b>${title}</b><i>${sub}</i></div></div>`
  const labels = {
    hv: [20, 20, 300, 400, sign('当心触电', 'DANGER HIGH VOLTAGE', triangle(bolt('#111')))],
    fire: [
      340,
      20,
      300,
      400,
      sign(
        '禁止烟火',
        'NO OPEN FLAME',
        `<svg viewBox="0 0 100 100" width="92%"><circle cx="50" cy="50" r="42" fill="#fff" stroke="#c8201f" stroke-width="9"/><path d="M50 22c6 14 18 18 18 34a18 18 0 0 1-36 0c0-10 7-13 9-22 4 3 6 7 6 11 4-6 5-14 3-23z" fill="#111"/><path d="M22 22 78 78" stroke="#c8201f" stroke-width="9"/></svg>`,
        '#c8201f',
        '#fff',
      ),
    ],
    battery: [
      660,
      20,
      300,
      400,
      sign(
        '当心电池',
        'BATTERY HAZARD',
        triangle(
          `<rect x="28" y="30" width="44" height="62" rx="5" fill="#111"/><rect x="42" y="20" width="16" height="10" fill="#111"/><path d="M53 40 40 64h9l-4 18 15-26h-9l2-16z" fill="#f6c21c"/>`,
        ),
      ),
    ],
    earth: [
      980,
      20,
      140,
      130,
      triangle(
        `<path d="M50 28v30M26 58h48M34 70h32M43 82h14" stroke="#111" stroke-width="7" stroke-linecap="round" fill="none"/>`,
      ),
    ],
    plus: [1140, 20, 70, 70, `<div class="pol" style="background:#c8201f">+</div>`],
    minus: [1220, 20, 70, 70, `<div class="pol" style="background:#1d2022">−</div>`],
    nameplate: [
      20,
      440,
      620,
      340,
      `<div class="plate"><header><b>工商业储能一体柜</b><span>ENERGY STORAGE CABINET</span></header>${['产品型号', '电池类型', '防护等级', '出厂编号'].map(t => `<p><em>${t}</em><u></u></p>`).join('')}</div>`,
    ],
    title: [
      660,
      440,
      900,
      230,
      `<div class="title"><svg viewBox="0 0 60 60" width="130"><circle cx="30" cy="30" r="27" fill="none" stroke="#fff" stroke-width="3.5"/><path d="M33 11 18 34h10l-3 15 17-24H31l2-14z" fill="#fff"/></svg><div><b>储能系统</b><span>ENERGY STORAGE SYSTEM</span></div></div>`,
    ],
    titleSmall: [
      660,
      690,
      620,
      110,
      `<div class="title small"><div><b>电气仓</b><span>ELECTRICAL BAY</span></div></div>`,
    ],
    packLabel: [
      1300,
      690,
      520,
      110,
      `<div class="pack"><div><b>LFP BATTERY PACK</b><span>磷酸铁锂电池包</span></div><div class="bars">${Array.from({ length: 34 }, (_, i) => `<i style="width:${1 + ((i * 7) % 4)}px"></i>`).join('')}</div></div>`,
    ],
    hmi: [
      20,
      800,
      1000,
      620,
      `<div class="hmi"><header><b>系统总览</b><span>SYSTEM OVERVIEW</span><em>● 运行</em></header><div class="flow"><svg viewBox="0 0 900 320" width="100%"><g fill="none" stroke="#2fd0c8" stroke-width="4" opacity=".9"><path d="M162 90H378M522 90H738M450 136V216"/></g><g font-family="PingFang SC,Hiragino Sans GB,sans-serif" text-anchor="middle">${[
        ['电网', 90, 90],
        ['PCS', 450, 90],
        ['负载', 810, 90],
        ['电池', 450, 262],
      ]
        .map(
          ([t, x, y]) =>
            `<rect x="${x - 72}" y="${y - 46}" width="144" height="92" rx="14" fill="#0f2a38" stroke="#2fd0c8" stroke-width="3"/><text x="${x}" y="${y - 6}" fill="#d9f7f4" font-size="30" font-weight="600">${t}</text><text x="${x}" y="${y + 30}" fill="#7fb7c0" font-size="26">-- kW</text>`,
        )
        .join(
          '',
        )}</g></svg></div><footer>${['SOC', '温度', '告警'].map(t => `<div><span>${t}</span><b>--</b></div>`).join('')}</footer></div>`,
    ],
    pcs: [1040, 820, 480, 120, `<div class="tag"><b>PCS</b><span>储能变流器</span></div>`],
    ems: [1540, 820, 480, 120, `<div class="tag"><b>EMS</b><span>能量管理系统</span></div>`],
    hvbox: [1040, 960, 480, 120, `<div class="tag"><b>HV BOX</b><span>高压箱</span></div>`],
    bmu: [1540, 960, 480, 120, `<div class="tag light"><b>QF</b><span>交流配电单元</span></div>`],
    fireTag: [
      1040,
      1100,
      300,
      400,
      `<div class="firetag"><b>七氟丙烷</b><span>灭火装置</span><em>FIRE SUPPRESSION</em></div>`,
    ],
    pcb: [
      1360,
      1100,
      660,
      330,
      `<svg viewBox="0 0 660 330" width="660" height="330"><rect width="660" height="330" fill="#0c5a3c"/><g stroke="#2d9c6c" stroke-width="3" fill="none">${Array.from({ length: 16 }, (_, i) => `<path d="M0 ${18 + i * 19}H${110 + ((i * 37) % 170)}l26 26H${420 + ((i * 23) % 200)}"/>`).join('')}</g><g fill="#111"><rect x="240" y="96" width="150" height="130" rx="6"/><rect x="60" y="40" width="72" height="48"/><rect x="60" y="230" width="72" height="48"/><rect x="480" y="50" width="120" height="44"/></g><g fill="#c9a24a">${Array.from({ length: 22 }, (_, i) => `<circle cx="${20 + i * 29}" cy="314" r="7"/>`).join('')}</g></svg>`,
    ],
    hazard: [20, 1440, 1000, 80, `<div class="hazard"></div>`],
    breakers: [
      1040,
      1520,
      980,
      70,
      `<div class="strip">${['QF1 总开关', 'QF2 PCS', 'QF3 液冷', 'QF4 消防', 'QF5 辅助', 'QF6 备用'].map(t => `<span>${t}</span>`).join('')}</div>`,
    ],
    swGreen: [1340, 20, 24, 24, `<div style="width:100%;height:100%;background:#28e070"></div>`],
    swAmber: [1380, 20, 24, 24, `<div style="width:100%;height:100%;background:#ffab1f"></div>`],
    swRed: [1420, 20, 24, 24, `<div style="width:100%;height:100%;background:#ff3a2c"></div>`],
    swWhite: [1460, 20, 24, 24, `<div style="width:100%;height:100%;background:#f4f8ff"></div>`],
    arrow: [
      20,
      1540,
      300,
      120,
      `<div class="arrow"><svg viewBox="0 0 90 40" width="86"><path d="M4 20h60M48 6l18 14-18 14" stroke="#fff" stroke-width="7" fill="none"/></svg><span>进线 INLET</span></div>`,
    ],
  }
  const html = `<!doctype html><meta charset="utf8"><style>
*{box-sizing:border-box;margin:0}body{width:${SIZE}px;height:${SIZE}px;background:transparent;font-family:"PingFang SC","Hiragino Sans GB","Helvetica Neue",sans-serif;position:relative;overflow:hidden}
.l{position:absolute;display:flex;align-items:center;justify-content:center;overflow:hidden}
.sign{width:100%;height:100%;background:#fff;border:6px solid #111;border-radius:14px;display:flex;flex-direction:column;overflow:hidden}.ic{flex:1;display:flex;align-items:center;justify-content:center;padding:14px}
.bar{padding:12px 6px;text-align:center}.bar b{display:block;font-size:46px;letter-spacing:4px}.bar i{display:block;font-style:normal;font-size:19px;font-weight:600;margin-top:4px}
.pol{width:100%;height:100%;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font:700 58px/1 Helvetica}
.plate{width:100%;height:100%;padding:22px 30px;border-radius:12px;color:#1a2226;background:linear-gradient(120deg,#b4bcc0,#d4d9dc 40%,#a6afb4 70%,#c9cfd2);border:3px solid #6f7a80}
.plate header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid #1a2226;padding-bottom:10px;margin-bottom:16px}.plate b{font-size:36px}.plate span{font-size:16px;font-weight:600}
.plate p{display:flex;align-items:flex-end;gap:14px;height:50px;font-size:24px}.plate em{font-style:normal;width:120px}.plate u{flex:1;border-bottom:2px solid #5a666c}
.title{width:100%;height:100%;display:flex;align-items:center;gap:36px;padding:0 44px;background:#1d6f86;color:#fff}.title b{display:block;font-size:92px;letter-spacing:12px;font-weight:600;line-height:1.1}.title span{font-size:32px;letter-spacing:5px;opacity:.92}
.title.small{gap:0;padding:0 26px}.title.small b{font-size:50px;letter-spacing:8px;display:inline;margin-right:20px}.title.small span{font-size:22px;letter-spacing:3px}
.pack{width:100%;height:100%;display:flex;align-items:center;justify-content:space-between;padding:0 18px;background:#eef1f2;color:#14191c;border-radius:6px}.pack b{display:block;font-size:30px}.pack span{font-size:24px}.bars{display:flex;gap:2px;height:76px}.bars i{display:block;background:#14191c}
.hmi{width:100%;height:100%;background:linear-gradient(160deg,#0a1b26,#0c2733);color:#d9f7f4;padding:26px 34px;display:flex;flex-direction:column}
.hmi header{display:flex;align-items:baseline;gap:16px;border-bottom:2px solid #1f4a56;padding-bottom:12px}.hmi header b{font-size:40px}.hmi header span{font-size:20px;color:#7fb7c0}.hmi header em{margin-left:auto;font-style:normal;font-size:26px;color:#39e08a}
.flow{flex:1;display:flex;align-items:center}.hmi footer{display:flex;gap:18px}.hmi footer div{flex:1;background:#0f2a38;border:2px solid #1f4a56;border-radius:12px;padding:10px 20px;display:flex;justify-content:space-between;align-items:baseline}.hmi footer span{font-size:26px;color:#7fb7c0}.hmi footer b{font-size:40px}
.tag{width:100%;height:100%;display:flex;align-items:center;gap:22px;padding:0 24px;background:#14181b;color:#e8eef0;border-radius:6px}.tag b{font-size:58px;font-weight:700;color:#2fd0c8}.tag span{font-size:36px}.tag.light{background:#e8ebec;color:#14181b}.tag.light b{color:#14181b}
.firetag{width:100%;height:100%;background:#fff;border:6px solid #b01615;border-radius:12px;color:#b01615;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}.firetag b{font-size:62px;line-height:1.1}.firetag span{font-size:50px}.firetag em{font-style:normal;font-size:24px;font-weight:700}
.hazard{width:100%;height:100%;background:repeating-linear-gradient(-45deg,#f6c21c 0 40px,#14181b 40px 80px)}
.strip{width:100%;height:100%;display:flex;background:#f1f3f4;color:#14181b;border:2px solid #333}.strip span{flex:1;text-align:center;font-size:26px;line-height:64px;border-right:2px solid #333;font-weight:600}
.arrow{width:100%;height:100%;display:flex;align-items:center;gap:12px;padding:0 16px;background:#1a2024;color:#fff;font-size:30px;border-radius:6px}
</style>${Object.entries(labels)
    .map(
      ([name, [x, y, w, h, body]]) =>
        `<div class="l" data-name="${name}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${body}</div>`,
    )
    .join('')}`
  const { page, close } = await launch()
  await page.setViewportSize({ width: SIZE, height: SIZE })
  await page.setContent(html)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: `${out}/atlas.png`,
    omitBackground: true,
    clip: { x: 0, y: 0, width: SIZE, height: SIZE },
  })
  const powder = await page.evaluate(powderTextures)
  await close()
  const save = (name, url) => writeFile(`${out}/${name}`, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))
  await save('powder-normal.png', powder.normal)
  await save('powder-rough.png', powder.rough)
  await writeFile(
    `${out}/atlas.json`,
    JSON.stringify({
      size: SIZE,
      rects: Object.fromEntries(Object.entries(labels).map(([n, [x, y, w, h]]) => [n, [x, y, w, h]])),
    }),
  )
}

/** 在页面里运行：可平铺的细噪声，生成粉末喷涂的橘皮法线和轻微的粗糙度变化，高光才不会像塑料一样死平。 */
function powderTextures() {
  const S = 512
  const noise = (seed, cells) => {
    const grid = Array.from({ length: cells * cells }, (_, i) => {
      const v = Math.sin((i + 1) * 12.9898 * seed) * 43758.5453
      return v - Math.floor(v)
    })
    const at = (x, y) => grid[((y + cells) % cells) * cells + ((x + cells) % cells)]
    const smooth = t => t * t * (3 - 2 * t)
    return (u, v) => {
      const x = u * cells
      const y = v * cells
      const [ix, iy] = [Math.floor(x), Math.floor(y)]
      const [fx, fy] = [smooth(x - ix), smooth(y - iy)]
      return (
        (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) +
        (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy
      )
    }
  }
  const [a, b, c] = [noise(1.3, 96), noise(2.1, 48), noise(3.7, 12)]
  const h = new Float32Array(S * S)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) h[y * S + x] = a(x / S, y / S) * 0.5 + b(x / S, y / S) * 0.4 + c(x / S, y / S) * 0.1
  const paint = fill => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = S
    const context = canvas.getContext('2d')
    const image = context.createImageData(S, S)
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) fill(x, y, image.data, (y * S + x) * 4)
    context.putImageData(image, 0, 0)
    return canvas.toDataURL('image/png')
  }
  const K = 2.4
  return {
    normal: paint((x, y, d, i) => {
      const dx = (h[y * S + ((x + 1) % S)] - h[y * S + ((x + S - 1) % S)]) * -K
      const dy = (h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x]) * -K
      const l = Math.hypot(dx, dy, 1)
      d[i] = (dx / l) * 127.5 + 127.5
      d[i + 1] = (dy / l) * 127.5 + 127.5
      d[i + 2] = (1 / l) * 127.5 + 127.5
      d[i + 3] = 255
    }),
    // G 通道是粗糙度倍率，B 通道是金属度倍率
    rough: paint((x, y, d, i) => {
      d[i] = 255
      d[i + 1] = (0.82 + (h[y * S + x] - 0.5) * 0.35) * 255
      d[i + 2] = 255
      d[i + 3] = 255
    }),
  }
}
