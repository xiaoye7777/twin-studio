import { angleBetween, slerp, toVector, type GeoPoint, type Vec3 } from './geo'

/** 整段转场的节奏（秒）和高度（地球半径为 1）。手感要调就改这里。 */
export const TIMING = {
  /** 相机从场景里升起，直到被云完全遮住 */
  lift: 1.4,
  /** 从近地拉远到地球全貌 */
  pull: 2.1,
  /** 转动地球的基础时长，距离越远再加上 turnPerHalfEarth 的比例 */
  turn: 1.1,
  turnPerHalfEarth: 1.3,
  /** 从全貌俯冲到近地 */
  dive: 2.3,
  /** 穿出云层，相机落回场景 */
  land: 1.6,
  /** 近地高度。贴图看不出糊的最低高度，再低就交给云层遮挡 */
  groundAltitude: 0.07,
} as const

export type FlightPhase = 'lift' | 'pull' | 'turn' | 'hold' | 'dive' | 'land' | 'done'

export interface FlightPlan {
  fromVector: Vec3
  toVector: Vec3
  /** 在 highAltitude 能看到整个地球 */
  highAltitude: number
  liftEnd: number
  pullEnd: number
  turnStart: number
  /** 时钟停在这里等目标场景加载完 */
  holdAt: number
  diveEnd: number
  end: number
}

export interface FlightSample {
  phase: FlightPhase
  center: Vec3
  altitude: number
  /** 云层遮挡强度，1 时整个画面被盖住 */
  veil: number
  /** 这一刻该画地球（否则画面透出下面的真实场景） */
  earthVisible: boolean
  /** 航线画到了哪里 */
  arc: number
  /** 真实场景的相机高度参数：0 是原始视角，1 是最高点。没有场景要动时为 null */
  ascent: { side: 'from' | 'to'; value: number } | null
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const span = (t: number, start: number, end: number) => clamp01((t - start) / (end - start))
export const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

/** 刚好装下整个地球（含大气光晕）所需的高度，竖屏也能完整看到。 */
export function fullEarthAltitude(fovDegrees: number, aspect: number): number {
  const vertical = (fovDegrees * Math.PI) / 360
  const horizontal = Math.atan(Math.tan(vertical) * aspect)
  return 1.34 / Math.sin(Math.min(vertical, horizontal)) - 1
}

export function planFlight(from: GeoPoint, to: GeoPoint, highAltitude: number): FlightPlan {
  const fromVector = toVector(from)
  const destination = toVector(to)
  const turn = TIMING.turn + (TIMING.turnPerHalfEarth * angleBetween(fromVector, destination)) / Math.PI
  const liftEnd = TIMING.lift
  const pullEnd = liftEnd + TIMING.pull
  // 拉远到一半就开始转，运动才连贯；转完才开始俯冲，这样在此等加载也不会显得卡在半路。
  const turnStart = liftEnd + TIMING.pull * 0.55
  const holdAt = Math.max(pullEnd, turnStart + turn)
  const diveEnd = holdAt + TIMING.dive
  return {
    fromVector,
    toVector: destination,
    highAltitude,
    liftEnd,
    pullEnd,
    turnStart,
    holdAt,
    diveEnd,
    end: diveEnd + TIMING.land,
  }
}

function phaseAt(plan: FlightPlan, t: number): FlightPhase {
  if (t < plan.liftEnd) return 'lift'
  if (t < plan.turnStart) return 'pull'
  if (t < plan.holdAt) return 'turn'
  if (t === plan.holdAt) return 'hold'
  if (t < plan.diveEnd) return 'dive'
  return t < plan.end ? 'land' : 'done'
}

/** 对数空间插值高度：越靠近地面变化越快，和真实飞行时的视觉速度一致。 */
function altitudeAt(plan: FlightPlan, t: number): number {
  const ground = Math.log(TIMING.groundAltitude)
  const high = Math.log(plan.highAltitude)
  const up = smooth(span(t, plan.liftEnd, plan.pullEnd))
  const down = smooth(span(t, plan.holdAt, plan.diveEnd))
  return Math.exp(ground + (high - ground) * up * (1 - down))
}

function veilAt(plan: FlightPlan, t: number): number {
  const closing = smooth(span(t, plan.liftEnd * 0.35, plan.liftEnd))
  const opening = smooth(span(t, plan.liftEnd, plan.liftEnd + TIMING.pull * 0.42))
  const descending = smooth(span(t, plan.holdAt + TIMING.dive * 0.62, plan.diveEnd))
  const clearing = smooth(span(t, plan.diveEnd + TIMING.land * 0.08, plan.diveEnd + TIMING.land * 0.7))
  return t < plan.holdAt ? closing * (1 - opening) : descending * (1 - clearing)
}

export function sampleFlight(plan: FlightPlan, t: number): FlightSample {
  const turning = smooth(span(t, plan.turnStart, plan.holdAt))
  let ascent: FlightSample['ascent'] = null
  if (t < plan.liftEnd) {
    const rise = t / plan.liftEnd
    ascent = { side: 'from', value: rise * rise }
  } else if (t >= plan.diveEnd) {
    const fall = 1 - span(t, plan.diveEnd, plan.end)
    ascent = { side: 'to', value: fall * fall * fall }
  }
  return {
    phase: phaseAt(plan, t),
    center: slerp(plan.fromVector, plan.toVector, turning),
    altitude: altitudeAt(plan, t),
    veil: veilAt(plan, t),
    earthVisible: t >= plan.liftEnd && t < plan.diveEnd,
    arc: turning,
    ascent,
  }
}

export interface HostPose {
  position: Vec3
  target: Vec3
}

/** 场景相机升起的最大倍数：从当前视距升到这么多倍，已足够被云遮住前看到整个园区变小。 */
const ASCENT_RATIO = 40

/**
 * 真实场景里相机的位置。value 为 0 时严格等于原始视角，方便落地时无跳变地交还给相机控制器。
 * 上升时高度指数增长，水平偏移收拢，最终接近从正上方俯视。
 */
export function hostPose(view: HostPose, value: number, farLimit: number): HostPose {
  const [px, py, pz] = view.position
  const [tx, ty, tz] = view.target
  const offset = [px - tx, py - ty, pz - tz]
  const distance = Math.hypot(offset[0]!, offset[1]!, offset[2]!) || 1
  const peak = Math.min(distance * ASCENT_RATIO, farLimit * 0.6)
  const rise = distance * Math.pow(Math.max(peak / distance, 1), value) - distance
  const gather = 1 - 0.92 * value
  return {
    position: [tx + offset[0]! * gather + 0.001 * value, py + rise, tz + offset[2]! * gather],
    target: view.target,
  }
}
