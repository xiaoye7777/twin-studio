import { AnimationClip, Group, NumberKeyframeTrack, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { PartMotion } from '../src/domain/scene'
import { ModelAnimator } from '../src/runtime/scene/ModelAnimator'

function model() {
  const root = new Group()
  const blades = new Group()
  blades.name = 'blades'
  root.add(blades)
  const clip = new AnimationClip('spin', 1, [new NumberKeyframeTrack('blades.position[x]', [0, 1], [0, 10])])
  return { root, blades, clip }
}

const motion = (patch: Partial<PartMotion> = {}): PartMotion => ({
  id: 'm1',
  assetNodeId: 'blades',
  axis: 'z',
  speed: 90,
  speedVariable: null,
  factor: 1,
  ...patch,
})

/** Rotation about Z in degrees, read from where the X axis ends up. */
const angleAround = (q: Quaternion) => {
  const v = new Vector3(1, 0, 0).applyQuaternion(q)
  return Math.round((Math.atan2(v.y, v.x) * 180) / Math.PI)
}

describe('ModelAnimator', () => {
  it('plays the first clip by default and none when cleared', () => {
    const { root, blades, clip } = model()
    const animator = new ModelAnimator(root, [clip])
    animator.configure(undefined, undefined, new Map())
    expect(animator.clipNames).toEqual(['spin'])
    animator.update(0.5, () => undefined)
    expect(blades.position.x).toBeCloseTo(5)
    animator.configure({ clip: null, speed: 1, loop: true }, undefined, new Map())
    expect(animator.active).toBe(false)
  })

  it('spins parts at a fixed speed, or as fast as the live value says', () => {
    const { root, blades } = model()
    const animator = new ModelAnimator(root, [])
    const parts = new Map([['blades', blades]])
    animator.configure(undefined, [motion()], parts)
    animator.update(1, () => undefined)
    expect(angleAround(blades.quaternion)).toBe(90)

    // rpm × 6 = degrees per second
    animator.configure(undefined, [motion({ speedVariable: 'rotorSpeed', factor: 6 })], parts)
    animator.update(0.5, key => (key === 'rotorSpeed' ? 10 : undefined))
    expect(angleAround(blades.quaternion)).toBe(120)
    // No live value: the fixed speed applies.
    animator.update(0.5, () => undefined)
    expect(angleAround(blades.quaternion)).toBe(165)
  })

  it('restores the part pose on dispose', () => {
    const { root, blades } = model()
    const animator = new ModelAnimator(root, [])
    animator.configure(undefined, [motion()], new Map([['blades', blades]]))
    animator.update(1, () => undefined)
    animator.dispose()
    expect(blades.quaternion.equals(new Quaternion())).toBe(true)
  })
})
