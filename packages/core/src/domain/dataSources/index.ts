export type ProjectDataSource =
  | { id: string; name: string; type: 'mock'; enabled: boolean }
  | { id: string; name: string; type: 'websocket'; enabled: boolean; url: string }

/** Default realtime endpoint: the local device simulator (tools/device-simulator). */
export const DEFAULT_REALTIME_URL = 'ws://127.0.0.1:8787/realtime'

export function defaultDataSources(): ProjectDataSource[] {
  return [{ id: 'realtime', name: '实时设备数据', type: 'websocket', enabled: true, url: DEFAULT_REALTIME_URL }]
}
export function isProjectDataSources(value: unknown): value is ProjectDataSource[] {
  if (!Array.isArray(value) || value.length > 16) return false
  const ids = new Set<string>()
  let enabled = 0
  return value.every(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim() ||
      ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || typeof item.enabled !== 'boolean') return false
    ids.add(item.id)
    if (item.enabled && ++enabled > 1) return false
    const keys = item.type === 'mock' ? ['id','name','type','enabled'] : ['id','name','type','enabled','url']
    if (Object.keys(item).some(key => !keys.includes(key))) return false
    if (item.type === 'mock') return true
    if (item.type !== 'websocket' || typeof item.url !== 'string') return false
    try {
      const url = new URL(item.url)
      return ['ws:', 'wss:'].includes(url.protocol) && !url.username && !url.password && !url.hash
    } catch { return false }
  })
}
/**
 * Only an enabled WebSocket source produces runtime values. An absent field, [] , all disabled, or a
 * legacy 'mock' entry (still accepted when reading old packages) all mean: not configured, no data.
 */
export function activeDataSource(sources?: ProjectDataSource[]): Extract<ProjectDataSource, { type: 'websocket' }> | null {
  const values = sources ?? []
  if (!isProjectDataSources(values)) throw new Error('数据源配置无效（最多启用一个，URL 必须为 ws/wss）')
  return values.find((source): source is Extract<ProjectDataSource, { type: 'websocket' }> => source.enabled && source.type === 'websocket') ?? null
}

