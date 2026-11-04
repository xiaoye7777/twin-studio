// 储能电站案例用到的设备：程序化建模，和储能柜同一套工具和材质。1 单位 = 1 米，Y 向上，正面朝 +Z，原点在底部中心。
// 运行：node scripts/station-models/build.mjs [模型文件名…]，不带参数生成全部。
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { createKit, disposeTextures } from '../model-kit/kit.mjs'

const wanted = process.argv.slice(2)
async function model(file, name, build) {
  if (wanted.length && !wanted.includes(file)) return
  const kit = await createKit({ name, rootId: file })
  await build(kit)
  await kit.finish(fileURLToPath(new URL(`../../public/demo-assets/${file}.glb`, import.meta.url)))
}

/** 一段百叶：边框 + 带角度的叶片。 */
function vent(kit, p, w, h, center, n = Math.round(h / 0.035)) {
  const { M } = kit
  p.box(M.body, [w + 0.03, h + 0.03, 0.008], [center[0], center[1], center[2] - 0.002], { r: 0.003 })
  p.louver(M.body, w, h, n, [center[0], center[1], center[2] + 0.004])
}

// ---------------------------------------------------------------- 箱式变压器
await model('box-transformer', '箱式变压器', kit => {
  const { M, Part, place, tint, matte } = kit
  const concrete = tint(matte, '#8e918f')
  const W = 4.4,
    H = 2.5,
    D = 2.2,
    B = 0.22
  const p = new Part('箱变本体')
  p.box(concrete, [W + 0.3, B, D + 0.3], [0, B / 2, 0], { r: 0.015 })
  p.box(M.dark, [W + 0.02, 0.08, D + 0.02], [0, B + 0.04, 0], { r: 0.004 })
  p.box(M.body, [W, H - 0.08, D], [0, B + 0.08 + (H - 0.08) / 2, 0], { r: 0.012, seg: 2 })
  const y0 = B + 0.08
  // 顶盖：外挑，两坡
  const top = y0 + H - 0.08
  p.box(M.dark, [W + 0.03, 0.03, D + 0.03], [0, top + 0.015, 0])
  p.box(M.body, [W + 0.16, 0.05, D + 0.16], [0, top + 0.055, 0], { r: 0.012, seg: 2 })
  p.box(M.body, [W + 0.02, 0.1, D * 0.55], [0, top + 0.1, 0], { r: 0.02, seg: 2 })
  for (const x of [-1.5, 0, 1.5]) {
    p.box(M.dark, [0.5, 0.05, 0.3], [x, top + 0.175, 0], { r: 0.004 })
    p.box(M.body, [0.6, 0.025, 0.4], [x, top + 0.21, 0], { r: 0.006 })
  }
  // 正反两面各三个仓，每仓一对门
  const bays = [-W / 3, 0, W / 3]
  for (const side of [1, -1]) {
    const z = (side * D) / 2
    const ry = side > 0 ? 0 : Math.PI
    const at = (x, y, dz = 0) => [side * x, y, z + side * dz]
    for (const bx of bays) {
      for (const s of [-1, 1]) {
        const dx = bx + (s * W) / 12
        const dw = W / 6 - 0.03
        p.box(M.body, [dw, H - 0.26, 0.02], at(dx, y0 + (H - 0.08) / 2, 0.008), { r: 0.004, rot: [0, ry, 0] })
        const inset = dw - 0.12
        p.box(M.dark, [inset + 0.02, 0.5, 0.004], at(dx, y0 + 0.42, 0.018), { rot: [0, ry, 0] })
        p.louver(M.body, inset, 0.48, 12, at(dx, y0 + 0.42, 0.026), { ry })
        p.box(M.dark, [inset + 0.02, 0.3, 0.004], at(dx, y0 + H - 0.5, 0.018), { rot: [0, ry, 0] })
        p.louver(M.body, inset, 0.28, 7, at(dx, y0 + H - 0.5, 0.026), { ry })
        // 铰链
        for (const hy of [0.45, 1.15, 1.85])
          p.cyl(M.dark, 0.012, 0.09, at(dx + (s * dw) / 2 - s * 0.01, y0 + hy, 0.026), { seg: 8 })
      }
      p.box(M.plastic, [0.03, 0.22, 0.02], at(bx - 0.035, y0 + 1.1, 0.03), { r: 0.006 })
      p.box(M.plastic, [0.03, 0.22, 0.02], at(bx + 0.035, y0 + 1.1, 0.03), { r: 0.006 })
    }
    p.label(side > 0 ? 'tagBox' : 'hv', side > 0 ? 0.52 : 0.14, side > 0 ? 0.1 : 0.187, at(0, y0 + 1.55, 0.0195), {
      ry,
    })
    p.label('hv', 0.14, 0.187, at(-W / 3, y0 + 1.55, 0.0195), { ry })
    p.label('earth', 0.09, 0.085, at(W / 3, y0 + 1.5, 0.0195), { ry })
  }
  // 两端散热百叶
  for (const s of [-1, 1]) {
    p.box(M.dark, [0.004, 1.3, 1.5], [(s * W) / 2 + s * 0.002, y0 + 1.15, 0])
    for (let i = 0; i < 28; i++)
      p.box(M.body, [0.03, 0.032, 1.46], [(s * W) / 2 + s * 0.012, y0 + 0.55 + i * 0.045, 0], { rot: [0, 0, s * 0.6] })
  }
  place(p, 'box-transformer.body')
})

