export type DataSourceType = 'mock' | 'websocket'
/** 'unconfigured': the project has no enabled WebSocket source, so no runtime values exist. */
export type DataSourceConnectionStatus = 'unconfigured' | 'connecting' | 'connected' | 'disconnected' | 'error'

export type ViewerDataSourceConfig = { type: 'mock' } | { type: 'websocket'; url: string }

export interface DataSource {
  start(): void
  stop(): void
}
