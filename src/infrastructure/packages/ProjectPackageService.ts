import { isSceneDocumentV1, type SceneDocumentV1 } from '@/domain/scene'
import type { AssetRecord, AssetRepository } from '@/infrastructure/assets/AssetRepository'
import type { SceneRepository } from '@/infrastructure/scenes/SceneRepository'
import type { Project } from '@/stores/project'
import { collectSceneAssets, json, PACKAGE_FORMAT, PACKAGE_LIMITS, PACKAGE_VERSION, sha256, validateManifest, type PackageManifest } from './packageFormat'
import { readPackageZip, writePackageZip } from './packageZip'
import { validatePortableAsset } from './validatePortableAsset'

interface PackageAssets extends AssetRepository {
  addBatch(records: readonly AssetRecord[]): Promise<void>
  removeBatch(ids: readonly string[]): Promise<void>
}
interface PackageScenes extends SceneRepository { remove(projectId: string): Promise<void> }
interface PackageProjects { addImportedProject(project: Project): void }

function validateScene(value: unknown): asserts value is SceneDocumentV1 {
  if (!isSceneDocumentV1(value)) throw new Error('SceneDocument 损坏或 version 不受支持')
  const unique = (ids: string[]) => ids.every(id => !!id) && new Set(ids).size === ids.length
  if (!unique(value.instances.map(item => item.instanceId)) || !unique(value.primitives.map(item => item.nodeId)) || !unique((value.bindings ?? []).map(item => item.id))) throw new Error('SceneDocument 包含重复或空业务 ID')
  for (const instance of value.instances) {
    if (!unique(instance.nodeOverrides.map(item => item.assetNodeId))) throw new Error('SceneDocument 包含重复节点 override')
  }
  for (const primitive of value.primitives) {
    for (const [key, size] of Object.entries(primitive.properties)) {
      if (key === 'color') continue
      if (typeof size !== 'number' || !Number.isFinite(size) || size < 0 || size > 1e6) throw new Error('Primitive 几何参数无效')
      if (key === 'radialSegments' && (!Number.isInteger(size) || size < 3 || size > 256)) throw new Error('Primitive 分段数超出支持范围')
    }
  }
  for (const item of [...value.instances, ...value.primitives, ...value.instances.flatMap(root => root.nodeOverrides)]) {
    if (item.visible !== undefined && typeof item.visible !== 'boolean') throw new Error('场景 visibility 无效')
    if (item.runtimeBid !== undefined && typeof item.runtimeBid !== 'string') throw new Error('场景 runtimeBid 无效')
  }
}

/** Portable boundary only. Neither Editor nor Viewer consumes ZIP files. */
export class ProjectPackageService {
  constructor(private readonly scenes: PackageScenes, private readonly assets: PackageAssets, private readonly projects: PackageProjects) {}

  async exportProject(project: Project): Promise<Blob> {
    const scene = await this.scenes.load(project.id)
    if (!scene) throw new Error('项目尚未保存场景，请先进入编辑器保存')
    validateScene(scene)
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
    const sceneBytes = encode(scene)
    if (sceneBytes.length > PACKAGE_LIMITS.jsonBytes) throw new Error('场景 JSON 超过大小限制')
    const files: Record<string, Uint8Array> = { 'scene.json': sceneBytes }
    const manifest: PackageManifest = {
      format: PACKAGE_FORMAT, packageVersion: PACKAGE_VERSION, exportedAt: new Date().toISOString(),
      project: { id: project.id, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt },
      scene: { path: 'scene.json', sha256: await sha256(sceneBytes) }, assets: [],
    }
    let total = sceneBytes.length
    const dependencies = collectSceneAssets(scene)
    if (dependencies.size + 2 > PACKAGE_LIMITS.files) throw new Error('资产数量超过项目包限制')
    for (const [id, type] of dependencies) {
      const asset = await this.assets.get(id)
      if (!asset || asset.assetType !== type) throw new Error(`缺少资产或类型不匹配: ${id}`)
      total += asset.blob.size
      if (asset.blob.size > PACKAGE_LIMITS.fileBytes || total > PACKAGE_LIMITS.totalBytes) throw new Error('项目资产超过项目包大小限制')
      const bytes = new Uint8Array(await asset.blob.arrayBuffer())
      validatePortableAsset(bytes, type)
      const path = `assets/${manifest.assets.length}.${type === 'model' ? 'glb' : 'hdr'}`
      files[path] = bytes
      manifest.assets.push({ id, path, name: asset.name, mimeType: type === 'model' ? 'model/gltf-binary' : 'image/vnd.radiance', assetType: type,
        size: bytes.length, sha256: await sha256(bytes), lastModified: asset.lastModified, createdAt: asset.createdAt })
    }
    validateManifest(manifest)
    files['manifest.json'] = encode(manifest)
    if (total + files['manifest.json'].length > PACKAGE_LIMITS.totalBytes) throw new Error('项目包超过大小限制')
    return writePackageZip(files)
  }

