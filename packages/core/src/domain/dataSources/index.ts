import { z } from 'zod'
import { trimmedString, uniqueBy } from '../schemaHelpers'

/** ws:// or wss:// only; credentials and fragments must never travel inside a project package. */
export function isSafeRealtimeUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return ['ws:', 'wss:'].includes(url.protocol) && !url.username && !url.password && !url.hash
  } catch {
    return false
  }
}

// Strict objects: extra keys (a token, say) are rejected rather than silently kept or dropped.
const MockDataSourceSchema = z.strictObject({
  id: trimmedString,
  name: trimmedString,
  type: z.literal('mock'),
  enabled: z.boolean(),
})
const WebSocketDataSourceSchema = z.strictObject({
  id: trimmedString,
  name: trimmedString,
  type: z.literal('websocket'),
  enabled: z.boolean(),
  url: z.string().refine(isSafeRealtimeUrl, { message: '地址必须是 ws:// 或 wss://，且不能包含用户名、密码或 #' }),
})

export const ProjectDataSourceSchema = z.discriminatedUnion('type', [MockDataSourceSchema, WebSocketDataSourceSchema])

export const ProjectDataSourcesSchema = z
  .array(ProjectDataSourceSchema)
  .max(16)
  .superRefine(uniqueBy(source => source.id, '数据源 ID'))
  .refine(sources => sources.filter(source => source.enabled).length <= 1, { message: '最多只能启用一个数据源' })

export type ProjectDataSource = z.infer<typeof ProjectDataSourceSchema>

/** Default realtime endpoint: the local device simulator (tools/device-simulator). */
export const DEFAULT_REALTIME_URL = 'ws://127.0.0.1:8787/realtime'

export function defaultDataSources(): ProjectDataSource[] {
  return [{ id: 'realtime', name: '实时设备数据', type: 'websocket', enabled: true, url: DEFAULT_REALTIME_URL }]
}
export function isProjectDataSources(value: unknown): value is ProjectDataSource[] {
  return ProjectDataSourcesSchema.safeParse(value).success
}

/**
 * Only an enabled WebSocket source produces runtime values. An absent field, [] , all disabled, or a
 * legacy 'mock' entry (still accepted when reading old packages) all mean: not configured, no data.
 */
export function activeDataSource(
  sources?: ProjectDataSource[],
): Extract<ProjectDataSource, { type: 'websocket' }> | null {
  const values = sources ?? []
  if (!isProjectDataSources(values)) throw new Error('数据源配置无效（最多启用一个，URL 必须为 ws/wss）')
  return (
    values.find(
      (source): source is Extract<ProjectDataSource, { type: 'websocket' }> =>
        source.enabled && source.type === 'websocket',
    ) ?? null
  )
}
