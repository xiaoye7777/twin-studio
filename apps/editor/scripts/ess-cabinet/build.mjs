// 工商业一体式储能柜：程序化建模。1 单位 = 1 米，Y 向上，正面朝 +Z，原点在底部中心。
// 每个可动或可替换的部件是独立节点（带 assetNodeId），门的节点原点在门轴上，风扇的节点原点在转轴上。
// 用法和部件清单见同目录的 README.md。
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import { KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { renderTextures } from './textures.mjs'

const output = fileURLToPath(new URL('../../public/demo-assets/ess-cabinet.glb', import.meta.url))
const work = await mkdtemp(join(tmpdir(), 'ess-cabinet-'))
await renderTextures(work)

const doc = new Document()
doc.createBuffer()
const emissiveExt = doc.createExtension(KHRMaterialsEmissiveStrength)

// ---------------------------------------------------------------- 贴图
const atlasInfo = JSON.parse(await readFile(`${work}/atlas.json`, 'utf8'))
const atlasTexture = doc
  .createTexture('labels')
  .setMimeType('image/png')
  .setImage(await readFile(`${work}/atlas.png`))

const powder = {
  normal: doc
    .createTexture('powder-normal')
    .setMimeType('image/png')
    .setImage(await readFile(`${work}/powder-normal.png`)),
  rough: doc
    .createTexture('powder-rough')
    .setMimeType('image/png')
    .setImage(await readFile(`${work}/powder-rough.png`)),
}

// ---------------------------------------------------------------- 材质（同类零件共用，不按零件各建一个）
function material(name, hex, metal, rough, options = {}) {
  const color = new THREE.Color(hex)
  const m = doc
    .createMaterial(name)
    .setBaseColorFactor([color.r, color.g, color.b, 1])
    .setMetallicFactor(metal)
    .setRoughnessFactor(rough)
  if (options.powder) {
    m.setNormalTexture(powder.normal).setNormalScale(options.powder)
    m.setMetallicRoughnessTexture(powder.rough)
  }
  if (options.emissive) {
    const e = new THREE.Color(options.emissive)
    m.setEmissiveFactor([e.r, e.g, e.b])
    if (options.glow)
      m.setExtension(
        'KHR_materials_emissive_strength',
        emissiveExt.createEmissiveStrength().setEmissiveStrength(options.glow),
      )
  }
  return {
    gltf: m,
    tile: !!options.powder,
    decal: !!options.decal,
    vcol: !!options.vcol,
    tileScale: options.tileScale ?? 16,
  }
}
// 小零件的颜色放在顶点色里，共用「金属」和「塑料」两种底材质：一个零件再多颜色也只多一两个绘制批次。
const metal = material('金属', '#ffffff', 0.88, 0.4, { vcol: true })
const matte = material('塑料橡胶', '#ffffff', 0, 0.5, { vcol: true })
const tint = (bin, hex) => {
  const c = new THREE.Color(hex)
  return { bin, color: [c.r, c.g, c.b] }
}
const decal = material('标签', '#ffffff', 0, 0.55, { decal: true })
const screen = material('屏幕与指示灯', '#ffffff', 0, 0.18, { decal: true })
const swatch = name => ({ bin: screen, swatch: name })
const M = {
  body: material('柜体喷涂', '#a9b0b4', 0.05, 0.6, { powder: 0.16 }),
  inner: material('内腔喷涂', '#b6bcbf', 0.02, 0.7, { powder: 0.12 }),
  dark: material('深灰喷涂', '#3a4248', 0.1, 0.55, { powder: 0.14 }),
  accent: material('主题青蓝', '#1d6f86', 0.15, 0.45, { powder: 0.12 }),
  zinc: tint(metal, '#a9b2b6'),
  alu: tint(metal, '#c2c8cb'),
  anod: tint(metal, '#3d4247'),
  copper: tint(metal, '#c9794a'),
  brass: tint(metal, '#b89a50'),
  rubber: tint(matte, '#141618'),
  plastic: tint(matte, '#1c1f22'),
  plasticLight: tint(matte, '#c4c8c9'),
  hv: tint(matte, '#dd5f1c'),
  red: tint(matte, '#b81d1c'),
  yellow: tint(matte, '#e8b81a'),
  beacon: tint(matte, '#e8a818'),
  cell: tint(matte, '#2563a8'),
  fpc: tint(matte, '#c9973a'),
  coolBlue: tint(matte, '#1f6fc2'),
  coolRed: tint(matte, '#c9352d'),
  ledGreen: swatch('swGreen'),
  ledAmber: swatch('swAmber'),
  ledRed: swatch('swRed'),
  lamp: swatch('swWhite'),
  decal,
  screen,
}
decal.gltf.setBaseColorTexture(atlasTexture).setAlphaMode('MASK').setAlphaCutoff(0.5)
// 屏幕和指示灯主要靠自发光：底色压暗，颜色才不会被光照冲淡
screen.gltf
  .setBaseColorTexture(atlasTexture)
  .setBaseColorFactor([0.22, 0.22, 0.22, 1])
  .setEmissiveTexture(atlasTexture)
  .setEmissiveFactor([1, 1, 1])
screen.gltf.setExtension(
  'KHR_materials_emissive_strength',
  emissiveExt.createEmissiveStrength().setEmissiveStrength(1.15),
)

// ---------------------------------------------------------------- 建模小工具
const AXIS = { x: new THREE.Euler(0, 0, -Math.PI / 2), y: new THREE.Euler(), z: new THREE.Euler(Math.PI / 2, 0, 0) }
const clean = g => {
  const out = g.index ? g.toNonIndexed() : g
  for (const name of Object.keys(out.attributes))
    if (!['position', 'normal', 'uv', 'color'].includes(name)) out.deleteAttribute(name)
  // 拉伸体等几何可能自带 groups，合并时会要求一致，这里统一清掉
  out.clearGroups()
  return out
}

/** 一个零件：按材质收集几何体，生成时每种材质一个图元，所以零件再复杂也只占很少的绘制批次。 */
class Part {
  constructor(name) {
    this.name = name
    this.bins = new Map()
  }
  add(mat, geometry, pos = [0, 0, 0], rot = null, scale = null) {
    const g = clean(geometry.clone())
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(rot instanceof THREE.Euler ? rot : new THREE.Euler(...(rot ?? [0, 0, 0]))),
      new THREE.Vector3(...(scale ?? [1, 1, 1])),
    )
    g.applyMatrix4(matrix)
    const bin = mat.bin ?? mat
    const count = g.attributes.position.count
    if (mat.color) {
      const colors = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) colors.set(mat.color, i * 3)
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    }
    if (mat.swatch) {
      const [x, y, w, h] = atlasInfo.rects[mat.swatch]
      for (let i = 0; i < count; i++)
        g.attributes.uv.setXY(i, (x + w / 2) / atlasInfo.size, (y + h / 2) / atlasInfo.size)
    }
    if (!this.bins.has(bin)) this.bins.set(bin, [])
    this.bins.get(bin).push(g)
    return this
  }
  box(mat, [w, h, d], pos, { r = 0, seg = 1, rot } = {}) {
    const g =
      r > 0
        ? new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4))
        : new THREE.BoxGeometry(w, h, d)
    return this.add(mat, g, pos, rot)
  }
  cyl(mat, r, h, pos, { axis = 'y', seg = 16, r2 = r, open = false } = {}) {
    return this.add(mat, new THREE.CylinderGeometry(r2, r, h, seg, 1, open), pos, AXIS[axis])
  }
  ball(mat, r, pos, { scale, seg = 16, half = false } = {}) {
    const g = new THREE.SphereGeometry(r, seg, Math.ceil(seg / 2), 0, Math.PI * 2, 0, half ? Math.PI / 2 : Math.PI)
    return this.add(mat, g, pos, null, scale)
  }
  torus(mat, r, t, pos, { rot, seg = 24, arc = Math.PI * 2, radial = 6 } = {}) {
    return this.add(mat, new THREE.TorusGeometry(r, t, radial, seg, arc), pos, rot)
  }
  /** 沿折线走的管线，拐角处自动圆滑。 */
  tube(mat, points, r, { radial = 8, seg = 0 } = {}) {
    const curve = new THREE.CatmullRomCurve3(
      points.map(p => new THREE.Vector3(...p)),
      false,
      'catmullrom',
      0.25,
    )
    return this.add(mat, new THREE.TubeGeometry(curve, seg || points.length * 7, r, radial, false))
  }
  /** 贴图集里的一个标签：只是贴在表面前方的一张小四边形。 */
  label(name, w, h, pos, { ry = 0, rx = 0, mat = M.decal } = {}) {
    const [x, y, pw, ph] = atlasInfo.rects[name]
    const g = new THREE.PlaneGeometry(w, h)
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (x + uv.getX(i) * pw) / atlasInfo.size, (y + (1 - uv.getY(i)) * ph) / atlasInfo.size)
    return this.add(mat, g, pos, [rx, ry, 0])
  }
  /** 百叶：一排带角度的叶片，后面衬深色，光影比贴图真实得多。 */
  louver(mat, w, h, n, center, { back = M.anod, ry = 0 } = {}) {
    const [cx, cy, cz] = center
    const sin = Math.sin(ry),
      cos = Math.cos(ry)
    this.box(back, [w, h, 0.004], [cx - sin * 0.012, cy, cz - cos * 0.012], { rot: [0, ry, 0] })
    const pitch = h / n
    for (let i = 0; i < n; i++)
      this.box(mat, [w - 0.006, pitch * 0.82, 0.003], [cx, cy - h / 2 + pitch * (i + 0.5), cz], {
        rot: new THREE.Euler(0.72, ry, 0, 'YXZ'),
      })
    return this
  }
  /** 明装螺丝。 */
  screws(points, { axis = 'z', r = 0.005, mat = M.zinc } = {}) {
    for (const p of points) this.cyl(mat, r, 0.003, p, { axis, seg: 6 })
    return this
  }
  toMesh() {
    if (!this.bins.size) return null
    const mesh = doc.createMesh(this.name)
    for (const [mat, list] of this.bins) mesh.addPrimitive(primitive(mergeVertices(mergeGeometries(list), 1e-5), mat))
    return mesh
  }
}

