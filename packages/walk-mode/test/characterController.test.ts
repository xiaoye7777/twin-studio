import { describe, expect, it } from 'vitest'
import { CharacterController, type CastRay, type MoveInput, TUNING } from '../src/CharacterController'

const DT = 1 / 60
/** 平地 y=0，x=5 处可以放一堵无限高的墙，x>10 可以放一个高台。 */
function world(options: { wallAt?: number; ledge?: { from: number; height: number } } = {}): CastRay {
  return (origin, direction, far) => {
    let best: { distance: number; normal: { x: number; y: number; z: number } } | null = null
    const consider = (distance: number, normal: { x: number; y: number; z: number }) => {
      if (distance >= 0 && distance <= far && (!best || distance < best.distance)) best = { distance, normal }
    }
    if (direction.y < -0.5) {
      const floor = options.ledge && origin.x >= options.ledge.from ? options.ledge.height : 0
      if (origin.y >= floor) consider(origin.y - floor, { x: 0, y: 1, z: 0 })
    }
    if (options.wallAt !== undefined && direction.x > 0.01) {
      consider((options.wallAt - origin.x) / direction.x, { x: -1, y: 0, z: 0 })
    }
    if (options.ledge && direction.x > 0.01 && origin.x < options.ledge.from && origin.y < options.ledge.height) {
      consider((options.ledge.from - origin.x) / direction.x, { x: -1, y: 0, z: 0 })
    }
    return best
  }
}
const input = (patch: Partial<MoveInput> = {}): MoveInput => ({
  x: 0,
  z: 0,
  sprint: false,
  jumpHeld: false,
  jumpPressed: false,
  descend: false,
  toggleFlight: false,
  yaw: 0,
  pitch: 0,
  ...patch,
})
const run = (c: CharacterController, seconds: number, patch: Partial<MoveInput> = {}) => {
  for (let t = 0; t < seconds; t += DT) c.update(DT, input(patch))
}
const settled = (cast: CastRay = world()) => {
  const c = new CharacterController(cast, { x: 0, y: 0.5, z: 0 })
  run(c, 0.5)
  return c
}

describe('CharacterController', () => {
  it('falls and lands on the ground', () => {
    const c = settled()
    expect(c.grounded).toBe(true)
    expect(c.position.y).toBeCloseTo(0)
  })

  it('reaches walking speed quickly but not instantly, and stops fast', () => {
    const c = settled()
    c.update(DT, input({ z: 1 }))
    expect(c.horizontalSpeed).toBeLessThan(TUNING.walkSpeed * 0.3)
    run(c, 0.3, { z: 1 })
    expect(c.horizontalSpeed).toBeGreaterThan(TUNING.walkSpeed * 0.95)
    run(c, 0.25)
    expect(c.horizontalSpeed).toBeLessThan(0.1)
  })

  it('moves relative to the camera; camera at yaw 0 looks towards -Z', () => {
    const c = settled()
    run(c, 0.5, { z: 1 })
    expect(c.velocity.z).toBeLessThan(-TUNING.walkSpeed * 0.9)
    expect(Math.abs(c.yaw)).toBeGreaterThan(3)
  })

  it('sprints faster than it walks; diagonals are not faster', () => {
    const c = settled()
    run(c, 1, { z: 1, sprint: true })
    expect(c.horizontalSpeed).toBeCloseTo(TUNING.sprintSpeed, 0)
    const d = settled()
    run(d, 1, { z: 1, x: 1 })
    expect(d.horizontalSpeed).toBeCloseTo(TUNING.walkSpeed, 0)
  })

  it('jumps about the configured height and comes back faster than it rose', () => {
    const c = settled()
    c.update(DT, input({ jumpPressed: true, jumpHeld: true }))
    expect(c.jumped).toBe(true)
    let top = 0
    let up = 0
    while (c.velocity.y > 0) {
      c.update(DT, input({ jumpHeld: true }))
      top = Math.max(top, c.position.y)
      up += DT
    }
    expect(top).toBeGreaterThan(TUNING.jumpHeight * 0.92)
    expect(top).toBeLessThan(TUNING.jumpHeight * 1.05)
    let down = 0
    while (!c.grounded) {
      c.update(DT, input())
      down += DT
    }
    expect(down).toBeLessThan(up)
    expect(c.position.y).toBeCloseTo(0)
  })

  it('a short tap jumps lower than holding', () => {
    const c = settled()
    c.update(DT, input({ jumpPressed: true, jumpHeld: true }))
    let top = 0
    while (!c.grounded) {
      c.update(DT, input())
      top = Math.max(top, c.position.y)
    }
    expect(top).toBeLessThan(TUNING.jumpHeight * 0.5)
  })

  it('a jump pressed just before landing still happens', () => {
    const c = settled()
    c.update(DT, input({ jumpPressed: true, jumpHeld: true }))
    while (c.velocity.y > 0 || c.position.y > 0.25) c.update(DT, input({ jumpHeld: true }))
    c.update(DT, input({ jumpPressed: true, jumpHeld: true }))
    let again = false
    for (let i = 0; i < 12 && !again; i++) {
      c.update(DT, input({ jumpHeld: true }))
      again = c.jumped
    }
    expect(again).toBe(true)
  })

  it('stops at a wall and slides along it', () => {
    const c = settled(world({ wallAt: 3 }))
    // 相机 yaw -90° 时向前是 +X；同时向右是 +Z，贴墙时 Z 方向还能走
    run(c, 2, { z: 1, x: 1, yaw: -Math.PI / 2 })
    expect(c.position.x).toBeLessThanOrEqual(3 - TUNING.radius + 0.02)
    expect(Math.abs(c.position.z)).toBeGreaterThan(2)
  })

  it('walks up a step but not up a wall', () => {
    const low = settled(world({ ledge: { from: 2, height: TUNING.stepHeight - 0.1 } }))
    run(low, 1.5, { z: 1, yaw: -Math.PI / 2 })
    expect(low.position.x).toBeGreaterThan(2)
    expect(low.position.y).toBeCloseTo(TUNING.stepHeight - 0.1)
    const high = settled(world({ ledge: { from: 2, height: 1.2 } }))
    run(high, 1.5, { z: 1, yaw: -Math.PI / 2 })
    expect(high.position.x).toBeLessThan(2)
  })

  it('flies: holds height, climbs with space, follows the camera pitch, lands going down', () => {
    const c = settled()
    c.update(DT, input({ toggleFlight: true }))
    expect(c.flying).toBe(true)
    run(c, 1, { jumpHeld: true })
    const y = c.position.y
    expect(y).toBeGreaterThan(3)
    run(c, 1.5)
    expect(Math.abs(c.velocity.y)).toBeLessThan(0.1)
    // 相机从上往下看着飞会下降
    run(c, 0.2, { z: 1, pitch: 0.6 })
    expect(c.velocity.y).toBeLessThan(0)
    run(c, 6, { descend: true })
    expect(c.flying).toBe(false)
    expect(c.grounded).toBe(true)
  })

  it('is the same at a low frame rate', () => {
    const c = settled()
    for (let t = 0; t < 1; t += 0.05) c.update(0.05, input({ z: 1 }))
    expect(c.horizontalSpeed).toBeCloseTo(TUNING.walkSpeed, 0)
  })
})
