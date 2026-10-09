import { produce } from 'immer'
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  ancestorIds,
  createEmptyDocument,
  duplicateNodes,
  extractComponent,
  groupNodes,
  insertComponent,
  nextDeviceId,
  removeModelParts,
  removeNodes,
  reparentNodes,
  subtreeIds,
  topmost,
  ungroupNodes,
  uniqueName,
  worldMatrixOf,
} from '../src/document/sceneOps'
import { createEffect } from '../src/domain/effects'
import { isSceneDocumentV2, type SceneDocumentV2, type SceneNodeV2 } from '../src/domain/scene'

const t = (x: number, y = 0, z = 0, ry = 0) => ({
  position: [x, y, z] as [number, number, number],
  rotation: [0, ry, 0] as [number, number, number],
  scale: [1, 1, 1] as [number, number, number],
})
const base = { visible: true, locked: false }

/** park/group A (at x=10, turned 90°) holding box a1; top-level boxes b and c. */
function fixture(): SceneDocumentV2 {
  const doc = createEmptyDocument('p1', '测试')
  const box = (id: string, parentId: string | null, transform: ReturnType<typeof t>): SceneNodeV2 => ({
    ...base,
    id,
    kind: 'primitive',
    parentId,
    name: id,
    transform,
    primitive: { shape: 'box', color: '#888888', width: 1, height: 1, depth: 1 },
  })
  doc.nodes = [
    { ...base, id: 'A', kind: 'group', parentId: null, name: '分组 A', transform: t(10, 0, 0, Math.PI / 2) },
    box('a1', 'A', t(2)),
    box('b', null, t(-5)),
    box('c', null, t(5, 0, 5)),
  ]
  doc.bindings = [
    {
      id: 'bind-a1',
      target: { type: 'primitive', nodeId: 'a1' },
      device: { id: 'DEV-1', name: '设备 1' },
      variables: [{ id: 'v', key: 'temperature', name: '温度', dataType: 'number' }],
    },
  ]
  doc.effects = [{ ...createEffect('box-glow', { type: 'primitive', nodeId: 'a1' }), id: 'fx-a1' }]
  doc.visualRules = [
    {
      id: 'rule-a1',
      bindingId: 'bind-a1',
      target: { type: 'primitive', nodeId: 'a1' },
      variableKey: 'temperature',
      condition: { dataType: 'number', operator: '>', value: 60 },
      enabled: true,
      priority: 10,
      template: null,
    },
  ]
  doc.interactions = [
    {
      id: 'ix-b',
      enabled: true,
      source: { type: 'primitive', nodeId: 'b' },
      trigger: 'click',
      action: { type: 'show', target: { type: 'primitive', nodeId: 'a1' } },
    },
  ]
  doc.bookmarks = [{ id: 'v1', name: '视角', view: { position: [1, 2, 3], target: [0, 0, 0] } }]
  doc.tours = [
    {
      id: 'tour',
      name: '导览',
      loop: false,
      steps: [
        {
          id: 's1',
          bookmarkId: 'v1',
          nodeId: 'a1',
          duration: 1,
          hold: 1,
          caption: '',
          show: ['a1', 'b'],
          hide: ['A'],
          highlightNodeId: 'a1',
        },
      ],
    },
  ]
  return doc
}

const worldPosition = (doc: SceneDocumentV2, id: string) =>
  new Vector3()
    .setFromMatrixPosition(worldMatrixOf(doc, id))
    .toArray()
    .map(v => Math.round(v * 1000) / 1000)

describe('hierarchy queries', () => {
  it('walks subtrees and ancestors', () => {
    const doc = fixture()
    expect([...subtreeIds(doc, 'A')]).toEqual(['A', 'a1'])
    expect(ancestorIds(doc, 'a1')).toEqual(['A'])
    expect(topmost(doc, ['a1', 'A', 'b'])).toEqual(['A', 'b'])
  })

  it('composes world matrices through groups', () => {
    // a1 sits 2 m along the group's local X, which the 90° turn points along world -Z.
    expect(worldPosition(fixture(), 'a1')).toEqual([10, 0, -2])
  })

  it('numbers duplicate names', () => {
    const doc = fixture()
    expect(uniqueName(doc, 'new')).toBe('new')
    expect(uniqueName(doc, 'b')).toBe('b 2')
  })
})