// ---------------------------------------------------------------- 主变压器
await model('main-transformer', '主变压器', kit => {
  const { M, Part, place, tint, matte, metal } = kit
  const paint = tint(metal, '#6d777c')
  const paintDark = tint(metal, '#4b5459')
  const porcelain = tint(matte, '#6d3f2e')
  const concrete = tint(matte, '#8e918f')
  const p = new Part('主变本体')
  const W = 4.2,
    D = 2.2,
    H = 2.7,
    Y = 0.5
  p.box(concrete, [W + 2.8, 0.35, D + 3.2], [0, 0.175, 0], { r: 0.02 })
  for (const z of [-0.65, 0.65]) p.box(paintDark, [W + 0.6, 0.15, 0.26], [0, 0.42, z])
  p.box(M.dark, [W + 0.1, 0.1, D + 0.1], [0, Y + 0.05, 0], { r: 0.008 })
  p.box(paint, [W, H, D], [0, Y + 0.1 + H / 2, 0], { r: 0.03, seg: 2 })
  const top = Y + 0.1 + H
  p.box(paint, [W + 0.14, 0.09, D + 0.14], [0, top + 0.045, 0], { r: 0.015 })
  // 箱壳加强筋
  for (let i = 0; i < 7; i++)
    for (const s of [-1, 1])
      p.box(paint, [0.09, H - 0.2, 0.05], [-W / 2 + 0.3 + i * 0.6, Y + 0.1 + H / 2, s * (D / 2 + 0.02)], { r: 0.01 })
  // 法兰螺栓
  for (let i = 0; i < 20; i++)
    for (const s of [-1, 1])
      p.cyl(M.zinc, 0.018, 0.02, [-W / 2 + 0.1 + i * 0.21, top + 0.1, s * (D / 2 + 0.03)], { seg: 6 })
  // 片式散热器：前后各三组，集油管 + 一排薄片
  for (const s of [-1, 1]) {
    for (const cx of [-1.3, 0, 1.3]) {
      const z0 = s * (D / 2 + 0.2)
      for (const y of [Y + 0.5, Y + H - 0.3]) {
        p.cyl(paintDark, 0.05, 1.08, [cx, y, z0 + s * 0.45], { axis: 'x', seg: 10 })
        p.cyl(paintDark, 0.05, 0.62, [cx, y, z0 + s * 0.12], { axis: 'z', seg: 10 })
      }
      for (let i = 0; i < 14; i++)
        p.box(paint, [0.03, H - 0.7, 0.72], [cx - 0.5 + i * 0.077, Y + (H + 0.2) / 2, z0 + s * 0.46], { r: 0.008 })
    }
  }
  // 高压套管：瓷瓶一节节叠上去
  const bushing = (x, z, base, sheds, r, cap) => {
    p.cyl(M.dark, r * 1.6, 0.1, [x, top + 0.14, z], { seg: 14 })
    for (let i = 0; i < sheds; i++) {
      const y = top + base + i * 0.085
      p.cyl(porcelain, r * 1.75, 0.03, [x, y, z], { seg: 14, r2: r * 1.05 })
      p.cyl(porcelain, r, 0.06, [x, y + 0.045, z], { seg: 12 })
    }
    const end = top + base + sheds * 0.085
    p.cyl(M.alu, r * 0.9, 0.12, [x, end + 0.05, z], { seg: 12 })
    p.cyl(M.copper, r * 0.45, 0.16, [x, end + 0.18, z], { seg: 10 })
    p.box(M.copper, [0.14, 0.03, 0.14], [x, end + 0.27, z])
  }
  for (const x of [-1.15, 0, 1.15]) bushing(x, -0.45, 0.2, 14, 0.09, true)
  for (const x of [-1.2, -0.4, 0.4, 1.2]) bushing(x, 0.55, 0.2, 5, 0.06, true)
  // 储油柜：卧式油枕，支架、呼吸器和联管
  const conX = -0.2,
    conY = top + 1.15,
    conZ = 0.0
  p.cyl(paint, 0.34, 2.9, [conX, conY, conZ], { axis: 'x', seg: 24 })
  for (const s of [-1, 1]) {
    p.ball(paint, 0.34, [conX + s * 1.45, conY, conZ], { seg: 20, scale: [0.28, 1, 1] })
    p.box(paintDark, [0.1, 1.0, 0.1], [conX + s * 1.0, top + 0.55, conZ], { r: 0.01 })
    p.box(paintDark, [0.1, 0.08, 0.72], [conX + s * 1.0, conY - 0.34, conZ], { r: 0.01 })
  }
  p.tube(
    paintDark,
    [
      [conX + 0.4, conY - 0.32, conZ],
      [conX + 0.4, top + 0.5, conZ + 0.15],
      [conX + 0.4, top + 0.2, conZ + 0.3],
    ],
    0.035,
    { seg: 14 },
  )
  p.cyl(M.plasticLight, 0.05, 0.22, [conX + 1.65, conY - 0.55, conZ + 0.15], { seg: 12 })
  p.cyl(M.zinc, 0.09, 0.012, [conX - 1.54, conY, conZ], { axis: 'x', seg: 18 })
  // 侧面控制箱、爬梯、接地
  const cx = W / 2 + 0.2
  p.box(M.body, [0.3, 1.0, 0.7], [cx, Y + 1.1, 0], { r: 0.012 })
  p.box(M.plastic, [0.012, 0.16, 0.03], [cx + 0.156, Y + 1.1, 0.2])
  p.label('tagMain', 0.6, 0.116, [cx + 0.152, Y + 1.42, -0.0], { ry: Math.PI / 2 })
  p.label('hv', 0.2, 0.267, [cx + 0.152, Y + 1.0, -0.13], { ry: Math.PI / 2 })
  const lx = -W / 2 - 0.1
  for (const z of [-0.22, 0.22]) p.box(M.zinc, [0.03, H + 0.3, 0.03], [lx, Y + 0.3 + H / 2, z])
  for (let i = 0; i < 9; i++) p.cyl(M.zinc, 0.012, 0.44, [lx, Y + 0.4 + i * 0.32, 0], { axis: 'z', seg: 6 })
  p.label('tagMain', 0.8, 0.155, [0, Y + 1.7, D / 2 + 0.0465 + 0.001])
  place(p, 'main-transformer.body')
})

