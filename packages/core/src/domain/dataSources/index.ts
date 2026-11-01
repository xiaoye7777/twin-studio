/**
 * 场景的数据源：设备变量的值从哪里来。一个场景最多启用一个：
 *
 *   websocket  网关实时推送（生产环境的主要方式）
 *   http       定时请求一个接口（没有推送服务时；返回格式与 WebSocket 消息相同）
 *   static     手填的固定值（调试和演示：在属性栏改数值，立即看效果）
 *
 * 三种来源都按「设备编号 + 变量名」写入同一份运行时数据，三维效果、规则、Viewer 不关心值从哪来。
 * 场景文件会随项目包分发，所以这里不允许保存任何账号、密码或 Token。
 */
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

/** http(s):// 或以 / 开头的同域地址；不能带账号密码或 #。 */
export function isSafeHttpUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return !value.includes('#')
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash
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

const HttpDataSourceSchema = z.strictObject({
  id: trimmedString,
  name: trimmedString,
  type: z.literal('http'),
  enabled: z.boolean(),
  url: z.string().refine(isSafeHttpUrl, { message: '地址必须是 http(s):// 或以 / 开头，且不能包含用户名、密码或 #' }),
  method: z.enum(['GET', 'POST']),
  /** 请求间隔（秒）。 */
  interval: z.number().int().min(1).max(3600),
  /** 设备消息在返回值中的位置，如 data.list；空表示整个返回值。 */
  resultPath: z.string().max(200),
  /** POST 的 JSON 请求体（文本）。 */
  body: z.string().max(4000).optional(),
  /** 带上浏览器中该站点的登录 Cookie（需要后端允许带凭据的跨域）。 */
  withCredentials: z.boolean(),
})

const StaticValueSchema = z.union([z.number(), z.string().max(500), z.boolean()])
const StaticDataSourceSchema = z.strictObject({
  id: trimmedString,
  name: trimmedString,
  type: z.literal('static'),
  enabled: z.boolean(),
  /** 设备编号 → 变量名 → 值。 */
  values: z.record(z.string().max(200), z.record(z.string().max(200), StaticValueSchema)),
})

export const ProjectDataSourceSchema = z.discriminatedUnion('type', [
  MockDataSourceSchema,
  WebSocketDataSourceSchema,
  HttpDataSourceSchema,
  StaticDataSourceSchema,
])

export const ProjectDataSourcesSchema = z
  .array(ProjectDataSourceSchema)
  .max(16)
  .superRefine(uniqueBy(source => source.id, '数据源 ID'))
  .refine(sources => sources.filter(source => source.enabled).length <= 1, { message: '最多只能启用一个数据源' })

export type ProjectDataSource = z.infer<typeof ProjectDataSourceSchema>
export type WebSocketDataSourceConfig = Extract<ProjectDataSource, { type: 'websocket' }>
export type HttpDataSourceConfig = Extract<ProjectDataSource, { type: 'http' }>
export type StaticDataSourceConfig = Extract<ProjectDataSource, { type: 'static' }>
/** 能产生运行时数据的数据源（旧版的 mock 只为兼容读取，不产生数据）。 */
export type ActiveDataSourceConfig = WebSocketDataSourceConfig | HttpDataSourceConfig | StaticDataSourceConfig

/** Default realtime endpoint: the local device simulator (tools/device-simulator). */
export const DEFAULT_REALTIME_URL = 'ws://127.0.0.1:8787/realtime'

export function defaultDataSources(): ProjectDataSource[] {
  return [{ id: 'realtime', name: '实时设备数据', type: 'websocket', enabled: true, url: DEFAULT_REALTIME_URL }]
}
export function isProjectDataSources(value: unknown): value is ProjectDataSource[] {
  return ProjectDataSourcesSchema.safeParse(value).success
}

/** 新建数据源时的默认配置（地址指向本机的设备模拟器）。 */
export function newDataSource(type: ActiveDataSourceConfig['type']): ActiveDataSourceConfig {
  if (type === 'http')
    return {
      id: 'http',
      name: '定时请求',
      type,
      enabled: true,
      url: 'http://127.0.0.1:8787/api/devices/latest',
      // POST 且请求体为空：自动发送本场景的设备清单，模拟器（或支持它的后端）只返回这些设备。
      method: 'POST',
      interval: 5,
      resultPath: 'data',
      withCredentials: false,
    }
  if (type === 'static') return { id: 'static', name: '静态数据', type, enabled: true, values: {} }
  return { id: 'realtime', name: '实时设备数据', type, enabled: true, url: DEFAULT_REALTIME_URL }
}

/**
 * 当前启用、会产生数据的数据源。没有这个字段、空数组、全部停用、或旧版的 mock，都表示「未配置，没有数据」。
 */
export function activeDataSource(sources?: ProjectDataSource[]): ActiveDataSourceConfig | null {
  const values = sources ?? []
  if (!isProjectDataSources(values)) throw new Error('数据源配置无效（最多启用一个；地址格式不对或包含账号密码）')
  return values.find((source): source is ActiveDataSourceConfig => source.enabled && source.type !== 'mock') ?? null
}
