/*
 * 角色的运动：走、疾跑、跳、飞，以及和场景的碰撞。这里只有数学，不碰画面和输入设备，手感参数都在 TUNING 里。
 * 手感的做法：速度向目标速度按指数逼近（有一点惯性，但响应时间只有 0.1 秒左右）；
 * 跳跃有土狼时间和按键缓冲，松开空格会提前收力，下落比上升快，所以不飘。
 */
export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface RayHit {
  distance: number
  /** 世界空间法线。 */
  normal: Vec3
}

/** 场景能回答的问题只有一个：这条射线先碰到什么。方向是单位向量。 */
export type CastRay = (origin: Vec3, direction: Vec3, far: number) => RayHit | null

export interface MoveInput {
  /** 相机坐标系下的移动意图：x 向右，z 向前，范围 -1 到 1。 */
  x: number
  z: number
  sprint: boolean
  jumpHeld: boolean
  /** 这一帧刚按下空格。 */
  jumpPressed: boolean
  /** 飞行时下降。 */
  descend: boolean
  /** 这一帧切换飞行（F 键或双击空格）。 */
  toggleFlight: boolean
  /** 相机朝向。 */
  yaw: number
  pitch: number
}

export const TUNING = {
  height: 2.6,
  radius: 0.42,
  stepHeight: 0.55,

  walkSpeed: 4.4,
  sprintSpeed: 9,
  /** 速度响应：数字越大越跟手。起步、停下分开调，停得比起步略快，不会滑。 */
  startResponse: 13,
  sprintResponse: 9,
  stopResponse: 17,
  airResponse: 3.2,
  turnResponse: 15,
  airTurnResponse: 7,

  gravity: 26,
  /** 下落时重力的倍数：上升和下落不对称，跳起来才利落。 */
  fallMultiplier: 1.55,
  jumpHeight: 1.9,
  /** 松开空格时，上升速度留下多少：轻点跳得矮。 */
  jumpCut: 0.5,
  coyoteTime: 0.1,
  jumpBuffer: 0.13,

  flySpeed: 13,
  flyBoostSpeed: 30,
  flyResponse: 4.5,
  flyVerticalSpeed: 9,
} as const

const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))
/** 与帧率无关的指数逼近系数。 */
const blend = (response: number, dt: number) => 1 - Math.exp(-response * dt)

const DIRECTIONS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2
  return { x: Math.cos(a), y: 0, z: Math.sin(a) }
})
const DOWN = { x: 0, y: -1, z: 0 }
const UP = { x: 0, y: 1, z: 0 }

export class CharacterController {
  readonly position: Vec3
  readonly velocity: Vec3 = { x: 0, y: 0, z: 0 }
  /** 身体朝向，0 朝 +Z。 */
  yaw = 0
  grounded = false
  flying = false
  sprinting = false
  /** 刚落地这一帧的冲击速度，给动画用。 */
  landingImpact = 0
  /** 这一帧刚起跳。 */
  jumped = false

  private coyote = 0
  private buffer = 0
  private jumping = false

