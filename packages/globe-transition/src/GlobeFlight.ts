import { EARTH_FOV, EarthScene } from './EarthScene'
import { fullEarthAltitude, hostPose, planFlight, sampleFlight, type FlightPlan } from './flightPlan'
import { formatPoint, type GeoPoint } from './geo'
import type { GlobeHost, GlobeSite, HostView } from './host'

/** 目标场景迟迟打不开时最多等这么久，然后也要把画面还给用户。 */
const LOAD_TIMEOUT = 25
/** 场景 ready 后模型还要流式加载一小会儿，再等等才开始俯冲。 */
const SETTLE_AFTER_READY = 0.7
/** 单帧最长推进这么多：加载造成主线程卡顿时动画放慢，而不是跳过一段。 */
const MAX_STEP = 1 / 24

export interface FlightOptions {
  host: GlobeHost
  from: GlobeSite & { point: GeoPoint }
  to: GlobeSite & { point: GeoPoint }
  /** 切换到目标项目的路由跳转。 */
  openProject(id: string): Promise<unknown>
}

function createLabel(accent: string): HTMLDivElement {
  const label = document.createElement('div')
  label.style.cssText =
    'position:absolute;left:0;top:0;padding-left:14px;border-left:2px solid ' +
    accent +
    ';color:#f1f7f8;font:600 15px/1.35 system-ui,sans-serif;white-space:nowrap;pointer-events:none;' +
    'text-shadow:0 1px 6px rgba(0,0,0,.85);opacity:0;will-change:transform'
  return label
}

function fillLabel(label: HTMLElement, site: GlobeSite & { point: GeoPoint }): void {
  const name = document.createElement('div')
  name.textContent = site.name
  const position = document.createElement('div')
  position.textContent = formatPoint(site.point)
  position.style.cssText = 'font:400 11px/1.4 ui-monospace,monospace;opacity:.72;letter-spacing:.04em'
  label.append(name, position)
}

/**
 * 一次切换的全过程。覆盖层挂在 body 上，所以路由切换、旧场景销毁都不影响它，
 * 目标项目的编辑器挂载后调用 `adopt` 接上，等它加载完再俯冲降落。
 */
export class GlobeFlight {
  private readonly overlay = document.createElement('div')
  private readonly canvas = document.createElement('canvas')
  private readonly status = document.createElement('div')
  private readonly fromLabel = createLabel('#e2f2f4')
  private readonly toLabel = createLabel('#5eead4')
  private readonly earth: EarthScene
  private plan: FlightPlan | null = null
  private clock = 0
  private lastFrame = 0
  private animation = 0
  private navigated = false
  private navigatedAt = 0
  private stopHostFrame: (() => void) | null = null
  private origin: HostView | null = null
  private landing: { host: GlobeHost; view: HostView | null; readyFor: number } | null = null
  private finished = false
  private readonly done: Promise<void>
  private resolveDone: () => void = () => {}

  constructor(private readonly options: FlightOptions) {
    this.done = new Promise(resolve => (this.resolveDone = resolve))
    this.overlay.dataset.testid = 'globe-flight'
    this.overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;overflow:hidden;cursor:progress'
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
    this.status.style.cssText =
      'position:absolute;left:50%;bottom:9%;transform:translateX(-50%);color:#cfe3e6;letter-spacing:.14em;' +
      'font:12px/1 system-ui,sans-serif;opacity:0;transition:opacity .5s;pointer-events:none'
    this.status.textContent = '正在载入场景'
    fillLabel(this.fromLabel, options.from)
    fillLabel(this.toLabel, options.to)
    this.overlay.append(this.canvas, this.fromLabel, this.toLabel, this.status)
    this.earth = new EarthScene(this.canvas)
  }

  get targetId(): string {
    return this.options.to.id
  }

  /** 贴图加载失败时抛错，调用方退回到直接跳转。 */
  async start(): Promise<void> {
    try {
      await this.earth.load()
    } catch (error) {
      this.earth.dispose()
      throw error
    }
    const { host, from, to } = this.options
    if (host.ui.saveState === 'unsaved') await host.save?.()
    document.body.append(this.overlay)
    window.addEventListener('resize', this.onResize)
    this.earth.setRoute(from.point, to.point)
    this.plan = planFlight(from.point, to.point, fullEarthAltitude(EARTH_FOV, window.innerWidth / window.innerHeight))
    this.origin = host.engine.rig.getView()
    host.engine.setCameraControlsEnabled(false)
    this.driveHost(host, this.origin, 'from')
    this.lastFrame = performance.now()
    this.animation = requestAnimationFrame(this.frame)
    return this.done
  }

