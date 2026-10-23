/**
 * Data interfaces (数据接口): backend HTTP APIs registered once by a technical user, then picked by name in
 * any widget's data panel. A connection (数据服务) is one backend — its address, sign-in and shared headers;
 * a dataset (接口) is one request on it, described in business terms: a Chinese name, parameters with labels
 * and choices, where the useful data sits in the response and what each field means.
 */

export type ApiMethod = 'GET' | 'POST' | 'PUT'

export type ApiAuth =
  | { type: 'none' }
  /** `Authorization: Bearer <token>`. */
  | { type: 'bearer'; token: string }
  /** Any header, e.g. `X-Token: …`. */
  | { type: 'header'; name: string; value: string }
  /** The browser's own sign-in cookie for that site (the backend must allow credentials). */
  | { type: 'cookie' }

export interface ApiHeader {
  key: string
  value: string
}

export interface ApiConnection {
  id: string
  name: string
  /** Scheme, host and optional base path, e.g. `https://api.example.com/park`. */
  baseUrl: string
  /** Kept on this computer only: never exported with screens. */
  auth: ApiAuth
  /** Sent with every request of the connection. */
  headers: ApiHeader[]
  /** Seconds. */
  timeout: number
  /**
   * Many backends wrap results as `{ code, msg, data }` and report failures in `code` with HTTP 200.
   * `auto` treats a `code` other than 0 / 200 / "success" as an error and shows its message.
   */
  envelope: 'auto' | 'off'
  /** Where the dataset list was last imported from, to sync it again. */
  catalog?: { kind: 'openapi' | 'datasets'; url: string; syncedAt: string }
  createdAt: string
  updatedAt: string
}

export type ApiParamType = 'string' | 'number' | 'boolean' | 'date' | 'month' | 'enum'

export interface ApiParam {
  key: string
  /** What the business user sees. */
  label: string
  in: 'query' | 'path' | 'body' | 'header'
  type: ApiParamType
  required: boolean
  default: string
  options?: Array<{ value: string; label: string }>
  description?: string
}

export type ApiFieldType = 'string' | 'number' | 'boolean' | 'date'

export interface ApiField {
  /** Path inside one record, e.g. `name` or `stats.kwh`. */
  key: string
  label: string
  type: ApiFieldType
  unit?: string
}

export interface ApiDataset {
  id: string
  connectionId: string
  name: string
  group: string
  description: string
  method: ApiMethod
  /** Appended to the connection's address; `{key}` takes a path parameter. */
  path: string
  params: ApiParam[]
  /** Where the useful data sits in the response, e.g. `data.list`; empty = the whole response. */
  resultPath: string
  /** A list of records (charts, tables), one record (figures) or a bare value. */
  resultShape: 'rows' | 'object' | 'value'
  fields: ApiField[]
  /** Suggested refresh in seconds; 0 = load once. Widgets may override it. */
  refresh: number
  /** The last test response (trimmed), to pick fields without calling the backend again. */
  sample?: unknown
  /** Set when imported from a catalog or OpenAPI document, to update it on the next sync. */
  externalId?: string
  source: 'manual' | 'openapi' | 'catalog' | 'curl'
  createdAt: string
  updatedAt: string
}

/** A parameter of a widget's request: typed in, or taken from a screen variable. */
export interface ParamBinding {
  value?: string
  variable?: string
}

export type ApiReduce = 'first' | 'last' | 'sum' | 'avg' | 'max' | 'min' | 'count'

/** How a widget uses a dataset. Field choices left empty fall back to sensible defaults. */
export interface ApiBinding {
  datasetId: string
  params: Record<string, ParamBinding>
  /** Charts: the category field and the number fields. */
  dimension?: string
  measures?: string[]
  /** Tables and lists: the columns, in order. */
  columns?: string[]
  /** Figures: the field shown, and how a list is reduced to one number. */
  value?: string
  reduce?: ApiReduce
  sort?: { field: string; order: 'asc' | 'desc' }
  limit?: number
  /** Seconds; undefined follows the dataset, 0 loads once. */
  refresh?: number
}

export const refreshChoices = [
  { value: 0, label: '只加载一次' },
  { value: 5, label: '每 5 秒' },
  { value: 10, label: '每 10 秒' },
  { value: 30, label: '每 30 秒' },
  { value: 60, label: '每分钟' },
  { value: 300, label: '每 5 分钟' },
  { value: 1800, label: '每 30 分钟' },
] as const

export function refreshLabel(seconds: number): string {
  const choice = refreshChoices.find(item => item.value === seconds)
  if (choice) return choice.label
  return seconds < 60 ? `每 ${seconds} 秒` : `每 ${Math.round(seconds / 60)} 分钟`
}

export function newDataSourceId(prefix: 'conn' | 'ds'): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`
}

export function createConnection(name: string, baseUrl: string): ApiConnection {
  const now = new Date().toISOString()
  return {
    id: newDataSourceId('conn'),
    name,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    auth: { type: 'none' },
    headers: [],
    timeout: 15,
    envelope: 'auto',
    createdAt: now,
    updatedAt: now,
  }
}

export function createDataset(connectionId: string, patch: Partial<ApiDataset> = {}): ApiDataset {
  const now = new Date().toISOString()
  return {
    id: newDataSourceId('ds'),
    connectionId,
    name: '未命名接口',
    group: '默认分组',
    description: '',
    method: 'GET',
    path: '/',
    params: [],
    resultPath: '',
    resultShape: 'rows',
    fields: [],
    refresh: 60,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    ...patch,
  }
}

export function isConnection(value: unknown): value is ApiConnection {
  const item = value as Partial<ApiConnection> | null
  return !!item && typeof item.id === 'string' && typeof item.baseUrl === 'string' && !!item.auth
}

export function isDataset(value: unknown): value is ApiDataset {
  const item = value as Partial<ApiDataset> | null
  return (
    !!item &&
    typeof item.id === 'string' &&
    typeof item.connectionId === 'string' &&
    typeof item.path === 'string' &&
    Array.isArray(item.params) &&
    Array.isArray(item.fields)
  )
}

/** A connection without its secrets, for files that leave this computer. */
export function shareableConnection(connection: ApiConnection): ApiConnection {
  const auth: ApiAuth =
    connection.auth.type === 'bearer'
      ? { type: 'bearer', token: '' }
      : connection.auth.type === 'header'
        ? { type: 'header', name: connection.auth.name, value: '' }
        : connection.auth
  return { ...connection, auth }
}