function primitive(g, mat) {
  const buffer = doc.getRoot().listBuffers()[0]
  const pos = g.attributes.position.array,
    nor = g.attributes.normal.array
  let uv = g.attributes.uv.array
  if (mat.tile) {
    // 平铺贴图：按面朝向做盒状投影，纹理在任何尺寸的零件上密度都一样。
    uv = new Float32Array((pos.length / 3) * 2)
    for (let i = 0; i < pos.length / 3; i++) {
      const [ax, ay, az] = [Math.abs(nor[i * 3]), Math.abs(nor[i * 3 + 1]), Math.abs(nor[i * 3 + 2])]
      const [u, v] =
        ax > ay && ax > az
          ? [pos[i * 3 + 2], pos[i * 3 + 1]]
          : ay > az
            ? [pos[i * 3], pos[i * 3 + 2]]
            : [pos[i * 3], pos[i * 3 + 1]]
      uv[i * 2] = u * mat.tileScale
      uv[i * 2 + 1] = v * mat.tileScale
    }
  }
  const accessor = (type, array) =>
    doc.createAccessor().setType(type).setArray(new Float32Array(array)).setBuffer(buffer)
  const p = doc
    .createPrimitive()
    .setMaterial(mat.gltf)
    .setAttribute('POSITION', accessor('VEC3', pos))
    .setAttribute('NORMAL', accessor('VEC3', nor))
  if (mat.tile || mat.decal) p.setAttribute('TEXCOORD_0', accessor('VEC2', uv))
  if (mat.vcol) p.setAttribute('COLOR_0', accessor('VEC3', g.attributes.color.array))
  const count = pos.length / 3
  p.setIndices(
    doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(count > 65535 ? new Uint32Array(g.index.array) : new Uint16Array(g.index.array))
      .setBuffer(buffer),
  )
  return p
}

const scene = doc.createScene('储能柜')
const root = doc.createNode('储能柜').setExtras({ assetNodeId: 'ess' })
scene.addChild(root)
const nodes = {}

/** 把零件放进场景：id 写进 assetNodeId，重新生成模型后编辑器里的绑定和修改依然有效。 */
function place(part, id, pos = [0, 0, 0], parent = root, mesh = undefined) {
  const node = doc.createNode(part.name).setTranslation(pos).setExtras({ assetNodeId: id })
  const m = mesh === undefined ? part.toMesh() : mesh
  if (m) node.setMesh(m)
  parent.addChild(node)
  nodes[id] = node
  return node
}

// ---------------------------------------------------------------- 尺寸
const W = 1.36,
  D = 1.3,
  H = 2.3,
  BASE = 0.12
const xL = -W / 2,
  xR = W / 2,
  zF = D / 2,
  zB = -D / 2
const SX = 0.24 // 电池仓和电气仓的分隔位置
const TOP = H - 0.06
const bodyH = TOP - BASE

// ---------------------------------------------------------------- 底座：带叉车口的槽钢
{
  const p = new Part('底座')
  const y = BASE / 2
  p.box(M.dark, [W + 0.02, BASE, 0.1], [0, y, zF - 0.05], { r: 0.006 })
  p.box(M.dark, [W + 0.02, BASE, 0.1], [0, y, zB + 0.05], { r: 0.006 })
  p.box(M.dark, [0.1, BASE, D - 0.2], [xL + 0.05, y, 0], { r: 0.006 })
  p.box(M.dark, [0.1, BASE, D - 0.2], [xR - 0.05, y, 0], { r: 0.006 })
  p.box(M.dark, [W - 0.2, 0.02, D - 0.2], [0, BASE - 0.01, 0])
  for (const x of [-0.34, 0.34]) {
    for (const z of [zF + 0.0005, zB - 0.0005]) p.box(M.rubber, [0.3, 0.078, 0.002], [x, 0.054, z])
  }
  for (const [x, z] of [
    [xL + 0.05, zF - 0.05],
    [xR - 0.05, zF - 0.05],
    [xL + 0.05, zB + 0.05],
    [xR - 0.05, zB + 0.05],
  ]) {
    p.box(M.zinc, [0.12, 0.008, 0.12], [x, 0.004, z])
    p.cyl(M.zinc, 0.012, 0.012, [x, 0.012, z], { seg: 6 })
  }
  p.label('hazard', W + 0.02, 0.018, [0, BASE - 0.009, zF + 0.0012])
  p.label('earth', 0.05, 0.046, [xR - 0.07, 0.074, zF + 0.0012])
  place(p, 'ess.base')
}

// ---------------------------------------------------------------- 框架和内腔
{
  const p = new Part('框架')
  const post = 0.05,
    inset = 0.02 // 框架缩在外板里面，不能和外板共面，否则会闪烁
  const xa = xL + inset + post / 2,
    xb = xR - inset - post / 2,
    za = zF - inset - post / 2,
    zb = zB + inset + post / 2
  for (const x of [xa, xb])
    for (const z of [za, zb]) p.box(M.dark, [post, bodyH - 0.004, post], [x, BASE + bodyH / 2, z], { r: 0.004 })
  for (const y of [BASE + post / 2, TOP - post / 2 - 0.002]) {
    for (const z of [za, zb]) p.box(M.dark, [W - inset * 2, post, post], [0, y, z], { r: 0.004 })
    for (const x of [xa, xb]) p.box(M.dark, [post, post, D - post * 2 - inset * 2], [x, y, 0], { r: 0.004 })
  }
  p.box(M.dark, [0.05, bodyH - 0.004, post], [SX, BASE + bodyH / 2, za], { r: 0.004 }) // 中立柱
  // 电气仓的安装板、变流器托轨、穿线护套
  const ex = (SX + xR) / 2 + 0.002
  p.box(M.zinc, [0.385, 0.98, 0.004], [ex, 0.69, 0.1])
  for (const s of [-1, 1]) p.box(M.zinc, [0.024, 0.02, 0.95], [ex + s * 0.178, TOP - 0.09 - 0.7 - 0.01, 0.08])
  for (const dz of [0.28, 0.32]) p.cyl(M.rubber, 0.024, 0.02, [SX, BASE + 0.32, dz], { axis: 'x', seg: 14 })
  p.box(M.inner, [0.012, bodyH - 0.1, D - 0.1], [SX, BASE + bodyH / 2, 0]) // 分隔板
  p.box(M.inner, [W - 0.1, 0.01, D - 0.1], [0, BASE + 0.054, 0]) // 底板
  p.box(M.inner, [W - 0.1, 0.01, D - 0.1], [0, TOP - 0.054, 0]) // 顶板
  place(p, 'ess.frame')
}