// ---------------------------------------------------------------- 预制舱
async function cabin(file, name, tag, doors) {
  await model(file, name, kit => {
    const { M, Part, place, tint, matte, metal } = kit
    const glass = tint(metal, '#1e3a4c')
    const concrete = tint(matte, '#8e918f')
    const L = 12,
      H = 3.1,
      D = 3.4,
      B = 0.5
    const p = new Part(`${name}本体`)
    for (const x of [-5, -1.7, 1.7, 5]) p.box(concrete, [0.7, B, D + 0.2], [x, B / 2, 0], { r: 0.01 })
    p.box(M.dark, [L + 0.06, 0.16, D + 0.06], [0, B + 0.08, 0], { r: 0.004 })
    const y0 = B + 0.16
    p.box(M.body, [L, H, D], [0, y0 + H / 2, 0], { r: 0.01 })
    // 墙板：每 1.2 米一条竖向接缝加压条，远看也不闪
    for (const side of [1, -1])
      for (let i = 0; i <= 10; i++)
        p.box(M.body, [0.05, H - 0.34, 0.025], [-L / 2 + i * 1.2, y0 + H / 2, side * (D / 2 + 0.01)], { r: 0.008 })
    for (const side of [-1, 1])
      for (let i = 0; i <= 3; i++)
        p.box(M.body, [0.025, H - 0.34, 0.05], [side * (L / 2 + 0.01), y0 + H / 2, -D / 2 + 0.1 + i * 1.07], {
          r: 0.008,
        })
    // 上下收边 + 主题色腰线
    for (const s of [1, -1]) {
      p.box(M.dark, [L + 0.03, 0.12, 0.03], [0, y0 + 0.06, s * (D / 2 + 0.016)])
      p.box(M.accent, [L + 0.03, 0.2, 0.03], [0, y0 + H - 0.1, s * (D / 2 + 0.016)])
    }
    for (const s of [-1, 1]) {
      p.box(M.dark, [0.03, 0.12, D + 0.03], [s * (L / 2 + 0.016), y0 + 0.06, 0])
      p.box(M.accent, [0.03, 0.2, D + 0.03], [s * (L / 2 + 0.016), y0 + H - 0.1, 0])
    }
    // 屋面：外挑檐口和设备
    const top = y0 + H
    p.box(M.dark, [L + 0.3, 0.1, D + 0.3], [0, top + 0.05, 0], { r: 0.012 })
    p.box(M.body, [L + 0.1, 0.1, D + 0.1], [0, top + 0.14, 0], { r: 0.03, seg: 2 })
    for (const x of [-4, 0, 4]) {
      p.cyl(M.zinc, 0.14, 0.2, [x, top + 0.29, 0], { seg: 16 })
      p.cyl(M.zinc, 0.24, 0.06, [x, top + 0.42, 0], { seg: 18, r2: 0.1 })
    }
    // 门、台阶、门灯
    const faceZ = D / 2 + 0.024
    for (const x of doors) {
      p.box(M.dark, [1.16, 2.3, 0.03], [x, y0 + 1.15, faceZ])
      for (const s of [-1, 1]) {
        p.box(M.plasticLight, [0.53, 2.2, 0.04], [x + s * 0.28, y0 + 1.12, faceZ + 0.012], { r: 0.006 })
        p.box(glass, [0.26, 0.42, 0.006], [x + s * 0.28, y0 + 1.72, faceZ + 0.034])
      }
      p.box(M.plastic, [0.03, 0.2, 0.03], [x - 0.05, y0 + 1.05, faceZ + 0.045], { r: 0.008 })
      p.box(M.plastic, [0.03, 0.2, 0.03], [x + 0.05, y0 + 1.05, faceZ + 0.045], { r: 0.008 })
      p.box(M.zinc, [1.4, 0.04, 0.9], [x, B + 0.14, faceZ + 0.45])
      for (let i = 1; i <= 2; i++) p.box(M.zinc, [1.4, 0.03, 0.26], [x, B + 0.14 - i * 0.17, faceZ + 0.75 + i * 0.26])
      for (const s of [-1, 1])
        p.tube(
          M.zinc,
          [
            [x + s * 0.68, B + 0.14, faceZ + 0.1],
            [x + s * 0.68, B + 1.05, faceZ + 0.1],
            [x + s * 0.68, B + 1.05, faceZ + 0.85],
            [x + s * 0.68, 0.12, faceZ + 1.5],
          ],
          0.018,
          { radial: 6, seg: 16 },
        )
      p.box(M.plasticLight, [0.5, 0.07, 0.14], [x, y0 + 2.48, faceZ + 0.07], { r: 0.008 })
      p.box(M.lamp, [0.44, 0.012, 0.1], [x, y0 + 2.442, faceZ + 0.07])
    }
    // 窗
    const spots = [-4.6, -3, -1.4, 0.2, 1.8, 3.4, 5].filter(x => doors.every(d => Math.abs(d - x) > 1.1))
    for (const x of spots) {
      p.box(M.dark, [1.14, 1.04, 0.05], [x, y0 + 1.7, faceZ + 0.006])
      p.box(M.glassLit ?? glass, [1.04, 0.94, 0.012], [x, y0 + 1.7, faceZ + 0.03])
      p.box(M.dark, [0.03, 0.94, 0.02], [x, y0 + 1.7, faceZ + 0.032])
    }
    p.label(tag, 1.8, 0.348, [doors[0] + 1.75 > 5 ? doors[0] - 1.75 : doors[0] + 1.75, y0 + 2.72, faceZ + 0.02])
    p.label('hv', 0.2, 0.267, [doors[0] - 0.85, y0 + 1.6, faceZ + 0.007])
    // 背面室外机和桥架接口
    const backZ = -D / 2 - 0.024
    for (const x of [-3.6, -1.2, 1.2, 3.6]) {
      p.box(M.plasticLight, [1.0, 0.72, 0.36], [x, y0 + 0.72, backZ - 0.2], { r: 0.012 })
      p.cyl(M.dark, 0.26, 0.012, [x - 0.12, y0 + 0.72, backZ - 0.385], { axis: 'z', seg: 22 })
      for (const f of [0.5, 0.75, 1])
        p.torus(M.zinc, 0.26 * f, 0.004, [x - 0.12, y0 + 0.72, backZ - 0.392], { seg: 22, radial: 4 })
      p.box(M.zinc, [1.1, 0.03, 0.46], [x, y0 + 0.34, backZ - 0.22])
      p.tube(
        M.plasticLight,
        [
          [x + 0.4, y0 + 0.95, backZ - 0.1],
          [x + 0.4, y0 + 1.3, backZ - 0.03],
        ],
        0.02,
        { radial: 6, seg: 4 },
      )
    }
    place(p, `${file}.body`)
  })
}
await cabin('switchgear-cabin', '35kV 开关舱', 'tagSwitch', [-3.8, 3.8])
await cabin('control-room', '站控室', 'tagControl', [-1])