  /** 新页面的编辑器打开时调用：目标场景从这里接入。 */
  adopt(host: GlobeHost): void {
    this.landing = { host, view: null, readyFor: 0 }
    host.engine.setCameraControlsEnabled(false)
    // 新场景加载期间相机随便放，覆盖层是不透明的；就绪后再定位。
  }

  private driveHost(host: GlobeHost, view: HostView, side: 'from' | 'to'): void {
    this.stopHostFrame?.()
    const camera = host.engine.camera
    this.stopHostFrame = host.engine.onFrame(() => {
      const ascent = this.plan && sampleFlight(this.plan, this.clock).ascent
      // 轮到另一边时这台相机停在最高点：目标相机落地前一直在云层上方
      const value = ascent?.side === side ? ascent.value : 1
      const pose = hostPose(view, value, camera.far)
      camera.position.set(...pose.position)
      camera.up.set(0, 1, 0)
      camera.lookAt(...pose.target)
    })
  }

  /** 目标场景是否可以开始降落。没接上时等到超时就放行，不能把用户困在地球上。 */
  private updateLanding(step: number): boolean {
    if (!this.navigated) return false
    const landing = this.landing
    if (!landing) return performance.now() - this.navigatedAt > LOAD_TIMEOUT * 1000
    if (landing.view) return true
    const { host } = landing
    if (host.ui.error) return true
    if (performance.now() - this.navigatedAt > LOAD_TIMEOUT * 1000) return true
    if (!host.ui.ready) return false
    if (host.ui.mode !== 'preview') host.enterPreview()
    landing.readyFor += step
    if (landing.readyFor < SETTLE_AFTER_READY) return false
    landing.view = host.engine.rig.getView()
    this.driveHost(host, landing.view, 'to')
    return true
  }

  private readonly frame = (now: number): void => {
    if (this.finished) return
    this.animation = requestAnimationFrame(this.frame)
    const plan = this.plan!
    const step = Math.min((now - this.lastFrame) / 1000, MAX_STEP)
    this.lastFrame = now
    const canLand = this.updateLanding(step)
    const next = this.clock + step
    this.clock = canLand ? next : Math.min(next, plan.holdAt)
    this.status.style.opacity = !canLand && this.clock >= plan.holdAt ? '1' : '0'

    const sample = sampleFlight(plan, this.clock)
    // 云已盖满画面、地球已接手，旧场景可以销毁了
    if (!this.navigated && this.clock >= plan.liftEnd) this.navigate()
    this.earth.setEarthVisible(sample.earthVisible)
    this.earth.setView(sample.center, sample.altitude)
    this.earth.setArcProgress(sample.arc)
    this.earth.setVeil(sample.veil)
    this.earth.render(step)
    this.placeLabel(this.fromLabel, this.options.from.point, sample.altitude, sample.earthVisible)
    this.placeLabel(this.toLabel, this.options.to.point, sample.altitude, sample.earthVisible)
    this.overlay.dataset.phase = sample.phase
    this.overlay.dataset.clock = this.clock.toFixed(2)
    this.overlay.style.pointerEvents = sample.phase === 'land' && sample.veil < 0.3 ? 'none' : 'auto'
    if (sample.phase === 'done') this.finish()
  }

  private placeLabel(label: HTMLElement, point: GeoPoint, altitude: number, earthVisible: boolean): void {
    const spot = this.earth.project(point)
    const shown = earthVisible && spot.visible && altitude > 0.5
    const opacity = shown ? Math.min(1, (altitude - 0.5) / 0.8) : 0
    label.style.opacity = opacity.toFixed(2)
    if (opacity > 0) label.style.transform = `translate(${spot.x + 16}px, ${spot.y - 22}px)`
  }

  private navigate(): void {
    this.navigated = true
    this.navigatedAt = performance.now()
    this.stopHostFrame?.()
    this.stopHostFrame = null
    // 路由失败时留在原场景：把它当作"目标"落回去，不把用户困住。
    this.options.openProject(this.options.to.id).catch(() => {
      if (!this.landing && this.origin) {
        this.landing = { host: this.options.host, view: this.origin, readyFor: 0 }
        this.driveHost(this.options.host, this.origin, 'to')
      }
    })
  }

  private finish(): void {
    this.finished = true
    cancelAnimationFrame(this.animation)
    window.removeEventListener('resize', this.onResize)
    this.stopHostFrame?.()
    const landing = this.landing
    if (landing) {
      const { engine } = landing.host
      if (landing.view) engine.rig.flyTo(landing.view, { duration: 0 })
      engine.setCameraControlsEnabled(true)
    }
    this.overlay.remove()
    this.earth.dispose()
    this.resolveDone()
  }

  private readonly onResize = (): void => this.earth.resize()
}
