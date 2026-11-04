import {
  type ModelNodeV2,
  type ModelPart,
  nodeById,
  removeModelParts,
  type SceneNodeV2,
  type SceneTransformV1,
} from '@twin-studio/core'
import type { EditorSession, PartRef } from '../EditorSession'

type PartOverride = ModelNodeV2['model']['overrides'][string]

/**
 * 模型部件：模型文件里的子物体（如风机的叶片）。可以单独改名、移动、隐藏、换材质、删除，
 * 这些改动存为模型节点上的覆盖（overrides），模型文件本身不变；「恢复部件」就是删掉覆盖。
 */
export class ModelParts {
  constructor(private readonly session: EditorSession) {}

  /** Outlines a part while the pointer is over its row in the hierarchy. */
  hoverPart(part: PartRef | null): void {
    const object = part ? this.session.sync.partObject(part.nodeId, part.assetNodeId) : null
    this.session.hovered.value = null
    this.session.engine.setOutlined('hover', object ? [object] : [])
  }

  /** A part's name as shown: its rename, else the name in the file. */
  partName(nodeId: string, assetNodeId: string): string {
    const node = this.session.node(nodeId)
    const override = node?.kind === 'model' ? node.model.overrides[assetNodeId] : undefined
    return (
      override?.name ?? this.session.sync.partsOf(nodeId).find(part => part.id === assetNodeId)?.name ?? assetNodeId
    )
  }

  partOverride(nodeId: string, assetNodeId: string): PartOverride | undefined {
    const node = this.session.node(nodeId)
    return node?.kind === 'model' ? node.model.overrides[assetNodeId] : undefined
  }

  /** A part's pose relative to its parent in the model: the override, else as imported. */
  partTransform(nodeId: string, assetNodeId: string): SceneTransformV1 | null {
    const override = this.partOverride(nodeId, assetNodeId)?.transform
    if (override) return override
    void this.session.ui.syncRevision
    const initial: unknown = this.session.sync.partObject(nodeId, assetNodeId)?.userData.editorInitialTransform
    return (initial as SceneTransformV1 | undefined) ?? null
  }

  /** Edits one part's override; an override left empty is removed. */
  updatePart(
    nodeId: string,
    assetNodeId: string,
    recipe: (override: PartOverride) => void,
    label = '修改部件',
    coalesceKey?: string,
  ): void {
    this.session.edit(
      label,
      draft => {
        const node = nodeById(draft, nodeId)
        if (node?.kind !== 'model') return
        const override = (node.model.overrides[assetNodeId] ??= {})
        recipe(override)
        for (const key of Object.keys(override) as Array<keyof PartOverride>)
          if (override[key] === undefined) delete override[key]
        if (override.material && !Object.keys(override.material).length) delete override.material
        if (!Object.keys(override).length) delete node.model.overrides[assetNodeId]
      },
      { coalesceKey },
    )
  }

  setPartVisible(nodeId: string, assetNodeId: string, visible: boolean): void {
    this.updatePart(
      nodeId,
      assetNodeId,
      override => void (override.visible = visible ? undefined : false),
      visible ? '显示部件' : '隐藏部件',
    )
  }

  /** Back to the part as imported (name, pose, visibility and material). */
  resetPart(nodeId: string, assetNodeId: string): void {
    this.session.edit('恢复部件', draft => {
      const node = nodeById(draft, nodeId)
      if (node?.kind === 'model') delete node.model.overrides[assetNodeId]
    })
  }

  /** Removes parts from their model instance, with whatever was bound to them. */
  deleteParts(nodeId: string, assetNodeIds: readonly string[]): void {
    const tree = this.session.sync.partTree(nodeId)
    const within: string[] = []
    const collect = (parts: ModelPart[], inside: boolean) => {
      for (const part of parts) {
        const hit = inside || assetNodeIds.includes(part.id)
        if (hit) within.push(part.id)
        collect(part.children, hit)
      }
    }
    collect(tree, false)
    this.session.edit(`删除部件`, draft => removeModelParts(draft, nodeId, assetNodeIds, within))
    this.session.select([nodeId])
  }

  restoreDeletedParts(nodeId: string): void {
    this.session.nodes.updateNode(
      nodeId,
      node => void (node.kind === 'model' && (node.model.deleted = [])),
      '恢复删除的部件',
    )
  }

  /** Model nodes that use an asset. */
  nodesUsingAsset(assetId: string): SceneNodeV2[] {
    return this.session.doc.value.nodes.filter(node => node.kind === 'model' && node.model.assetId === assetId)
  }

  /**
   * Swaps the model file of nodes, keeping position, part edits, bindings and effects. Parts are matched by
   * their assetNodeId, so an updated delivery of the same model keeps everything that still exists in it.
   */
  replaceModel(nodeIds: readonly string[], assetId: string): void {
    this.session.edit(nodeIds.length > 1 ? `替换 ${nodeIds.length} 个模型` : '替换模型', draft => {
      for (const id of nodeIds) {
        const node = nodeById(draft, id)
        if (node?.kind === 'model') node.model.assetId = assetId
      }
    })
  }
}
