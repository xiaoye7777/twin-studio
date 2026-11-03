import {
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  BoxGeometry,
  type BufferGeometry,
  type Material,
} from 'three'
import { type CharacterController, TUNING } from './CharacterController'

const blend = (response: number, dt: number) => 1 - Math.exp(-response * dt)
const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** 建模时身高 1.8，整体缩放到 TUNING.height。 */
const MODEL_HEIGHT = 1.8

const material = (color: string, roughness = 0.65, metalness = 0, emissive?: string) =>
  new MeshStandardMaterial({ color, roughness, metalness, ...(emissive ? { emissive, emissiveIntensity: 1.6 } : {}) })

/**
 * 一个戴安全帽、穿反光背心的巡检员，全部用基本几何体拼成，不需要模型文件。
 * 动画是程序化的：步伐按走过的距离推进，脚不会打滑；各个姿态之间用权重平滑过渡。
 */
export class Character {
  readonly root = new Group()
  private readonly body = new Group()
  private readonly hips = new Group()
  private readonly chest = new Group()
  private readonly head = new Group()
  private readonly thighL = new Group()
  private readonly thighR = new Group()
  private readonly shinL = new Group()
  private readonly shinR = new Group()
  private readonly armL = new Group()
  private readonly armR = new Group()
  private readonly foreL = new Group()
  private readonly foreR = new Group()
  private readonly flames: Mesh[] = []
  private readonly geometries: BufferGeometry[] = []
  private readonly materials: Material[] = []

  private phase = 0
  private airborne = 0
  private flight = 0
  private lean = 0
  private bank = 0
  private squash = 0
  private squashVelocity = 0
  private lastYaw = 0
  private smoothY: number | null = null
  private time = 0

  constructor() {
    this.build()
    this.root.add(this.body)
    this.body.scale.setScalar(TUNING.height / MODEL_HEIGHT)
    this.root.traverse(node => {
      if (node instanceof Mesh) {
        node.castShadow = true
        node.receiveShadow = true
        node.userData.editorInternal = true
      }
    })
    for (const flame of this.flames) flame.castShadow = false
  }

  private part(parent: Group, geometry: BufferGeometry, mat: Material, x = 0, y = 0, z = 0): Mesh {
    const mesh = new Mesh(geometry, mat)
    mesh.position.set(x, y, z)
    parent.add(mesh)
    this.geometries.push(geometry)
    return mesh
  }