// ---------------------------------------------------------------- 高压出线间隔
await model('hv-bay', '高压出线间隔', kit => {
  const { M, Part, place, tint, matte, metal } = kit
  const steel = tint(metal, '#7f8a90')
  const porcelain = tint(matte, '#6d3f2e')
  const concrete = tint(matte, '#8e918f')
  const p = new Part('出线间隔')
  const lattice = (x, h) => {
    const w = 0.5
    p.box(concrete, [1.1, 0.35, 1.1], [x, 0.175, 0], { r: 0.02 })
    for (const dx of [-w / 2, w / 2])
      for (const dz of [-w / 2, w / 2]) p.box(steel, [0.05, h, 0.05], [x + dx, 0.35 + h / 2, dz])
    const pitch = 0.6
    for (let i = 0; i < Math.floor(h / pitch); i++) {
      const y = 0.35 + i * pitch
      const brace = (a, b) => p.tube(steel, [a, b], 0.012, { radial: 4, seg: 1 })
      const sign = i % 2 ? 1 : -1
      for (const dz of [-w / 2, w / 2]) brace([x - sign * (w / 2), y, dz], [x + sign * (w / 2), y + pitch, dz])
      for (const dx of [-w / 2, w / 2]) brace([x + dx, y, -sign * (w / 2)], [x + dx, y + pitch, sign * (w / 2)])
      for (const dz of [-w / 2, w / 2]) p.box(steel, [w, 0.02, 0.02], [x, y, dz])
      for (const dx of [-w / 2, w / 2]) p.box(steel, [0.02, 0.02, w], [x + dx, y, 0])
    }
  }
  const H = 9,
    span = 10
  lattice(-span / 2, H)
  lattice(span / 2, H)
  // 横梁桁架
  const by = H + 0.35
  for (const y of [by - 0.5, by]) for (const z of [-0.22, 0.22]) p.box(steel, [span + 0.5, 0.05, 0.05], [0, y, z])
  for (let i = 0; i < 18; i++) {
    const x = -span / 2 + (i * span) / 18
    const next = x + span / 18
    for (const z of [-0.22, 0.22])
      p.tube(
        steel,
        [
          [x, i % 2 ? by : by - 0.5, z],
          [next, i % 2 ? by - 0.5 : by, z],
        ],
        0.012,
        { radial: 4, seg: 1 },
      )
    p.box(steel, [0.02, 0.02, 0.44], [x, by, 0])
  }
  // 三相悬式绝缘子串
  for (const x of [-3, 0, 3]) {
    for (let i = 0; i < 7; i++) p.cyl(porcelain, 0.13, 0.03, [x, by - 0.62 - i * 0.11, 0], { seg: 12, r2: 0.05 })
    p.cyl(M.zinc, 0.018, 0.82, [x, by - 0.92, 0], { seg: 6 })
    p.box(M.alu, [0.14, 0.05, 0.1], [x, by - 1.38, 0])
  }
  // 地面设备：每相一组支柱绝缘子和隔离开关
  for (const x of [-3, 0, 3]) {
    const z = 2.6
    p.box(concrete, [0.7, 0.3, 0.7], [x, 0.15, z], { r: 0.015 })
    p.cyl(steel, 0.09, 2.6, [x, 1.6, z], { seg: 10 })
    p.box(steel, [0.5, 0.06, 1.3], [x, 2.92, z])
    for (const dz of [-0.5, 0.5]) {
      for (let i = 0; i < 8; i++) p.cyl(porcelain, 0.1, 0.05, [x, 3.0 + i * 0.09, z + dz], { seg: 10, r2: 0.06 })
      p.box(M.alu, [0.1, 0.05, 0.14], [x, 3.75, z + dz])
    }
    p.box(M.copper, [0.05, 0.03, 1.1], [x, 3.8, z])
  }
  place(p, 'hv-bay.body')
})

