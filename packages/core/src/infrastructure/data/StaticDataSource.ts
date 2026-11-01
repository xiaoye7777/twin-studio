import type { TwinBinding, TwinRuntimeValueData } from '../../domain/twin'
import type { DataSource, DataSourceConnectionStatus } from './DataSource'
import { mapWebSocketDeviceMessage } from './WebSocketDataSource'

export interface StaticDataSourceOptions {
  /** 设备编号 → 变量名 → 值。 */
  values: Record<string, Record<string, TwinRuntimeValueData>>
  getBindings(): readonly TwinBinding[]
  setRuntimeValue(bindingId: string, variableKey: string, value: TwinRuntimeValueData): void
  onStatus(status: DataSourceConnectionStatus, error?: string): void
}

/**
 * 静态数据：把场景里手填的值一次性写入。用于调试和演示——在属性栏改一个数，三维效果和规则立刻响应。
 * 类型不符的值（如给数值变量填了文字）会被忽略，和网关推来的数据同样处理。
 */
export class StaticDataSource implements DataSource {
  constructor(private readonly options: StaticDataSourceOptions) {}

  start(): void {
    const bindings = this.options.getBindings()
    for (const [deviceId, values] of Object.entries(this.options.values))
      for (const update of mapWebSocketDeviceMessage({ deviceId, ...values }, bindings))
        this.options.setRuntimeValue(update.bindingId, update.variableKey, update.value)
    this.options.onStatus('connected')
  }

  stop(): void {
    this.options.onStatus('disconnected')
  }
}
