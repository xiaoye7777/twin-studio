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

  describe('clips triggered by interactions', () => {
    const none = () => undefined
    /** door 动 x，fan 动 y；slide 和 door 动同一个属性。 */
    function cabinet() {
      const root = new Group()
      const door = new Group()
      door.name = 'door'
      const fan = new Group()
      fan.name = 'fan'
      root.add(door, fan)
      const clips = [
        new AnimationClip('fan', 1, [new NumberKeyframeTrack('fan.position[y]', [0, 1], [0, 1])]),
        new AnimationClip('door', 2, [new NumberKeyframeTrack('door.position[x]', [0, 2], [0, 10])]),
        new AnimationClip('slide', 2, [new NumberKeyframeTrack('door.position[x]', [0, 2], [0, -10])]),
      ]
      return { root, door, fan, animator: new ModelAnimator(root, clips) }
    }

    it('toggle plays forward and holds, then plays back and lets go', () => {
      const { root, door, animator } = cabinet()
      animator.configure({ clip: null, speed: 1, loop: true }, undefined, new Map())
      expect(animator.play('door', 'toggle')).toBe(true)
      animator.update(1, none)
      expect(door.position.x).toBeCloseTo(5)
      animator.update(5, none)
      expect(door.position.x).toBeCloseTo(10)

      animator.play('door', 'toggle')
      animator.update(1, none)
      expect(door.position.x).toBeCloseTo(5)
      // Turned around halfway it goes back the way it came.
      animator.play('door', 'toggle')
      animator.update(0.5, none)
      expect(door.position.x).toBeCloseTo(7.5)
      animator.play('door', 'toggle')
      animator.update(5, none)
      expect(door.position.x).toBeCloseTo(0)
      expect(animator.active).toBe(false)
      expect(root.children).toContain(door)
    })

    it('runs next to the configured clip', () => {
      const { door, fan, animator } = cabinet()
      animator.configure(undefined, undefined, new Map())
      animator.play('door', 'toggle')
      animator.update(0.5, none)
      expect(fan.position.y).toBeCloseTo(0.5)
      expect(door.position.x).toBeCloseTo(2.5)
    })

    it('once restarts on every trigger and holds the end', () => {
      const { door, animator } = cabinet()
      animator.configure({ clip: null, speed: 1, loop: true }, undefined, new Map())
      animator.play('door', 'once')
      animator.update(5, none)
      expect(door.position.x).toBeCloseTo(10)
      animator.play('door', 'once')
      animator.update(1, none)
      expect(door.position.x).toBeCloseTo(5)
    })

    it('loop repeats until triggered again', () => {
      const { door, animator } = cabinet()
      animator.configure({ clip: null, speed: 1, loop: true }, undefined, new Map())
      animator.play('door', 'loop')
      animator.update(3, none)
      expect(door.position.x).toBeCloseTo(5)
      animator.play('door', 'loop')
      animator.update(1, none)
      expect(door.position.x).toBeCloseTo(0)
      expect(animator.active).toBe(false)
    })

    it('a clip on the same property replaces the running one', () => {
      const { door, animator } = cabinet()
      animator.configure({ clip: null, speed: 1, loop: true }, undefined, new Map())
      animator.play('door', 'toggle')
      animator.update(5, none)
      animator.play('slide', 'toggle')
      animator.update(5, none)
      expect(door.position.x).toBeCloseTo(-10)
    })

    it('stop returns the parts to their pose; unknown clips do nothing', () => {
      const { door, animator } = cabinet()
      animator.configure({ clip: null, speed: 1, loop: true }, undefined, new Map())
      expect(animator.play('missing', 'toggle')).toBe(false)
      expect(animator.stop()).toBe(false)
      animator.play('door', 'toggle')
      animator.update(5, none)
      expect(animator.stop()).toBe(true)
      animator.update(1, none)
      expect(door.position.x).toBeCloseTo(0)
      expect(animator.active).toBe(false)
    })

    it('clearTriggered goes back to the configured clip, even one the interaction took over', () => {
      const { door, fan, animator } = cabinet()
      animator.configure(undefined, undefined, new Map())
      animator.play('fan', 'once')
      animator.play('door', 'toggle')
      animator.update(5, none)
      animator.clearTriggered()
      animator.update(0, none)
      expect(door.position.x).toBeCloseTo(0)
      expect(animator.active).toBe(true)
      animator.update(0.5, none)
      expect(fan.position.y).toBeCloseTo(0.5)
    })
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