// ---------------------------------------------------------------- 三面外板和顶盖
function sidePanel(name, id, sign) {
  const p = new Part(name)
  p.box(M.body, [0.018, bodyH, D], [0, 0, 0], { r: 0.005 })
  p.box(M.inner, [0.002, bodyH - 0.1, D - 0.1], [-sign * 0.01, 0, 0])
  // 压筋：外板上微微凸起的横筋，让大平面有结构感，只靠光影显形
  for (const y of [-bodyH * 0.2, bodyH * 0.1, bodyH * 0.34]) {
    p.box(M.body, [0.006, 0.04, D - 0.12], [sign * 0.0085, y, 0], { r: 0.0028 })
    p.box(M.dark, [0.0015, 0.003, D - 0.13], [sign * 0.0095, y - 0.0215, 0])
  }
  const gridRy = sign > 0 ? Math.PI / 2 : -Math.PI / 2
  p.louver(M.body, 0.52, 0.26, 10, [sign * 0.012, -bodyH * 0.39, 0], { ry: gridRy })
  p.box(M.body, [0.006, 0.28, 0.54], [sign * 0.0085, -bodyH * 0.39, 0], { r: 0.002 }) // 百叶边框
  p.box(M.anod, [0.004, 0.26, 0.52], [sign * 0.0098, -bodyH * 0.39, 0])
  const pts = []
  for (const py of [-bodyH / 2 + 0.04, bodyH / 2 - 0.04])
    for (const pz of [-D / 2 + 0.04, 0, D / 2 - 0.04]) pts.push([sign * 0.01, py, pz])
  p.screws(pts, { axis: 'x' })
  place(p, id, [sign * (W / 2 - 0.009), BASE + bodyH / 2, 0])
}
sidePanel('左侧板', 'ess.panel.left', -1)
sidePanel('右侧板', 'ess.panel.right', 1)
{
  const p = new Part('后板')
  p.box(M.body, [W, bodyH, 0.018], [0, 0, 0], { r: 0.005 })
  p.box(M.inner, [W - 0.1, bodyH - 0.1, 0.002], [0, 0, 0.01])
  const pts = []
  for (const py of [-bodyH / 2 + 0.04, bodyH / 2 - 0.04])
    for (const px of [-W / 2 + 0.04, 0, W / 2 - 0.04]) pts.push([px, py, -0.01])
  p.screws(pts)
  p.label('battery', 0.14, 0.187, [-0.52, 0.72, -0.0102], { ry: Math.PI })
  place(p, 'ess.panel.back', [0, BASE + bodyH / 2, zB + 0.009])
}
{
  const p = new Part('顶盖')
  // 顶盖略大于柜体、微微起拱，雨水向四周流走；下沿一圈滴水线
  p.box(M.body, [W + 0.05, 0.03, D + 0.05], [0, 0.015, 0], { r: 0.01, seg: 2 })
  p.box(M.body, [W - 0.1, 0.018, D - 0.12], [0, 0.036, 0], { r: 0.008 })
  p.box(M.dark, [W + 0.012, 0.012, D + 0.012], [0, -0.006, 0])
  // 泄爆口
  p.box(M.dark, [0.42, 0.012, 0.42], [-0.22, 0.05, -0.1], { r: 0.003 })
  p.box(M.body, [0.38, 0.016, 0.38], [-0.22, 0.062, -0.1], { r: 0.005 })
  p.label('hv', 0.09, 0.12, [-0.22, 0.0705, -0.1], { rx: -Math.PI / 2 })
  const pts = []
  for (const a of [-1, 1]) for (const b of [-1, 1]) pts.push([-0.22 + a * 0.19, 0.057, -0.1 + b * 0.19])
  p.screws(pts, { axis: 'y' })
  // 吊环
  for (const [x, z] of [
    [xL + 0.09, zF - 0.09],
    [xR - 0.09, zF - 0.09],
    [xL + 0.09, zB + 0.09],
    [xR - 0.09, zB + 0.09],
  ]) {
    p.cyl(M.zinc, 0.022, 0.012, [x, 0.05, z], { seg: 12 })
    p.torus(M.zinc, 0.026, 0.007, [x, 0.082, z], { seg: 16 })
  }
  // 声光报警器
  p.cyl(M.plastic, 0.05, 0.03, [0.45, 0.06, 0.34], { seg: 20 })
  p.cyl(M.beacon, 0.036, 0.06, [0.45, 0.105, 0.34], { seg: 20 })
  p.ball(M.beacon, 0.036, [0.45, 0.135, 0.34], { seg: 20, half: true })
  // 排气蘑菇头
  p.cyl(M.zinc, 0.035, 0.05, [0.45, 0.07, -0.34], { seg: 16 })
  p.cyl(M.zinc, 0.07, 0.02, [0.45, 0.105, -0.34], { seg: 20, r2: 0.03 })
  place(p, 'ess.roof', [0, TOP, 0])
}

// ---------------------------------------------------------------- 柜门
function doorCommon(p, width, height, sign, hingeCount = 3) {
  // 局部坐标：门轴在原点，门板向 sign 方向展开，门外表面朝 +Z。
  const cx = (sign * width) / 2
  p.box(M.body, [width - 0.01, height, 0.03], [cx, 0, 0.012], { r: 0.006, seg: 2 })
  // 外框：比门芯高一点，能接住一条细高光
  for (const y of [-height / 2 + 0.024, height / 2 - 0.024])
    p.box(M.body, [width - 0.03, 0.03, 0.006], [cx, y, 0.029], { r: 0.0025 })
  for (const dx of [-width / 2 + 0.024, width / 2 - 0.024])
    p.box(M.body, [0.03, height - 0.03, 0.006], [cx + dx, 0, 0.029], { r: 0.0025 })
  // 铰链
  for (let i = 0; i < hingeCount; i++) {
    const y = -height / 2 + height * ((i + 0.5) / hingeCount)
    p.cyl(M.dark, 0.011, 0.1, [0, y, 0.034], { seg: 12 })
    p.box(M.dark, [0.05, 0.09, 0.004], [sign * 0.028, y, 0.0338], { r: 0.0015 })
    p.screws(
      [
        [sign * 0.04, y - 0.03, 0.0365],
        [sign * 0.04, y + 0.03, 0.0365],
      ],
      { r: 0.004, mat: M.zinc },
    )
  }
  // 内侧：密封条和加强筋
  const seal = 0.012
  for (const y of [-height / 2 + 0.03, height / 2 - 0.03]) p.box(M.rubber, [width - 0.07, seal, seal], [cx, y, -0.006])
  for (const dx of [-width / 2 + 0.035, width / 2 - 0.035])
    p.box(M.rubber, [seal, height - 0.07, seal], [cx + dx, 0, -0.006])
  p.box(M.inner, [width - 0.08, height - 0.08, 0.002], [cx, 0, -0.004])
  for (const f of [0.34, 0.66])
    p.box(M.inner, [0.03, height - 0.14, 0.018], [sign * width * f, 0, -0.014], { r: 0.003 })
}
function handle(p, x, y) {
  p.box(M.plastic, [0.05, 0.2, 0.008], [x, y, 0.036], { r: 0.003 })
  p.box(M.plastic, [0.034, 0.16, 0.022], [x, y - 0.006, 0.05], { r: 0.008 })
  p.cyl(M.zinc, 0.012, 0.004, [x, y + 0.078, 0.042], { axis: 'z', seg: 16 })
  p.cyl(M.rubber, 0.005, 0.005, [x, y + 0.078, 0.044], { axis: 'z', seg: 8 })
}
const doorH = bodyH - 0.024,
  doorY = BASE + bodyH / 2
