import { describe, expect, it } from 'vitest'
import type { TwinBindingTarget } from '../src/domain/twin'
import {
  createDefaultSceneSettings,
  sceneSettingsFromV1,
  isSceneDocumentV2,
  loadSceneDocument,
  migrateSceneDocument,
  type SceneDocumentV1,
  SceneDocumentVersionError,
  toSceneDocumentV2,
} from '../src/domain/scene'
import { clone, fixture, patch } from './helpers'

const fixtures = ['zero-carbon-park-models', 'zero-carbon-park-primitives', 'sdk-assets'] as const

describe.each(fixtures)('v1 → v2 migration of %s', name => {
  const v1 = fixture(`v1/${name}.scene.json`) as SceneDocumentV1
  const v2 = toSceneDocumentV2(v1)

  it('produces a valid v2 document', () => {
    expect(v2.version).toBe(2)
    expect(isSceneDocumentV2(v2)).toBe(true)
  })

  it('keeps every primitive, in order, with all its properties', () => {
    const nodes = v2.nodes.slice(0, v1.primitives.length)
    v1.primitives.forEach((primitive, index) => {
      const node = nodes[index]!
      expect(node).toMatchObject({ id: primitive.nodeId, kind: 'primitive', parentId: null, name: primitive.name })
      expect(node.transform).toEqual(primitive.transform)
      expect(node.visible).toBe(primitive.visible ?? true)
      expect(node.locked).toBe(false)
      expect(node.runtimeBid).toBe(primitive.runtimeBid)
      if (node.kind !== 'primitive') throw new Error('expected a primitive node')
      expect(node.primitive).toEqual({ shape: primitive.type, ...primitive.properties })
    })
  })

  it('keeps every model instance after the primitives, with overrides and deletions', () => {
    const nodes = v2.nodes.slice(v1.primitives.length)
    expect(nodes).toHaveLength(v1.instances.length)
    v1.instances.forEach((instance, index) => {
      const node = nodes[index]!
      expect(node).toMatchObject({ id: instance.instanceId, kind: 'model', parentId: null, name: instance.name })
      expect(node.transform).toEqual(instance.transform)
      expect(node.visible).toBe(instance.visible ?? true)
      expect(node.runtimeBid).toBe(instance.runtimeBid)
      if (node.kind !== 'model') throw new Error('expected a model node')
      expect(node.model.assetId).toBe(instance.assetId)
      expect(node.model.deleted).toEqual(instance.deletedAssetNodeIds ?? [])
      expect(Object.keys(node.model.overrides).sort()).toEqual(instance.nodeOverrides.map(o => o.assetNodeId).sort())
      for (const { assetNodeId, ...override } of instance.nodeOverrides) {
        expect(node.model.overrides[assetNodeId]).toEqual(override)
      }
    })
  })

  it('carries bindings, effects, rules and interactions over unchanged and converts settings', () => {
    expect(v2.bindings).toEqual(v1.bindings ?? [])
    expect(v2.effects).toEqual(v1.effects ?? [])
    expect(v2.visualRules).toEqual(v1.visualRules ?? [])
    expect(v2.interactions).toEqual(v1.interactions ?? [])
    expect(v2.dataSources).toEqual(v1.dataSources)
    expect(v2.settings).toEqual(sceneSettingsFromV1(v1.sceneSettings ?? createDefaultSceneSettings()))
    expect([v2.bookmarks, v2.tours]).toEqual([[], []])
    expect(v2.cameraView).toEqual(v1.cameraView)
    expect(v2.projectId).toBe(v1.projectId)
    expect(v2.metadata).toEqual(v1.metadata)
  })

  it('leaves every business target pointing at an existing node', () => {
    const ids = new Set(v2.nodes.map(node => node.id))
    const targets: TwinBindingTarget[] = [
      ...v2.bindings.map(b => b.target),
      ...v2.effects.map(e => e.target),
      ...v2.visualRules.map(r => r.target),
      ...v2.interactions.map(i => i.source),
    ]
    for (const target of targets) {
      expect(ids.has(target.type === 'primitive' ? target.nodeId : target.instanceId), JSON.stringify(target)).toBe(
        true,
      )
    }
  })
})

describe('migration chain', () => {
  it('is registered for v1 → v2', () => {
    const v1 = fixture('v1/sdk-assets.scene.json') as Record<string, unknown>
    expect(migrateSceneDocument(v1, 1, 2)).toMatchObject({ version: 2, nodes: expect.any(Array) })
  })

  it('reads v2 files as they are', () => {
    const v2 = toSceneDocumentV2(fixture('v1/sdk-assets.scene.json'))
    expect(loadSceneDocument(v2)).toEqual({ document: v2, migratedFrom: null })
  })

  it('rejects files from a newer editor', () => {
    const v3 = { ...toSceneDocumentV2(fixture('v1/sdk-assets.scene.json')), version: 3 }
    expect(() => loadSceneDocument(v3)).toThrow(SceneDocumentVersionError)
  })
})

describe('v2 hierarchy rules', () => {
  const base = toSceneDocumentV2(fixture('v1/sdk-assets.scene.json'))
  const group = {
    id: 'group_1',
    kind: 'group',
    parentId: null,
    name: '储能区',
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    visible: true,
    locked: false,
  }
  const withGroup = { ...clone(base), nodes: [group, ...clone(base.nodes)] }

  it('accepts groups with children', () => {
    expect(isSceneDocumentV2(patch(withGroup, ['nodes', 1, 'parentId'], 'group_1'))).toBe(true)
  })

  it.each([
    ['duplicate node id', patch(withGroup, ['nodes', 1, 'id'], 'group_1')],
    ['missing parent', patch(withGroup, ['nodes', 1, 'parentId'], 'nowhere')],
    ['non-group parent', patch(withGroup, ['nodes', 0, 'parentId'], base.nodes[0]!.id)],
    ['self parent', patch(withGroup, ['nodes', 0, 'parentId'], 'group_1')],
    ['unknown kind', patch(withGroup, ['nodes', 0, 'kind'], 'light')],
    ['missing locked flag', patch(withGroup, ['nodes', 0, 'locked'], undefined)],
  ])('rejects %s', (_label, value) => expect(isSceneDocumentV2(value)).toBe(false))

  it('rejects cycles between groups', () => {
    const second = { ...group, id: 'group_2', parentId: 'group_1' }
    const cyclic = { ...clone(base), nodes: [{ ...group, parentId: 'group_2' }, second] }
    expect(isSceneDocumentV2(cyclic)).toBe(false)
  })
})
