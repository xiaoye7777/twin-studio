import type { CameraBookmark, Tour } from '../../domain/scene'
import type { CameraView } from '../../engine/CameraRig'

export interface TourState {
  tourId: string | null
  tourName: string
  stepIndex: number
  stepCount: number
  playing: boolean
  paused: boolean
  caption: string
}

export const idleTourState = (): TourState => ({
  tourId: null,
  tourName: '',
  stepIndex: -1,
  stepCount: 0,
  playing: false,
  paused: false,
  caption: '',
})

/** What a tour needs from the scene it plays in. */
export interface TourHost {
  getTours(): readonly Tour[]
  getBookmarks(): readonly CameraBookmark[]
  /** Resolves true when the camera arrived, false when interrupted. */
  flyTo(view: CameraView, duration: number): Promise<boolean>
  frameNode(nodeId: string, duration: number): Promise<boolean>
  setNodeVisible(nodeId: string, visible: boolean): void
  /** Restores every visibility the tour changed. */
  restoreVisibility(): void
  setHighlight(nodeId: string | null): void
}

/**
 * Plays guided tours: each step flies to a bookmark (or frames a node), shows its caption, switches layers,
 * holds, then advances. Manual camera input stops the tour, so a presenter can take over at any moment.
 */
export class TourPlayer {
  private generation = 0
  private state: TourState = idleTourState()
  private resumeWaiters: Array<() => void> = []

  constructor(
    private readonly host: TourHost,
    private readonly onChange: (state: TourState) => void = () => {},
  ) {}

  getState(): TourState {
    return { ...this.state }
  }

  /** Starts (or restarts) a tour. Resolves when it ends, is stopped or replaced. */
  async play(tourId: string, from = 0): Promise<boolean> {
    const tour = this.host.getTours().find(item => item.id === tourId)
    if (!tour || !tour.steps.length) return false
    const generation = ++this.generation
    this.releaseWaiters()
    this.host.restoreVisibility()
    let index = Math.max(0, Math.min(from, tour.steps.length - 1))
    this.set({
      tourId,
      tourName: tour.name,
      stepIndex: index,
      stepCount: tour.steps.length,
      playing: true,
      paused: false,
    })
    for (;;) {
      const step = tour.steps[index]!
      this.set({ stepIndex: index, caption: step.caption })
      for (const id of step.show) this.host.setNodeVisible(id, true)
      for (const id of step.hide) this.host.setNodeVisible(id, false)
      this.host.setHighlight(step.highlightNodeId)
      const bookmark = step.bookmarkId ? this.host.getBookmarks().find(item => item.id === step.bookmarkId) : null
      let arrived = true
      if (bookmark) arrived = await this.host.flyTo(bookmark.view, step.duration)
      else if (step.nodeId) arrived = await this.host.frameNode(step.nodeId, step.duration)
      if (generation !== this.generation) return false
      if (!arrived && !this.state.paused) {
        // The user grabbed the camera: hand control back to them.
        this.finish(generation)
        return false
      }
      if (!(await this.hold(step.hold, generation))) return false
      index += 1
      if (index >= tour.steps.length) {
        if (!tour.loop) break
        index = 0
      }
    }
    this.finish(generation)
    return true
  }

  pause(): void {
    if (!this.state.playing || this.state.paused) return
    this.set({ paused: true })
  }

  resume(): void {
    if (!this.state.paused) return
    this.set({ paused: false })
    this.releaseWaiters()
  }

  stop(): void {
    if (!this.state.playing) return
    this.finish(++this.generation)
  }

  /** Jumps to a step of the current tour. */
  goTo(index: number): void {
    if (this.state.tourId) void this.play(this.state.tourId, index)
  }

  next(): void {
    if (this.state.tourId) this.goTo(this.state.stepIndex + 1 >= this.state.stepCount ? 0 : this.state.stepIndex + 1)
  }

  previous(): void {
    if (this.state.tourId) this.goTo(Math.max(0, this.state.stepIndex - 1))
  }

  dispose(): void {
    this.generation++
    this.releaseWaiters()
    this.state = idleTourState()
  }

  private finish(generation: number): void {
    if (generation !== this.generation) return
    this.generation++
    this.releaseWaiters()
    this.host.setHighlight(null)
    this.host.restoreVisibility()
    this.set(idleTourState())
  }

  /** Waits `seconds` of unpaused time; false if the tour was stopped meanwhile. */
  private async hold(seconds: number, generation: number): Promise<boolean> {
    let remaining = seconds * 1000
    while (remaining > 0) {
      if (generation !== this.generation) return false
      if (this.state.paused) {
        await new Promise<void>(resolve => this.resumeWaiters.push(resolve))
        continue
      }
      const slice = Math.min(remaining, 100)
      const started = performance.now()
      await new Promise(resolve => setTimeout(resolve, slice))
      if (!this.state.paused) remaining -= performance.now() - started
    }
    return generation === this.generation
  }

  private releaseWaiters(): void {
    const waiters = this.resumeWaiters
    this.resumeWaiters = []
    waiters.forEach(resolve => resolve())
  }

  private set(patch: Partial<TourState>): void {
    this.state = { ...this.state, ...patch }
    this.onChange(this.getState())
  }
}
