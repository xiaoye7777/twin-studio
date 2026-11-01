import { Box3, Matrix4, Vector3 } from 'three'
import {
  extractComponent,
  identityTransform,
  insertComponent,
  newId,
  nodeById,
  primitiveDefaults,
  type PrimitiveShape,
  type SceneComponentData,
  type SceneDocumentV2,
  type SceneNodeV2,
  topmost,
  transformOf,
  uniqueName,
  worldMatrixOf,
} from '@twin-studio/core'
import { type DrawResult } from '../DrawTool'
import type { EditorSession } from '../EditorSession'

const primitiveNames: Record<PrimitiveShape, string> = {
  box: '立方体',
  plane: '平面',
  cylinder: '圆柱',
  sphere: '球体',
  cone: '圆锥',
}

/**
 * 往场景里添加东西：模型、基本体、分组、组件（可复用的一组对象），以及绘制工具画出的路径 / 区域 / 标签 / 灯光。
 * 新对象放在拖放的位置（没有就放在相机看着的地方），并且加进当前选中的分组。
 */
export class NodeCreation {
  constructor(private readonly session: EditorSession) {}

  /** Where new things go: the dropped point, else the point the camera looks at. */
  private placement(at?: Vector3 | null): Vector3 {
    if (at) return at.clone()
    const target = this.session.engine.rig.controls.getTarget(new Vector3())
    return new Vector3(target.x, 0, target.z)
  }

  private insert(label: string, nodes: SceneNodeV2[]): void {
    if (!nodes.length) return
    const parentId = this.insertionParent()
    this.session.edit(label, draft => {
      for (const node of nodes) {
        if (node.parentId === null && parentId) {
          // Drop into the selected group, keeping the world position.
          const local = worldMatrixOf(draft, parentId).invert().multiply(worldMatrixOfTransform(node))
          node.transform = transformOf(local)
          node.parentId = parentId
        }
        draft.nodes.push(node)
      }
    })
    this.session.select(nodes.map(node => node.id))
  }

  /** New nodes join the selected group (or the group of the selected node). */
  private insertionParent(): string | null {
    if (this.session.selection.value.length !== 1) return null
    const node = this.session.node(this.session.selection.value[0]!)
    if (!node) return null
    return node.kind === 'group' ? node.id : node.parentId
  }

  /** The selection as a reusable component (with bindings, rules, effects), plus a picture of it. */
  async componentFromSelection(): Promise<{ name: string; data: SceneComponentData; thumbnail?: string } | null> {
    const doc = this.session.doc.value
    const ids = topmost(doc, this.session.selection.value)
    if (!ids.length) return null
    const bounds = new Box3()
    for (const id of ids) {
      const object = this.session.sync.objectFor(id)
      if (object) bounds.expandByObject(object, true)
    }
    if (bounds.isEmpty())
      bounds.setFromCenterAndSize(new Vector3(...worldPositionOf(doc, ids[0]!)), new Vector3(1, 1, 1))
    const center = bounds.getCenter(new Vector3())
    const data = extractComponent(doc, ids, [center.x, bounds.min.y, center.z])
    const size = bounds.getSize(new Vector3()).length() || 1
    const eye = center.clone().add(new Vector3(1, 0.75, 1).normalize().multiplyScalar(size * 1.3))
    const thumbnail =
      (await this.session.captureFrom(
        { position: [eye.x, eye.y, eye.z], target: [center.x, center.y, center.z] },
        240,
      )) ?? undefined
    const first = nodeById(doc, ids[0]!)?.name ?? '组件'
    return { name: ids.length === 1 ? first : `${first} 等 ${ids.length} 个`, data, thumbnail }
  }

  /** Places a component at a point (or where the camera looks), with new device ids. */
  addComponent(data: SceneComponentData, at?: Vector3 | null): string[] {
    const point = this.placement(at)
    const parentId = this.insertionParent()
    let roots: string[] = []
    this.session.edit('添加组件', draft => {
      roots = insertComponent(draft, data, [point.x, point.y, point.z], parentId)
    })
    this.session.select(roots)
    return roots
  }

