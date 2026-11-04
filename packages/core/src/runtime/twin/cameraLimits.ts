import { Box3, type Object3D, Vector3 } from 'three'
import type { CameraLimits, CameraViewV2 } from '../../domain/scene'
import type { CameraRig } from '../../engine/CameraRig'

/**
 * Applies a project's camera limits around its content. Saved views always stay reachable: the boundary
 * includes their targets, the range their distances (with room for narrow screens, which pull back) and
 * the lowest angle their elevation.
 */
export function applyCameraLimits(
  rig: CameraRig,
  limits: CameraLimits | undefined,
  roots: readonly Object3D[],
  views: readonly CameraViewV2[],
): void {
  if (!limits?.enabled) return rig.setLimits(null)
  const bounds = new Box3()
  for (const root of roots) bounds.expandByObject(root, true)
  if (bounds.isEmpty()) return rig.setLimits(null)
  const size = bounds.getSize(new Vector3()).length()
  const boundary = bounds.clone().expandByScalar(size * 0.05)
  let farthest = 0
  let lowest = limits.minElevation
  for (const view of views) {
    const position = new Vector3(...view.position)
    const target = new Vector3(...view.target)
    boundary.expandByPoint(target)
    const offset = position.sub(target)
    farthest = Math.max(farthest, offset.length())
    const elevation = (Math.asin(Math.min(1, Math.max(-1, offset.y / (offset.length() || 1)))) * 180) / Math.PI
    lowest = Math.min(lowest, Math.max(0, elevation - 1))
  }
  rig.setLimits({
    boundary,
    minDistance: limits.minDistance,
    maxDistance: Math.max(size * limits.maxDistance, farthest * 2, limits.minDistance + 1),
    minElevation: lowest,
  })
}
