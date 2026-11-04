/*
 * 模型动画：播放模型文件自带的动画片段，以及让部件旋转（如风机叶片），转速可以跟随设备变量。
 */
import {
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three'
import type { AnimationPlayMode } from '../../domain/interactions'
import type { ModelAnimation, PartMotion } from '../../domain/scene'

const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) } as const
/** 片段被打断或停止时，部件淡回原来姿态的时间。 */
const FADE_SECONDS = 0.3

/** 由交互触发的片段。 */
interface TriggeredClip {
  action: AnimationAction
  mode: AnimationPlayMode
  /** 往返切换时当前的方向。 */
  forward: boolean
}

/** 两个片段是否在动同一个属性：同时生效会被混合成中间值，所以不能并存。 */
function sharesProperty(a: AnimationClip, b: AnimationClip): boolean {
  const names = new Set(a.tracks.map(track => track.name))
  return b.tracks.some(track => names.has(track.name))
}

interface ActiveMotion {
  motion: PartMotion
  object: Object3D
  /** The part's orientation when configured; the spin is applied on top of it. */
  base: Quaternion
}

/**
 * Plays a model's animation clip and its procedural part motions. Part motions may take their speed from
 * a live device value, so a turbine spins as fast as the data says.
 * 交互还可以再触发别的片段（play）：它和配置的片段各放各的，风扇一边转，柜门一边开。
 */
export class ModelAnimator {
  private mixer: AnimationMixer | null = null
  private action: AnimationAction | null = null
  private signature = ''
  /** 配置的片段：交互用同一个片段接管过它之后，靠这里恢复。 */
  private base: { clip: string | null; loop: boolean; speed: number } = { clip: null, loop: true, speed: 1 }
  private readonly triggered = new Map<string, TriggeredClip>()
  /** 正在淡出的片段，淡完就彻底停掉，部件回到原来的姿态。 */
  private readonly fading = new Set<AnimationAction>()
  /** 倒放回起点的片段：mixer 更新途中不能停，等更新完再处理。 */
  private readonly rewound: AnimationAction[] = []
  private motions: ActiveMotion[] = []
  /** Spin angle per motion id, kept across reconfiguration so edits do not make parts jump. */
  private readonly angles = new Map<string, number>()
  private readonly spin = new Quaternion()

  constructor(
    private readonly root: Object3D,
    private readonly clips: readonly AnimationClip[],
  ) {}

  get clipNames(): string[] {
    return this.clips.map(clip => clip.name)
  }

  get active(): boolean {
    return this.action !== null || this.motions.length > 0 || this.triggered.size > 0 || this.fading.size > 0
  }

  /** Applies a node's settings. Call after the model's pose (overrides) has been applied. */
  configure(
    animation: ModelAnimation | undefined,
    motions: readonly PartMotion[] | undefined,
    parts: ReadonlyMap<string, Object3D>,
  ): void {
    // Without explicit settings a model plays its first clip, so animated deliveries just work.
    const clipName = animation === undefined ? (this.clips[0]?.name ?? null) : animation.clip
    const loop = animation?.loop ?? true
    const signature = JSON.stringify([clipName, loop])
    this.base = { clip: clipName, loop, speed: animation?.speed ?? 1 }
    if (signature !== this.signature) {
      this.signature = signature
      this.startBase()
    }
    if (this.action) this.action.timeScale = this.base.speed
    this.reset()
    this.motions = (motions ?? []).flatMap(motion => {
      const object = parts.get(motion.assetNodeId)
      return object ? [{ motion, object, base: object.quaternion.clone() }] : []
    })
    for (const id of [...this.angles.keys()])
      if (!this.motions.some(item => item.motion.id === id)) this.angles.delete(id)
  }

  private startBase(): void {
    this.action?.stop()
    this.action = null
    const clip = this.clips.find(item => item.name === this.base.clip)
    if (!clip) return
    this.action = this.mixerFor().clipAction(clip)
    this.action.setLoop(this.base.loop ? LoopRepeat : LoopOnce, Infinity)
    this.action.clampWhenFinished = true
    this.action.timeScale = this.base.speed
    this.action.reset().setEffectiveWeight(1).play()
    this.syncBase()
  }

  private mixerFor(): AnimationMixer {
    if (!this.mixer) {
      this.mixer = new AnimationMixer(this.root)
      this.mixer.addEventListener('finished', event => {
        if (event.direction < 0) this.rewound.push(event.action as AnimationAction)
      })
    }
    return this.mixer
  }

