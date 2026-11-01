import { Box3, Matrix4, Vector3 } from 'three'
import {
  duplicateNodes,
  type EffectInstance,
  groupNodes,
  isLockedOrHidden,
  newId,
  nodeById,
  plain,
  removeNodes,
  reparentNodes,
  type SceneNodeV2,
  subtreeIds,
  targetNodeId,
  topmost,
  transformOf,
  type TwinBindingTarget,
  ungroupNodes,
  uniqueName,
  worldMatrixOf,
} from '@twin-studio/core'
import type { EditorSession } from '../EditorSession'

/**
 * 编辑已有的对象：改属性、显隐、锁定、删除、复制粘贴、组合、调整层级、对齐分布、落地、阵列、方向键微调。
 * 所有操作都通过 session.edit() 成为一步可撤销的修改；对齐、落地等按世界坐标计算，再换算回各自父级的局部坐标。
 */
export class NodeEditing {
  /** Copied nodes, their effects and where they appeared (centre of their bounds, for paste-here). */
  private clipboard: { nodes: SceneNodeV2[]; effects: EffectInstance[]; center: Vector3 | null } | null = null

  constructor(private readonly session: EditorSession) {}

  updateNode(id: string, recipe: (node: SceneNodeV2) => void, label = '修改属性', coalesceKey?: string): void {
    this.session.edit(
      label,
      draft => {
        const node = nodeById(draft, id)
        if (node) recipe(node)
      },
      { coalesceKey },
    )
  }

  /** Applies a change to every selected node (multi-edit in the inspector). */
  updateSelected(recipe: (node: SceneNodeV2) => void, label = '修改属性', coalesceKey?: string): void {
    const ids = this.session.selection.value
    this.session.edit(
      label,
      draft => {
        for (const id of ids) {
          const node = nodeById(draft, id)
          if (node) recipe(node)
        }
      },
      { coalesceKey },
    )
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim()
    if (trimmed) this.updateNode(id, node => void (node.name = trimmed), '重命名')
  }

  setVisible(ids: readonly string[], visible: boolean): void {
    this.session.edit(visible ? '显示' : '隐藏', draft => {
      for (const id of ids) {
        const node = nodeById(draft, id)
        if (node) node.visible = visible
      }
    })
  }

  setLocked(ids: readonly string[], locked: boolean): void {
    this.session.edit(locked ? '锁定' : '解锁', draft => {
      for (const id of ids) {
        const node = nodeById(draft, id)
        if (node) node.locked = locked
      }
    })
    this.session.refreshSelectionVisuals()
  }

  toggleVisibilityOfSelection(): void {
    const part = this.session.part.value
    if (part) {
      const hidden = this.session.modelParts.partOverride(part.nodeId, part.assetNodeId)?.visible === false
      return this.session.modelParts.setPartVisible(part.nodeId, part.assetNodeId, hidden)
    }
    const nodes = this.session.selectedNodes
    if (nodes.length)
      this.setVisible(
        nodes.map(node => node.id),
        !nodes.every(node => node.visible),
      )
  }

  deleteSelection(): void {
    const part = this.session.part.value
    if (part) return this.session.modelParts.deleteParts(part.nodeId, [part.assetNodeId])
    const ids = this.session.selection.value
    if (!ids.length) return
    this.session.edit(`删除 ${ids.length} 个对象`, draft => void removeNodes(draft, ids))
    this.session.clearSelection()
  }

  duplicateSelection(): void {
    const ids = this.session.selection.value
    if (!ids.length) return
    let created: string[] = []
    this.session.edit('复制', draft => {
      created = duplicateNodes(draft, ids, [2, 0, 2])
    })
    this.session.select(created)
  }

  copySelection(): void {
    const doc = this.session.doc.value
    const ids = topmost(doc, this.session.selection.value)
    if (!ids.length) return
    const included = new Set(ids.flatMap(id => [...subtreeIds(doc, id)]))
    const bounds = new Box3()
    for (const id of ids) {
      const object = this.session.sync.objectFor(id)
      if (object) bounds.expandByObject(object, true)
    }
    this.clipboard = {
      nodes: plain(doc.nodes.filter(node => included.has(node.id))) as SceneNodeV2[],
      effects: plain(doc.effects.filter(effect => included.has(targetNodeId(effect.target)))) as EffectInstance[],
      center: bounds.isEmpty() ? null : bounds.getCenter(new Vector3()),
    }
    this.session.ui.hasClipboard = true
  }

