import {
  type BoxGeometry,
  Group,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Scene,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import { DocumentStore } from '../src/document/DocumentStore'
import { type SceneDocumentV2, type SceneNodeV2, type SceneTransformV1, toSceneDocumentV2 } from '../src/domain/scene'
import type { AssetRecord, AssetRepository } from '../src/infrastructure/assets/AssetRepository'
import { type SceneHost, SceneSync } from '../src/runtime/scene/SceneSync'
import { fixture } from './helpers'

/** Mimics an engine that indexes a tree (ids, picking BVH) only when it is added or removed. */
class FakeHost implements SceneHost {
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera()
  readonly registry = new Map<string, Object3D>()
  readonly topLevel = new Set<Object3D>()
  /** Files parsed, per URL; later loads of a parsed URL clone from the cache like the engine's. */
  readonly parses = new Map<string, number>()
  private readonly cache = new Set<string>()
  private nextBid = 0
  readonly environmentStatus = 'physical'
  setHelpers = vi.fn()
  applySettings = vi.fn(async () => {})
  flyTo = vi.fn(async () => true)

  addObject<T extends Object3D>(object: T): boolean {
    object.traverse(node => {
      node.userData.bid ??= `bid_${this.nextBid++}`
      const existing = this.registry.get(node.userData.bid as string)
      if (existing && existing !== node) throw new Error(`Duplicate scene bid: ${node.userData.bid}`)
      this.registry.set(node.userData.bid as string, node)
    })
    this.scene.add(object)
    this.topLevel.add(object)
    return true
  }
  removeObject(object: Object3D): void {
    object.traverse(node => this.registry.delete(node.userData.bid as string))
    object.removeFromParent()
    this.topLevel.delete(object)
  }
  /** A model whose nodes a, b and b/c carry assetNodeIds, like an imported GLB. */
  async loadGLTFModel(url: string): Promise<Object3D> {
    if (!this.cache.has(url)) {
      this.parses.set(url, (this.parses.get(url) ?? 0) + 1)
      await new Promise(resolve => setTimeout(resolve, 1))
      this.cache.add(url)
    }
    const node = (id: string) => Object.assign(new Group(), { name: id, userData: { assetNodeId: id } })
    const [a, b, c] = [node('a'), node('b'), node('c')]
    b.add(c)
    const model = new Group()
    model.add(a, b)
    return model
  }
  getScene(): Scene {
    return this.scene
  }
  getCamera(): PerspectiveCamera {
    return this.camera
  }

  /** Every object in a registered tree is registered, and nothing else is. */
  expectRegistryMatchesScene(): void {
    const inScene = new Set<Object3D>()
    for (const root of this.topLevel) {
      expect(root.parent).toBe(this.scene)
      root.traverse(node => inScene.add(node))
    }
    expect(this.registry.size).toBe(inScene.size)
    for (const object of this.registry.values()) expect(inScene.has(object)).toBe(true)
  }
}

class FakeAssets implements AssetRepository {
  readonly gets: string[] = []
  async get(id: string): Promise<AssetRecord | null> {
    this.gets.push(id)
    if (id.startsWith('missing')) return null
    const assetType = id.startsWith('env') ? 'environment' : 'model'
    const blob = new Blob([id])
    return { id, name: id, fingerprint: id, mimeType: '', size: 1, lastModified: 0, createdAt: '', blob, assetType }
  }
  saveFile(): never {
    throw new Error('not used')
  }
  async listMetadata() {
    return []
  }
}

const transform = (x = 0): SceneTransformV1 => ({ position: [x, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })
const base = { parentId: null, visible: true, locked: false } as const

function scene(): SceneDocumentV2 {
  const nodes: SceneNodeV2[] = [
    {
      ...base,
      id: 'm1',
      kind: 'model',
      name: '储能柜',
      transform: transform(1),
      runtimeBid: 'bid_saved_m1',
      model: {
        assetId: 'asset-1',
        overrides: { a: { name: 'A2', transform: transform(5), visible: false, runtimeBid: 'bid_saved_a' } },
        deleted: ['c'],
      },
    },
    {
      ...base,
      id: 'p1',
      kind: 'primitive',
      name: '地块',
      transform: transform(2),
      primitive: { shape: 'box', color: '#336699', width: 2, height: 1, depth: 1 },
    },
    { ...base, id: 'g1', kind: 'group', name: '储能区', transform: transform(3) },
    {
      ...base,
      id: 'p2',
      kind: 'primitive',
      parentId: 'g1',
      name: '围栏',
      transform: transform(),
      primitive: { shape: 'cylinder', color: '#999999' },
    },
  ]
  const document = toSceneDocumentV2(fixture('v1/sdk-assets.scene.json'))
  return {
    ...document,
    settings: { ...document.settings, sky: { ...document.settings.sky, mode: 'hdr' as const, hdrAssetId: 'env-1' } },
    nodes,
    cameraView: { position: [10, 10, 10], target: [0, 0, 0] },
  }
}

async function setup(document = scene()) {
  const host = new FakeHost()
  const assets = new FakeAssets()
  const sync = new SceneSync(host, assets)
  const store = new DocumentStore(document)
  const result = await sync.mount(store.document)
  const edit = async (recipe: (draft: SceneDocumentV2) => void) => {
    store.transaction('edit', recipe)
    return sync.update(store.document)
  }
  const undo = () => {
    store.undo()
    return sync.update(store.document)
  }
  const node = (draft: SceneDocumentV2, id: string) => draft.nodes.find(item => item.id === id)!
  return { host, assets, sync, store, result, edit, undo, node }
}

describe('mount', () => {
  it('builds every node with its properties, hierarchy and metadata', async () => {
    const { host, sync, result } = await setup()
    expect(result.warnings).toEqual([])
    expect(sync.roots.map(object => object.name)).toEqual(['储能柜', '地块', '储能区'])
    const model = sync.objectFor('m1')!
    expect(model.position.x).toBe(1)
    expect(model.userData.bid).toBe('bid_saved_m1')
    expect(model.userData.editor).toMatchObject({ kind: 'assetInstance', assetId: 'asset-1', instanceId: 'm1' })
    const p1 = sync.objectFor('p1') as Mesh
    expect(p1.userData.editor).toEqual({ kind: 'primitive', nodeId: 'p1', primitiveType: 'box' })
    expect((p1.geometry as BoxGeometry).parameters.width).toBe(2)
    expect((p1.material as MeshStandardMaterial).color.getHexString()).toBe('336699')
    expect(sync.objectFor('p2')!.parent).toBe(sync.objectFor('g1'))
    host.expectRegistryMatchesScene()
  })

  it('applies model overrides and deletions', async () => {
    const { sync } = await setup()
    const model = sync.objectFor('m1')!
    const a = model.getObjectByName('A2')!
    expect([a.visible, a.position.x, a.userData.bid]).toEqual([false, 5, 'bid_saved_a'])
    expect(model.getObjectByName('c')).toBeUndefined()
    expect(sync.nodeIdOf(a)).toBe('m1')
    expect(sync.nodeIdOf(sync.objectFor('p2')!)).toBe('p2')
  })

  it('applies settings and the saved camera view', async () => {
    const { host } = await setup()
    expect(host.applySettings).toHaveBeenCalledTimes(1)
    expect(host.applySettings.mock.calls[0]).toEqual([
      expect.objectContaining({ sky: expect.objectContaining({ mode: 'hdr' }) }),
      { hdrUrl: expect.stringMatching(/^blob:/) },
    ])
    expect(host.setHelpers).toHaveBeenCalledWith({ grid: false, axes: false })
    expect(host.flyTo).toHaveBeenCalledWith({ position: [10, 10, 10], target: [0, 0, 0] }, 0)
  })

  it('reports missing assets and model nodes as warnings', async () => {
    const document = scene()
    const model = document.nodes[0]!
    if (model.kind !== 'model') throw new Error('expected a model')
    model.model.overrides.nowhere = { name: 'x' }
    document.nodes.push({ ...model, id: 'm2', runtimeBid: undefined, model: { ...model.model, assetId: 'missing-1' } })
    const { result, sync } = await setup(document)
    expect(result.warnings).toEqual(['m2: 缺少资产 missing-1', '缺少模型节点 m1/nowhere'])
    expect(sync.objectFor('m2')).toBeNull()
  })

  it('builds a real project with dozens of model instances', async () => {
    const { host, sync, store } = await setup(toSceneDocumentV2(fixture('v1/zero-carbon-park-models.scene.json')))
    expect(sync.roots).toHaveLength(store.document.nodes.length)
    expect(host.parses.size).toBeGreaterThan(0)
    host.expectRegistryMatchesScene()
  })

  it('can only be mounted once', async () => {
    const { sync } = await setup()
    await expect(sync.mount(scene())).rejects.toThrow('already mounted')
  })
})

describe('update', () => {
  it('touches only the nodes whose value changed', async () => {
    const { sync, edit, node, host } = await setup()
    const model = sync.objectFor('m1')!
    const p1 = sync.objectFor('p1')!
    model.getObjectByName('A2')!.name = 'changed outside the document'
    await edit(doc => void (node(doc, 'p1').name = '新地块'))
    expect(sync.objectFor('p1')).toBe(p1)
    expect(p1.name).toBe('新地块')
    expect(model.getObjectByName('changed outside the document')).toBeDefined()
    expect(host.applySettings).toHaveBeenCalledTimes(1)
  })

  it('moves, hides and undoes', async () => {
    const { sync, edit, undo, node } = await setup()
    await edit(doc => {
      node(doc, 'm1').transform.position[0] = 42
      node(doc, 'm1').visible = false
    })
    expect([sync.objectFor('m1')!.position.x, sync.objectFor('m1')!.visible]).toEqual([42, false])
    await undo()
    expect([sync.objectFor('m1')!.position.x, sync.objectFor('m1')!.visible]).toEqual([1, true])
  })

  it('removes nodes and brings them back on undo', async () => {
    const { sync, edit, undo, host } = await setup()
    const p1 = sync.objectFor('p1') as Mesh
    const dispose = vi.spyOn(p1.geometry, 'dispose')
    await edit(
      doc => void (doc.nodes = doc.nodes.filter(item => item.id !== 'p1' && item.id !== 'g1' && item.id !== 'p2')),
    )
    expect(sync.roots.map(object => object.name)).toEqual(['储能柜'])
    expect(p1.parent).toBeNull()
    expect(dispose).toHaveBeenCalled()
    host.expectRegistryMatchesScene()
    await undo()
    expect(sync.roots.map(object => object.name)).toEqual(['储能柜', '地块', '储能区'])
    expect(sync.objectFor('p2')!.parent).toBe(sync.objectFor('g1'))
    host.expectRegistryMatchesScene()
  })

  it('reparents into and out of groups, keeping the engine registry in step', async () => {
    const { sync, edit, undo, node, host } = await setup()
    const p1 = sync.objectFor('p1')!
    await edit(doc => void (node(doc, 'p1').parentId = 'g1'))
    expect(p1.parent).toBe(sync.objectFor('g1'))
    expect(sync.roots.map(object => object.name)).toEqual(['储能柜', '储能区'])
    host.expectRegistryMatchesScene()
    await edit(doc => void (node(doc, 'p2').parentId = null))
    expect(sync.objectFor('p2')!.parent).toBe(host.scene)
    host.expectRegistryMatchesScene()
    await undo()
    await undo()
    expect(sync.objectFor('p1')).toBe(p1)
    expect(p1.parent).toBe(host.scene)
    expect(sync.objectFor('p2')!.parent).toBe(sync.objectFor('g1'))
    host.expectRegistryMatchesScene()
  })

  it('handles new groups listed after their children', async () => {
    const { sync, edit, host } = await setup()
    await edit(doc => {
      doc.nodes.find(item => item.id === 'p1')!.parentId = 'g2'
      doc.nodes.push({ ...base, id: 'g2', kind: 'group', name: '新组', transform: transform(), parentId: 'g1' })
    })
    expect(sync.objectFor('p1')!.parent).toBe(sync.objectFor('g2'))
    expect(sync.objectFor('g2')!.parent).toBe(sync.objectFor('g1'))
    host.expectRegistryMatchesScene()
  })

  it('re-applies model overrides and restores deleted parts on undo', async () => {
    const { sync, edit, undo, node, host } = await setup()
    const model = sync.objectFor('m1')!
    await edit(doc => {
      const target = node(doc, 'm1')
      if (target.kind !== 'model') throw new Error('expected a model')
      target.model.deleted = ['a']
      delete target.model.overrides.a
    })
    expect(model.getObjectByName('A2')).toBeUndefined()
    expect(model.getObjectByName('c')).toBeDefined()
    host.expectRegistryMatchesScene()
    await undo()
    expect(model.getObjectByName('A2')!.position.x).toBe(5)
    expect(model.getObjectByName('c')).toBeUndefined()
    expect(sync.objectFor('m1')).toBe(model)
    host.expectRegistryMatchesScene()
  })

  it('changes primitive geometry in place', async () => {
    const { sync, edit, node, host } = await setup()
    const p1 = sync.objectFor('p1') as Mesh<BoxGeometry>
    const old = p1.geometry
    const dispose = vi.spyOn(old, 'dispose')
    await edit(doc => {
      const target = node(doc, 'p1')
      if (target.kind !== 'primitive') throw new Error('expected a primitive')
      target.primitive.width = 8
      target.primitive.color = '#ff0000'
    })
    expect(sync.objectFor('p1')).toBe(p1)
    expect(p1.geometry).not.toBe(old)
    expect(p1.geometry.parameters.width).toBe(8)
    expect(dispose).toHaveBeenCalled()
    expect((p1.material as MeshStandardMaterial).color.getHexString()).toBe('ff0000')
    host.expectRegistryMatchesScene()
  })

  it('rebuilds a model whose asset changed', async () => {
    const { sync, edit, node, host } = await setup()
    const before = sync.objectFor('m1')!
    await edit(doc => {
      const target = node(doc, 'm1')
      if (target.kind === 'model') target.model.assetId = 'asset-2'
    })
    const after = sync.objectFor('m1')!
    expect(after).not.toBe(before)
    expect(before.parent).toBeNull()
    expect(after.userData.editor).toMatchObject({ assetId: 'asset-2' })
    expect(after.userData.bid).toBe('bid_saved_m1')
    host.expectRegistryMatchesScene()
  })

  it('retries a failed model only when its asset changes', async () => {
    const document = scene()
    const model = document.nodes[0]!
    if (model.kind !== 'model') throw new Error('expected a model')
    model.model.assetId = 'missing-1'
    const { sync, edit, node, assets } = await setup(document)
    const attempts = () => assets.gets.filter(id => id.startsWith('missing') || id === 'asset-3').length
    expect(attempts()).toBe(1)
    await edit(doc => void (node(doc, 'p1').name = 'x'))
    expect(attempts()).toBe(1)
    const result = await edit(doc => {
      const target = node(doc, 'm1')
      if (target.kind === 'model') target.model.assetId = 'asset-3'
    })
    expect(result.warnings).toEqual([])
    expect(sync.objectFor('m1')).not.toBeNull()
  })

  it('re-applies settings only when they change and never moves the camera', async () => {
    const { host, edit } = await setup()
    await edit(doc => void (doc.settings.helpers.grid = !doc.settings.helpers.grid))
    await edit(doc => void (doc.cameraView = { position: [1, 2, 3], target: [0, 0, 0] }))
    expect(host.applySettings).toHaveBeenCalledTimes(2)
    expect(host.flyTo).toHaveBeenCalledTimes(1)
  })

  it('applies updates in order without awaiting', async () => {
    const { sync, store, node } = await setup()
    store.transaction('a', doc => void (node(doc, 'p1').name = 'first'))
    void sync.update(store.document)
    store.transaction('b', doc => void (node(doc, 'p1').name = 'second'))
    await sync.update(store.document)
    expect(sync.objectFor('p1')!.name).toBe('second')
  })
})

describe('dispose', () => {
  it('cancels a mount in progress', async () => {
    const host = new FakeHost()
    const sync = new SceneSync(host, new FakeAssets())
    const mounting = sync.mount(scene())
    sync.dispose()
    await expect(mounting).rejects.toThrow('cancelled')
    expect(host.topLevel.size).toBe(0)
  })
})
