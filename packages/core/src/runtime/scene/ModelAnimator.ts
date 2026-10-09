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
import type { ModelAnimation, PartMotion } from '../../domain/scene'

const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) } as const

interface ActiveMotion {
  motion: PartMotion
  object: Object3D
  /** The part's orientation when configured; the spin is applied on top of it. */
  base: Quaternion
}

/**
 * Plays a model's animation clip and its procedural part motions. Part motions may take their speed from
 * a live device value, so a turbine spins as fast as the data says.
 */
export class ModelAnimator {
  private mixer: AnimationMixer | null = null
  private action: AnimationAction | null = null
  private signature = ''
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
    return this.action !== null || this.motions.length > 0
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
    if (signature !== this.signature) {
      this.signature = signature
      this.action?.stop()
      this.action = null
      const clip = clipName === null ? undefined : this.clips.find(item => item.name === clipName)
      if (clip) {
        this.mixer ??= new AnimationMixer(this.root)
        this.action = this.mixer.clipAction(clip)
        this.action.setLoop(loop ? LoopRepeat : LoopOnce, Infinity)
        this.action.clampWhenFinished = true
        this.action.reset().play()
      }
    }
    if (this.action) this.action.timeScale = animation?.speed ?? 1
    this.reset()
    this.motions = (motions ?? []).flatMap(motion => {
      const object = parts.get(motion.assetNodeId)
      return object ? [{ motion, object, base: object.quaternion.clone() }] : []
    })
    for (const id of [...this.angles.keys()])
      if (!this.motions.some(item => item.motion.id === id)) this.angles.delete(id)
  }

  /** Puts spinning parts back to their unspun orientation (before the model's pose is re-applied). */
  reset(): void {
    for (const item of this.motions) item.object.quaternion.copy(item.base)
    this.motions = []
  }

  /** Advances clips and motions. `value` reads a live variable of the node's device. */
  update(delta: number, value: (variableKey: string) => unknown): void {
    this.mixer?.update(delta)
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

  dispose(): void {
    this.reset()
    this.angles.clear()
    this.mixer?.stopAllAction()
    this.mixer?.uncacheRoot(this.root)
    this.mixer = null
    this.action = null
  }
}