  /** Pastes the copied nodes beside the originals, or centred on a scene point (right-click → paste here). */
  paste(at?: Vector3 | null): void {
    const clip = this.clipboard
    if (!clip) return
    const remap = new Map(clip.nodes.map(node => [node.id, newId(node.kind === 'model' ? 'instance' : 'node')]))
    const roots: string[] = []
    this.session.edit('粘贴', draft => {
      const parentOf = (original: SceneNodeV2) =>
        original.parentId && !remap.has(original.parentId) && nodeById(draft, original.parentId)
          ? original.parentId
          : null
      const top = clip.nodes.filter(node => !node.parentId || !remap.has(node.parentId))
      const world = (node: SceneNodeV2) =>
        new Vector3(...node.transform.position).applyMatrix4(worldMatrixOf(draft, parentOf(node)))
      const center =
        clip.center ?? top.reduce((sum, node) => sum.add(world(node)), new Vector3()).divideScalar(top.length || 1)
      const shift = at ? new Vector3(at.x - center.x, 0, at.z - center.z) : new Vector3(3, 0, 3)
      for (const original of clip.nodes) {
        const node = plain(original) as SceneNodeV2
        node.id = remap.get(original.id)!
        const parentInClip = original.parentId ? remap.get(original.parentId) : undefined
        node.parentId = parentInClip ?? parentOf(original)
        delete node.runtimeBid
        if (!parentInClip) {
          node.name = uniqueName(draft, node.name)
          const target = world(original).add(shift).applyMatrix4(worldMatrixOf(draft, node.parentId).invert())
          node.transform.position = [target.x, target.y, target.z]
          roots.push(node.id)
        }
        draft.nodes.push(node)
      }
      for (const effect of clip.effects) {
        const target = plain(effect.target) as TwinBindingTarget
        const id = remap.get(targetNodeId(target))
        if (!id) continue
        if (target.type === 'asset-instance' || target.type === 'asset-node') target.instanceId = id
        else target.nodeId = id
        draft.effects.push({ ...plain(effect), id: newId('effect'), target })
      }
    })
    this.session.select(roots)
  }

  groupSelection(): string | null {
    let id: string | null = null
    this.session.edit('组合', draft => {
      id = groupNodes(draft, this.session.selection.value)
    })
    if (id) this.session.select([id])
    return id
  }

  ungroupSelection(): void {
    const groups = this.session.selectedNodes.filter(node => node.kind === 'group').map(node => node.id)
    if (!groups.length) return
    let freed: string[] = []
    this.session.edit('取消组合', draft => {
      freed = ungroupNodes(draft, groups)
    })
    this.session.select(freed)
  }

  reparent(ids: readonly string[], parentId: string | null, beforeId?: string): void {
    this.session.edit('调整层级', draft => reparentNodes(draft, ids, parentId, beforeId))
  }

  /** Lines the selection up along a world axis. */
  align(axis: 0 | 1 | 2, edge: 'min' | 'center' | 'max'): void {
    const ids = topmost(this.session.doc.value, this.session.selection.value)
    const boxes = ids.map(id => {
      const object = this.session.sync.objectFor(id)
      return object ? new Box3().setFromObject(object, true) : null
    })
    if (boxes.filter(Boolean).length < 2) return
    const values = boxes.map(box => (box ? edgeOf(box, axis, edge) : 0))
    const goal =
      edge === 'min'
        ? Math.min(...values)
        : edge === 'max'
          ? Math.max(...values)
          : values.reduce((a, b) => a + b, 0) / values.length
    this.shiftWorld(
      '对齐',
      ids,
      ids.map((_, i) => (boxes[i] ? goal - values[i]! : 0)),
      axis,
    )
  }

  /** Spaces the selection evenly between its outermost members. */
  distribute(axis: 0 | 2): void {
    const ids = topmost(this.session.doc.value, this.session.selection.value)
    const entries = ids
      .map(id => ({
        id,
        box: this.session.sync.objectFor(id) ? new Box3().setFromObject(this.session.sync.objectFor(id)!, true) : null,
      }))
      .filter((entry): entry is { id: string; box: Box3 } => !!entry.box)
      .map(entry => ({ ...entry, center: edgeOf(entry.box, axis, 'center') }))
      .sort((a, b) => a.center - b.center)
    if (entries.length < 3) return
    const first = entries[0]!.center
    const step = (entries.at(-1)!.center - first) / (entries.length - 1)
    this.shiftWorld(
      '均匀分布',
      entries.map(entry => entry.id),
      entries.map((entry, index) => first + step * index - entry.center),
      axis,
    )
  }

