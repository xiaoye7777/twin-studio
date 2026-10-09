import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { defaultDataSources } from '../domain/dataSources'
import {
  createDefaultPresentation,
  createDefaultSceneSettingsV2,
  type SceneDocumentV2,
  type SceneNodeV2,
  type SceneTransformV1,
} from '../domain/scene'
import type { EffectInstance } from '../domain/effects'
import type { SceneInteraction } from '../domain/interactions'
import { targetNodeId, type TwinBinding, type TwinBindingTarget } from '../domain/twin'
import type { VisualRule } from '../domain/visualRules'

/**
 * Edits on scene documents, written for Immer drafts (they mutate) but equally usable on plain copies.
 * They keep the document consistent: removing a node removes what pointed at it, reparenting keeps world
 * positions, and so on.
 */
type Doc = SceneDocumentV2
type Node = SceneNodeV2
type Transform = SceneTransformV1

export const identityTransform = (): Transform => ({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })

/** A detached deep copy of document data (works on Immer drafts, unlike structuredClone). */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export function createEmptyDocument(projectId: string, name: string): Doc {
  return {
    version: 2,
    projectId,
    metadata: { name, updatedAt: new Date().toISOString() },
    dataSources: defaultDataSources(),
    settings: createDefaultSceneSettingsV2(),
    nodes: [],
    bindings: [],
    effects: [],
    visualRules: [],
    interactions: [],
    bookmarks: [],
    tours: [],
    presentation: createDefaultPresentation(),
  }
}

// ---------------------------------------------------------------- hierarchy

export function nodeById(doc: Doc, id: string): Node | undefined {
  return doc.nodes.find(node => node.id === id)
}

export function childrenOf(doc: Doc, parentId: string | null): Node[] {
  return doc.nodes.filter(node => node.parentId === parentId)
}

/** The node and everything below it. */
export function subtreeIds(doc: Doc, id: string): Set<string> {
  const result = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const node of doc.nodes) {
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id)
        grew = true
      }
    }
  }
  return result
}

/** Ancestors from the root down to (excluding) the node. */
export function ancestorIds(doc: Doc, id: string): string[] {
  const chain: string[] = []
  let current = nodeById(doc, id)?.parentId ?? null
  while (current) {
    chain.unshift(current)
    current = nodeById(doc, current)?.parentId ?? null
  }
  return chain
}

/** Drops ids whose ancestor is also in the list, so operations apply once per subtree. */
export function topmost(doc: Doc, ids: readonly string[]): string[] {
  const set = new Set(ids)
  return ids.filter(id => !ancestorIds(doc, id).some(ancestor => set.has(ancestor)))
}

export function isLockedOrHidden(doc: Doc, id: string): { locked: boolean; hidden: boolean } {
  let locked = false
  let hidden = false
  for (const nodeId of [...ancestorIds(doc, id), id]) {
    const node = nodeById(doc, nodeId)
    if (node?.locked) locked = true
    if (node && !node.visible) hidden = true
  }
  return { locked, hidden }
}

// ---------------------------------------------------------------- transforms

export function matrixOf(transform: Transform): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...transform.position),
    new Quaternion().setFromEuler(new Euler(...transform.rotation)),
    new Vector3(...transform.scale),
  )
}

export function transformOf(matrix: Matrix4): Transform {
  const position = new Vector3()
  const quaternion = new Quaternion()
  const scale = new Vector3()
  matrix.decompose(position, quaternion, scale)
  const euler = new Euler().setFromQuaternion(quaternion)
  const round = (value: number) => Math.round(value * 1e5) / 1e5
  return {
    position: [round(position.x), round(position.y), round(position.z)],
    rotation: [round(euler.x), round(euler.y), round(euler.z)],
    scale: [round(scale.x), round(scale.y), round(scale.z)],
  }
}

/** A node's world matrix, composed from the document alone. */
export function worldMatrixOf(doc: Doc, id: string | null): Matrix4 {
  const matrix = new Matrix4()
  if (!id) return matrix
  for (const nodeId of [...ancestorIds(doc, id), id]) {
    const node = nodeById(doc, nodeId)
    if (node) matrix.multiply(matrixOf(node.transform))
  }
  return matrix
}

// ---------------------------------------------------------------- edits (on Immer drafts)