const batteryDoorW = SX - xL - 0.006,
  elecDoorW = xR - SX - 0.006
{
  const p = new Part('电池仓门')
  doorCommon(p, batteryDoorW, doorH, 1)
  const cx = batteryDoorW / 2
  // 主题色标题带
  p.box(M.accent, [batteryDoorW - 0.09, 0.216, 0.004], [cx, doorH / 2 - 0.22, 0.0285], { r: 0.0015 })
  p.label('title', batteryDoorW - 0.098, (batteryDoorW - 0.098) * (230 / 900), [cx, doorH / 2 - 0.22, 0.0312])
  // 警示标牌和铭牌
  p.label('hv', 0.12, 0.16, [cx - 0.2, 0.2, 0.0275])
  p.label('fire', 0.12, 0.16, [cx - 0.06, 0.2, 0.0275])
  p.label('battery', 0.12, 0.16, [cx + 0.08, 0.2, 0.0275])
  p.label('nameplate', 0.24, 0.132, [cx - 0.14, -0.02, 0.0275])
  p.screws(
    [
      [cx - 0.255, -0.08, 0.0285],
      [cx - 0.025, -0.08, 0.0285],
      [cx - 0.255, 0.04, 0.0285],
      [cx - 0.025, 0.04, 0.0285],
    ],
    { r: 0.003 },
  )
  // 通风百叶
  p.box(M.body, [0.62, 0.36, 0.006], [cx, -doorH / 2 + 0.25, 0.029], { r: 0.0025 })
  p.louver(M.body, 0.58, 0.32, 13, [cx, -doorH / 2 + 0.25, 0.034])
  handle(p, batteryDoorW - 0.05, 0.02)
  // 内侧：资料袋
  p.box(M.plasticLight, [0.22, 0.3, 0.01], [cx - 0.12, -0.05, -0.024], { r: 0.003 })
  place(p, 'ess.door.battery', [xL + 0.003, doorY, zF])
}
{
  const p = new Part('电气仓门')
  doorCommon(p, elecDoorW, doorH, -1)
  const cx = -elecDoorW / 2
  p.box(M.accent, [elecDoorW - 0.09, 0.075, 0.004], [cx, doorH / 2 - 0.15, 0.0285], { r: 0.0015 })
  p.label('titleSmall', 0.33, 0.0585, [cx, doorH / 2 - 0.15, 0.0312])
  // 触摸屏
  p.box(M.plastic, [0.3, 0.2, 0.014], [cx, 0.42, 0.034], { r: 0.006, seg: 2 })
  p.label('hmi', 0.272, 0.169, [cx, 0.42, 0.0415], { mat: M.screen })
  // 按钮区
  const by = 0.2
  p.box(M.dark, [0.3, 0.12, 0.004], [cx, by, 0.028], { r: 0.0015 })
  p.cyl(M.yellow, 0.034, 0.004, [cx - 0.09, by, 0.0325], { axis: 'z', seg: 24 })
  p.cyl(M.red, 0.018, 0.018, [cx - 0.09, by, 0.043], { axis: 'z', seg: 16 })
  p.add(M.red, new THREE.SphereGeometry(0.024, 16, 8), [cx - 0.09, by, 0.05], null, [1, 1, 0.45])
  const leds = [M.ledGreen, M.ledAmber, M.ledRed]
  leds.forEach((led, i) => {
    const x = cx + 0.0 + i * 0.045
    p.cyl(M.zinc, 0.015, 0.006, [x, by + 0.016, 0.0325], { axis: 'z', seg: 16 })
    p.cyl(led, 0.011, 0.006, [x, by + 0.016, 0.0365], { axis: 'z', seg: 14 })
  })
  p.cyl(M.zinc, 0.016, 0.008, [cx + 0.045, by - 0.03, 0.0335], { axis: 'z', seg: 16 })
  p.box(M.plastic, [0.006, 0.02, 0.008], [cx + 0.045, by - 0.03, 0.04])
  p.label('hv', 0.09, 0.12, [cx + 0.09, -0.06, 0.0275])
  p.label('earth', 0.06, 0.056, [cx - 0.09, -0.08, 0.0275])
  p.box(M.body, [0.3, 0.36, 0.006], [cx, -doorH / 2 + 0.25, 0.029], { r: 0.0025 })
  p.louver(M.body, 0.27, 0.32, 13, [cx, -doorH / 2 + 0.25, 0.034])
  handle(p, -elecDoorW + 0.05, 0.02)
  place(p, 'ess.door.electrical', [xR - 0.003, doorY, zF])
}

// ---------------------------------------------------------------- 电池架
const packCX = -0.21,
  packW = 0.74,
  packH = 0.15,
  packD = 0.96,
  packZ = -0.02,
  PACKS = 9
const rackBottom = BASE + 0.3,
  pitch = 0.188
{
  const p = new Part('电池架')
  const xs = [packCX - packW / 2 - 0.02, packCX + packW / 2 + 0.02]
  const zs = [packZ + packD / 2 - 0.015, packZ - packD / 2 - 0.015]
  const rackTop = TOP - 0.1,
    y0 = BASE + 0.06
  for (const x of xs) {
    for (const z of zs) {
      p.box(M.zinc, [0.036, rackTop - y0, 0.036], [x, (rackTop + y0) / 2, z], { r: 0.002 })
      // 立柱上的冲孔：只是小方块，便宜但一眼就是工业货架
      for (let y = y0 + 0.03; y < rackTop - 0.02; y += 0.05)
        p.add(M.anod, new THREE.PlaneGeometry(0.012, 0.022), [x, y, z + 0.0186])
    }
    p.box(M.zinc, [0.016, 0.03, packD + 0.04], [x, y0 + 0.02, -0.02], { r: 0.002 })
    p.box(M.zinc, [0.016, 0.03, packD + 0.04], [x, rackTop - 0.02, -0.02], { r: 0.002 })
  }
  for (let i = 0; i <= PACKS; i++) {
    const y = rackBottom + i * pitch - 0.014
    for (const s of [-1, 1])
      p.box(M.zinc, [0.03, 0.006, packD + 0.02], [packCX + s * (packW / 2 + 0.003), y, packZ], {})
  }
  for (const z of [zs[1]]) {
    p.box(M.zinc, [packW + 0.06, 0.03, 0.012], [packCX, y0 + 0.02, z])
    p.box(M.zinc, [packW + 0.06, 0.03, 0.012], [packCX, rackTop - 0.02, z])
  }
  place(p, 'ess.rack')
}

