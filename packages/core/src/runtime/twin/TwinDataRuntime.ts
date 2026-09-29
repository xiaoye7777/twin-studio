import { activeDataSource, type ProjectDataSource } from '../../domain/dataSources'
import type { UnwrapNestedRefs } from 'vue'
import type { TwinBinding } from '../../domain/twin'
import { BindingTargetResolver } from './BindingTargetResolver'
import { MockDataSource, WebSocketDataSource, type DataSource, type DataSourceType } from '../../infrastructure/data'
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
    onTick: () => { state.recordMockTick(); state.recordDataSourceMessage() },
  })
}

/**
 * Per-scene data lifecycle, shared by Editor and Viewer. Runtime values exist only while a WebSocket
 * source is connected: any other state clears them, so visible values always mean live network data.
 */
export class TwinDataRuntime {
  private source: DataSource | null = null
  private sourceType: DataSourceType = 'websocket'
  constructor(readonly state: TwinRuntimeState, private readonly resolver: BindingTargetResolver) {
  }
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
    const getBindings = () => this.state.bindings.filter(binding => this.state.resolutionByBindingId[binding.id] === 'resolved')
    if (import.meta.env.DEV && qaMockRequested()) { this.run('mock', createQaMockSource(this.state, getBindings)); return }
    const config = activeDataSource(sources)
    if (!config) {
      this.stop()
      this.state.resetDataSourceMessages()
      this.state.setDataSourceState('websocket', 'unconfigured')
      return
    }
    this.run('websocket', new WebSocketDataSource({
      url: config.url,
      getBindings,
      setRuntimeValue: (id, key, value) => this.state.setRuntimeValue(id, key, value),
      onStatus: (status, error) => {
        // Never leave stale values on screen once the live connection is gone.
        if (status !== 'connected') this.state.clearRuntimeValues()
        this.state.setDataSourceState('websocket', status, error)
      },
      onMessage: () => this.state.recordDataSourceMessage(),
    }))
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