/** Removes nodes with their subtrees and everything that pointed at them. Returns the removed ids. */
export function removeNodes(draft: Doc, ids: readonly string[]): Set<string> {
  const removed = new Set<string>()
  for (const id of ids) for (const nodeId of subtreeIds(draft, id)) removed.add(nodeId)
  draft.nodes = draft.nodes.filter(node => !removed.has(node.id))
  dropTargets(draft, target => removed.has(targetNodeId(target)))
  for (const tour of draft.tours) {
    for (const step of tour.steps) {
      if (step.nodeId && removed.has(step.nodeId)) step.nodeId = null
      if (step.highlightNodeId && removed.has(step.highlightNodeId)) step.highlightNodeId = null
      step.show = step.show.filter(id => !removed.has(id))
      step.hide = step.hide.filter(id => !removed.has(id))
    }
  }
  return removed
}

/** Removes bindings, effects, rules and interactions aimed at targets that are gone. */
function dropTargets(draft: Doc, gone: (target: TwinBindingTarget) => boolean): void {
  const bindingIds = new Set(draft.bindings.filter(binding => gone(binding.target)).map(binding => binding.id))
  draft.bindings = draft.bindings.filter(binding => !bindingIds.has(binding.id))
  draft.effects = draft.effects.filter(effect => !gone(effect.target))
  draft.visualRules = draft.visualRules.filter(rule => !gone(rule.target) && !bindingIds.has(rule.bindingId))
  draft.interactions = draft.interactions.filter(
    item => !gone(item.source) && !('target' in item.action && item.action.target && gone(item.action.target)),
  )
}

/**
 * Deletes parts of a model instance, and whatever pointed at them. `within` lists every part inside the
 * deleted ones (they disappear with them), for cleaning up bindings, effects and motions on nested parts.
 */
export function removeModelParts(
  draft: Doc,
  nodeId: string,
  partIds: readonly string[],
  within: readonly string[] = partIds,
): void {
  const node = draft.nodes.find(item => item.id === nodeId)
  if (node?.kind !== 'model') return
  for (const id of partIds) if (!node.model.deleted.includes(id)) node.model.deleted.push(id)
  const gone = new Set([...partIds, ...within])
  dropTargets(
    draft,
    target => target.type === 'asset-node' && target.instanceId === nodeId && gone.has(target.assetNodeId),
  )
  if (node.model.motions) {
    node.model.motions = node.model.motions.filter(motion => !gone.has(motion.assetNodeId))
    if (!node.model.motions.length) delete node.model.motions
  }
}

/** Deep-copies nodes (with subtrees and their effects) next to the originals. Returns the new top ids. */
export function duplicateNodes(draft: Doc, ids: readonly string[], offset: [number, number, number]): string[] {
  const top = topmost(draft, ids)
  const created: string[] = []
  const remap = new Map<string, string>()
  for (const id of top) {
    const subtree = subtreeIds(draft, id)
    const originals = draft.nodes.filter(node => subtree.has(node.id))
    for (const node of originals) remap.set(node.id, newId(node.kind === 'model' ? 'instance' : 'node'))
    const copies = originals.map(node => {
      const copy = plain(node) as Node
      copy.id = remap.get(node.id)!
      copy.parentId = node.id === id ? node.parentId : remap.get(node.parentId!)!
      delete copy.runtimeBid
      if (node.id === id) {
        copy.name = uniqueName(draft, `${node.name}`)
        copy.transform.position = copy.transform.position.map((value, axis) => value + offset[axis]!) as [
          number,
          number,
          number,
        ]
      }
      return copy
    })
    const last = Math.max(...originals.map(node => draft.nodes.findIndex(item => item.id === node.id)))
    draft.nodes.splice(last + 1, 0, ...copies)
    created.push(remap.get(id)!)
  }
  // Effects follow their copies; device bindings do not (a device lives in one place).
  for (const effect of [...draft.effects]) {
    const nodeId = targetNodeId(effect.target)
    const copyId = remap.get(nodeId)
    if (!copyId) continue
    const target = plain(effect.target) as TwinBindingTarget
    if (target.type === 'asset-instance' || target.type === 'asset-node') target.instanceId = copyId
    else target.nodeId = copyId
    draft.effects.push({ ...plain(effect), id: newId('effect'), target })
  }
  return created
}

export function uniqueName(doc: Doc, base: string): string {
  const names = new Set(doc.nodes.map(node => node.name))
  const stem = base.replace(/\s\d+$/, '')
  if (!names.has(base)) return base
  for (let index = 2; ; index++) if (!names.has(`${stem} ${index}`)) return `${stem} ${index}`
}