// ---------------------------------------------------------------- 电池包：一份网格，九个实例
const packParts = (() => {
  const tray = new Part('外壳')
  const w = packW,
    h = packH,
    d = packD
  tray.box(M.alu, [w, 0.006, d], [0, 0.003, 0])
  for (const s of [-1, 1]) tray.box(M.alu, [0.006, h - 0.012, d], [(s * (w - 0.006)) / 2, (h - 0.012) / 2, 0])
  tray.box(M.alu, [w, h - 0.012, 0.006], [0, (h - 0.012) / 2, -d / 2 + 0.003])
  for (const s of [-1, 1]) tray.box(M.alu, [0.018, 0.006, d - 0.02], [(s * (w - 0.03)) / 2, h - 0.015, 0]) // 翻边

  const cover = new Part('上盖')
  cover.box(M.dark, [w + 0.004, 0.006, d - 0.004], [0, 0, 0], { r: 0.002 })
  for (const x of [-0.24, -0.08, 0.08, 0.24]) cover.box(M.dark, [0.05, 0.004, d - 0.1], [x, 0.004, 0], { r: 0.0015 })
  const screwPts = []
  for (const s of [-1, 1]) for (let z = -0.42; z <= 0.42; z += 0.42) screwPts.push([(s * (w - 0.02)) / 2, 0.004, z])
  cover.screws(screwPts, { axis: 'y', r: 0.004 })

  // 电芯：4 排 9 列，每颗一个蓝膜长方体、两个极柱，相邻极柱之间连一片镍排
  const cells = new Part('电芯模组')
  const cols = 8,
    rows = 3,
    cw = 0.082,
    ch = 0.104,
    cd = 0.24
  const dx = (w - 0.03) / cols,
    dz = (d - 0.1) / rows
  const y0 = 0.008
  const nickel = new THREE.BoxGeometry(0.066, 0.0015, 0.03)
  for (let r = 0; r < rows; r++) {
    const z = -d / 2 + 0.03 + dz * (r + 0.5)
    for (let c = 0; c < cols; c++) {
      const x = -((cols - 1) * dx) / 2 + c * dx
      cells.box(M.cell, [cw, ch, cd], [x, y0 + ch / 2, z])
      cells.box(M.plastic, [cw - 0.006, 0.002, cd - 0.012], [x, y0 + ch + 0.001, z])
      cells.cyl(M.alu, 0.012, 0.006, [x, y0 + ch + 0.004, z - 0.075], { seg: 6 })
      cells.cyl(M.copper, 0.012, 0.006, [x, y0 + ch + 0.004, z + 0.075], { seg: 6 })
      cells.add(M.zinc, nickel, [x, y0 + ch + 0.0078, z - 0.075])
    }
    cells.box(M.fpc, [w - 0.06, 0.0012, 0.022], [0, y0 + ch + 0.0088, z]) // 采样排线
  }
  cells.box(M.plastic, [0.22, 0.006, 0.09], [0.2, y0 + ch + 0.01, d / 2 - 0.1])
  cells.label('pcb', 0.21, 0.08, [0.2, y0 + ch + 0.0135, d / 2 - 0.1], { rx: -Math.PI / 2 })

  // 前面板：这是柜门打开后看到的部分，细节都放在这里
  const front = new Part('前面板')
  const z0 = d / 2
  front.box(M.anod, [w + 0.03, h, 0.012], [0, h / 2, z0 + 0.006], { r: 0.003, seg: 2 })
  front.label('packLabel', 0.2, 0.0423, [-0.2, h - 0.037, z0 + 0.0125])
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.018)
    front.tube(
      M.plastic,
      [
        [x, 0.032, z0 + 0.012],
        [x, 0.036, z0 + 0.034],
        [x, 0.075, z0 + 0.042],
        [x, 0.114, z0 + 0.034],
        [x, 0.118, z0 + 0.012],
      ],
      0.0075,
      { radial: 6, seg: 10 },
    )
    front.screws(
      [
        [x, 0.018, z0 + 0.0125],
        [x, 0.132, z0 + 0.0125],
      ],
      { r: 0.0045 },
    )
  }
  // 高压接插件：+ 和 −
  for (const [x, polarity] of [
    [-0.05, 'plus'],
    [0.05, 'minus'],
  ]) {
    front.box(M.hv, [0.04, 0.05, 0.014], [x, 0.058, z0 + 0.018], { r: 0.004 })
    front.cyl(M.hv, 0.016, 0.024, [x, 0.058, z0 + 0.034], { axis: 'z', seg: 16 })
    front.cyl(M.plastic, 0.009, 0.004, [x, 0.058, z0 + 0.0465], { axis: 'z', seg: 12 })
    front.label(polarity, 0.016, 0.016, [x, 0.098, z0 + 0.0125])
  }
  // 通信口和指示灯
  for (const x of [-0.16, -0.11]) {
    front.box(M.plastic, [0.035, 0.022, 0.012], [x, 0.06, z0 + 0.018], { r: 0.002 })
    front.box(M.alu, [0.022, 0.011, 0.001], [x, 0.06, z0 + 0.0245])
  }
  front.cyl(M.ledGreen, 0.004, 0.002, [-0.21, 0.06, z0 + 0.013], { axis: 'z', seg: 10 })
  front.cyl(M.ledAmber, 0.004, 0.002, [-0.23, 0.06, z0 + 0.013], { axis: 'z', seg: 10 })
  // 液冷快插
  for (const [x, mat] of [
    [0.19, M.coolBlue],
    [0.25, M.coolRed],
  ]) {
    front.cyl(M.alu, 0.012, 0.018, [x, 0.07, z0 + 0.02], { axis: 'z', seg: 12 })
    front.cyl(mat, 0.0135, 0.012, [x, 0.07, z0 + 0.034], { axis: 'z', seg: 12 })
  }
  return { tray: tray.toMesh(), cover: cover.toMesh(), cells: cells.toMesh(), front: front.toMesh() }
})()
const packEntries = []
for (let i = 0; i < PACKS; i++) {
  const number = String(i + 1).padStart(2, '0')
  const id = `ess.pack${number}`
  const y = rackBottom + i * pitch
  const group = doc.createNode(`电池包 ${number}`).setTranslation([packCX, y, packZ]).setExtras({ assetNodeId: id })
  root.addChild(group)
  nodes[id] = group
  const child = (name, suffix, mesh, pos = [0, 0, 0]) => {
    const node = doc
      .createNode(`电池包 ${number} ${name}`)
      .setMesh(mesh)
      .setTranslation(pos)
      .setExtras({ assetNodeId: `${id}.${suffix}` })
    group.addChild(node)
    nodes[`${id}.${suffix}`] = node
    return node
  }
  child('外壳', 'tray', packParts.tray)
  child('电芯模组', 'cells', packParts.cells)
  child('上盖', 'cover', packParts.cover, [0, packH - 0.006, 0])
  child('前面板', 'front', packParts.front)
  packEntries.push({ i, id, y })
}

// ---------------------------------------------------------------- 高压箱
{
  const p = new Part('高压箱')
  const w = 0.74,
    h = 0.21,
    d = 0.62
  p.box(M.dark, [w, h, d], [0, h / 2, -d / 2], { r: 0.006 })
  p.box(M.anod, [w + 0.03, h, 0.014], [0, h / 2, 0.007], { r: 0.003, seg: 2 })
  p.label('hvbox', 0.2, 0.05, [-0.22, h - 0.042, 0.0145])
  // 红色隔离开关
  p.cyl(M.plastic, 0.046, 0.012, [0.0, h / 2 + 0.0, 0.02], { axis: 'z', seg: 24 })
  p.cyl(M.yellow, 0.038, 0.006, [0.0, h / 2, 0.029], { axis: 'z', seg: 24 })
  p.box(M.red, [0.024, 0.08, 0.018], [0.0, h / 2, 0.04], { r: 0.006 })
  // 主回路接插件
  for (const x of [0.17, 0.25]) {
    p.cyl(M.hv, 0.024, 0.03, [x, 0.1, 0.03], { axis: 'z', seg: 20 })
    p.cyl(M.plastic, 0.014, 0.006, [x, 0.1, 0.048], { axis: 'z', seg: 12 })
  }
  for (const x of [-0.3, -0.26, -0.22, -0.18]) p.box(M.plastic, [0.028, 0.018, 0.012], [x, 0.07, 0.018], { r: 0.002 })
  p.cyl(M.ledGreen, 0.006, 0.002, [-0.12, 0.13, 0.0148], { axis: 'z', seg: 12 })
  p.cyl(M.ledRed, 0.006, 0.002, [-0.09, 0.13, 0.0148], { axis: 'z', seg: 12 })
  p.label('hv', 0.06, 0.08, [0.1, 0.09, 0.0145])
  p.screws(
    [
      [-0.37, 0.016, 0.0148],
      [0.37, 0.016, 0.0148],
      [-0.37, h - 0.016, 0.0148],
      [0.37, h - 0.016, 0.0148],
    ],
    { r: 0.005 },
  )
  place(p, 'ess.hvbox', [packCX, BASE + 0.07, packZ + packD / 2])
}

// ---------------------------------------------------------------- 风扇（节点原点在转轴上）
function fanMesh(name, radius, mat = M.plastic, blades = 7) {
  const p = new Part(name)
  const shape = new THREE.Shape()
  const r0 = radius * 0.24,
    r1 = radius * 0.95
  shape.moveTo(r0, -radius * 0.08)
  shape.quadraticCurveTo((r0 + r1) / 2, -radius * 0.26, r1, -radius * 0.2)
  shape.quadraticCurveTo(r1 * 1.02, radius * 0.08, r1 * 0.92, radius * 0.22)
  shape.quadraticCurveTo((r0 + r1) / 2, radius * 0.2, r0, radius * 0.08)
  const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.0025, bevelEnabled: false, curveSegments: 6 })
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2
    const q = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(0, 0, a))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, 0, 0)))
    p.add(mat, blade, [0, 0, 0], new THREE.Euler().setFromQuaternion(q))
  }
  p.cyl(mat, radius * 0.27, radius * 0.22, [0, 0, 0.002], { axis: 'z', seg: 24 })
  p.cyl(M.zinc, radius * 0.1, 0.004, [0, 0, 0.002 + radius * 0.115], { axis: 'z', seg: 16 })
  return p
}
/** 固定的风扇外圈和防护网，叶片单独成节点。 */
function fanGuard(p, x, y, z, radius) {
  p.torus(M.anod, radius * 1.06, 0.007, [x, y, z], { seg: 32 })
  for (const f of [0.33, 0.56, 0.8, 1.02]) p.torus(M.zinc, radius * f, 0.0016, [x, y, z + 0.022], { seg: 28 })
  for (let i = 0; i < 4; i++)
    p.box(M.zinc, [radius * 2.04, 0.003, 0.002], [x, y, z + 0.022], { rot: [0, 0, (i * Math.PI) / 4] })
}

