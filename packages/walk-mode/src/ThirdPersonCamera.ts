import type { PerspectiveCamera } from 'three'
import { type CastRay, type Vec3, TUNING } from './CharacterController'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const blend = (response: number, dt: number) => 1 - Math.exp(-response * dt)

const MIN_PITCH = -0.45
const MAX_PITCH = 1.3
const MIN_DISTANCE = 2.2
const MAX_DISTANCE = 22
const SENSITIVITY = 0.0023

/**
 * 第三人称跟随相机。鼠标直接转视角，不加平滑（否则会觉得飘）；
 * 跟随点水平跟得紧、竖直稍慢，跳起来时画面不会一抖一抖。有东西挡住就把相机拉近，拉近快、退回慢。
 */
export class ThirdPersonCamera {
  yaw = 0
  /** 0 水平，正值从上往下看。 */
  pitch = 0.28
  readonly position: Vec3 = { x: 0, y: 0, z: 0 }
  readonly target: Vec3 = { x: 0, y: 0, z: 0 }
  private distanceWanted = 7
  private distance = 7
  private pulled = 7
  private baseFov: number
  private fov: number
  private readonly follow: Vec3 = { x: 0, y: 0, z: 0 }

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly castRay: CastRay,
  ) {
    this.baseFov = camera.fov
    this.fov = camera.fov
  }

  /** 从当前画面的朝向开始，进入时镜头不会突然转向。 */
  startFrom(character: Vec3): void {
    const { x, y, z } = this.camera.position
    this.yaw = Math.atan2(x - character.x, z - character.z)
    this.pitch = clamp(Math.atan2(y - character.y, Math.hypot(x - character.x, z - character.z)), 0.1, 0.7)
    Object.assign(this.follow, character)
    this.follow.y += TUNING.height * 0.72
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx * SENSITIVITY
    this.pitch = clamp(this.pitch + dy * SENSITIVITY, MIN_PITCH, MAX_PITCH)
  }

  zoom(delta: number): void {
    this.distanceWanted = clamp(this.distanceWanted * Math.exp(delta * 0.001), MIN_DISTANCE, MAX_DISTANCE)
  }

  update(dt: number, character: Vec3, speedRatio: number, flying: boolean): void {
    const wantedY = character.y + TUNING.height * 0.72
    const horizontal = blend(26, dt)
    this.follow.x += (character.x - this.follow.x) * horizontal
    this.follow.z += (character.z - this.follow.z) * horizontal
    this.follow.y += (wantedY - this.follow.y) * blend(flying ? 18 : 11, dt)

    this.distance += (this.distanceWanted + speedRatio * 1.2 - this.distance) * blend(6, dt)
    const cosPitch = Math.cos(this.pitch)
    const direction = {
      x: Math.sin(this.yaw) * cosPitch,
      y: Math.sin(this.pitch),
      z: Math.cos(this.yaw) * cosPitch,
    }
    const hit = this.castRay(this.follow, direction, this.distance + 0.4)
    const free = hit ? Math.max(MIN_DISTANCE * 0.4, hit.distance - 0.3) : this.distance
    this.pulled = free < this.pulled ? free : this.pulled + (free - this.pulled) * blend(5, dt)

    this.position.x = this.follow.x + direction.x * this.pulled
    this.position.y = Math.max(this.follow.y + direction.y * this.pulled, 0.25)
    this.position.z = this.follow.z + direction.z * this.pulled
    Object.assign(this.target, this.follow)

    this.camera.position.set(this.position.x, this.position.y, this.position.z)
    this.camera.lookAt(this.follow.x, this.follow.y, this.follow.z)
    // 疾跑时视野略微拉宽，速度感来自这里
    const wantedFov = this.baseFov + speedRatio * 7
    this.fov += (wantedFov - this.fov) * blend(5, dt)
    this.camera.fov = this.fov
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
  }

  restore(): void {
    this.camera.fov = this.baseFov
    this.camera.updateProjectionMatrix()
  }
}