  /** Sets every selected object down on the ground. */
  dropToGround(): void {
    const ids = topmost(this.session.doc.value, this.session.selection.value)
    const offsets = ids.map(id => {
      const object = this.session.sync.objectFor(id)
      const box = object ? new Box3().setFromObject(object, true) : null
      return box && !box.isEmpty() ? -box.min.y : 0
    })
    this.shiftWorld('落地', ids, offsets, 1)
  }

  /** Copies the selection `count` times, each `spacing` metres further along X / Z. */
  arrayDuplicate(count: number, spacing: [number, number, number]): void {
    const ids = topmost(this.session.doc.value, this.session.selection.value)
    if (!ids.length || count < 1) return
    const created: string[] = []
    this.session.edit(`阵列 ${count} 份`, draft => {
      for (let i = 1; i <= count; i++) {
        created.push(...duplicateNodes(draft, ids, [spacing[0] * i, spacing[1] * i, spacing[2] * i]))
      }
    })
    this.session.select([...ids, ...created])
  }

  /**
   * Arrow keys: moves the selection one step relative to the view (up = away from the camera along the
   * nearest world axis). The step is the snap distance when snapping, else 0.1 m; `coarse` (Shift) is ×10.
   * Holding a key repeats into one undo step; the key's release commits it.
   */
  nudge(direction: 'up' | 'down' | 'left' | 'right' | 'raise' | 'lower', coarse = false): void {
    const ids = topmost(this.session.doc.value, this.session.selection.value).filter(
      id => !isLockedOrHidden(this.session.doc.value, id).locked,
    )
    if (!ids.length || this.session.part.value) return
    const step = (this.session.ui.snap.enabled ? this.session.ui.snap.translate : 0.1) * (coarse ? 10 : 1)
    if (direction === 'raise' || direction === 'lower') {
      return this.shiftWorld(
        '微调位置',
        ids,
        ids.map(() => (direction === 'raise' ? step : -step)),
        1,
        'nudge',
      )
    }
    // The camera's forward on the ground, snapped to the nearest world axis.
    const forward = this.session.engine.camera.getWorldDirection(new Vector3()).setY(0)
    const alongX = Math.abs(forward.x) > Math.abs(forward.z)
    const sign = Math.sign(alongX ? forward.x : forward.z) || 1
    let axis: 0 | 2
    let amount: number
    if (direction === 'up' || direction === 'down') {
      axis = alongX ? 0 : 2
      amount = (direction === 'up' ? step : -step) * sign
    } else {
      // Right of forward: (x, z) → (-z, x).
      axis = alongX ? 2 : 0
      amount = (direction === 'right' ? step : -step) * (alongX ? sign : -sign)
    }
    this.shiftWorld(
      '微调位置',
      ids,
      ids.map(() => amount),
      axis,
      'nudge',
    )
  }

  private shiftWorld(
    label: string,
    ids: readonly string[],
    offsets: readonly number[],
    axis: 0 | 1 | 2,
    coalesce?: string,
  ): void {
    this.session.edit(
      label,
      draft => {
        ids.forEach((id, index) => {
          const offset = offsets[index] ?? 0
          if (Math.abs(offset) < 1e-6) return
          const node = nodeById(draft, id)
          if (!node) return
          const world = worldMatrixOf(draft, id)
          const shift = new Vector3()
          shift.setComponent(axis, offset)
          world.premultiply(new Matrix4().makeTranslation(shift.x, shift.y, shift.z))
          node.transform = transformOf(worldMatrixOf(draft, node.parentId).invert().multiply(world))
        })
      },
      coalesce ? { coalesceKey: `${coalesce}:${ids.join(',')}` } : {},
    )
  }
}

function edgeOf(box: Box3, axis: 0 | 1 | 2, edge: 'min' | 'center' | 'max'): number {
  const min = box.min.getComponent(axis)
  const max = box.max.getComponent(axis)
  return edge === 'min' ? min : edge === 'max' ? max : (min + max) / 2
}