// ---------------------------------------------------------------- 光伏车棚
await model('pv-carport', '光伏车棚', kit => {
  const { M, Part, place, material, tint, metal, doc } = kit
  const steel = tint(metal, '#59636a')
  const pvGlass = material('光伏玻璃', '#ffffff', 0.1, 0.34, { decal: true })
  pvGlass.gltf.setBaseColorTexture(M.decal.gltf.getBaseColorTexture())
  void doc
  const p = new Part('车棚')
  const L = 16,
    Depth = 6.4,
    tilt = 0.14
  const pitch = 4
  for (let i = 0; i <= L / pitch; i++) {
    const x = -L / 2 + i * pitch
    p.box(M.zinc, [0.5, 0.12, 0.5], [x, 0.06, -0.9], { r: 0.01 })
    p.box(steel, [0.18, 3.0, 0.18], [x, 1.6, -0.9], { r: 0.015 })
    // 悬臂主梁，向前挑出
    const beamLen = Depth + 0.2
    p.box(steel, [0.14, 0.24, beamLen], [x, 3.08, 0], { r: 0.012, rot: [tilt, 0, 0] })
    p.tube(
      steel,
      [
        [x, 2.25, -0.9],
        [x, 2.9, 0.55],
      ],
      0.05,
      { radial: 8, seg: 2 },
    )
    p.tube(
      steel,
      [
        [x, 2.45, -0.9],
        [x, 3.2, -2.1],
      ],
      0.04,
      { radial: 8, seg: 2 },
    )
  }
  const up = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(tilt, 0, 0))
  const along = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(tilt, 0, 0))
  const onRoof = (x, s, h) => {
    const v = new THREE.Vector3(x, 3.08, 0).addScaledVector(along, s).addScaledVector(up, h)
    return [v.x, v.y, v.z]
  }
  for (const s of [-2.6, -0.9, 0.9, 2.6])
    p.box(M.zinc, [L + 0.3, 0.08, 0.05], onRoof(0, s, 0.14), { rot: [tilt, 0, 0] })
  const mw = 1.13,
    md = 2.2
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 14; col++) {
      const x = -L / 2 + 0.1 + mw * (col + 0.5)
      const s = (row - 1) * (md + 0.03)
      p.box(M.alu, [mw - 0.015, 0.035, md - 0.01], onRoof(x, s, 0.2), { rot: [tilt, 0, 0] })
      p.label('pvCell', mw - 0.04, md - 0.04, onRoof(x, s, 0.2185), { rx: tilt - Math.PI / 2, mat: pvGlass })
    }
  }
  // 车棚下的灯带
  for (let i = 0; i < 4; i++)
    p.box(M.lamp, [1.2, 0.015, 0.08], onRoof(-L / 2 + 2 + i * 4, 0.8, -0.13), { rot: [tilt, 0, 0] })
  place(p, 'pv-carport.body')
})