  async importProject(blob: Blob): Promise<Project> {
    if (blob.size > PACKAGE_LIMITS.zipBytes) throw new Error('ZIP 超过 256 MiB 限制')
    const files = readPackageZip(new Uint8Array(await blob.arrayBuffer()))
    const manifest = json(files.get('manifest.json'), 'manifest.json')
    validateManifest(manifest)
    const sceneBytes = files.get('scene.json')!
    if (await sha256(sceneBytes) !== manifest.scene.sha256) throw new Error('scene.json 校验失败')
    const scene = json(sceneBytes, 'scene.json')
    validateScene(scene)
    if (scene.projectId !== manifest.project.id) throw new Error('manifest 与 SceneDocument 项目 ID 不一致')
    const dependencies = collectSceneAssets(scene)
    if (files.size !== manifest.assets.length + 2 || dependencies.size !== manifest.assets.length) throw new Error('包内资产与场景依赖不一致')
    const projectId = `project_${crypto.randomUUID()}`
    const timestamp = new Date().toISOString()
    const records: AssetRecord[] = []
    const remap = new Map<string, string>()
    for (const asset of manifest.assets) {
      const bytes = files.get(asset.path)
      if (!bytes || bytes.length !== asset.size || dependencies.get(asset.id) !== asset.assetType) throw new Error(`缺少引用资产或大小/类型不一致: ${asset.name}`)
      if (await sha256(bytes) !== asset.sha256) throw new Error(`资产校验失败: ${asset.name}`)
      validatePortableAsset(bytes, asset.assetType)
      const id = `asset_${crypto.randomUUID()}`
      remap.set(asset.id, id)
      records.push({ id, fingerprint: `package:${projectId}:${id}`, name: asset.name, mimeType: asset.mimeType, size: asset.size,
        lastModified: asset.lastModified, createdAt: asset.createdAt, assetType: asset.assetType, blob: new Blob([new Uint8Array(bytes).buffer], { type: asset.mimeType }) })
    }
    scene.projectId = projectId
    for (const instance of scene.instances) instance.assetId = remap.get(instance.assetId)!
    if (scene.sceneSettings?.environmentAssetId) scene.sceneSettings.environmentAssetId = remap.get(scene.sceneSettings.environmentAssetId)!
    const project: Project = { id: projectId, name: `${manifest.project.name.slice(0, 196)}（导入）`, createdAt: timestamp, updatedAt: timestamp }
    let assetsCommitted = false
    try {
      await this.assets.addBatch(records)
      assetsCommitted = true
      await this.scenes.save(scene)
      this.projects.addImportedProject(project)
      return project
    } catch (error) {
      const cleanup = await Promise.allSettled([this.scenes.remove(projectId), ...(assetsCommitted ? [this.assets.removeBatch(records.map(item => item.id))] : [])])
      if (cleanup.some(result => result.status === 'rejected')) throw new Error('导入失败且回滚未完成；请检查浏览器存储状态')
      throw new Error(`导入失败，已回滚：${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