  async addModel(assetId: string, at?: Vector3 | null): Promise<string | null> {
    const asset = await this.session.assets.get(assetId)
    if (!asset) throw new Error('资产不存在')
    const url = this.session.sync.resources.getOrCreate(asset).objectUrl
    // Measure the model once (the loader caches it) so it lands on the ground, not half inside it.
    const probe = await this.session.engine.loadGLTFModel(url)
    const bounds = new Box3().setFromObject(probe)
    const position = this.placement(at)
    const lift = bounds.isEmpty() ? 0 : -bounds.min.y
    const node: SceneNodeV2 = {
      id: newId('instance'),
      kind: 'model',
      parentId: null,
      name: uniqueName(this.session.doc.value, asset.name.replace(/\.glb$/i, '') || '模型'),
      transform: { ...identityTransform(), position: [position.x, position.y + lift, position.z] },
      visible: true,
      locked: false,
      model: { assetId, overrides: {}, deleted: [] },
    }
    this.insert('添加模型', [node])
    return node.id
  }

  addPrimitive(shape: PrimitiveShape, at?: Vector3 | null): string {
    const position = this.placement(at)
    const node: SceneNodeV2 = {
      id: newId('node'),
      kind: 'primitive',
      parentId: null,
      name: uniqueName(this.session.doc.value, primitiveNames[shape]),
      transform: { ...identityTransform(), position: [position.x, position.y, position.z] },
      visible: true,
      locked: false,
      primitive: { ...primitiveDefaults[shape] },
    }
    this.insert(`添加${primitiveNames[shape]}`, [node])
    return node.id
  }

  addGroup(): string | null {
    const ids = this.session.selection.value
    if (ids.length) return this.session.nodes.groupSelection()
    const position = this.placement()
    const node: SceneNodeV2 = {
      id: newId('group'),
      kind: 'group',
      parentId: null,
      name: uniqueName(this.session.doc.value, '分组'),
      transform: { ...identityTransform(), position: [position.x, 0, position.z] },
      visible: true,
      locked: false,
    }
    this.insert('新建分组', [node])
    return node.id
  }

  finishDrawing({ kind, points }: DrawResult): void {
    const base = { parentId: null, visible: true, locked: false }
    if (kind === 'label' || kind === 'light') {
      const at = points[0]!
      const node: SceneNodeV2 =
        kind === 'label'
          ? {
              ...base,
              id: newId('node'),
              kind: 'label',
              name: uniqueName(this.session.doc.value, '标签'),
              transform: { ...identityTransform(), position: [at.x, at.y + 4, at.z] },
              label: { text: '新标签', style: 'tag', color: '#f0a050', background: '#14171b', size: 1, leader: true },
            }
          : {
              ...base,
              id: newId('node'),
              kind: 'light',
              name: uniqueName(this.session.doc.value, '灯光'),
              transform: { ...identityTransform(), position: [at.x, at.y + 6, at.z] },
              light: { type: 'point', color: '#ffd9a8', intensity: 300, distance: 40, angle: 35, castShadow: false },
            }
      this.insert(kind === 'label' ? '添加标签' : '添加灯光', [node])
      return
    }
    const origin =
      kind === 'area'
        ? points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length)
        : points[0]!.clone()
    origin.y = kind === 'area' ? 0 : origin.y
    const local = points.map(
      p =>
        [round(p.x - origin.x), round(kind === 'area' ? 0 : p.y - origin.y), round(p.z - origin.z)] as [
          number,
          number,
          number,
        ],
    )
    const node: SceneNodeV2 =
      kind === 'path'
        ? {
            ...base,
            id: newId('node'),
            kind: 'path',
            name: uniqueName(this.session.doc.value, '能流线'),
            transform: { ...identityTransform(), position: [origin.x, origin.y, origin.z] },
            path: {
              points: local,
              closed: false,
              style: 'flow',
              color: '#38d6ff',
              width: 0.6,
              speed: 1.5,
              opacity: 0.95,
            },
          }
        : {
            ...base,
            id: newId('node'),
            kind: 'area',
            name: uniqueName(this.session.doc.value, '区域'),
            transform: { ...identityTransform(), position: [origin.x, 0, origin.z] },
            area: { points: local, color: '#35c6b4', opacity: 0.55, wallHeight: 3, label: '' },
          }
    this.insert(kind === 'path' ? '绘制能流线' : '绘制区域', [node])
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function worldPositionOf(doc: SceneDocumentV2, id: string): [number, number, number] {
  const position = new Vector3().setFromMatrixPosition(worldMatrixOf(doc, id))
  return [position.x, position.y, position.z]
}

function worldMatrixOfTransform(node: SceneNodeV2): Matrix4 {
  return worldMatrixOf({ nodes: [{ ...node, parentId: null }] } as unknown as SceneDocumentV2, node.id)
}