// ---------------------------------------------------------------- 充电桩
await model('ev-charger', '充电桩', kit => {
  const { M, Part, place, tint, matte } = kit
  const concrete = tint(matte, '#8e918f')
  const p = new Part('充电桩')
  p.box(concrete, [0.9, 0.16, 0.65], [0, 0.08, 0], { r: 0.02 })
  p.box(M.dark, [0.7, 0.16, 0.42], [0, 0.24, 0], { r: 0.012 })
  p.box(M.body, [0.68, 1.62, 0.4], [0, 1.13, 0], { r: 0.04, seg: 3 })
  p.box(M.accent, [0.685, 0.5, 0.405], [0, 1.72, 0], { r: 0.04, seg: 3 })
  p.box(M.plastic, [0.46, 0.34, 0.012], [0, 1.45, 0.2], { r: 0.008 })
  p.label('evScreen', 0.42, 0.28, [0, 1.45, 0.2075], { mat: M.screen })
  p.box(M.lamp, [0.5, 0.012, 0.012], [0, 1.93, 0.2])
  p.cyl(M.red, 0.026, 0.02, [0.2, 1.14, 0.205], { axis: 'z', seg: 14 })
  p.cyl(M.yellow, 0.036, 0.004, [0.2, 1.14, 0.2], { axis: 'z', seg: 16 })
  for (const s of [-1, 1]) {
    p.box(M.plastic, [0.09, 0.2, 0.08], [s * 0.39, 1.15, 0.05], { r: 0.012 })
    p.tube(
      M.rubber,
      [
        [s * 0.39, 1.05, 0.05],
        [s * 0.5, 0.6, 0.16],
        [s * 0.44, 0.35, 0.22],
        [s * 0.34, 0.5, 0.1],
        [s * 0.34, 0.62, 0.0],
      ],
      0.013,
      { radial: 6, seg: 22 },
    )
  }
  for (let i = 0; i < 9; i++) p.box(M.dark, [0.3, 0.008, 0.002], [-0.1, 0.42 + i * 0.03, 0.201])
  place(p, 'ev-charger.body')
})