describe('reparenting', () => {
  it('keeps world positions when moving into and out of a turned group', () => {
    const before = fixture()
    const into = produce(before, draft => reparentNodes(draft, ['c'], 'A'))
    expect(into.nodes.find(n => n.id === 'c')!.parentId).toBe('A')
    expect(worldPosition(into, 'c')).toEqual(worldPosition(before, 'c'))
    const out = produce(into, draft => reparentNodes(draft, ['a1'], null))
    expect(worldPosition(out, 'a1')).toEqual(worldPosition(before, 'a1'))
    expect(isSceneDocumentV2(out)).toBe(true)
  })

  it('never moves a group into its own subtree', () => {
    const doc = produce(fixture(), draft => reparentNodes(draft, ['A'], 'A'))
    expect(doc.nodes.find(n => n.id === 'A')!.parentId).toBeNull()
  })

  it('orders siblings before a given node', () => {
    const doc = produce(fixture(), draft => reparentNodes(draft, ['c'], null, 'b'))
    const order = doc.nodes.filter(n => n.parentId === null).map(n => n.id)
    expect(order.indexOf('c')).toBe(order.indexOf('b') - 1)
  })
})

describe('grouping', () => {
  it('groups at the centre and ungroups back to the same places', () => {
    const before = fixture()
    let group = ''
    const grouped = produce(before, draft => {
      group = groupNodes(draft, ['b', 'c'], '新组')!
    })
    const node = grouped.nodes.find(n => n.id === group)!
    expect(node.transform.position).toEqual([0, 0, 2.5])
    expect(
      grouped.nodes
        .filter(n => n.parentId === group)
        .map(n => n.id)
        .sort(),
    ).toEqual(['b', 'c'])
    for (const id of ['b', 'c']) expect(worldPosition(grouped, id)).toEqual(worldPosition(before, id))
    expect(isSceneDocumentV2(grouped)).toBe(true)

    const ungrouped = produce(grouped, draft => void ungroupNodes(draft, [group]))
    expect(ungrouped.nodes.some(n => n.id === group)).toBe(false)
    for (const id of ['b', 'c']) expect(worldPosition(ungrouped, id)).toEqual(worldPosition(before, id))
  })
})

describe('removing', () => {
  it('removes the subtree and everything that pointed at it', () => {
    const doc = produce(fixture(), draft => void removeNodes(draft, ['A']))
    expect(doc.nodes.map(n => n.id)).toEqual(['b', 'c'])
    expect(doc.bindings).toEqual([])
    expect(doc.effects).toEqual([])
    expect(doc.visualRules).toEqual([])
    // The interaction's source survives but its action targeted a removed node.
    expect(doc.interactions).toEqual([])
    const step = doc.tours[0]!.steps[0]!
    expect([step.nodeId, step.highlightNodeId, step.show, step.hide]).toEqual([null, null, ['b'], []])
    expect(isSceneDocumentV2(doc)).toBe(true)
  })
})