// ---------------------------------------------------------------- 电气仓：变流器、EMS、配电、消防
const elecX = (SX + xR) / 2 + 0.002 // 电气仓中线
{
  const p = new Part('储能变流器 PCS')
  const w = 0.34,
    h = 0.7,
    d = 0.92
  p.box(M.dark, [w, h, d], [0, h / 2, -d / 2], { r: 0.006 })
  p.box(M.anod, [w + 0.012, h, 0.012], [0, h / 2, 0.006], { r: 0.003, seg: 2 })
  p.label('pcs', 0.2, 0.05, [-0.058, h - 0.05, 0.0125])
  p.cyl(M.ledGreen, 0.005, 0.002, [0.13, h - 0.035, 0.0128], { axis: 'z', seg: 10 })
  p.cyl(M.ledAmber, 0.005, 0.002, [0.13, h - 0.06, 0.0128], { axis: 'z', seg: 10 })
  fanGuard(p, 0, h - 0.205, 0.014, 0.105)
  fanGuard(p, 0, h - 0.455, 0.014, 0.105)
  p.louver(M.anod, 0.28, 0.06, 4, [0, 0.06, 0.016])
  // 侧面散热鳍片
  for (let i = 0; i < 22; i++) p.box(M.alu, [0.012, h - 0.08, 0.008], [-w / 2 - 0.006, h / 2, -0.1 - i * 0.034])
  place(p, 'ess.pcs', [elecX, TOP - 0.09 - h, zF - 0.11])
  for (const [n, y] of [
    [1, h - 0.205],
    [2, h - 0.455],
  ]) {
    const fan = fanMesh(`PCS 风扇 ${n}`, 0.105)
    place(fan, `ess.pcs.fan${n}`, [0, y, 0.018], nodes['ess.pcs'])
  }
}
{
  const p = new Part('能量管理器 EMS')
  const w = 0.3,
    h = 0.13,
    d = 0.24
  p.box(M.anod, [w, h, d], [0, h / 2, -d / 2], { r: 0.005 })
  p.label('ems', 0.15, 0.0375, [-0.06, h - 0.03, 0.0008])
  for (let i = 0; i < 4; i++) p.box(M.plastic, [0.026, 0.02, 0.006], [-0.11 + i * 0.036, 0.05, 0.003], { r: 0.001 })
  for (let i = 0; i < 3; i++)
    p.cyl([M.ledGreen, M.ledGreen, M.ledAmber][i], 0.0035, 0.002, [0.06 + i * 0.022, 0.05, 0.0012], {
      axis: 'z',
      seg: 8,
    })
  p.box(M.zinc, [0.385, 0.006, d + 0.02], [0, -0.003, -d / 2])
  place(p, 'ess.ems', [elecX, 1.2, zF - 0.14])
}
{
  const p = new Part('交流配电单元')
  const w = 0.35,
    h = 0.42
  p.box(M.zinc, [w, h, 0.006], [0, 0, -0.003])
  // 走线槽
  for (const y of [h / 2 - 0.04, -h / 2 + 0.04]) {
    p.box(M.plasticLight, [w - 0.02, 0.05, 0.04], [0, y, 0.02], { r: 0.002 })
    for (let i = 0; i < 13; i++) p.box(M.rubber, [0.006, 0.05, 0.001], [-w / 2 + 0.035 + i * 0.024, y, 0.0405])
  }
  p.box(M.alu, [w - 0.03, 0.035, 0.008], [0, 0, 0.004]) // 导轨
  // 总开关
  p.box(M.plastic, [0.11, 0.16, 0.07], [-0.105, 0, 0.038], { r: 0.004 })
  p.box(M.dark, [0.09, 0.05, 0.012], [-0.105, 0, 0.078], { r: 0.002 })
  p.box(M.plasticLight, [0.02, 0.03, 0.022], [-0.105, 0.006, 0.09], { r: 0.003 })
  // 小型断路器
  for (let i = 0; i < 5; i++) {
    const x = -0.03 + i * 0.038
    p.box(M.plastic, [0.033, 0.11, 0.058], [x, 0, 0.033], { r: 0.0025 })
    p.box(M.plasticLight, [0.012, 0.018, 0.012], [x, 0.006, 0.066], { r: 0.002 })
    p.box(i === 0 ? M.ledRed : M.ledGreen, [0.012, 0.004, 0.001], [x, -0.03, 0.0625])
  }
  p.label(
    'breakers',
    0.32,
    0.024,
    [0, 0.082, 0.0125].map((v, i) => (i === 2 ? 0.0475 : v)),
  )
  place(p, 'ess.breakers', [elecX, 0.96, 0.106])
  // 铜排（挂在配电板背后的母线，单独成节点，方便爆炸时看到）
  const bars = new Part('铜排')
  for (let i = 0; i < 4; i++) bars.box(M.copper, [0.3, 0.012, 0.004], [0, 0.04 - i * 0.026, 0.014], { r: 0.001 })
  place(bars, 'ess.busbars', [0, 0, 0.0], nodes['ess.breakers'])
}
{
  const p = new Part('消防气瓶')
  const h = 0.46,
    r = 0.085
  p.cyl(M.red, r, h, [0, h / 2 + 0.02, 0], { seg: 28 })
  p.ball(M.red, r, [0, h + 0.02, 0], { half: true, seg: 28, scale: [1, 0.72, 1] })
  p.cyl(M.dark, r + 0.002, 0.02, [0, 0.01, 0], { seg: 28 })
  p.cyl(M.brass, 0.022, 0.05, [0, h + 0.105, 0], { seg: 14 })
  p.box(M.brass, [0.05, 0.03, 0.03], [0, h + 0.14, 0], { r: 0.004 })
  p.cyl(M.zinc, 0.026, 0.01, [0.0, h + 0.14, 0.022], { axis: 'z', seg: 18 })
  p.cyl(M.plasticLight, 0.021, 0.002, [0.0, h + 0.14, 0.0275], { axis: 'z', seg: 18 })
  p.box(M.ledRed, [0.002, 0.016, 0.0006], [0, h + 0.146, 0.0288], { rot: [0, 0, -0.7] })
  for (const y of [0.16, 0.38]) p.cyl(M.zinc, r + 0.004, 0.018, [0, y, 0], { seg: 28, open: true })
  p.label('fireTag', 0.075, 0.1, [0, 0.27, r + 0.0015])
  for (const y of [0.16, 0.38]) p.box(M.zinc, [0.024, 0.012, 0.2], [0, y, -0.18])
  place(p, 'ess.fire.cylinder', [elecX + 0.03, BASE + 0.06, zF - 0.26])
}
{
  const p = new Part('消防控制器')
  p.box(M.plasticLight, [0.14, 0.18, 0.05], [0, 0, 0], { r: 0.004 })
  p.box(M.red, [0.11, 0.03, 0.002], [0, 0.058, 0.0255])
  p.cyl(M.ledGreen, 0.005, 0.002, [-0.03, 0.01, 0.0258], { axis: 'z', seg: 10 })
  p.cyl(M.ledRed, 0.005, 0.002, [0.0, 0.01, 0.0258], { axis: 'z', seg: 10 })
  p.cyl(M.ledAmber, 0.005, 0.002, [0.03, 0.01, 0.0258], { axis: 'z', seg: 10 })
  p.box(M.plastic, [0.1, 0.03, 0.002], [0, -0.04, 0.0255])
  place(p, 'ess.fire.panel', [elecX - 0.11, 0.48, 0.128])
}
{
  // 顶部探测器和灯带：装在顶板上，跟顶盖一起走
  const p = new Part('照明与探测器')
  for (const x of [packCX, elecX]) {
    p.box(M.lamp, [x === packCX ? 0.6 : 0.24, 0.006, 0.03], [x, -0.002, 0.42])
    p.box(M.plasticLight, [x === packCX ? 0.62 : 0.26, 0.008, 0.04], [x, 0.004, 0.42], { r: 0.002 })
  }
  for (const [x, z, led] of [
    [packCX - 0.2, 0.12, M.ledGreen],
    [packCX + 0.2, 0.12, M.ledGreen],
    [elecX, -0.2, M.ledGreen],
  ]) {
    p.cyl(M.plasticLight, 0.05, 0.03, [x, -0.016, z], { seg: 20, r2: 0.052 })
    p.cyl(M.plasticLight, 0.035, 0.01, [x, -0.034, z], { seg: 20 })
    p.cyl(led, 0.004, 0.002, [x + 0.022, -0.04, z], { seg: 8 })
  }
  // 消防喷头
  p.cyl(M.brass, 0.014, 0.03, [packCX, -0.018, -0.2], { seg: 10 })
  p.cyl(M.brass, 0.034, 0.006, [packCX, -0.036, -0.2], { seg: 16 })
  place(p, 'ess.ceiling', [0, TOP - 0.06, 0])
}