/** Moves nodes under a new parent, keeping where they are in the world. */
export function reparentNodes(draft: Doc, ids: readonly string[], parentId: string | null, beforeId?: string): void {
  const moving = topmost(draft, ids).filter(id => {
    if (parentId === null) return true
    // Never into itself or its own subtree.
    return !subtreeIds(draft, id).has(parentId)
  })
  if (!moving.length) return
  const parentInverse = worldMatrixOf(draft, parentId).invert()
  for (const id of moving) {
    const node = nodeById(draft, id)!
    const world = worldMatrixOf(draft, id)
    node.transform = transformOf(parentInverse.clone().multiply(world))
    node.parentId = parentId
  }
  // Sibling order: place the moved nodes before `beforeId`, or after the parent's last child.
  const entries = moving.map(id => draft.nodes.find(node => node.id === id)!)
  draft.nodes = draft.nodes.filter(node => !moving.includes(node.id))
  let index = beforeId ? draft.nodes.findIndex(node => node.id === beforeId) : -1
  if (index < 0) {
    const siblings = draft.nodes.map((node, at) => (node.parentId === parentId ? at : -1)).filter(at => at >= 0)
    const parentIndex = parentId ? draft.nodes.findIndex(node => node.id === parentId) : -1
    index = Math.max(parentIndex, ...siblings) + 1
  }
  draft.nodes.splice(index, 0, ...entries)
}

/** Wraps nodes in a new group placed at their centre. Returns the group id. */
export function groupNodes(draft: Doc, ids: readonly string[], name = '分组'): string | null {
  const top = topmost(draft, ids)
  if (!top.length) return null
  const parents = new Set(top.map(id => nodeById(draft, id)!.parentId))
  const parentId = parents.size === 1 ? [...parents][0]! : null
  const parentInverse = worldMatrixOf(draft, parentId).invert()
  const center = new Vector3()
  for (const id of top) center.add(new Vector3().setFromMatrixPosition(worldMatrixOf(draft, id)))
  center.divideScalar(top.length).applyMatrix4(parentInverse)
  const group: Node = {
    id: newId('group'),
    kind: 'group',
    parentId,
    name: uniqueName(draft, name),
    transform: { ...identityTransform(), position: [center.x, Math.max(0, center.y), center.z] },
    visible: true,
    locked: false,
  }
  const firstIndex = Math.min(...top.map(id => draft.nodes.findIndex(node => node.id === id)))
  draft.nodes.splice(firstIndex, 0, group)
  reparentNodes(draft, top, group.id)
  return group.id
}

/** Dissolves groups, keeping their children in place. Returns the freed children. */
export function ungroupNodes(draft: Doc, ids: readonly string[]): string[] {
  const freed: string[] = []
  for (const id of ids) {
    const group = nodeById(draft, id)
    if (!group || group.kind !== 'group') continue
    const children = childrenOf(draft, id).map(child => child.id)
    reparentNodes(draft, children, group.parentId, id)
    freed.push(...children)
    removeNodes(draft, [id])
  }
  return freed
}

/**
 * A reusable piece of scene: nodes with what is attached to them (device bindings, alarm rules, effects and
 * interactions). Top-level nodes are stored in world space relative to the component's origin.
 */
export interface SceneComponentData {
  nodes: Node[]
  bindings: TwinBinding[]
  effects: EffectInstance[]
  visualRules: VisualRule[]
  interactions: SceneInteraction[]
}

/** Copies nodes (with subtrees) and everything attached to them out of a document, around `origin`. */
export function extractComponent(
  doc: Doc,
  ids: readonly string[],
  origin: [number, number, number],
): SceneComponentData {
  const top = topmost(doc, ids)
  const included = new Set(top.flatMap(id => [...subtreeIds(doc, id)]))
  const inside = (target: TwinBindingTarget) => included.has(targetNodeId(target))
  const shift = new Matrix4().makeTranslation(-origin[0], -origin[1], -origin[2])
  const nodes = doc.nodes
    .filter(node => included.has(node.id))
    .map(node => {
      const copy = plain(node)
      delete copy.runtimeBid
      if (top.includes(node.id)) {
        copy.parentId = null
        copy.transform = transformOf(shift.clone().multiply(worldMatrixOf(doc, node.id)))
      }
      return copy
    })
  const bindings = doc.bindings.filter(binding => inside(binding.target))
  const bindingIds = new Set(bindings.map(binding => binding.id))
  return {
    nodes,
    bindings: plain(bindings),
    effects: plain(doc.effects.filter(effect => inside(effect.target))),
    visualRules: plain(doc.visualRules.filter(rule => inside(rule.target) && bindingIds.has(rule.bindingId))),
    // Interactions that only make sense in this project (its views and tours, or other objects) stay behind.
    interactions: plain(
      doc.interactions.filter(
        item =>
          inside(item.source) &&
          !('bookmarkId' in item.action) &&
          !('tourId' in item.action) &&
          (!item.action.target || inside(item.action.target)),
      ),
    ),
  }
}

