import type { Object3D } from 'three'
import { targetNodeId, type TwinBindingTarget } from '../../domain/twin'
import { findAssetInstanceRoot, getEditorMetadata } from '../scene/objectMetadata'

const plainNodeKinds = new Set(['group', 'path', 'area', 'label', 'light'])

/** The binding target an object stands for, or null for unidentified parts. */
export function bindingTargetFromObject(object: Object3D): TwinBindingTarget | null {
  const ownMetadata = getEditorMetadata(object)
  if (ownMetadata?.kind === 'primitive') return { type: 'primitive', nodeId: ownMetadata.nodeId }
  const kind: unknown = object.userData.nodeKind
  const nodeId: unknown = object.userData.sceneNodeId
  if (typeof kind === 'string' && plainNodeKinds.has(kind) && typeof nodeId === 'string') {
    return { type: 'node', nodeId }
  }
  const assetRoot = findAssetInstanceRoot(object)
  const rootMetadata = assetRoot ? getEditorMetadata(assetRoot) : null
  if (!assetRoot || rootMetadata?.kind !== 'assetInstance') return null
  if (object === assetRoot) return { type: 'asset-instance', instanceId: rootMetadata.instanceId }
  const assetNodeId: unknown = object.userData.assetNodeId
  if (typeof assetNodeId !== 'string' || !assetNodeId) return null
  return { type: 'asset-node', instanceId: rootMetadata.instanceId, assetNodeId }
}

export function bindingTargetsInObjectTree(object: Object3D): TwinBindingTarget[] {
  const targets: TwinBindingTarget[] = []
  object.traverse(node => {
    const target = bindingTargetFromObject(node)
    if (target) targets.push(target)
  })
  return targets
}

/** Finds the object a target refers to through the scene's node index (any depth of grouping). */
export class BindingTargetResolver {
  private lookups = 0

  constructor(private readonly findNode: (nodeId: string) => Object3D | null) {}

  resolve(target: TwinBindingTarget): Object3D | null {
    this.lookups += 1
    const root = this.findNode(targetNodeId(target))
    if (!root || target.type !== 'asset-node') return root
    let resolved: Object3D | null = null
    root.traverse(node => {
      if (!resolved && node.userData.assetNodeId === target.assetNodeId) resolved = node
    })
    return resolved
  }

  getDiagnostics(): { platformLookupCount: number; meteorLookupCount: number } {
    return { platformLookupCount: this.lookups, meteorLookupCount: 0 }
  }
}