describe('removing model parts', () => {
  it('deletes parts with the bindings, effects, rules and motions aimed at them', () => {
    const doc = fixture()
    doc.nodes.push({
      ...base,
      id: 'm',
      kind: 'model',
      parentId: null,
      name: '风机',
      transform: t(0),
      model: {
        assetId: 'turbine',
        overrides: {},
        deleted: [],
        motions: [{ id: 'spin', assetNodeId: 'blade', axis: 'x', speed: 60, speedVariable: null, factor: 1 }],
      },
    })
    const blade = { type: 'asset-node' as const, instanceId: 'm', assetNodeId: 'blade' }
    const hub = { type: 'asset-node' as const, instanceId: 'm', assetNodeId: 'hub' }
    doc.bindings.push(
      { id: 'bind-blade', target: blade, device: { id: 'B', name: '叶片' }, variables: [] },
      { id: 'bind-hub', target: hub, device: { id: 'H', name: '轮毂' }, variables: [] },
    )
    doc.effects.push({ ...createEffect('box-glow', blade), id: 'fx-blade' })
    const after = produce(doc, draft => removeModelParts(draft, 'm', ['hub'], ['hub', 'blade']))
    const model = after.nodes.find(node => node.id === 'm')!
    expect(model.kind === 'model' && [model.model.deleted, model.model.motions]).toEqual([['hub'], undefined])
    expect(after.bindings.map(binding => binding.id)).toEqual(['bind-a1'])
    expect(after.effects.map(effect => effect.id)).toEqual(['fx-a1'])
    expect(isSceneDocumentV2(after)).toBe(true)
  })
})

describe('duplicating', () => {
  it('copies subtrees with new ids, offset, effects but not device bindings', () => {
    let created: string[] = []
    const doc = produce(fixture(), draft => {
      created = duplicateNodes(draft, ['A', 'a1'], [0, 0, 3])
    })
    expect(created).toHaveLength(1)
    const copy = doc.nodes.find(n => n.id === created[0])!
    expect(copy.name).toBe('分组 A 2')
    expect(copy.transform.position).toEqual([10, 0, 3])
    const child = doc.nodes.find(n => n.parentId === copy.id)!
    expect(child.id).not.toBe('a1')
    expect(
      doc.effects.filter(effect => effect.target.type === 'primitive' && effect.target.nodeId === child.id),
    ).toHaveLength(1)
    expect(doc.bindings).toHaveLength(1)
    expect(isSceneDocumentV2(doc)).toBe(true)
  })
})

describe('components', () => {
  it('numbers devices on from the highest in use', () => {
    expect(nextDeviceId(new Set(['ESS-001', 'ESS-008', 'PV-020']), 'ESS-003')).toBe('ESS-009')
    expect(nextDeviceId(new Set(['METER']), 'METER')).toBe('METER-2')
  })

  it('extracts a group with its binding, rule and effect, and places fresh copies', () => {
    const source = fixture()
    // Group A holds a1, which carries the binding, rule and effect; b's interaction targets a1 (outside).
    const component = extractComponent(source, ['A'], [10, 0, 0])
    expect(component.nodes.map(node => node.id)).toEqual(['A', 'a1'])
    expect(component.nodes[0]!.transform.position).toEqual([0, 0, 0])
    expect([component.bindings.length, component.visualRules.length, component.effects.length]).toEqual([1, 1, 1])
    expect(component.interactions).toEqual([])

    let roots: string[] = []
    const doc = produce(source, draft => {
      roots = insertComponent(draft, component, [0, 0, 20])
      insertComponent(draft, component, [5, 0, 20])
    })
    expect(roots).toHaveLength(1)
    const copy = doc.nodes.find(node => node.id === roots[0])!
    expect(copy.name).toBe('分组 A 2')
    const child = doc.nodes.find(node => node.parentId === copy.id)!
    // a1 sits at world (10, 0, -2); relative to the origin (10, 0, 0) and placed at (0, 0, 20).
    expect(worldPosition(doc, child.id)).toEqual([0, 0, 18])
    expect(doc.bindings.map(binding => binding.device.id)).toEqual(['DEV-1', 'DEV-2', 'DEV-3'])
    expect(doc.bindings.map(binding => binding.device.name)).toEqual(['设备 1', '设备 2', '设备 3'])
    const binding = doc.bindings[1]!
    expect(binding.target).toEqual({ type: 'primitive', nodeId: child.id })
    const rule = doc.visualRules[1]!
    expect([rule.bindingId, rule.target]).toEqual([binding.id, binding.target])
    expect(doc.effects[1]!.target).toEqual({ type: 'primitive', nodeId: child.id })
    expect(isSceneDocumentV2(doc)).toBe(true)
  })
})