// ---------------------------------------------------------------- 电缆桥架（一段 6 米，可排列）
await model('cable-tray', '电缆桥架', kit => {
  const { M, Part, place } = kit
  const p = new Part('桥架')
  const L = 6,
    Y = 2.9,
    W = 0.6
  for (const x of [-L / 2 + 0.06]) {
    p.box(M.zinc, [0.34, 0.02, 0.34], [x, 0.01, 0])
    p.box(M.zinc, [0.12, Y + 0.3, 0.12], [x, (Y + 0.3) / 2, 0], { r: 0.006 })
    p.box(M.zinc, [0.08, 0.1, W + 0.3], [x, Y - 0.06, 0], { r: 0.006 })
    p.tube(
      M.zinc,
      [
        [x, Y - 0.7, 0],
        [x, Y - 0.08, W / 2],
      ],
      0.022,
      { radial: 6, seg: 2 },
    )
    p.tube(
      M.zinc,
      [
        [x, Y - 0.7, 0],
        [x, Y - 0.08, -W / 2],
      ],
      0.022,
      { radial: 6, seg: 2 },
    )
  }
  for (const s of [-1, 1]) p.box(M.zinc, [L, 0.1, 0.02], [0, Y + 0.04, (s * W) / 2])
  for (let i = 0; i < 20; i++) p.box(M.zinc, [0.03, 0.015, W], [-L / 2 + 0.15 + i * 0.3, Y, 0])
  const cables = [
    [M.rubber, -0.2],
    [M.rubber, -0.12],
    [M.hv, -0.03],
    [M.hv, 0.05],
    [M.rubber, 0.14],
    [M.rubber, 0.21],
  ]
  for (const [mat, z] of cables) p.cyl(mat, 0.024, L, [0, Y + 0.035, z], { axis: 'x', seg: 8, open: true })
  place(p, 'cable-tray.body')
})

// ---------------------------------------------------------------- 围栏（一段 4 米，可排列）
async function fence(file, name, L) {
  await model(file, name, async kit => {
    const { M, Part, place, material, tint, matte, metal, textureFile } = kit
    const steel = tint(metal, '#596368')
    const concrete = tint(matte, '#8e918f')
    const mesh = material('钢丝网', '#59636a', 0.6, 0.5, { tile: true, tileScale: 12 })
    mesh.gltf
      .setBaseColorTexture(await textureFile('fence-mesh.png'))
      .setAlphaMode('MASK')
      .setAlphaCutoff(0.5)
      .setDoubleSided(true)
    const p = new Part('围栏')
    const H = 2.5
    p.box(concrete, [L, 0.25, 0.22], [0, 0.125, 0])
    for (let x = -L / 2; x < L / 2 - 0.1; x += 4) {
      p.box(steel, [0.09, H + 0.25, 0.09], [x, H / 2 + 0.125, 0], { r: 0.006 })
      p.box(steel, [0.03, 0.42, 0.03], [x, H + 0.3, -0.1], { rot: [-0.5, 0, 0] })
    }
    p.add(mesh, new THREE.PlaneGeometry(L - 0.09, H - 0.3), [0, 0.25 + (H - 0.3) / 2, 0])
    for (const y of [0.27, H - 0.05, H / 2 + 0.1]) p.box(steel, [L, 0.035, 0.035], [0, y, 0])
    // 顶部防攀爬斜撑
    for (const dy of [0, 0.12, 0.24])
      p.cyl(M.zinc, 0.004, L, [0, H + 0.18 + dy, -0.04 - dy * 0.5], { axis: 'x', seg: 4, open: true })
    place(p, `${file}.body`)
  })
}
await fence('station-fence', '围栏', 4)
await fence('station-fence-long', '围栏（16 米）', 16)

