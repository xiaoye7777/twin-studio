import { BoxGeometry, Mesh, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { CameraRig } from '../src/engine/CameraRig'
import { applyCameraLimits } from '../src/runtime/twin/cameraLimits'

const rig = () => ({ setLimits: vi.fn() })
// A 20 × 2 × 20 m scene centred on the origin.
const scene = [new Mesh(new BoxGeometry(20, 2, 20))]
const limits = { enabled: true, maxDistance: 1.5, minDistance: 2, minElevation: 10 }

describe('camera limits', () => {
  it('frees the camera when disabled or the scene is empty', () => {
    const disabled = rig()
    applyCameraLimits(disabled as unknown as CameraRig, { ...limits, enabled: false }, scene, [])
    expect(disabled.setLimits).toHaveBeenCalledWith(null)
    const empty = rig()
    applyCameraLimits(empty as unknown as CameraRig, limits, [], [])
    expect(empty.setLimits).toHaveBeenCalledWith(null)
  })

  it('bounds the camera around the scene by its size', () => {
    const target = rig()
    applyCameraLimits(target as unknown as CameraRig, limits, scene, [])
    const applied = target.setLimits.mock.calls[0]![0]
    const size = Math.hypot(20, 2, 20)
    expect(applied.maxDistance).toBeCloseTo(size * 1.5)
    expect([applied.minDistance, applied.minElevation]).toEqual([2, 10])
    expect(applied.boundary.max.x).toBeCloseTo(10 + size * 0.05)
  })

  it('keeps saved views reachable: far, low and outside the scene', () => {
    const target = rig()
    const view = { position: [100, 5, 0] as [number, number, number], target: [40, 0, 0] as [number, number, number] }
    applyCameraLimits(target as unknown as CameraRig, limits, scene, [view])
    const applied = target.setLimits.mock.calls[0]![0]
    const distance = Math.hypot(60, 5)
    expect(applied.maxDistance).toBeGreaterThanOrEqual(distance * 2)
    expect(applied.boundary.containsPoint(new Vector3(40, 0, 0))).toBe(true)
    expect(applied.minElevation).toBeLessThan((Math.asin(5 / distance) * 180) / Math.PI)
  })
})
