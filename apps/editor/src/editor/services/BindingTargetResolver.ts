import type { Object3D } from 'three'
import type { TwinBindingTarget } from '@/domain/twin'
import { findAssetInstanceRoot, getEditorMetadata } from '@/editor/editorMetadata'
import type { MeteorScene } from '@/infrastructure/meteor3d'

export function bindingTargetFromObject(object: Object3D): TwinBindingTarget | null {
  const ownMetadata = getEditorMetadata(object)
  if (ownMetadata?.kind === 'primitive') {
    return { type: 'primitive', nodeId: ownMetadata.nodeId }
  }

  const assetRoot = findAssetInstanceRoot(object)
  const rootMetadata = assetRoot ? getEditorMetadata(assetRoot) : null
  if (!assetRoot || rootMetadata?.kind !== 'assetInstance') return null
  if (object === assetRoot) {
    return { type: 'asset-instance', instanceId: rootMetadata.instanceId }
  }
  const assetNodeId: unknown = object.userData.assetNodeId
  if (typeof assetNodeId !== 'string' || !assetNodeId) return null
  return {
    type: 'asset-node',
    instanceId: rootMetadata.instanceId,
    assetNodeId,
  }
}

export function bindingTargetsInObjectTree(object: Object3D): TwinBindingTarget[] {
  const targets: TwinBindingTarget[] = []
  object.traverse((node) => {
    const target = bindingTargetFromObject(node)
    if (target) targets.push(target)
  })
  return targets
}

export class BindingTargetResolver {
  private platformLookupCount = 0
  private meteorLookupCount = 0

  constructor(
    private readonly getSceneRoots: () => readonly Object3D[],
    private readonly meteorScene: MeteorScene,
  ) {}

  resolve(target: TwinBindingTarget): Object3D | null {
    this.platformLookupCount += 1
    const platformObject = this.resolveByPlatformIdentity(target)
    if (!platformObject) return null

    const runtimeBid: unknown = platformObject.userData.bid
    if (typeof runtimeBid === 'string') {
      this.meteorLookupCount += 1
      return this.meteorScene.findObjectByBid(runtimeBid) ?? platformObject
    }
    return platformObject
  }

  getDiagnostics(): { platformLookupCount: number; meteorLookupCount: number } {
    return {
      platformLookupCount: this.platformLookupCount,
      meteorLookupCount: this.meteorLookupCount,
    }
  }

  private resolveByPlatformIdentity(target: TwinBindingTarget): Object3D | null {
    if (target.type === 'primitive') {
      return this.getSceneRoots().find((root) => {
        const metadata = getEditorMetadata(root)
        return metadata?.kind === 'primitive' && metadata.nodeId === target.nodeId
      }) ?? null
    }

    const assetRoot = this.getSceneRoots().find((root) => {
      const metadata = getEditorMetadata(root)
      return metadata?.kind === 'assetInstance' && metadata.instanceId === target.instanceId
    }) ?? null
    if (!assetRoot || target.type === 'asset-instance') return assetRoot

    let resolved: Object3D | null = null
    assetRoot.traverse((node) => {
      if (!resolved && node.userData.assetNodeId === target.assetNodeId) resolved = node
    })
    return resolved
  }
}
