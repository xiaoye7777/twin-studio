// 程序化建模工具：储能柜和电站设备共用。按材质收集几何体的 Part、共用材质、动画通道和压缩导出。
// 用 flat 生成轻量模型：喷涂也走顶点色，每个零件的绘制批次更少。
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { renderTextures } from './textures.mjs'

let sharedWork = null
/** 贴图只渲染一次：一个脚本生成多个模型时共用。 */
async function textures() {
  if (!sharedWork) {
    sharedWork = await mkdtemp(join(tmpdir(), 'model-kit-'))
    await renderTextures(sharedWork)
  }
  return sharedWork
}
export async function disposeTextures() {
  if (sharedWork) await rm(sharedWork, { recursive: true, force: true })
  sharedWork = null
}

export async function createKit({ name, rootId, flat = false }) {
  const work = await textures()
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
      tile: !!options.powder || !!options.tile,
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
  const paint = (label, hex, m, r, powderScale) =>
    flat ? tint(matte, hex) : material(label, hex, m, r, { powder: powderScale })
  const M = {
    body: paint('柜体喷涂', '#9aa2a6', 0.05, 0.6, 0.16),
    inner: paint('内腔喷涂', '#a4abae', 0.02, 0.7, 0.12),
    dark: paint('深灰喷涂', '#3a4248', 0.1, 0.55, 0.14),
    accent: paint('主题青蓝', '#1d6f86', 0.15, 0.45, 0.12),
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
        r > 0 && !flat
          ? new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4))
          : new THREE.BoxGeometry(w, h, d)
      return this.add(mat, g, pos, rot)
    }
    cyl(mat, r, h, pos, { axis = 'y', seg = 16, r2 = r, open = false } = {}) {
      if (flat) seg = Math.min(seg, 8)
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

  const scene = doc.createScene(name)
  const root = doc.createNode(name).setExtras({ assetNodeId: rootId })
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

  /** 动画通道。 */
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

  /** 压缩并写出：贴图转 WebP，几何和动画用 Meshopt（节点层级不变，所以不用 optimize 的合并步骤）。 */
  async function finish(output) {
    const dir = await mkdtemp(join(tmpdir(), 'model-out-'))
    const raw = join(dir, 'raw.glb')
    await new NodeIO().registerExtensions([KHRMaterialsEmissiveStrength]).write(raw, doc)
    const transform = (command, input, out, ...args) =>
      execFileSync('npx', ['--yes', '@gltf-transform/cli@4.5.1', command, input, out, ...args], { stdio: 'pipe' })
    transform('prune', raw, join(dir, 'pruned.glb'), '--keep-leaves', 'true', '--keep-solid-textures', 'true')
    transform('webp', join(dir, 'pruned.glb'), join(dir, 'webp.glb'), '--quality', '88')
    transform('meshopt', join(dir, 'webp.glb'), output, '--level', 'medium')
    await rm(dir, { recursive: true, force: true })
    let tris = 0
    let prims = 0
    const meshNodes = doc
      .getRoot()
      .listNodes()
      .filter(n => n.getMesh())
    for (const node of meshNodes)
      for (const p of node.getMesh().listPrimitives()) {
        prims++
        tris += (p.getIndices()?.getCount() ?? 0) / 3
      }
    console.log(`${name}: 节点 ${doc.getRoot().listNodes().length} · 绘制批次 ${prims} · 三角面 ${Math.round(tris)}`)
  }

  /** 读一张贴图工具生成的贴图。 */
  async function textureFile(file) {
    return doc
      .createTexture(file)
      .setMimeType('image/png')
      .setImage(await readFile(`${work}/${file}`))
  }

  return {
    textureFile,
    doc,
    M,
    Part,
    AXIS,
    material,
    tint,
    metal,
    matte,
    emissiveExt,
    nodes,
    root,
    place,
    channel,
    finish,
  }
}