  constructor(
    private readonly castRay: CastRay,
    start: Vec3,
  ) {
    this.position = { ...start }
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z)
  }

  /** 瞬移（出生、掉出世界）。 */
  teleport(to: Vec3): void {
    Object.assign(this.position, to)
    Object.assign(this.velocity, { x: 0, y: 0, z: 0 })
  }

  update(dt: number, input: MoveInput): void {
    this.landingImpact = 0
    this.jumped = false
    if (input.toggleFlight) this.setFlying(!this.flying)
    if (this.flying) this.steerFlight(dt, input)
    else this.steerGround(dt, input)
    this.turn(dt, input)
    // 速度快时分几步走，不会穿过薄墙。
    const speed = Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z)
    const steps = Math.min(5, Math.max(1, Math.ceil((speed * dt) / (TUNING.radius * 0.8))))
    for (let i = 0; i < steps; i++) this.integrate(dt / steps, input)
  }

  private setFlying(flying: boolean): void {
    this.flying = flying
    this.jumping = false
    if (flying) {
      this.grounded = false
      // 起飞时轻轻向上托一下
      this.velocity.y = Math.max(this.velocity.y, 3)
    }
  }

  private steerGround(dt: number, input: MoveInput): void {
    const { forward, right } = this.axes(input.yaw)
    const length = Math.hypot(input.x, input.z)
    const scale = length > 1 ? 1 / length : 1
    const moveX = (right.x * input.x + forward.x * input.z) * scale
    const moveZ = (right.z * input.x + forward.z * input.z) * scale
    this.sprinting = input.sprint && length > 0.1
    const top = this.sprinting ? TUNING.sprintSpeed : TUNING.walkSpeed
    const response = !this.grounded
      ? TUNING.airResponse
      : length < 0.01
        ? TUNING.stopResponse
        : this.sprinting
          ? TUNING.sprintResponse
          : TUNING.startResponse
    const k = blend(response, dt)
    this.velocity.x += (moveX * top - this.velocity.x) * k
    this.velocity.z += (moveZ * top - this.velocity.z) * k

    this.coyote = this.grounded ? TUNING.coyoteTime : Math.max(0, this.coyote - dt)
    this.buffer = input.jumpPressed ? TUNING.jumpBuffer : Math.max(0, this.buffer - dt)
    if (this.buffer > 0 && this.coyote > 0) {
      this.velocity.y = Math.sqrt(2 * TUNING.gravity * TUNING.jumpHeight)
      this.grounded = false
      this.jumping = true
      this.jumped = true
      this.coyote = 0
      this.buffer = 0
    }
    if (this.jumping && !input.jumpHeld && this.velocity.y > 0) {
      this.velocity.y *= TUNING.jumpCut
      this.jumping = false
    }
    const gravity = TUNING.gravity * (this.velocity.y < 0 ? TUNING.fallMultiplier : 1)
    this.velocity.y -= gravity * dt
  }

  private steerFlight(dt: number, input: MoveInput): void {
    const { forward, right } = this.axes(input.yaw)
    const length = Math.hypot(input.x, input.z)
    const scale = length > 1 ? 1 / length : 1
    const cosPitch = Math.cos(input.pitch)
    // 向前飞就是朝相机看的方向飞：相机从上往下看时向前飞会下降。pitch 为正表示相机在上方。
    const top = input.sprint ? TUNING.flyBoostSpeed : TUNING.flySpeed
    const z = input.z * scale
    const x = input.x * scale
    this.sprinting = input.sprint && length > 0.1
    const targetX = (right.x * x + forward.x * z * cosPitch) * top
    const targetZ = (right.z * x + forward.z * z * cosPitch) * top
    let targetY = -Math.sin(input.pitch) * z * top
    if (input.jumpHeld) targetY += TUNING.flyVerticalSpeed
    if (input.descend) targetY -= TUNING.flyVerticalSpeed
    const k = blend(TUNING.flyResponse, dt)
    this.velocity.x += (targetX - this.velocity.x) * k
    this.velocity.y += (targetY - this.velocity.y) * k
    this.velocity.z += (targetZ - this.velocity.z) * k
  }

  private turn(dt: number, input: MoveInput): void {
    if (this.horizontalSpeed < 0.25) return
    const wanted =
      this.flying && Math.hypot(input.x, input.z) < 0.01 ? this.yaw : Math.atan2(this.velocity.x, this.velocity.z)
    const k = blend(this.grounded ? TUNING.turnResponse : TUNING.airTurnResponse, dt)
    this.yaw = wrapAngle(this.yaw + wrapAngle(wanted - this.yaw) * k)
  }

  private axes(yaw: number) {
    return {
      forward: { x: -Math.sin(yaw), z: -Math.cos(yaw) },
      right: { x: Math.cos(yaw), z: -Math.sin(yaw) },
    }
  }

  private integrate(dt: number, input: MoveInput): void {
    this.position.x += this.velocity.x * dt
    this.position.z += this.velocity.z * dt
    this.resolveWalls()
    this.position.y += this.velocity.y * dt
    this.resolveCeiling()
    this.resolveGround(input)
  }

  /** 身体四周、三个高度各打一圈射线，把人从墙里推出来，并沿墙滑动，不会卡住。膝盖以下的矮东西留给台阶处理。 */
  private resolveWalls(): void {
    const { radius, stepHeight, height } = TUNING
    for (const h of [stepHeight + 0.15, height * 0.5, height - 0.25]) {
      for (const direction of DIRECTIONS) {
        const origin = { x: this.position.x, y: this.position.y + h, z: this.position.z }
        const hit = this.castRay(origin, direction, radius)
        if (!hit) continue
        const nx = hit.normal.x
        const nz = hit.normal.z
        const flat = Math.hypot(nx, nz)
        if (flat < 0.3) continue
        const ux = nx / flat
        const uz = nz / flat
        const facing = Math.abs(direction.x * ux + direction.z * uz)
        const push = (radius - hit.distance) * facing
        this.position.x += ux * push
        this.position.z += uz * push
        const into = this.velocity.x * ux + this.velocity.z * uz
        if (into < 0) {
          this.velocity.x -= ux * into
          this.velocity.z -= uz * into
        }
      }
    }
  }

  private resolveCeiling(): void {
    if (this.velocity.y <= 0) return
    const head = { x: this.position.x, y: this.position.y + TUNING.height - 0.2, z: this.position.z }
    if (this.castRay(head, UP, 0.25)) this.velocity.y = 0
  }

  /** 脚下取五个点，站在最高的那个上。高度差在台阶以内就走上去；刚才还站着、落差不大就贴地，下坡下台阶不会腾空。 */
  private resolveGround(input: MoveInput): void {
    const { radius, stepHeight } = TUNING
    const reach = stepHeight + 0.4 + Math.max(0, -this.velocity.y) * 0.05
    let best = -Infinity
    for (const [dx, dz] of [
      [0, 0],
      [radius * 0.6, 0],
      [-radius * 0.6, 0],
      [0, radius * 0.6],
      [0, -radius * 0.6],
    ]) {
      const origin = { x: this.position.x + dx!, y: this.position.y + stepHeight, z: this.position.z + dz! }
      const hit = this.castRay(origin, DOWN, reach + stepHeight)
      if (hit && hit.normal.y > 0.5) best = Math.max(best, origin.y - hit.distance)
    }
    const gap = this.position.y - best
    const wasGrounded = this.grounded
    if (this.flying) {
      if (gap < 0) this.position.y = best
      // 下降碰到地面就落地，不用再按一次切换
      if (gap < 0.05 && input.descend) {
        this.flying = false
        this.grounded = true
        this.velocity.y = 0
      }
      return
    }
    const landing = this.velocity.y <= 0 && gap <= (wasGrounded ? 0.32 : 0)
    if (best > -Infinity && (landing || gap < 0)) {
      if (!wasGrounded) this.landingImpact = Math.max(0, -this.velocity.y)
      this.position.y = best
      this.velocity.y = 0
      this.grounded = true
      this.jumping = false
    } else {
      this.grounded = false
    }
  }
}
