import type { Object3D, PerspectiveCamera, Scene } from 'three'
import { Character } from './Character'
import { CharacterController, TUNING, type Vec3 } from './CharacterController'
import { SceneCollider } from './SceneCollider'
import { ThirdPersonCamera } from './ThirdPersonCamera'
import { WalkInput } from './WalkInput'

/**
 * 插件需要宿主提供的全部东西。这是结构类型：项目的 TwinEngine 不用改就符合，插件也不用引用它。
 */
export interface WalkModeHost {
  scene: Scene
  camera: PerspectiveCamera
  canvas: HTMLCanvasElement
  /** 场景内容的根节点：碰撞只测这里面的网格。 */
  content: Object3D
  onFrame(listener: (delta: number, elapsed: number) => void): () => void
  setCameraControlsEnabled(enabled: boolean): void
  isCameraControlsEnabled(): boolean
  /** 可选：把宿主自己的相机控制器同步到当前视角（阴影范围跟着走，退出时画面也不跳）。 */
  rig?: { controls: { setLookAt(...args: [number, number, number, number, number, number, boolean]): unknown } }
}

const FALL_LIMIT = -60
const CLEARANCE = 5

/** 把控制器、相机、人物和输入接起来。`start` 进入，`stop` 完整还原，不在场景里留下任何东西。 */
export class WalkMode {
  private controller: CharacterController | null = null
  private view: ThirdPersonCamera | null = null
  private character: Character | null = null
  private collider: SceneCollider | null = null
  private input: WalkInput | null = null
  private stopFrame: (() => void) | null = null
  private controlsWereEnabled = true
  private spawn: Vec3 = { x: 0, y: 0, z: 0 }

  constructor(
    private readonly host: WalkModeHost,
    /** 退出时通知（Esc、鼠标解除锁定）。 */
    private readonly onStop: () => void = () => {},
  ) {}

  get active(): boolean {
    return this.controller !== null
  }

  /** 给测试和调试看的当前状态。 */
  get state(): CharacterController | null {
    return this.controller
  }

  start(): void {
    if (this.active) return
    const { host } = this
    this.controlsWereEnabled = host.isCameraControlsEnabled()
    host.setCameraControlsEnabled(false)
    const collider = new SceneCollider(() => host.content)
    this.collider = collider
    this.spawn = this.findSpawn(collider)
    collider.update(0, this.spawn)
    const controller = new CharacterController(collider.castRay, this.spawn)
    this.controller = controller
    const view = new ThirdPersonCamera(host.camera, collider.castFar)
    view.startFrom(this.spawn)
    this.view = view
    controller.yaw = view.yaw + Math.PI
    this.character = new Character()
    host.scene.add(this.character.root)
    this.input = new WalkInput(
      host.canvas,
      (dx, dy) => view.look(dx, dy),
      delta => view.zoom(delta),
      () => this.stop(),
    )
    this.input.start()
    this.stopFrame = host.onFrame(delta => this.frame(delta))
  }

  /** 出生点：画面中心看到的地方，从高处往下找地面。 */
  private findSpawn(collider: SceneCollider): Vec3 {
    const { camera } = this.host
    collider.update(1, { x: 0, y: 0, z: 0 })
    const forward = camera.getWorldDirection(camera.position.clone())
    const hit = collider.castFar(camera.position, forward, 2000)
    const x = hit ? camera.position.x + forward.x * hit.distance : camera.position.x
    const z = hit ? camera.position.z + forward.z * hit.distance : camera.position.z
    // 从这里向外绕圈，找第一块周围够空旷的地面：别一出生就卡在设备中间，相机也有地方放
    for (let ring = 0; ring <= 10; ring++) {
      const steps = ring === 0 ? 1 : ring * 6
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2
        const spot = { x: x + Math.cos(angle) * ring * 3, z: z + Math.sin(angle) * ring * 3 }
        const y = this.openGround(collider, spot.x, spot.z)
        if (y !== null) return { x: spot.x, y: y + 0.05, z: spot.z }
      }
    }
    return { x, y: 2, z }
  }

  /** 这里的地面高度；周围 CLEARANCE 米内有东西挡着就返回 null。 */
  private openGround(collider: SceneCollider, x: number, z: number): number | null {
    collider.update(0, { x, y: 0, z })
    const ground = collider.castFar({ x, y: 300, z }, { x: 0, y: -1, z: 0 }, 600)
    if (!ground) return null
    const y = 300 - ground.distance
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      const direction = { x: Math.cos(angle), y: 0, z: Math.sin(angle) }
      if (collider.castFar({ x, y: y + 1.2, z }, direction, CLEARANCE)) return null
    }
    return y
  }

  private frame(delta: number): void {
    const { controller, view, character, collider, input } = this
    if (!controller || !view || !character || !collider || !input) return
    if (!this.host.canvas.isConnected) return this.stop()
    const dt = Math.min(delta, 0.1)
    collider.update(dt, controller.position)
    const events = input.consume()
    controller.update(dt, {
      x: input.moveX,
      z: input.moveZ,
      sprint: input.sprint,
      jumpHeld: input.jumpHeld,
      jumpPressed: events.jumpPressed,
      descend: input.descend,
      toggleFlight: events.toggleFlight,
      yaw: view.yaw,
      pitch: view.pitch,
    })
    if (controller.position.y < FALL_LIMIT) controller.teleport(this.spawn)
    character.update(dt, controller)
    const top = controller.flying ? TUNING.flyBoostSpeed : TUNING.sprintSpeed
    const ratio = Math.max(0, (controller.horizontalSpeed - TUNING.walkSpeed) / (top - TUNING.walkSpeed))
    view.update(dt, controller.position, Math.min(1, ratio), controller.flying)
    this.host.rig?.controls.setLookAt(
      view.position.x,
      view.position.y,
      view.position.z,
      view.target.x,
      view.target.y,
      view.target.z,
      false,
    )
  }

  stop(): void {
    if (!this.active) return
    this.stopFrame?.()
    this.stopFrame = null
    this.input?.stop()
    this.input = null
    this.view?.restore()
    this.view = null
    this.character?.dispose()
    this.character = null
    this.collider = null
    this.controller = null
    this.host.setCameraControlsEnabled(this.controlsWereEnabled)
    this.onStop()
  }
}
