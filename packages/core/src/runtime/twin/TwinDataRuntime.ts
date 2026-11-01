import { type ActiveDataSourceConfig, activeDataSource, type ProjectDataSource } from '../../domain/dataSources'
import type { UnwrapNestedRefs } from 'vue'
import type { TwinBinding, TwinRuntimeValueData } from '../../domain/twin'
import { BindingTargetResolver } from './BindingTargetResolver'
import {
  type DataSource,
  type DataSourceConnectionStatus,
  type DataSourceType,
  HttpPollingDataSource,
  MockDataSource,
  StaticDataSource,
  WebSocketDataSource,
} from '../../infrastructure/data'
import type { createTwinState } from './createTwinState'

export type TwinRuntimeState = UnwrapNestedRefs<ReturnType<typeof createTwinState>>

/**
 * Browser QA only. Dev servers honour window.__TWIN_QA_MOCK__ so regression suites get deterministic
 * values. Production bundles (Editor build, Viewer SDK dist) compile the guard to false, so this function,
 * MockDataSource and every generated value are removed from the shipped code entirely.
 */
function qaMockRequested(): boolean {
  return (globalThis as { __TWIN_QA_MOCK__?: unknown }).__TWIN_QA_MOCK__ === true
}
function createQaMockSource(state: TwinRuntimeState, getBindings: () => readonly TwinBinding[]): DataSource {
  return new MockDataSource({
    getBindings,
    setRuntimeValue: (id, key, value) => state.setRuntimeValue(id, key, value),
    onTick: () => {
      state.recordMockTick()
      state.recordDataSourceMessage()
    },
  })
}

/**
 * 一个场景的数据生命周期（编辑器和 Viewer 共用）：按场景配置启动一个数据源，把收到的值写进运行时状态。
 * 数值只在数据源正常时存在：断开或出错就清空，屏幕上不会留着过期的值。
 */
export class TwinDataRuntime {
  private source: DataSource | null = null
  private sourceType: DataSourceType = 'websocket'
  constructor(
    readonly state: TwinRuntimeState,
    private readonly resolver: BindingTargetResolver,
  ) {}
  initialize(projectId: string, bindings: readonly TwinBinding[]): void {
    this.stop()
    this.state.initializeProject(projectId, bindings)
    this.refresh()
  }
  refresh(): void {
    for (const binding of this.state.bindings) {
      this.state.setResolutionStatus(binding.id, this.resolver.resolve(binding.target) ? 'resolved' : 'unresolved')
    }
  }
  start(sources?: ProjectDataSource[]): void {
    this.refresh()
    const getBindings = () =>
      this.state.bindings.filter(binding => this.state.resolutionByBindingId[binding.id] === 'resolved')
    if (import.meta.env.DEV && qaMockRequested()) {
      this.run('mock', createQaMockSource(this.state, getBindings))
      return
    }
    const config = activeDataSource(sources)
    if (!config) {
      this.stop()
      this.state.resetDataSourceMessages()
      this.state.setDataSourceState('websocket', 'unconfigured')
      return
    }
    this.run(config.type, this.createSource(config, getBindings))
  }

  private createSource(config: ActiveDataSourceConfig, getBindings: () => readonly TwinBinding[]): DataSource {
    const common = {
      getBindings,
      setRuntimeValue: (id: string, key: string, value: TwinRuntimeValueData) =>
        this.state.setRuntimeValue(id, key, value),
      onStatus: (status: DataSourceConnectionStatus, error?: string) => {
        // 连接不在了就清空数值，不留过期的值。
        if (status !== 'connected') this.state.clearRuntimeValues()
        this.state.setDataSourceState(config.type, status, error)
      },
      onMessage: () => this.state.recordDataSourceMessage(),
    }
    switch (config.type) {
      case 'websocket':
        return new WebSocketDataSource({ ...common, url: config.url })
      case 'http':
        return new HttpPollingDataSource({ ...common, ...config })
      case 'static':
        return new StaticDataSource({ ...common, values: config.values })
    }
  }
  private run(type: DataSourceType, source: DataSource): void {
    this.stop()
    this.state.resetDataSourceMessages()
    this.sourceType = type
    this.state.setDataSourceState(type, type === 'mock' ? 'connected' : 'connecting')
    this.state.setMockRunning(type === 'mock')
    this.source = source
    source.start()
  }
  stop(): void {
    this.source?.stop()
    this.source = null
    this.state.clearRuntimeValues()
    this.state.setMockRunning(false)
    this.state.setDataSourceState(this.sourceType, 'disconnected')
  }
}
