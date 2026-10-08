import { reactive } from 'vue'
import type { Object3D } from 'three'
import { EffectRuntime } from '../effects/EffectRuntime'
import { type RuleDiagnostic, VisualRuleRuntime } from '../effects/VisualRuleRuntime'
import { twinBindingTargetKey, type TwinBindingTarget } from '../../domain/twin'
import type { SceneDocumentV2 } from '../../domain/scene'
import type {
  TwinSceneViewerEvents,
  ViewerAlarm,
  ViewerBookmark,
  ViewerDiagnostics,
  ViewerHoverEvent,
  ViewerInteractionEvent,
  ViewerNode,
  ViewerPerformance,
  ViewerQuality,
  ViewerSelection,
  ViewerTour,
  ViewerTourState,
} from '../../contract/viewerContract'
import { createViewerRuntimeState } from './viewerRuntimeState'
import type { SceneRepository } from '../../infrastructure/scenes/SceneRepository'
import type { AssetRepository } from '../../infrastructure/assets/AssetRepository'
import { TwinEngine } from '../../engine/TwinEngine'
import { SceneSync } from '../scene/SceneSync'
import { BindingTargetResolver, bindingTargetFromObject } from './BindingTargetResolver'
import { createTwinState } from './createTwinState'
import { TwinDataRuntime } from './TwinDataRuntime'
import { ViewerPointerEvents, type ViewerTargetClick } from './ViewerPointerEvents'
import { InteractionRuntime } from '../interactions/InteractionRuntime'
import { RuntimeVisibilityLayer } from '../interactions/runtimeVisibility'
import { TourPlayer } from '../tour/TourPlayer'
import { createEffect } from '../../domain/effects'
import { formatRuntimeValue } from './formatValue'

export interface TwinSceneRuntimeOptions {
  quality?: ViewerQuality
  onTourChange?: (state: ViewerTourState) => void
  onAlarmChange?: (alarms: ViewerAlarm[]) => void
  onHoverChange?: (event: ViewerHoverEvent) => void
  /** Kiosk mode: play the project's autoplay tour after this many idle seconds (overrides the project). */
  idleSeconds?: number
}

const IDLE_EVENTS = ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const

