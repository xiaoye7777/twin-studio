import type { Object3D } from 'three'
import { applySceneTransform, createDefaultSceneSettings } from '../../domain/scene'
import type { SceneDocumentV1, SceneSettingsV1, SceneCameraViewV1 } from '../../domain/scene'
import type { AssetRepository } from '../../infrastructure/assets/AssetRepository'
import type { MeteorScene } from '../../infrastructure/meteor3d'
import { ImportedAssetResourceRegistry } from './ImportedAssetResourceRegistry'
import { setEditorMetadata } from './objectMetadata'
import { createScenePrimitive } from './createScenePrimitive'
import { SceneEnvironment } from './SceneEnvironment'

export interface SceneRestoreResult {
  roots: Object3D[]
  modifiedObjects: Object3D[]
  warnings: string[]
}

/** Shared document interpreter. No stores, editing actions or DOM listeners. */
export class SceneRuntimeLoader {
  private disposed = false
  private readonly environment: SceneEnvironment

  constructor(
    private readonly runtime: MeteorScene,
    private readonly assets: AssetRepository,
    readonly resources = new ImportedAssetResourceRegistry(),
  ) {
    this.environment = new SceneEnvironment(runtime, assets, resources)
  }

  get environmentStatus(): string {
    return this.environment.status
  }

  private assertActive(): void {
    if (this.disposed) throw new DOMException('Scene loading cancelled', 'AbortError')
  }

  async restore(document: SceneDocumentV1): Promise<SceneRestoreResult> {
    this.assertActive()
    const roots: Object3D[] = []
    const modifiedObjects: Object3D[] = []
    const warnings: string[] = []
    for (const saved of document.primitives) {
      const object = createScenePrimitive(saved.type, saved)
      if (!this.runtime.addObject(object)) throw new Error(`无法恢复 Primitive ${saved.name}`)
      roots.push(object)
    }
    for (const instance of document.instances) {
      try {
        const asset = await this.assets.get(instance.assetId)
        this.assertActive()
        if (!asset) throw new Error(`缺少资产 ${instance.assetId}`)
        const model = await this.runtime.loadGLTFModel(this.resources.getOrCreate(asset).objectUrl)
        this.assertActive()
        model.name = instance.name
        setEditorMetadata(model, {
          kind: 'assetInstance',
          assetRoot: true,
          assetId: instance.assetId,
          instanceId: instance.instanceId,
          deletedAssetNodeIds: [...(instance.deletedAssetNodeIds ?? [])],
        })
        const nodes = new Map<string, Object3D>()
        model.traverse(node => {
          // Preserve original poses for Editor reset without involving an Editor store.
          node.userData.editorInitialTransform = {
            position: node.position.toArray(),
            rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
            scale: node.scale.toArray(),
          }
          if (typeof node.userData.assetNodeId === 'string') nodes.set(node.userData.assetNodeId, node)
        })
        applySceneTransform(model, instance.transform)
        if (instance.runtimeBid) model.userData.bid = instance.runtimeBid
        for (const override of instance.nodeOverrides) {
          const node = nodes.get(override.assetNodeId)
          if (!node) {
            warnings.push(`缺少模型节点 ${instance.instanceId}/${override.assetNodeId}`)
            continue
          }
          node.name = override.name
          applySceneTransform(node, override.transform)
          node.visible = override.visible ?? true
          if (override.runtimeBid) node.userData.bid = override.runtimeBid
          modifiedObjects.push(node)
        }
        for (const id of instance.deletedAssetNodeIds ?? []) nodes.get(id)?.removeFromParent()
        model.visible = instance.visible ?? true
        if (!this.runtime.addObject(model)) throw new Error(`无法恢复模型 ${instance.name}`)
        roots.push(model)
      } catch (error) {
        this.assertActive()
        warnings.push(`${instance.instanceId}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    try {
      await this.applySettings(document.sceneSettings ?? createDefaultSceneSettings())
    } catch (error) {
      this.assertActive()
      warnings.push(error instanceof Error ? error.message : String(error))
    }
    this.assertActive()
    if (document.cameraView) await this.restoreCamera(document.cameraView)
    this.assertActive()
    return { roots, modifiedObjects, warnings }
  }

  applySettings(settings: SceneSettingsV1): Promise<void> {
    this.assertActive()
    return this.environment.apply(settings)
  }

  restoreCamera(view: SceneCameraViewV1): Promise<void> {
    this.assertActive()
    return this.environment.restoreCamera(view)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.environment.dispose()
    this.resources.dispose()
    // Objects and environment belong to MeteorScene; its dispose frees them.
  }
}
