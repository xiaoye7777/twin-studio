const DOUBLE_TAP_SECONDS = 0.28
const HANDLED = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyF', 'KeyC'])

/** 键盘和鼠标。漫游时把这些按键截下来，编辑器的快捷键不会被触发。 */
export class WalkInput {
  private readonly keys = new Set<string>()
  private jumpPressed = false
  private flightPressed = false
  private lastSpace = -Infinity

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onLook: (dx: number, dy: number) => void,
    private readonly onZoom: (delta: number) => void,
    private readonly onExit: () => void,
  ) {}

  start(): void {
    window.addEventListener('keydown', this.down, true)
    window.addEventListener('keyup', this.up, true)
    window.addEventListener('blur', this.blur)
    window.addEventListener('mousemove', this.move, true)
    document.addEventListener('pointerlockchange', this.lockChange)
    this.canvas.addEventListener('wheel', this.wheel, { capture: true, passive: false })
    // 漫游时点击不再传给场景，否则会触发选中和交互
    for (const type of ['pointerdown', 'pointerup', 'pointermove', 'click', 'dblclick'] as const)
      this.canvas.addEventListener(type, this.swallow, true)
    void this.lock()
  }

  stop(): void {
    window.removeEventListener('keydown', this.down, true)
    window.removeEventListener('keyup', this.up, true)
    window.removeEventListener('blur', this.blur)
    window.removeEventListener('mousemove', this.move, true)
    document.removeEventListener('pointerlockchange', this.lockChange)
    this.canvas.removeEventListener('wheel', this.wheel, true)
    for (const type of ['pointerdown', 'pointerup', 'pointermove', 'click', 'dblclick'] as const)
      this.canvas.removeEventListener(type, this.swallow, true)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
    this.keys.clear()
  }

  /** 鼠标锁定失败（比如浏览器拒绝）时不算致命：还可以直接移动鼠标转视角。 */
  private async lock(): Promise<void> {
    try {
      await this.canvas.requestPointerLock()
    } catch {
      // 留在未锁定状态
    }
  }

  get sprint(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
  }
  get jumpHeld(): boolean {
    return this.keys.has('Space')
  }
  get descend(): boolean {
    return this.keys.has('KeyC')
  }
  get moveX(): number {
    return (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0)
  }
  get moveZ(): number {
    return (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0)
  }

  /** 这一帧的单次事件：读一次就清掉。 */
  consume(): { jumpPressed: boolean; toggleFlight: boolean } {
    const events = { jumpPressed: this.jumpPressed, toggleFlight: this.flightPressed }
    this.jumpPressed = false
    this.flightPressed = false
    return events
  }

  private readonly down = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      event.stopImmediatePropagation()
      event.preventDefault()
      this.onExit()
      return
    }
    if (!HANDLED.has(event.code)) return
    event.stopImmediatePropagation()
    event.preventDefault()
    if (event.repeat) return
    this.keys.add(event.code)
    if (event.code === 'KeyF') this.flightPressed = true
    if (event.code === 'Space') {
      const now = event.timeStamp / 1000
      if (now - this.lastSpace < DOUBLE_TAP_SECONDS) {
        this.flightPressed = true
        this.lastSpace = -Infinity
      } else {
        this.jumpPressed = true
        this.lastSpace = now
      }
    }
  }
  private readonly up = (event: KeyboardEvent): void => {
    if (!HANDLED.has(event.code)) return
    event.stopImmediatePropagation()
    this.keys.delete(event.code)
  }
  private readonly blur = (): void => this.keys.clear()
  private readonly move = (event: MouseEvent): void => {
    if (document.pointerLockElement === this.canvas || event.buttons === 0)
      this.onLook(event.movementX, event.movementY)
  }
  private readonly wheel = (event: WheelEvent): void => {
    event.preventDefault()
    event.stopImmediatePropagation()
    this.onZoom(event.deltaY)
  }
  private readonly swallow = (event: Event): void => {
    event.stopImmediatePropagation()
    // 锁定被取消后，再点一下画面重新锁定
    if (event.type === 'pointerdown' && document.pointerLockElement !== this.canvas) void this.lock()
  }
  private wasLocked = false
  private readonly lockChange = (): void => {
    const locked = document.pointerLockElement === this.canvas
    // 按 Esc 时浏览器自己解除锁定，通常不会发 keydown：解除锁定就是退出。
    if (this.wasLocked && !locked) this.onExit()
    this.wasLocked = locked
  }
}
