import { describe, expect, it } from 'vitest'
import { fullEarthAltitude, hostPose, planFlight, sampleFlight, TIMING } from '../src/flightPlan'
import { angleBetween, slerp, toGeoPoint, toVector } from '../src/geo'

const shanghai = { lat: 31.23, lon: 121.47 }
const newYork = { lat: 40.71, lon: -74.01 }
const beijing = { lat: 39.9, lon: 116.41 }

describe('geo', () => {
  it('经纬度和向量互转不失真', () => {
    const back = toGeoPoint(toVector(shanghai))
    expect(back.lat).toBeCloseTo(shanghai.lat, 6)
    expect(back.lon).toBeCloseTo(shanghai.lon, 6)
  })

  it('大圆插值始终在球面上，对跖点也不会出 NaN', () => {
    const a = toVector({ lat: 0, lon: 0 })
    const b = toVector({ lat: 0, lon: 180 })
    for (const t of [0, 0.3, 0.5, 1]) {
      const [x, y, z] = slerp(a, b, t)
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5)
    }
    const end = slerp(a, b, 1)
    expect(angleBetween(end, b)).toBeLessThan(1e-2)
  })
})

describe('飞行计划', () => {
  const high = fullEarthAltitude(30, 16 / 9)
  const plan = planFlight(shanghai, newYork, high)

  it('全貌高度能装下整个地球，竖屏要拉得更远', () => {
    const half = (30 * Math.PI) / 360
    expect(1 / (1 + high)).toBeLessThan(Math.sin(half))
    expect(fullEarthAltitude(30, 9 / 16)).toBeGreaterThan(high)
  })

  it('阶段按顺序走完，时间单调', () => {
    const order = ['lift', 'pull', 'turn', 'hold', 'dive', 'land', 'done']
    const seen: string[] = []
    const moments = [0, plan.liftEnd, plan.turnStart, plan.holdAt, plan.holdAt + 0.1, plan.diveEnd, plan.end]
    for (const t of moments) seen.push(sampleFlight(plan, t).phase)
    expect(seen).toEqual(order)
  })

  it('起飞在出发地上空，等待时已转到目的地并能看到全貌', () => {
    expect(angleBetween(sampleFlight(plan, plan.liftEnd).center, plan.fromVector)).toBeLessThan(1e-6)
    const waiting = sampleFlight(plan, plan.holdAt)
    expect(angleBetween(waiting.center, plan.toVector)).toBeLessThan(1e-6)
    expect(waiting.altitude).toBeCloseTo(high, 6)
    expect(waiting.arc).toBe(1)
  })

  it('两次换场都发生在云层全遮时，真实场景绝不会直接露出地球', () => {
    expect(sampleFlight(plan, plan.liftEnd).veil).toBeCloseTo(1, 3)
    expect(sampleFlight(plan, plan.diveEnd).veil).toBeCloseTo(1, 3)
    expect(sampleFlight(plan, plan.liftEnd - 0.001).earthVisible).toBe(false)
    expect(sampleFlight(plan, plan.liftEnd).earthVisible).toBe(true)
    expect(sampleFlight(plan, plan.diveEnd).earthVisible).toBe(false)
    expect(sampleFlight(plan, plan.diveEnd).altitude).toBeCloseTo(TIMING.groundAltitude, 6)
  })

  it('开头结尾云层完全散开，地球全貌时也没有云遮挡', () => {
    expect(sampleFlight(plan, 0).veil).toBe(0)
    expect(sampleFlight(plan, plan.end).veil).toBe(0)
    expect(sampleFlight(plan, plan.holdAt).veil).toBe(0)
  })

  it('距离越远转得越久；同一地点也会完整拉到全貌', () => {
    const near = planFlight(shanghai, beijing, high)
    expect(near.holdAt).toBeLessThan(plan.holdAt)
    const same = planFlight(shanghai, shanghai, high)
    expect(sampleFlight(same, same.holdAt).altitude).toBeCloseTo(high, 6)
  })
})

describe('场景相机', () => {
  const view = { position: [60, 45, 60] as const, target: [10, 0, -5] as const }

  it('value 为 0 时严格等于原视角，落地不跳', () => {
    expect(hostPose(view, 0, 20000).position).toEqual(view.position)
  })

  it('升起时高度单调增加且不超出远裁剪面', () => {
    let previous = 0
    for (const value of [0, 0.25, 0.5, 0.75, 1]) {
      const y = hostPose(view, value, 20000).position[1]
      expect(y).toBeGreaterThanOrEqual(previous)
      previous = y
    }
    expect(previous).toBeGreaterThan(1500)
    expect(hostPose(view, 1, 1000).position[1]).toBeLessThan(800)
  })
})