// ---------------------------------------------------------------- 液冷机组：背挂，风扇原点在转轴
{
  const p = new Part('液冷机组')
  const w = 0.9,
    h = 1.16,
    d = 0.24
  p.box(M.body, [w, h, d], [0, 0, -d / 2], { r: 0.012, seg: 2 })
  const zb = -d - 0.0005
  // 后面板（背对柜体，朝 -Z）
  p.box(M.dark, [w - 0.08, h - 0.08, 0.004], [0, 0, zb + 0.0005])
  const fanY = h / 2 - 0.27
  for (const [x, y] of [
    [-0.205, fanY],
    [0.205, fanY],
  ]) {
    p.torus(M.body, 0.178, 0.012, [x, y, zb - 0.002], { seg: 36 })
    p.cyl(M.rubber, 0.172, 0.05, [x, y, zb + 0.026], { axis: 'z', seg: 36, open: true })
    for (const f of [0.34, 0.56, 0.78, 0.98]) p.torus(M.zinc, 0.17 * f, 0.0022, [x, y, zb - 0.012], { seg: 30 })
    for (let i = 0; i < 4; i++)
      p.box(M.zinc, [0.34, 0.004, 0.003], [x, y, zb - 0.012], { rot: [0, 0, (i * Math.PI) / 4] })
    p.cyl(M.anod, 0.05, 0.05, [x, y, zb + 0.03], { axis: 'z', seg: 20 })
  }
  // 冷凝器百叶
  p.louver(M.body, w - 0.14, 0.42, 16, [0, -h / 2 + 0.28, zb - 0.002], { ry: Math.PI })
  p.label('hv', 0.07, 0.093, [-w / 2 + 0.09, -h / 2 + 0.57, zb - 0.0032], { ry: Math.PI })
  // 进出水管
  p.tube(
    M.coolBlue,
    [
      [-0.3, h / 2 - 0.04, -0.06],
      [-0.3, h / 2 + 0.05, -0.05],
      [-0.3, h / 2 + 0.08, 0.04],
    ],
    0.016,
    { seg: 10 },
  )
  p.tube(
    M.coolRed,
    [
      [-0.22, h / 2 - 0.04, -0.06],
      [-0.22, h / 2 + 0.05, -0.05],
      [-0.22, h / 2 + 0.08, 0.04],
    ],
    0.016,
    { seg: 10 },
  )
  place(p, 'ess.cooling', [0, BASE + 0.14 + h / 2, zB])
  const zFan = zb + 0.006
  for (const [n, x] of [
    [1, -0.205],
    [2, 0.205],
  ]) {
    const fan = fanMesh(`液冷风扇 ${n}`, 0.158, M.anod)
    // 叶片朝外（-Z），旋转轴是 Z
    place(fan, `ess.cooling.fan${n}`, [x, fanY, zFan], nodes['ess.cooling'])
  }
}

// ---------------------------------------------------------------- 线缆：爆炸时收起，不留在半空
const frontZ = packZ + packD / 2
{
  const p = new Part('动力线')
  for (let i = 0; i < PACKS - 1; i++) {
    const y = rackBottom + i * pitch + 0.058
    const x1 = packCX + 0.05,
      x2 = packCX - 0.05
    p.tube(
      M.hv,
      [
        [x1, y, frontZ + 0.048],
        [x1, y + 0.018, frontZ + 0.068],
        [x2, y + pitch - 0.018, frontZ + 0.068],
        [x2, y + pitch, frontZ + 0.048],
      ],
      0.0055,
      { radial: 6, seg: 14 },
    )
  }
  const yTop = rackBottom + (PACKS - 1) * pitch + 0.058
  const hvY = BASE + 0.17
  // 串联回路的首尾接到高压箱，再穿过隔板去变流器
  p.tube(
    M.hv,
    [
      [packCX - 0.05, rackBottom + 0.058, frontZ + 0.048],
      [packCX - 0.04, rackBottom - 0.02, frontZ + 0.07],
      [packCX + 0.1, hvY + 0.02, frontZ + 0.07],
      [packCX + 0.17, BASE + 0.17, frontZ + 0.05],
    ],
    0.0085,
    { seg: 22 },
  )
  p.tube(
    M.hv,
    [
      [packCX + 0.05, yTop, frontZ + 0.048],
      [packCX + 0.18, yTop + 0.03, frontZ + 0.07],
      [SX - 0.04, yTop - 0.1, frontZ + 0.06],
      [SX - 0.035, BASE + 0.45, frontZ + 0.06],
      [packCX + 0.26, BASE + 0.2, frontZ + 0.06],
      [packCX + 0.25, BASE + 0.17, frontZ + 0.05],
    ],
    0.0085,
    { seg: 44 },
  )
  for (const z of [0.28, 0.32])
    p.tube(
      M.hv,
      [
        [SX - 0.05, BASE + 0.32, z],
        [SX + 0.04, BASE + 0.32, z],
        [SX + 0.05, BASE + 0.42, z],
        [SX + 0.05, 1.3, z],
        [SX + 0.07, 1.42, z + 0.04],
        [elecX - 0.1, 1.455, z + 0.08],
      ],
      0.0105,
      { seg: 40 },
    )
  place(p, 'ess.cables.power')
}
{
  const p = new Part('通信线')
  for (let k = 0; k < 3; k++) {
    const offset = k * 0.011
    p.tube(
      M.rubber,
      [
        [packCX + packW / 2 + 0.006, BASE + 0.26, frontZ - 0.02 - offset],
        [packCX + packW / 2 + 0.008, TOP - 0.2, frontZ - 0.02 - offset],
      ],
      0.0042,
      { radial: 6, seg: 4 },
    )
  }
  for (let i = 0; i < PACKS; i++) {
    const y = rackBottom + i * pitch + 0.06
    p.tube(
      M.rubber,
      [
        [packCX - 0.11, y, frontZ + 0.026],
        [packCX - 0.06, y - 0.03, frontZ + 0.05],
        [packCX + 0.14, y - 0.044, frontZ + 0.05],
        [packCX + packW / 2 + 0.006, y - 0.03, frontZ - 0.02],
      ],
      0.0028,
      { radial: 6, seg: 16 },
    )
  }
  place(p, 'ess.cables.signal')
}
{
  const p = new Part('液冷管路')
  const mx = packCX + packW / 2 + 0.03
  p.cyl(M.coolBlue, 0.013, 1.86, [mx - 0.006, rackBottom + 0.72, frontZ + 0.052], { seg: 12 })
  p.cyl(M.coolRed, 0.013, 1.86, [mx + 0.024, rackBottom + 0.72, frontZ + 0.02], { seg: 12 })
  for (let i = 0; i < PACKS; i++) {
    const y = rackBottom + i * pitch + 0.07
    p.tube(
      M.coolBlue,
      [
        [packCX + 0.19, y, frontZ + 0.04],
        [packCX + 0.2, y + 0.008, frontZ + 0.066],
        [mx - 0.03, y + 0.02, frontZ + 0.066],
        [mx - 0.006, y + 0.03, frontZ + 0.052],
      ],
      0.0055,
      { radial: 6, seg: 12 },
    )
    p.tube(
      M.coolRed,
      [
        [packCX + 0.25, y, frontZ + 0.04],
        [packCX + 0.26, y - 0.008, frontZ + 0.056],
        [mx - 0.01, y - 0.02, frontZ + 0.048],
        [mx + 0.024, y - 0.03, frontZ + 0.02],
      ],
      0.0055,
      { radial: 6, seg: 12 },
    )
  }
  place(p, 'ess.cables.coolant')
}
{
  const p = new Part('消防管路')
  const cy = BASE + 0.06 + 0.46 + 0.17
  p.tube(
    M.red,
    [
      [elecX + 0.055, cy, zF - 0.26],
      [0.6, cy + 0.03, 0.42],
      [0.625, 1.1, 0.585],
      [0.625, 2.08, 0.6],
      [0.59, 2.135, 0.6],
      [0.3, 2.14, 0.6],
      [0.2, 2.14, 0.45],
      [packCX, 2.14, -0.2],
    ],
    0.0075,
    { seg: 70 },
  )
  place(p, 'ess.fire.pipe')
}

