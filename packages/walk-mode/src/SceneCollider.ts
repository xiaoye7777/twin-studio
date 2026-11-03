import { type Intersection, Matrix3, Mesh, type Object3D, Raycaster, Sphere, Vector3 } from 'three'
import type { CastRay, Vec3 } from './CharacterController'

const REFRESH_SECONDS = 0.5
const NEAR_RADIUS = 9

interface Entry {
  mesh: Mesh
  sphere: Sphere
}

/** 什么不算障碍：特效、编辑器辅助、标注、导线和能流线。 */
function isSolid(mesh: Mesh): boolean {
  for (let node: Object3D | null = mesh; node; node = node.parent) {
    if (!node.visible) return false
    const data = node.userData as Record<string, unknown>
    if (data.editorInternal || data.runtimeEffect) return false
    if (typeof data.nodeKind === 'string' && ['path', 'label', 'area', 'light'].includes(data.nodeKind)) return false
  }
  return true
}

/**
 * 射线碰撞。场景有几百个网格，每帧几十条射线不能全测一遍：
 * 先定期算好每个网格的世界包围球，只测角色附近的（网格自己的 BVH 负责后面的加速）。
 */
export class SceneCollider {
  private entries: Entry[] = []
  private near: Mesh[] = []
  private age = Infinity
  private readonly raycaster = new Raycaster()
  private readonly origin = new Vector3()
  private readonly direction = new Vector3()
  private readonly center = new Vector3()
  private readonly normalMatrix = new Matrix3()

  constructor(private readonly content: () => Object3D) {
    ;(this.raycaster as unknown as { firstHitOnly: boolean }).firstHitOnly = true
  }

  /** 每帧调用一次：刷新附近的网格。 */
  update(dt: number, focus: Vec3): void {
    this.age += dt
    if (this.age >= REFRESH_SECONDS) {
      this.age = 0
      this.rebuild()
    }
    this.center.set(focus.x, focus.y, focus.z)
    this.near = []
    for (const { mesh, sphere } of this.entries)
      if (sphere.center.distanceTo(this.center) <= sphere.radius + NEAR_RADIUS) this.near.push(mesh)
  }

  private rebuild(): void {
    this.entries = []
    this.content().updateMatrixWorld(true)
    this.content().traverse(node => {
      if (!(node instanceof Mesh) || !isSolid(node)) return
      if (!node.geometry.boundingSphere) node.geometry.computeBoundingSphere()
      const sphere = node.geometry.boundingSphere!.clone().applyMatrix4(node.matrixWorld)
      // 片段动画会移动零件：留点余量，等下次刷新
      sphere.radius += 0.5
      this.entries.push({ mesh: node, sphere })
    })
  }

  private cast(origin: Vec3, direction: Vec3, far: number, meshes: readonly Mesh[]) {
    this.raycaster.set(
      this.origin.set(origin.x, origin.y, origin.z),
      this.direction.set(direction.x, direction.y, direction.z),
    )
    this.raycaster.far = far
    const hits: Intersection[] = this.raycaster.intersectObjects(meshes as Mesh[], false)
    const hit = hits[0]
    if (!hit) return null
    const normal = hit.face?.normal.clone() ?? new Vector3(0, 1, 0)
    normal.applyNormalMatrix(this.normalMatrix.getNormalMatrix(hit.object.matrixWorld))
    // 双面的网（围栏）从背面打到时，法线要朝向射线来的方向
    if (normal.dot(this.direction) > 0) normal.negate()
    return { distance: hit.distance, normal: { x: normal.x, y: normal.y, z: normal.z } }
  }

  /** 给角色用：只测附近。 */
  readonly castRay: CastRay = (origin, direction, far) => this.cast(origin, direction, far, this.near)

  /** 给相机用：相机可能离角色比较远，测全部。 */
  readonly castFar: CastRay = (origin, direction, far) =>
    this.cast(
      origin,
      direction,
      far,
      this.entries
        .filter(entry => {
          return entry.sphere.center.distanceTo(this.center) <= entry.sphere.radius + far + NEAR_RADIUS
        })
        .map(entry => entry.mesh),
    )
}
