export type ProjectDataSource =
  | { id: string; name: string; type: 'mock'; enabled: boolean }
  | { id: string; name: string; type: 'websocket'; enabled: boolean; url: string }

export function defaultDataSources(): ProjectDataSource[] {
  return [{ id: 'default-mock', name: '演示数据', type: 'mock', enabled: true }]
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
/** Absent field is legacy Mock; explicit [] / all disabled means no acquisition. */
export function activeDataSource(sources?: ProjectDataSource[]): ProjectDataSource | null {
  const values = sources ?? defaultDataSources()
  if (!isProjectDataSources(values)) throw new Error('数据源配置无效（最多启用一个，URL 必须为 ws/wss）')
  return values.find(source => source.enabled) ?? null
}