// ---------------------------------------------------------------- 动画
const ease = t => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t))
function channel(animation, node, path, times, values, size) {
  const buffer = doc.getRoot().listBuffers()[0]
  const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buffer)
  const output = doc
    .createAccessor()
    .setType(size === 4 ? 'VEC4' : 'VEC3')
    .setArray(new Float32Array(values))
    .setBuffer(buffer)
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR')
  animation.addSampler(sampler)
  animation.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler))
}
const quatY = angle => [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)]
const quatZ = angle => [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)]

/** 把「从 t0 到 t1 的一段运动」采样成关键帧；reverse 生成反向片段，开门和关门、爆炸和复位一一对应。 */
function tween(animation, id, path, value, t0, t1, total, reverse) {
  const node = nodes[id]
  const samples = 14
  const times = [],
    values = []
  const push = (t, k) => {
    times.push(reverse ? total - t : t)
    values.push(value(k))
  }
  if (t0 > 0) push(0, 0)
  for (let i = 0; i <= samples; i++) push(t0 + ((t1 - t0) * i) / samples, ease(i / samples))
  if (t1 < total) push(total, 1)
  if (reverse) {
    // 倒序后时间要递增
    const size = path === 'rotation' ? 4 : 3
    const order = times.map((t, i) => [t, i]).sort((a, b) => a[0] - b[0])
    channel(
      animation,
      node,
      path,
      order.map(o => o[0]),
      order.flatMap(o => values[o[1]]),
      size,
    )
  } else channel(animation, node, path, times, values.flat(), path === 'rotation' ? 4 : 3)
}
const baseT = id => nodes[id].getTranslation()
const move = (animation, id, delta, t0, t1, total, reverse) => {
  const b = baseT(id)
  tween(
    animation,
    id,
    'translation',
    k => [b[0] + delta[0] * k, b[1] + delta[1] * k, b[2] + delta[2] * k],
    t0,
    t1,
    total,
    reverse,
  )
}

// 第一段是持续运转的风扇：编辑器默认循环播放第一段，放进场景时只有风扇在转，不会门板乱晃。
{
  const a = doc.createAnimation('Fans_Run')
  for (const [id, speed] of [
    ['ess.pcs.fan1', 1],
    ['ess.pcs.fan2', 1],
    ['ess.cooling.fan1', -1],
    ['ess.cooling.fan2', -1],
  ]) {
    const keys = [0, 1, 2, 3, 4]
    channel(
      a,
      nodes[id],
      'rotation',
      keys.map(k => k * 0.25),
      keys.flatMap(k => quatZ(speed * k * (Math.PI / 2))),
      4,
    )
  }
}
const DOOR_ANGLE = (110 * Math.PI) / 180
function doorsClip(name, reverse) {
  const a = doc.createAnimation(name)
  const total = 1.8
  tween(a, 'ess.door.battery', 'rotation', k => quatY(-DOOR_ANGLE * k), 0, 1.6, total, reverse)
  tween(a, 'ess.door.electrical', 'rotation', k => quatY(DOOR_ANGLE * k), 0.2, 1.8, total, reverse)
}
doorsClip('Doors_Open', false)
doorsClip('Doors_Close', true)

function explodeClip(name, reverse) {
  const a = doc.createAnimation(name)
  const total = 5
  // 线缆先收起来，否则会悬在半空
  for (const id of ['ess.cables.power', 'ess.cables.signal', 'ess.cables.coolant', 'ess.fire.pipe'])
    tween(
      a,
      id,
      'scale',
      k => {
        const s = Math.max(1 - k, 0.0001)
        return [s, s, s]
      },
      0.0,
      0.5,
      total,
      reverse,
    )
  // 外壳向四周散开
  move(a, 'ess.door.battery', [-1.25, 0, 1.15], 0.3, 1.5, total, reverse)
  move(a, 'ess.door.electrical', [2.55, 0, 0.9], 0.4, 1.6, total, reverse)
  move(a, 'ess.roof', [0, 1.7, 0], 0.5, 1.7, total, reverse)
  move(a, 'ess.ceiling', [0, 1.28, 0], 0.6, 1.8, total, reverse)
  move(a, 'ess.panel.left', [-1.9, 0, 0], 0.6, 1.8, total, reverse)
  move(a, 'ess.panel.right', [2.3, 0, 0], 0.6, 1.8, total, reverse)
  move(a, 'ess.panel.back', [0, 0, -1.1], 0.6, 1.8, total, reverse)
  move(a, 'ess.cooling', [0, 0, -1.9], 0.7, 1.9, total, reverse)
  // 电气仓设备向右抽出，各走各的距离，避免重叠
  move(a, 'ess.pcs', [1.2, 0.5, 0.2], 1.3, 2.5, total, reverse)
  move(a, 'ess.ems', [1.2, 0.34, 0.6], 1.4, 2.6, total, reverse)
  move(a, 'ess.breakers', [1.2, 0.1, 0.9], 1.5, 2.7, total, reverse)
  move(a, 'ess.busbars', [0, 0, -0.22], 2.7, 3.2, total, reverse)
  move(a, 'ess.fire.panel', [1.1, -0.02, 1.3], 1.6, 2.8, total, reverse)
  move(a, 'ess.fire.cylinder', [1.2, 0, 0.5], 1.7, 2.9, total, reverse)
  // 电池包向前抽出、纵向拉开；上盖掀起，露出电芯
  move(a, 'ess.hvbox', [0, -0.05, 0.85], 1.9, 3, total, reverse)
  for (const { i, id } of packEntries) {
    const t = 2.1 + i * 0.09
    move(a, id, [0, i * 0.14 + 0.03, 0.85], t, t + 1.1, total, reverse)
    move(a, `${id}.cover`, [0, 0.1, -0.03], t + 0.9, t + 1.5, total, reverse)
  }
}
explodeClip('Explode', false)
explodeClip('Assemble', true)

// 维护场景：单个电池包抽出来
function serviceClip(name, reverse) {
  const a = doc.createAnimation(name)
  move(a, 'ess.pack05', [0, 0, 0.72], 0, 1.6, 1.6, reverse)
}
serviceClip('Pack_Pull', false)
serviceClip('Pack_Insert', true)

const raw = join(work, 'raw.glb')
await new NodeIO().registerExtensions([KHRMaterialsEmissiveStrength]).write(raw, doc)

// 压缩：贴图转 WebP，几何和动画用 Meshopt（节点层级保持不变，所以不用 optimize 的合并步骤）
const transform = (command, input, out, ...args) =>
  execFileSync('npx', ['--yes', '@gltf-transform/cli@4.5.1', command, input, out, ...args], { stdio: 'pipe' })
transform('webp', raw, join(work, 'webp.glb'), '--quality', '88')
transform('meshopt', join(work, 'webp.glb'), output, '--level', 'medium')
await rm(work, { recursive: true, force: true })

let tris = 0,
  prims = 0
const seen = doc
  .getRoot()
  .listNodes()
  .filter(n => n.getMesh())
for (const node of seen)
  for (const p of node.getMesh().listPrimitives()) {
    prims++
    tris += (p.getIndices()?.getCount() ?? 0) / 3
  }
console.log(
  `节点 ${doc.getRoot().listNodes().length} · 网格节点 ${seen.length} · 绘制批次 ${prims} · 三角面 ${Math.round(tris)} · 材质 ${doc.getRoot().listMaterials().length} · 动画 ${doc
    .getRoot()
    .listAnimations()
    .map(a => a.getName())
    .join(', ')}`,
)