/** One independent runtime session per Viewer; repositories are injected. */
export class TwinSceneRuntime {
  readonly twin = reactive(createTwinState())
  readonly runtimeState = createViewerRuntimeState(this.twin)
  private selection: ViewerSelection = null
  readonly engine: TwinEngine
  readonly sync: SceneSync
  roots: Object3D[] = []
  document: SceneDocumentV2 | null = null
  private readonly resolver: BindingTargetResolver
  private readonly data: TwinDataRuntime
  private readonly visibility = new RuntimeVisibilityLayer()
  private pointers: ViewerPointerEvents | null = null
  private disposed = false
  private started = false
  private alarms: ViewerAlarm[] = []
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private tourFromIdle = false
  effects: EffectRuntime | null = null
  visualRules: VisualRuleRuntime | null = null
  interactions: InteractionRuntime | null = null
  readonly tours: TourPlayer

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly scenes: SceneRepository,
    assets: AssetRepository,
    private readonly onClick: (event: ViewerTargetClick) => void,
    private readonly onSelectionChange: (selection: ViewerSelection) => void = () => {},
    private readonly onInteractionEvent: (event: ViewerInteractionEvent) => void = () => {},
    private readonly options: TwinSceneRuntimeOptions = {},
  ) {
    this.engine = new TwinEngine(canvas, { quality: options.quality ?? 'auto' })
    this.sync = new SceneSync(this.engine, assets)
    this.resolver = new BindingTargetResolver(id => this.sync.objectFor(id))
    this.data = new TwinDataRuntime(this.twin, this.resolver)
    this.tours = new TourPlayer(
      {
        getTours: () => this.document?.tours ?? [],
        getBookmarks: () => this.document?.bookmarks ?? [],
        flyTo: (view, duration) => this.engine.flyTo(view, duration),
        frameNode: (id, duration) => {
          const object = this.sync.objectFor(id)
          return object ? this.engine.focus(object, duration) : Promise.resolve(true)
        },
        setNodeVisible: (id, visible) => void this.setNodeVisible(id, visible),
        restoreVisibility: () => this.visibility.dispose(),
        setHighlight: id => {
          const effect = id ? createEffect('outline', { type: 'node', nodeId: id }) : null
          if (effect) this.effects?.setTransientEffects('tour', [{ ...effect, id: 'tour:highlight' }])
          else this.effects?.clearTransientEffects('tour')
        },
      },
      state => {
        if (!state.playing) this.tourFromIdle = false
        if (!this.disposed) this.options.onTourChange?.(state)
      },
    )
  }

  /** Kept for callers that still read the engine under its previous name. */
  get meteor(): TwinEngine {
    return this.engine
  }

  async load(projectId: string): Promise<string[]> {
    if (this.started || this.disposed) throw new Error('Runtime session already used')
    this.started = true
    try {
      const document = await this.scenes.load(projectId)
      if (this.disposed) return []
      if (!document) throw new Error('该项目尚未保存场景，请先在 Editor 中保存')
      this.document = document
      const { warnings } = await this.sync.mount(document)
      if (this.disposed) return []
      this.roots = this.sync.roots
      this.effects = new EffectRuntime(this.engine, this.resolver)
      this.effects.dataProvider = (target, variables) => this.deviceLines(target, variables)
      this.data.initialize(projectId, document.bindings)
      this.visualRules = new VisualRuleRuntime(
        this.effects,
        this.twin,
        this.resolver,
        () => document.visualRules,
        () => document.effects,
        () => 0,
        diagnostics => this.publishAlarms(diagnostics),
      )
      this.interactions = new InteractionRuntime({
        resolver: this.resolver,
        effects: this.effects,
        selectTarget: target => this.selectTarget(target),
        clearSelection: () => this.clearSelection(),
        focusTarget: target => this.focusTarget(target),
        resolveDeviceId: target => this.twin.getBindingByTarget(target)?.device.id ?? null,
        emit: event => {
          if (!this.disposed) this.onInteractionEvent(event)
        },
        flyToBookmark: id => this.flyToBookmark(id),
        playTour: id => void this.playTour(id),
        stopTour: () => this.tours.stop(),
      })
      this.interactions.setInteractions(document.interactions)
      this.interactions.setPointerActive(true)
      this.data.start(document.dataSources)
      this.pointers = new ViewerPointerEvents(
        this.canvas,
        this.engine,
        () => this.roots,
        this.twin,
        event => {
          if (this.disposed) return
          this.selectTarget(event.target)
          if (!this.disposed) this.onClick(event)
          void this.interactions?.dispatch('click', event)
        },
        () => this.clearSelection(),
        event => {
          this.selectTarget(event.target)
          void this.interactions?.dispatch('double-click', event)
        },
        event => {
          this.emitHover(event)
          void this.interactions?.dispatch('hover-enter', event)
        },
        event => {
          this.emitHover(null)
          void this.interactions?.dispatch('hover-leave', event)
        },
      )
      this.engine.rig.autoRotateSpeed = 0
      for (const type of IDLE_EVENTS) this.canvas.addEventListener(type, this.onUserInput, { passive: true })
      this.scheduleIdle()
      const unresolved = this.twin.bindings.filter(
        binding => this.twin.resolutionByBindingId[binding.id] === 'unresolved',
      )
      return [...warnings, ...unresolved.map(binding => `设备绑定未解析: ${binding.device.id}`)]
    } catch (error) {
      this.dispose()
      throw error
    }
  }

  getRuntimeObject(target: TwinBindingTarget): Object3D | null {
    return this.disposed ? null : this.resolver.resolve(target)
  }
  getSelection(): ViewerSelection {
    return this.selection
  }

  selectDevice(deviceId: string): boolean {
    if (this.disposed) return false
    const binding = this.twin.bindings.find(item => item.device.id === deviceId && this.resolver.resolve(item.target))
    return binding ? this.selectTarget(binding.target) : false
  }

  selectTarget(target: TwinBindingTarget): boolean {
    let object = this.getRuntimeObject(target)
    if (!object) return false
    const selected = object
    let binding = null
    while (object) {
      const identity = bindingTargetFromObject(object)
      binding = identity ? this.twin.getBindingByTarget(identity) : null
      if (binding || this.roots.includes(object)) break
      object = object.parent
    }
    this.engine.setOutlined('selection', [selected])
    this.setSelection(
      Object.freeze({
        target: Object.freeze({ ...target }),
        bindingTarget: binding ? Object.freeze({ ...binding.target }) : null,
        bindingId: binding?.id ?? null,
        deviceId: binding?.device.id ?? null,
        deviceName: binding?.device.name ?? null,
      }),
    )
    return true
  }

  clearSelection(): void {
    if (!this.disposed) this.engine.setOutlined('selection', [])
    this.setSelection(null)
  }

  private setSelection(next: ViewerSelection): void {
    if (this.disposed) return
    const before = this.selection
    if (
      before === next ||
      (before &&
        next &&
        twinBindingTargetKey(before.target) === twinBindingTargetKey(next.target) &&
        before.bindingId === next.bindingId &&
        before.deviceId === next.deviceId &&
        before.deviceName === next.deviceName)
    )
      return
    this.selection = next
    this.onSelectionChange(next)
  }

  async focusTarget(target: TwinBindingTarget): Promise<boolean> {
    const object = this.getRuntimeObject(target)
    if (!object) return false
    await this.engine.focus(object)
    return true
  }

  async focusDevice(deviceId: string): Promise<boolean> {
    const binding = this.twin.bindings.find(
      item => item.device.id === deviceId && this.twin.resolutionByBindingId[item.id] === 'resolved',
    )
    return binding ? this.focusTarget(binding.target) : false
  }

  // ---------------------------------------------------------------- views and tours

  getBookmarks(): ViewerBookmark[] {
    return (this.document?.bookmarks ?? []).map(({ id, name }) => ({ id, name }))
  }

  flyToBookmark(bookmarkId: string, duration = 1.2): Promise<boolean> {
    const bookmark = this.document?.bookmarks.find(item => item.id === bookmarkId)
    return bookmark ? this.engine.flyTo(bookmark.view, duration) : Promise.resolve(false)
  }

  resetView(duration = 1): Promise<boolean> {
    const view = this.document?.cameraView
    return view ? this.engine.flyTo(view, duration) : this.engine.fitAll(duration)
  }

  getTours(): ViewerTour[] {
    return (this.document?.tours ?? []).map(tour => ({
      id: tour.id,
      name: tour.name,
      stepCount: tour.steps.length,
      loop: tour.loop,
    }))
  }

  playTour(tourId: string, fromStep = 0): Promise<boolean> {
    this.cancelIdle()
    return this.tours.play(tourId, fromStep)
  }

  getNodes(): ViewerNode[] {
    return (this.document?.nodes ?? []).map(node => ({
      id: node.id,
      name: node.name,
      kind: node.kind,
      parentId: node.parentId,
      visible: this.sync.objectFor(node.id)?.visible ?? node.visible,
    }))
  }

  setNodeVisible(nodeId: string, visible: boolean): boolean {
    const object = this.sync.objectFor(nodeId)
    if (!object) return false
    this.visibility.set(object, visible)
    return true
  }

  getAlarms(): ViewerAlarm[] {
    return this.alarms.map(alarm => ({ ...alarm }))
  }

  setQuality(quality: ViewerQuality): void {
    this.engine.setQuality(quality)
  }

  getPerformance(): ViewerPerformance {
    const { fps, quality, setting, pixelRatio } = this.engine.getStats()
    return { fps, quality, setting, pixelRatio }
  }

  screenshot(): Promise<Blob | null> {
    return this.engine.screenshot()
  }

  // ---------------------------------------------------------------- data

  private deviceLines(target: TwinBindingTarget, variables?: readonly string[]) {
    const binding = this.twin.getBindingByTarget(target)
    if (!binding) return null
    const shown = variables?.length
      ? binding.variables.filter(variable => variables.includes(variable.key))
      : binding.variables
    return {
      title: binding.device.name || binding.device.id,
      rows: shown.slice(0, 8).map(variable => {
        const value = this.twin.getRuntimeValue(binding.id, variable.key)?.value
        return `${variable.name || variable.key}\t${formatRuntimeValue(value, variable.unit)}`
      }),
    }
  }

  private publishAlarms(diagnostics: Record<string, RuleDiagnostic>): void {
    const rules = this.document?.visualRules ?? []
    const alarms: ViewerAlarm[] = []
    for (const rule of rules) {
      if (diagnostics[rule.id]?.status !== 'active') continue
      const binding = this.twin.getBindingById(rule.bindingId)
      alarms.push({
        ruleId: rule.id,
        bindingId: rule.bindingId,
        deviceId: binding?.device.id ?? null,
        deviceName: binding?.device.name ?? null,
        variableKey: rule.variableKey,
        value: this.twin.getRuntimeValue(rule.bindingId, rule.variableKey)?.value ?? null,
      })
    }
    const key = (list: ViewerAlarm[]) => list.map(alarm => alarm.ruleId).join('|')
    if (key(alarms) === key(this.alarms)) return
    this.alarms = alarms
    if (!this.disposed) this.options.onAlarmChange?.(this.getAlarms())
  }

  private emitHover(event: ViewerTargetClick | null): void {
    if (this.disposed) return
    this.options.onHoverChange?.({
      target: event ? Object.freeze({ ...event.target }) : null,
      deviceId: event?.device?.id ?? null,
      deviceName: event?.device?.name ?? null,
    })
  }

  // ---------------------------------------------------------------- kiosk idle behaviour

  private idleSeconds(): number {
    return this.options.idleSeconds ?? this.document?.presentation.idleSeconds ?? 0
  }

  private scheduleIdle(): void {
    this.cancelIdle()
    const seconds = this.idleSeconds()
    const presentation = this.document?.presentation
    if (!seconds || !presentation || this.disposed) return
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      if (this.disposed || this.tours.getState().playing) return
      if (presentation.autoplayTourId) {
        this.tourFromIdle = true
        void this.tours.play(presentation.autoplayTourId)
      } else if (presentation.autoRotate) this.engine.rig.autoRotateSpeed = 4
    }, seconds * 1000)
  }

  private cancelIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  private readonly onUserInput = (): void => {
    this.engine.rig.autoRotateSpeed = 0
    if (this.tourFromIdle) this.tours.stop()
    this.scheduleIdle()
  }

  getDiagnostics(): ViewerDiagnostics {
    const rules = this.visualRules?.getDiagnostics()
    const effects = this.effects?.getDiagnostics()
    return {
      dataSource: {
        type: this.twin.dataSourceType,
        status: this.twin.dataSourceStatus,
        messageCount: this.twin.dataSourceMessageCount,
        error: this.twin.dataSourceError,
      },
      visualRules: { activations: rules?.activations ?? 0, activeRules: rules?.activeRules ?? 0 },
      effects: {
        effects: effects?.effects ?? 0,
        transientOwners: effects?.transientOwners ?? 0,
        helpers: effects?.helpers ?? 0,
        outlined: effects?.outlined ?? 0,
      },
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cancelIdle()
    for (const type of IDLE_EVENTS) this.canvas.removeEventListener(type, this.onUserInput)
    this.tours.dispose()
    this.selection = null
    this.pointers?.dispose()
    this.pointers = null
    this.interactions?.dispose()
    this.interactions = null
    this.visualRules?.dispose()
    this.visualRules = null
    this.data.stop()
    this.effects?.dispose()
    this.effects = null
    this.visibility.dispose()
    this.sync.dispose()
    this.engine.dispose()
    this.roots = []
    if (this.twin.projectId) this.twin.resetProject(this.twin.projectId)
  }
}

export type { TwinSceneViewerEvents }
