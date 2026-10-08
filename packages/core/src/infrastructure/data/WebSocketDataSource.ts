import type { TwinBinding, TwinRuntimeValueData, TwinVariableDataType } from '../../domain/twin'
import type { DataSource, DataSourceConnectionStatus } from './DataSource'

export interface WebSocketDataSourceOptions {
  url: string
  getBindings(): readonly TwinBinding[]
  setRuntimeValue(bindingId: string, variableKey: string, value: TwinRuntimeValueData): void
  onStatus(status: DataSourceConnectionStatus, error?: string): void
  onMessage?(): void
}

export interface WebSocketDeviceMessage {
  deviceId: string
  [variableKey: string]: unknown
}

let activeSocketCount = 0

export function getWebSocketDataSourceDiagnostics(): { activeSocketCount: number } {
  return { activeSocketCount }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValueOfType(value: unknown, dataType: TwinVariableDataType): value is TwinRuntimeValueData {
  if (dataType === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeof value === dataType
}

/** The optional first client message: the devices and variables this scene displays. */
export function subscriptionMessage(bindings: readonly TwinBinding[]): {
  type: 'subscribe'
  devices: Array<{ deviceId: string; variables: Array<{ key: string; dataType: TwinVariableDataType }> }>
} {
  const devices = new Map<string, Map<string, TwinVariableDataType>>()
  for (const binding of bindings) {
    const variables = devices.get(binding.device.id) ?? new Map<string, TwinVariableDataType>()
    for (const variable of binding.variables) variables.set(variable.key, variable.dataType)
    devices.set(binding.device.id, variables)
  }
  return {
    type: 'subscribe',
    devices: [...devices].map(([deviceId, variables]) => ({
      deviceId,
      variables: [...variables].map(([key, dataType]) => ({ key, dataType })),
    })),
  }
}

/** Maps the transport envelope to existing binding/variable identities. */
export function mapWebSocketDeviceMessage(
  message: unknown,
  bindings: readonly TwinBinding[],
): Array<{ bindingId: string; variableKey: string; value: TwinRuntimeValueData }> {
  if (!isRecord(message) || typeof message.deviceId !== 'string' || !message.deviceId) return []
  const matching = bindings.filter(item => item.device.id === message.deviceId)
  const values = isRecord(message.values) ? message.values : message
  return matching.flatMap(binding =>
    binding.variables.flatMap(variable => {
      const value = values[variable.key]
      return isValueOfType(value, variable.dataType)
        ? [{ bindingId: binding.id, variableKey: variable.key, value }]
        : []
    }),
  )
}

export class WebSocketDataSource implements DataSource {
  private socket: WebSocket | null = null
  private stopping = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retries = 0

  constructor(private readonly options: WebSocketDataSourceOptions) {}

  start(): void {
    if (this.socket || this.retryTimer) return
    if (typeof WebSocket === 'undefined') {
      this.options.onStatus('error', '当前环境不支持 WebSocket')
      return
    }
    this.stopping = false
    this.connect()
  }

  private connect(): void {
    this.options.onStatus('connecting', this.retries ? `连接中断，正在第 ${this.retries} 次重连…` : undefined)
    try {
      const socket = new WebSocket(this.options.url)
      this.socket = socket
      activeSocketCount += 1
      socket.addEventListener('open', () => {
        if (this.socket !== socket) return
        this.retries = 0
        this.options.onStatus('connected')
        // Tell the gateway which devices this scene shows. Gateways that push everything may ignore it;
        // the Twin Studio device simulator uses it to generate data for any project.
        try {
          socket.send(JSON.stringify(subscriptionMessage(this.options.getBindings())))
        } catch {
          // A failed hint never affects receiving data.
        }
      })
      socket.addEventListener('message', event => {
        if (this.socket !== socket) return
        try {
          const parsed: unknown = JSON.parse(typeof event.data === 'string' ? event.data : '')
          const messages = Array.isArray(parsed) ? parsed : [parsed]
          let accepted = false
          for (const message of messages) {
            const updates = mapWebSocketDeviceMessage(message, this.options.getBindings())
            for (const update of updates)
              this.options.setRuntimeValue(update.bindingId, update.variableKey, update.value)
            accepted = accepted || updates.length > 0
          }
          this.options.onStatus('connected')
          if (accepted) this.options.onMessage?.()
        } catch {
          // The connection itself is still live; report the bad frame without dropping current values.
          this.options.onStatus('connected', '收到无法解析的 WebSocket JSON 消息')
        }
      })
      socket.addEventListener('error', () => {
        if (this.socket === socket) this.options.onStatus('error', 'WebSocket 连接错误')
      })
      socket.addEventListener('close', () => {
        if (this.socket !== socket) return
        this.socket = null
        activeSocketCount = Math.max(0, activeSocketCount - 1)
        if (this.stopping) return
        this.options.onStatus('disconnected', 'WebSocket 连接已关闭')
        this.scheduleReconnect()
      })
    } catch (error) {
      this.options.onStatus('error', error instanceof Error ? error.message : 'WebSocket 连接失败')
    }
  }

  /** Demo-grade resilience: back off 1s → 2s → 4s … capped at 10s until stop(). */
  private scheduleReconnect(): void {
    const delay = Math.min(1000 * 2 ** this.retries, 10000)
    this.retries += 1
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (!this.stopping) this.connect()
    }, delay)
  }

  stop(): void {
    this.stopping = true
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.retries = 0
    const socket = this.socket
    if (!socket) return
    this.socket = null
    activeSocketCount = Math.max(0, activeSocketCount - 1)
    socket.close(1000, 'Viewer data source stopped')
    this.options.onStatus('disconnected')
  }
}