  /** 配置的片段和触发的片段动同一个属性时，先让位给触发的片段。 */
  private syncBase(): void {
    if (!this.action) return
    const clip = this.action.getClip()
    const blocked = [...this.triggered.values()].some(item => sharesProperty(clip, item.action.getClip()))
    this.action.setEffectiveWeight(blocked ? 0 : 1)
  }

  /** 触发一个片段。方式见 AnimationPlayMode；片段不存在时返回 false。 */
  play(clipName: string, mode: AnimationPlayMode): boolean {
    const clip = this.clips.find(item => item.name === clipName)
    if (!clip) return false
    const running = this.triggered.get(clipName)
    if (running?.mode === mode && mode === 'toggle') {
      running.forward = !running.forward
      running.action.timeScale = running.forward ? 1 : -1
      running.action.paused = false
      return true
    }
    if (running?.mode === mode && mode === 'loop') return this.stop(clipName)

    // 配置的就是这个片段：同一个片段只有一份播放状态，由交互接管，clearTriggered 时恢复。
    if (this.action?.getClip() === clip) {
      this.action.stop()
      this.action = null
    }
    let interrupted = false
    for (const [name, item] of this.triggered) {
      if (name === clipName || !sharesProperty(clip, item.action.getClip())) continue
      item.action.fadeOut(FADE_SECONDS)
      this.fading.add(item.action)
      this.triggered.delete(name)
      interrupted = true
    }
    const action = this.mixerFor().clipAction(clip)
    this.fading.delete(action)
    action.setLoop(mode === 'loop' ? LoopRepeat : LoopOnce, Infinity)
    action.clampWhenFinished = mode !== 'loop'
    action.timeScale = 1
    action.reset().setEffectiveWeight(1).play()
    if (interrupted) action.fadeIn(FADE_SECONDS)
    this.triggered.set(clipName, { action, mode, forward: true })
    this.syncBase()
    return true
  }

  /** 停止触发的片段（不给名字就全部），部件淡回原来的姿态。 */
  stop(clipName?: string): boolean {
    let stopped = false
    for (const [name, item] of this.triggered) {
      if (clipName && name !== clipName) continue
      item.action.fadeOut(FADE_SECONDS)
      this.fading.add(item.action)
      this.triggered.delete(name)
      stopped = true
    }
    this.syncBase()
    return stopped
  }

  /** 立刻清掉所有触发的片段（退出预览时），只留配置的片段。 */
  clearTriggered(): void {
    for (const item of this.triggered.values()) item.action.stop()
    for (const action of this.fading) action.stop()
    this.triggered.clear()
    this.fading.clear()
    this.rewound.length = 0
    if (this.action) this.syncBase()
    else if (this.base.clip !== null) this.startBase()
  }

  /** Puts spinning parts back to their unspun orientation (before the model's pose is re-applied). */
  reset(): void {
    for (const item of this.motions) item.object.quaternion.copy(item.base)
    this.motions = []
  }

  /** Advances clips and motions. `value` reads a live variable of the node's device. */
  update(delta: number, value: (variableKey: string) => unknown): void {
    this.mixer?.update(delta)
    this.settleTriggered()
    for (const item of this.motions) {
      const { speedVariable, factor, speed, axis } = item.motion
      const live = speedVariable ? value(speedVariable) : undefined
      const degreesPerSecond = typeof live === 'number' && Number.isFinite(live) ? live * factor : speed
      const angle = ((this.angles.get(item.motion.id) ?? 0) + degreesPerSecond * delta) % 360
      this.angles.set(item.motion.id, angle)
      this.spin.setFromAxisAngle(AXES[axis], (angle * Math.PI) / 180)
      item.object.quaternion.copy(item.base).multiply(this.spin)
    }
  }

  /** 倒放回起点、淡出完成的片段彻底停掉：不再占用更新，部件回到原来的姿态。 */
  private settleTriggered(): void {
    for (const action of this.rewound.splice(0)) {
      for (const [name, item] of this.triggered) {
        if (item.action !== action) continue
        action.stop()
        this.triggered.delete(name)
        this.syncBase()
      }
    }
    for (const action of this.fading) {
      if (action.enabled) continue
      action.stop()
      this.fading.delete(action)
    }
  }

  dispose(): void {
    this.reset()
    this.angles.clear()
    this.triggered.clear()
    this.fading.clear()
    this.rewound.length = 0
    this.mixer?.stopAllAction()
    this.mixer?.uncacheRoot(this.root)
    this.mixer = null
    this.action = null
  }
}