/** The next free device id in a numbered series: ESS-003 → ESS-009 when ESS-008 is the highest in use. */
export function nextDeviceId(used: ReadonlySet<string>, id: string): string {
  const match = /^(.*?)(\d+)$/.exec(id)
  const prefix = match ? match[1]! : `${id}-`
  const width = match ? match[2]!.length : 1
  let highest = match ? 0 : 1
  for (const other of used) {
    if (!other.startsWith(prefix)) continue
    const number = /^\d+$/.test(other.slice(prefix.length)) ? Number(other.slice(prefix.length)) : NaN
    if (Number.isFinite(number)) highest = Math.max(highest, number)
  }
  return `${prefix}${String(highest + 1).padStart(width, '0')}`
}

/**
 * Adds a component to a document at a world point (under `parentId`), with fresh ids throughout. Devices
 * get the next free ids of their series, so each placed copy is a new device. Returns the new top ids.
 */
export function insertComponent(
  draft: Doc,
  component: SceneComponentData,
  at: [number, number, number],
  parentId: string | null = null,
): string[] {
  const nodeIds = new Map(component.nodes.map(node => [node.id, newId(node.kind === 'model' ? 'instance' : 'node')]))
  const remap = (target: TwinBindingTarget): TwinBindingTarget => {
    const copy = plain(target)
    const id = nodeIds.get(targetNodeId(copy))!
    if (copy.type === 'asset-instance' || copy.type === 'asset-node') copy.instanceId = id
    else copy.nodeId = id
    return copy
  }
  const parentInverse = worldMatrixOf(draft, parentId).invert()
  const place = new Matrix4().makeTranslation(...at)
  const roots: string[] = []
  for (const original of component.nodes) {
    const node = plain(original)
    node.id = nodeIds.get(original.id)!
    if (original.parentId && nodeIds.has(original.parentId)) node.parentId = nodeIds.get(original.parentId)!
    else {
      node.parentId = parentId
      node.name = uniqueName(draft, node.name)
      node.transform = transformOf(parentInverse.clone().multiply(place).multiply(matrixOf(original.transform)))
      roots.push(node.id)
    }
    draft.nodes.push(node)
  }
  const used = new Set(draft.bindings.map(binding => binding.device.id))
  const bindingIds = new Map<string, string>()
  for (const binding of component.bindings) {
    const id = newId('binding')
    bindingIds.set(binding.id, id)
    const deviceId = used.has(binding.device.id) ? nextDeviceId(used, binding.device.id) : binding.device.id
    used.add(deviceId)
    // Keep the name's own numbering style: 储能柜 03 → 储能柜 09 for ESS-009.
    const number = /(\d+)$/.exec(deviceId)?.[1]
    const name = number
      ? binding.device.name.replace(/\d+$/, digits => String(Number(number)).padStart(digits.length, '0'))
      : binding.device.name
    draft.bindings.push({
      ...plain(binding),
      id,
      target: remap(binding.target),
      device: { ...binding.device, id: deviceId, name },
    })
  }
  for (const effect of component.effects)
    draft.effects.push({ ...plain(effect), id: newId('effect'), target: remap(effect.target) })
  for (const rule of component.visualRules) {
    const bindingId = bindingIds.get(rule.bindingId)
    if (bindingId) draft.visualRules.push({ ...plain(rule), id: newId('rule'), bindingId, target: remap(rule.target) })
  }
  for (const item of component.interactions) {
    const copy = plain(item)
    copy.id = newId('interaction')
    copy.source = remap(item.source)
    if (item.action.target) copy.action.target = remap(item.action.target)
    draft.interactions.push(copy)
  }
  return roots
}
