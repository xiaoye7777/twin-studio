import { CompressedTexture, Mesh, type Material, type Object3D, type Texture } from 'three'
import type { SceneDocumentV2 } from '@twin-studio/core'

/** What an ordinary office PC or a venue's media player renders smoothly at 1080p–4K. */
export const BUDGET = { triangles: 1_500_000, drawCalls: 400, textureMB: 256 } as const

export interface ModelUsage {
  assetId: string
  name: string
  instances: number
  /** Per instance. */
  triangles: number
  meshes: number
  maxTexture: number
  textureMB: number
}

export interface SceneAnalysis {
  triangles: number
  drawCalls: number
  textureMB: number
  textures: number
  models: ModelUsage[]
  tips: string[]
}

function trianglesOf(mesh: Mesh): number {
  const geometry = mesh.geometry
  const count = geometry.index ? geometry.index.count : (geometry.attributes.position?.count ?? 0)
  return Math.floor(count / 3)
}

function texturesOf(material: Material): Texture[] {
  return Object.values(material).filter((value): value is Texture => Boolean(value && (value as Texture).isTexture))
}

function textureBytes(texture: Texture): number {
  if (texture instanceof CompressedTexture)
    return texture.mipmaps.reduce(
      (sum, level) => sum + ((level as { data?: ArrayBufferView }).data?.byteLength ?? 0),
      0,
    )
  const image = texture.image as { width?: number; height?: number } | null
  // RGBA8 plus a third for mipmaps.
  return image?.width && image.height ? image.width * image.height * 4 * 1.33 : 0
}

function textureSize(texture: Texture): number {
  const image = texture.image as { width?: number; height?: number } | null
  return Math.max(image?.width ?? 0, image?.height ?? 0)
}

/** Visible all the way up (a hidden group hides what is inside it). */
function rendered(object: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent) if (!current.visible) return false
  return true
}

const MB = 1024 * 1024
/** 12 000 → "1.2 万", 1 500 000 → "150 万". */
export const formatCount = (count: number) =>
  count >= 10_000 ? `${Number((count / 10_000).toFixed(1))} 万` : String(count)
const wan = formatCount

/**
 * Measures what the scene costs to render and suggests the fixes that matter most. Models are grouped by
 * file, since a heavy model repeated many times is the usual culprit.
 */
export function analyzeScene(
  doc: SceneDocumentV2,
  objectFor: (nodeId: string) => Object3D | null,
  assetName: (assetId: string) => string,
): SceneAnalysis {
  let triangles = 0
  let drawCalls = 0
  const textures = new Map<string, Texture>()
  const models = new Map<string, ModelUsage>()

  for (const node of doc.nodes) {
    const object = objectFor(node.id)
    if (!object || !rendered(object)) continue
    let nodeTriangles = 0
    let meshes = 0
    let maxTexture = 0
    let nodeTextureBytes = 0
    const walk = (child: Object3D): void => {
      // Nested document nodes are counted on their own; hidden parts and editor helpers not at all.
      if ((child !== object && typeof child.userData.sceneNodeId === 'string') || !child.visible) return
      if (!child.userData.editorInternal && child instanceof Mesh) measure(child)
      child.children.forEach(walk)
    }
    const measure = (child: Mesh): void => {
      const materials: Material[] = Array.isArray(child.material) ? child.material : [child.material]
      const tris = trianglesOf(child)
      nodeTriangles += tris
      meshes += 1
      drawCalls += Array.isArray(child.material) ? Math.max(1, child.geometry.groups.length) : 1
      for (const material of materials)
        for (const texture of texturesOf(material)) {
          maxTexture = Math.max(maxTexture, textureSize(texture))
          if (!textures.has(texture.uuid)) {
            textures.set(texture.uuid, texture)
            nodeTextureBytes += textureBytes(texture)
          }
        }
    }
    walk(object)
    triangles += nodeTriangles
    if (node.kind !== 'model') continue
    const usage = models.get(node.model.assetId) ?? {
      assetId: node.model.assetId,
      name: assetName(node.model.assetId) || node.name,
      instances: 0,
      triangles: nodeTriangles,
      meshes,
      maxTexture: 0,
      textureMB: 0,
    }
    usage.instances += 1
    usage.maxTexture = Math.max(usage.maxTexture, maxTexture)
    usage.textureMB += nodeTextureBytes / MB
    models.set(node.model.assetId, usage)
  }

  const textureMB = [...textures.values()].reduce((sum, texture) => sum + textureBytes(texture), 0) / MB
  const sorted = [...models.values()].sort((a, b) => b.triangles * b.instances - a.triangles * a.instances)
  const tips: string[] = []
  if (triangles > BUDGET.triangles) {
    const top = sorted[0]
    tips.push(
      `三角面共 ${wan(triangles)}，超出普通电脑建议的 ${wan(BUDGET.triangles)}。${
        top ? `「${top.name}」占 ${Math.round(((top.triangles * top.instances) / triangles) * 100)}%，优先减面。` : ''
      }`,
    )
  }
  for (const model of sorted) {
    if (model.triangles > 200_000)
      tips.push(`「${model.name}」单个 ${wan(model.triangles)} 面，建议减到 5 万面以内（细节可用法线贴图表现）。`)
    if (model.meshes > 30 && model.instances >= 5)
      tips.push(
        `「${model.name}」每个 ${model.meshes} 个网格 × ${model.instances} 个，绘制次数多：建模时合并静态网格、共用材质。`,
      )
    if (model.maxTexture > 2048)
      tips.push(`「${model.name}」使用 ${model.maxTexture} 像素贴图，大屏上 2048 已足够，或改用 KTX2 压缩贴图。`)
  }
  if (drawCalls > BUDGET.drawCalls)
    tips.push(`绘制次数约 ${drawCalls}，超过建议的 ${BUDGET.drawCalls}：重复设备尽量用同一个模型，模型内合并网格。`)
  if (textureMB > BUDGET.textureMB)
    tips.push(`贴图约占显存 ${Math.round(textureMB)} MB，建议导出时把贴图压缩为 KTX2（显存约降到 1/4）。`)
  if (!tips.length) tips.push('各项指标都在普通电脑的建议范围内，大屏可以流畅放映。')
  return { triangles, drawCalls, textureMB, textures: textures.size, models: sorted, tips }
}
