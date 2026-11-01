import type { TwinBinding, TwinRuntimeValueData } from '../../domain/twin'
import type { DataSource, DataSourceConnectionStatus } from './DataSource'
import { mapWebSocketDeviceMessage, subscriptionMessage } from './WebSocketDataSource'

export interface HttpPollingDataSourceOptions {
  url: string
  method: 'GET' | 'POST'
  /** 秒。 */
  interval: number
  /** 设备消息在返回值中的位置，如 data.list。 */
  resultPath: string
  /** POST 请求体；留空时发送本场景需要的设备清单（与 WebSocket 的订阅消息相同）。 */
  body?: string
  withCredentials: boolean
  getBindings(): readonly TwinBinding[]
  setRuntimeValue(bindingId: string, variableKey: string, value: TwinRuntimeValueData): void
  onStatus(status: DataSourceConnectionStatus, error?: string): void
  onMessage?(): void
}

/** 按 a.b[0].c 读取。 */
export function readPath(value: unknown, path: string): unknown {
  let current = value
  for (const part of path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * 定时请求一个 HTTP 接口取设备数据。
 *
 * 接口返回的数据（resultPath 指向的位置）与 WebSocket 消息格式相同：一条或一个数组的
 * { "deviceId": "ESS-001", "soc": 72, ... }。每次请求成功就更新数值；失败时清空数值并报告原因
 * （和 WebSocket 断开时一样，屏幕上不会留着过期的值），下一次照常重试。
 */
export class HttpPollingDataSource implements DataSource {
  private timer: ReturnType<typeof setTimeout> | null = null
  private controller: AbortController | null = null
  private running = false

  constructor(private readonly options: HttpPollingDataSourceOptions) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.options.onStatus('connecting')
    void this.poll()
  }

  private async poll(): Promise<void> {
    if (!this.running) return
    const { options } = this
    const controller = new AbortController()
    this.controller = controller
    // 超时不超过间隔，也不超过 15 秒。
    const timeout = setTimeout(() => controller.abort(), Math.min(options.interval, 15) * 1000)
    try {
      const body =
        options.method === 'POST'
          ? options.body?.trim() || JSON.stringify(subscriptionMessage(options.getBindings()))
          : undefined
      const response = await fetch(options.url, {
        method: options.method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
        credentials: options.withCredentials ? 'include' : 'same-origin',
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`接口返回 HTTP ${response.status}`)
      const result = readPath(await response.json(), options.resultPath)
      if (!this.running || this.controller !== controller) return
      const messages = Array.isArray(result) ? result : [result]
      let accepted = false
      for (const message of messages) {
        const updates = mapWebSocketDeviceMessage(message, options.getBindings())
        for (const update of updates) options.setRuntimeValue(update.bindingId, update.variableKey, update.value)
        accepted = accepted || updates.length > 0
      }
      options.onStatus('connected', accepted ? undefined : '请求成功，但返回的数据里没有已绑定设备的值')
      if (accepted) options.onMessage?.()
    } catch (error) {
      if (!this.running || this.controller !== controller) return
      const message = controller.signal.aborted
        ? '请求超时'
        : error instanceof TypeError
          ? '无法连接：服务未启动、地址有误或跨域被拒绝'
          : error instanceof Error
            ? error.message
            : String(error)
      options.onStatus('error', message)
    } finally {
      clearTimeout(timeout)
    }
    if (this.running) this.timer = setTimeout(() => void this.poll(), options.interval * 1000)
  }

  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.controller?.abort()
    this.controller = null
    this.options.onStatus('disconnected')
  }
}