// ---------------------------------------------------------------- 高杆灯
await model('light-mast', '高杆灯', kit => {
  const { M, Part, place, tint, matte } = kit
  const concrete = tint(matte, '#8e918f')
  const p = new Part('高杆灯')
  p.cyl(concrete, 0.45, 0.3, [0, 0.15, 0], { seg: 20 })
  p.cyl(M.zinc, 0.22, 0.03, [0, 0.31, 0], { seg: 18 })
  p.cyl(M.zinc, 0.13, 11.6, [0, 6.1, 0], { seg: 14, r2: 0.055 })
  p.box(M.dark, [0.2, 0.42, 0.03], [0, 1.3, 0.11], { r: 0.004 })
  p.box(M.zinc, [1.5, 0.07, 0.07], [0, 11.8, 0])
  for (const x of [-0.65, -0.22, 0.22, 0.65]) {
    p.box(M.dark, [0.36, 0.26, 0.09], [x, 11.65, 0.08], { r: 0.012, rot: [0.5, 0, 0] })
    p.box(M.lamp, [0.3, 0.2, 0.012], [x, 11.63, 0.128], { rot: [0.5, 0, 0] })
  }
  // 监控摄像机
  p.box(M.plasticLight, [0.14, 0.12, 0.34], [0, 10.2, 0.24], { r: 0.02 })
  p.cyl(M.plastic, 0.045, 0.02, [0, 10.2, 0.415], { axis: 'z', seg: 12 })
  p.box(M.zinc, [0.04, 0.04, 0.16], [0, 10.2, 0.08])
  place(p, 'light-mast.body')
})

// ---------------------------------------------------------------- 道闸
await model('boom-barrier', '道闸', kit => {
  const { M, Part, place, tint, matte } = kit
  const concrete = tint(matte, '#8e918f')
  const white = tint(matte, '#d7dadb')
  const p = new Part('道闸')
  p.box(concrete, [0.7, 0.14, 0.6], [0, 0.07, 0], { r: 0.012 })
  p.box(M.accent, [0.36, 1.0, 0.32], [0, 0.64, 0], { r: 0.03, seg: 2 })
  p.box(M.dark, [0.3, 0.04, 0.26], [0, 1.16, 0], { r: 0.008 })
  p.cyl(M.zinc, 0.05, 0.36, [0, 0.98, 0], { axis: 'z', seg: 12 })
  const L = 5
  for (let i = 0; i < 10; i++) p.box(i % 2 ? M.red : white, [L / 10, 0.09, 0.05], [0.2 + (L / 10) * (i + 0.5), 0.98, 0])
  p.box(M.ledRed, [0.06, 0.06, 0.012], [0.2 + L - 0.1, 0.98, 0.03])
  place(p, 'boom-barrier.body')
})

// ---------------------------------------------------------------- 门口铭牌
await model('station-sign', '电站标识', kit => {
  const { M, Part, place, tint, matte } = kit
  const stone = tint(matte, '#55595c')
  const p = new Part('标识')
  p.box(tint(matte, '#8e918f'), [6.6, 0.3, 1.1], [0, 0.15, 0], { r: 0.02 })
  p.box(stone, [6.2, 1.5, 0.5], [0, 1.05, 0], { r: 0.02 })
  p.box(M.accent, [5.8, 0.56, 0.02], [0, 1.2, 0.255], { r: 0.003 })
  p.label('sign', 5.7, 0.513, [0, 1.2, 0.2665])
  p.box(M.lamp, [5.8, 0.02, 0.03], [0, 0.82, 0.26])
  place(p, 'station-sign.body')
})

await disposeTextures()
