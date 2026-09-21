import { reactive } from 'vue'
import { EffectRuntime } from '@/runtime/effects/EffectRuntime'
import type { Object3D } from 'three'
import type { TwinBindingTarget } from '@/domain/twin'
import type { SceneRepository } from '@/infrastructure/scenes/SceneRepository'
import type { AssetRepository } from '@/infrastructure/assets'
import { MeteorScene } from '@/infrastructure/meteor3d'
import { SceneRuntimeLoader } from '@/runtime/scene/SceneRuntimeLoader'
import { BindingTargetResolver } from '@/editor/services/BindingTargetResolver'
import { createTwinState } from './createTwinState'
import { TwinDataRuntime } from './TwinDataRuntime'
import { ViewerPointerEvents, type ViewerTargetClick } from './ViewerPointerEvents'

/** One independent runtime session per Viewer; repositories are injected. */
export class TwinSceneRuntime {
  readonly twin = reactive(createTwinState())
  readonly meteor: MeteorScene
  readonly loader: SceneRuntimeLoader
  roots: Object3D[] = []
  private readonly resolver: BindingTargetResolver
  private readonly data: TwinDataRuntime
  private pointers: ViewerPointerEvents | null = null
  private disposed = false
  private started = false
  effects: EffectRuntime | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly scenes: SceneRepository,
    assets: AssetRepository,
    private readonly onClick: (event: ViewerTargetClick) => void,
  ) {
    this.meteor = new MeteorScene(canvas)
    this.loader = new SceneRuntimeLoader(this.meteor, assets)
    this.resolver = new BindingTargetResolver(() => this.roots, this.meteor)
    this.data = new TwinDataRuntime(this.twin, this.resolver)
  }

  async load(projectId: string): Promise<string[]> {
    if (this.started || this.disposed) throw new Error('Runtime session already used')
    this.started = true
    try {
      const document = await this.scenes.load(projectId)
      if (this.disposed) return []
      if (!document) throw new Error('该项目尚未保存场景，请先在 Editor 中保存')
      await this.meteor.initialize()
      if (this.disposed) return []
      const restored = await this.loader.restore(document)
      if (this.disposed) return []
      this.roots = restored.roots
      this.effects = new EffectRuntime(this.meteor, () => this.roots)
      this.effects.setEffects(document.effects ?? [])
      this.data.initialize(projectId, document.bindings ?? [])
      this.data.start()
      this.pointers = new ViewerPointerEvents(this.canvas, this.meteor, this.roots, this.twin, this.onClick)
      const unresolved = this.twin.bindings.filter((binding) => this.twin.resolutionByBindingId[binding.id] === 'unresolved')
      return [...restored.warnings, ...unresolved.map((binding) => `设备绑定未解析: ${binding.device.id}`)]
    } catch (error) {
      this.dispose()
      throw error
    }
  }

  getRuntimeObject(target: TwinBindingTarget): Object3D | null {
    return this.disposed ? null : this.resolver.resolve(target)
  }
  async focusTarget(target: TwinBindingTarget): Promise<boolean> {
    const object = this.getRuntimeObject(target)
    const bid: unknown = object?.userData.bid
    if (typeof bid !== 'string') return false
    await this.meteor.focusObject(bid)
    return true
  }
  async focusDevice(deviceId: string): Promise<boolean> {
    const binding = this.twin.bindings.find((item) => item.device.id === deviceId && this.twin.resolutionByBindingId[item.id] === 'resolved')
    return binding ? this.focusTarget(binding.target) : false
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.data.stop()
    this.effects?.dispose()
    this.effects = null
    this.pointers?.dispose()
    this.pointers = null
    this.loader.dispose()
    this.meteor.dispose()
    this.roots = []
    if (this.twin.projectId) this.twin.resetProject(this.twin.projectId)
  }
}