  private build(): void {
    const suit = material('#27476b', 0.72)
    const vest = material('#f26a1b', 0.6)
    const strip = material('#e8e8d8', 0.35, 0.3, '#55554a')
    const skin = material('#e3b48f', 0.6)
    const boot = material('#1f2022', 0.5)
    const glove = material('#30343a', 0.7)
    const hat = material('#f4c21f', 0.35)
    const dark = material('#15171a', 0.4)
    const flame = material('#7fe8ff', 0.3, 0, '#39c8ff')
    this.materials.push(suit, vest, strip, skin, boot, glove, hat, dark, flame)

    // 骨盆在 0.95 高。每段肢体的原点都在上端关节，旋转才对。
    this.hips.position.y = 0.95
    this.body.add(this.hips)
    this.part(this.hips, new CapsuleGeometry(0.15, 0.1, 4, 12), suit, 0, 0.02, 0).scale.set(1.15, 1, 0.8)

    this.chest.position.y = 0.12
    this.hips.add(this.chest)
    this.part(this.chest, new CapsuleGeometry(0.165, 0.28, 4, 14), vest, 0, 0.22, 0).scale.set(1.15, 1, 0.78)
    for (const y of [0.13, 0.27]) {
      this.part(this.chest, new CylinderGeometry(0.193, 0.193, 0.035, 18, 1, true), strip, 0, y, 0).scale.set(1, 1, 0.8)
    }
    this.part(this.chest, new BoxGeometry(0.04, 0.34, 0.02), strip, 0.09, 0.3, 0.135)
    this.part(this.chest, new BoxGeometry(0.04, 0.34, 0.02), strip, -0.09, 0.3, 0.135)

    this.head.position.y = 0.52
    this.chest.add(this.head)
    this.part(this.head, new CylinderGeometry(0.05, 0.055, 0.07, 10), skin, 0, -0.02, 0)
    this.part(this.head, new SphereGeometry(0.115, 18, 14), skin, 0, 0.1, 0).scale.set(0.95, 1.08, 1)
    this.part(this.head, new SphereGeometry(0.014, 8, 6), dark, 0.042, 0.115, 0.104)
    this.part(this.head, new SphereGeometry(0.014, 8, 6), dark, -0.042, 0.115, 0.104)
    this.part(this.head, new SphereGeometry(0.128, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, 0.135, 0).scale.set(
      1,
      0.92,
      1.06,
    )
    this.part(this.head, new CylinderGeometry(0.15, 0.155, 0.014, 22), hat, 0, 0.135, 0.018).scale.set(1, 1, 1.12)
    this.part(this.head, new BoxGeometry(0.022, 0.03, 0.2), hat, 0, 0.255, 0.0)

    const limb = (side: number, thigh: Group, shin: Group, arm: Group, fore: Group) => {
      thigh.position.set(side * 0.095, -0.03, 0)
      this.hips.add(thigh)
      this.part(thigh, new CapsuleGeometry(0.072, 0.3, 4, 10), suit, 0, -0.21, 0)
      shin.position.y = -0.42
      thigh.add(shin)
      this.part(shin, new CapsuleGeometry(0.058, 0.3, 4, 10), suit, 0, -0.2, 0)
      this.part(shin, new BoxGeometry(0.105, 0.07, 0.24), boot, 0, -0.44, 0.04)
      this.part(shin, new CapsuleGeometry(0.063, 0.08, 4, 10), boot, 0, -0.37, 0)
      const fire = this.part(shin, new ConeGeometry(0.05, 0.3, 10), flame, 0, -0.62, 0.02)
      fire.rotation.x = Math.PI
      this.flames.push(fire)

      arm.position.set(side * 0.225, 0.43, 0)
      this.chest.add(arm)
      this.part(arm, new SphereGeometry(0.066, 12, 10), vest)
      this.part(arm, new CapsuleGeometry(0.052, 0.21, 4, 10), suit, 0, -0.15, 0)
      fore.position.y = -0.3
      arm.add(fore)
      this.part(fore, new CapsuleGeometry(0.046, 0.2, 4, 10), suit, 0, -0.14, 0)
      this.part(fore, new SphereGeometry(0.055, 10, 8), glove, 0, -0.3, 0)
    }
    limb(1, this.thighL, this.shinL, this.armL, this.foreL)
    limb(-1, this.thighR, this.shinR, this.armR, this.foreR)
  }

  update(dt: number, state: CharacterController): void {
    this.time += dt
    const speed = state.horizontalSpeed
    const walk = smooth(0.15, 1.6, speed)
    const run = smooth(TUNING.walkSpeed * 0.9, TUNING.sprintSpeed * 0.9, speed)
    this.airborne += ((state.grounded || state.flying ? 0 : 1) - this.airborne) * blend(13, dt)
    this.flight += ((state.flying ? 1 : 0) - this.flight) * blend(6, dt)

    // 一步的长度：走路短，跑起来长。按距离推进，脚不打滑。
    const stride = mix(1.55, 2.5, run)
    if (state.grounded) this.phase += (speed * dt * Math.PI * 2) / (stride * 2)
    const s = Math.sin(this.phase)
    const c = Math.cos(this.phase)

    // 腿：抬腿的那条小腿弯得更多
    const swing = mix(0.5, 0.95, run) * walk
    const kneeBase = mix(0.25, 0.75, run) * walk
    const legL = s * swing
    const legR = -s * swing
    const kneeL = Math.max(0, -c) * kneeBase * 1.7 + 0.05 * walk
    const kneeR = Math.max(0, c) * kneeBase * 1.7 + 0.05 * walk

    // 手臂和腿反向，跑起来弯肘
    const armSwing = mix(0.42, 0.95, run) * walk
    const elbow = mix(0.22, 1.35, run) * walk + 0.12

    // 待机：很轻的呼吸
    const idle = 1 - walk
    const breathe = Math.sin(this.time * 1.8) * 0.012 * idle
    const bob = Math.abs(c) * mix(0.022, 0.05, run) * walk

    // 身体前倾跟速度走，转弯时往里倾
    const turnRate =
      Math.atan2(Math.sin(state.yaw - this.lastYaw), Math.cos(state.yaw - this.lastYaw)) / Math.max(dt, 1e-3)
    this.lastYaw = state.yaw
    const leanWanted = mix(0.05, 0.3, run) * walk
    this.lean += (leanWanted - this.lean) * blend(9, dt)
    const bankWanted = Math.max(-0.28, Math.min(0.28, -turnRate * 0.035 * Math.min(1, speed / 4)))
    this.bank += (bankWanted - this.bank) * blend(9, dt)

    // 落地缓冲：一个带弹性的下蹲
    if (state.landingImpact > 4) this.squashVelocity -= Math.min(state.landingImpact, 22) * 0.2
    if (state.jumped) this.squashVelocity += 1.4
    this.squashVelocity += (-this.squash * 140 - this.squashVelocity * 18) * dt
    this.squash += this.squashVelocity * dt
    const crouch = Math.min(0, this.squash)

    // 空中：上升收腿伸手，下落手臂张开
    const rising = state.velocity.y > 0.5 ? 1 : 0
    const air = this.airborne * (1 - this.flight)
    const airLegL = mix(-0.75, -0.25, 1 - rising)
    const airLegR = mix(0.35, 0.3, 1 - rising)

    // 飞行：有速度时身体前倾成超人姿势，悬停时站直微微浮动
    const flySpeed = smooth(1, 11, Math.hypot(state.velocity.x, state.velocity.z))
    const fly = this.flight
    const flyPitch = flySpeed * 1.15
    const hover = Math.sin(this.time * 2.4) * 0.03 * fly

    const legBlend = 1 - air - fly * (1 - air)
    this.thighL.rotation.x = legL * legBlend + air * airLegL + fly * mix(-0.15, 0.08, flySpeed) - crouch * 1.3
    this.thighR.rotation.x = legR * legBlend + air * airLegR + fly * mix(0.12, -0.05, flySpeed) - crouch * 1.3
    this.shinL.rotation.x = kneeL * legBlend + air * 1.1 + fly * mix(0.45, 0.15, flySpeed) + crouch * -2.4
    this.shinR.rotation.x = kneeR * legBlend + air * 0.55 + fly * mix(0.3, 0.25, flySpeed) + crouch * -2.4

    const armAir = air * (rising ? -0.5 : -1.2)
    this.armL.rotation.x =
      (-legL / Math.max(swing, 1e-3)) * armSwing * legBlend + armAir + fly * mix(-0.2, -2.9, flySpeed)
    this.armR.rotation.x =
      (-legR / Math.max(swing, 1e-3)) * armSwing * legBlend + armAir + fly * mix(-0.2, 0.15, flySpeed)
    this.armL.rotation.z = air * 0.45 + fly * mix(0.35, 0.05, flySpeed) + 0.06
    this.armR.rotation.z = -air * 0.45 - fly * mix(0.35, 0.15, flySpeed) - 0.06
    this.foreL.rotation.x = -elbow * legBlend - air * 0.5 - fly * mix(0.3, 0.05, flySpeed)
    this.foreR.rotation.x = -elbow * legBlend - air * 0.5 - fly * 0.25

    this.hips.rotation.y = s * 0.12 * walk * legBlend
    this.chest.rotation.y = -s * 0.2 * walk * legBlend
    this.chest.rotation.x = this.lean * 0.45 + breathe * 2 - crouch * 0.8
    this.head.rotation.x = -this.lean * 0.45 - fly * flyPitch * 0.75

    // 整体：朝向、前倾、转弯内倾、下蹲。旋转点放在骨盆，脚不会抬离地面太多。
    this.hips.position.y = 0.95 + bob * legBlend + crouch * 0.42 + breathe + hover
    this.body.rotation.x = this.lean * 0.55 * (1 - fly) + fly * flyPitch
    this.body.rotation.z = this.bank
    this.body.position.y = fly * flyPitch * 0.8

    // 尾焰：飞行时才有，推力大时更长
    for (const [index, flame] of this.flames.entries()) {
      flame.visible = fly > 0.05
      const flicker = 0.85 + Math.sin(this.time * 41 + index * 2.1) * 0.15
      flame.scale.set(fly, fly * flicker * (0.75 + flySpeed * 0.9), fly)
    }

    // 上台阶时脚下的高度是突变的，显示上平滑一下；跳跃和飞行不需要
    const y = state.position.y
    if (this.smoothY === null || !state.grounded) this.smoothY = y
    else this.smoothY += (y - this.smoothY) * blend(22, dt)
    this.root.position.set(state.position.x, this.smoothY, state.position.z)
    this.root.rotation.y = state.yaw
  }

  dispose(): void {
    this.root.removeFromParent()
    for (const geometry of this.geometries) geometry.dispose()
    for (const item of this.materials) item.dispose()
  }
}
