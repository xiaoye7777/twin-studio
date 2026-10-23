import type { ApiConnection, ApiDataset, ApiField, ApiFieldType, ApiParam } from './model'

export interface ApiResponse {
  ok: boolean
  /** HTTP status; 0 when the request never reached the server. */
  status: number
  /** Milliseconds. */
  duration: number
  /** The parsed body (also on failures, when there was one). */
  body: unknown
  /** What went wrong, in words for the person configuring the screen. */
  error: string
}

export interface ApiRequestPlan {
  url: string
  init: RequestInit
  /** Required parameters without a value. */
  missing: string[]
}

/** The value each parameter is sent with: the given one, else its default. */
export function paramValues(params: ApiParam[], given: Record<string, string | undefined>): Record<string, string> {
  const values: Record<string, string> = {}
  for (const param of params) values[param.key] = given[param.key] ?? param.default ?? ''
  return values
}

function typed(param: ApiParam, value: string): unknown {
  if (param.type === 'number') {
    const number = Number(value)
    return value.trim() !== '' && Number.isFinite(number) ? number : value
  }
  if (param.type === 'boolean') return value === 'true' || value === '1' || value === '是'
  return value
}

export function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export function buildRequest(
  connection: ApiConnection,
  dataset: Pick<ApiDataset, 'method' | 'path' | 'params'>,
  given: Record<string, string | undefined>,
): ApiRequestPlan {
  const values = paramValues(dataset.params, given)
  const missing = dataset.params
    .filter(param => param.required && !values[param.key]?.trim())
    .map(param => param.label || param.key)
  let path = dataset.path
  for (const param of dataset.params)
    if (param.in === 'path') path = path.replace(`{${param.key}}`, encodeURIComponent(values[param.key] ?? ''))
  const url = new URL(joinUrl(connection.baseUrl, path))
  const headers = new Headers()
  for (const header of connection.headers) if (header.key.trim()) headers.set(header.key.trim(), header.value)
  const body: Record<string, unknown> = {}
  for (const param of dataset.params) {
    const value = values[param.key] ?? ''
    if (value === '' && !param.required) continue
    if (param.in === 'query') url.searchParams.set(param.key, value)
    else if (param.in === 'header') headers.set(param.key, value)
    else if (param.in === 'body') body[param.key] = typed(param, value)
  }
  const auth = connection.auth
  if (auth.type === 'bearer' && auth.token) headers.set('Authorization', `Bearer ${auth.token}`)
  if (auth.type === 'header' && auth.name.trim()) headers.set(auth.name.trim(), auth.value)
  const init: RequestInit = {
    method: dataset.method,
    headers,
    credentials: auth.type === 'cookie' ? 'include' : 'same-origin',
  }
  if (dataset.method !== 'GET') {
    headers.set('Content-Type', 'application/json')
    init.body = JSON.stringify(body)
  }
  return { url: url.toString(), init, missing }
}

/** Reads `a.b[0].c` (or `a.b.0.c`) from a value; an empty path is the value itself. */
export function getPath(value: unknown, path: string): unknown {
  if (!path.trim()) return value
  let current = value
  for (const part of path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

const successCodes = new Set(['0', '200', 'success', 'ok', 'true'])

/** `{ code, msg, data }` style failures reported with HTTP 200. */
function envelopeError(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ''
  const record = body as Record<string, unknown>
  const code = record.code ?? record.status ?? record.errcode
  if (code === undefined || typeof code === 'object') return ''
  if (record.success === true || successCodes.has(String(code).toLowerCase())) return ''
  // `status` alone is often a business field ("running"); only a numeric one is a result code.
  if (record.code === undefined && record.errcode === undefined && typeof record.status !== 'number') return ''
  const message = record.msg ?? record.message ?? record.errmsg ?? record.error
  return `接口返回错误：${typeof message === 'string' && message ? message : '未说明原因'}（code = ${String(code)}）`
}

function describeStatus(status: number, body: unknown, path: string): string {
  const message =
    body && typeof body === 'object' && !Array.isArray(body)
      ? ((body as Record<string, unknown>).msg ?? (body as Record<string, unknown>).message)
      : undefined
  const detail = typeof message === 'string' && message ? `：${message}` : ''
  if (status === 401 || status === 403)
    return `没有访问权限（HTTP ${status}）${detail || '：请检查数据服务的认证设置（Token 是否过期）'}`
  if (status === 404) return `接口地址不存在（HTTP 404）：${path}`
  if (status === 405) return `请求方式不对（HTTP 405）：请确认是 GET 还是 POST`
  if (status >= 500) return `服务器出错（HTTP ${status}）${detail}`
  return `请求失败（HTTP ${status}）${detail}`
}

function networkError(url: string): string {
  const target = new URL(url)
  if (globalThis.location?.protocol === 'https:' && target.protocol === 'http:')
    return `当前页面是 https，浏览器禁止请求 http 地址（${target.origin}）。请给数据服务配置 https，或通过同域代理访问。`
  return `无法连接 ${target.origin}：服务未启动、地址有误，或后端没有允许跨域访问（CORS）。请后端为本站点开启跨域，或通过同域反向代理访问。`
}

/** Sends a dataset's request. Never throws: failures come back as `error`. */
export async function sendRequest(
  connection: ApiConnection,
  dataset: Pick<ApiDataset, 'method' | 'path' | 'params'>,
  given: Record<string, string | undefined>,
  signal?: AbortSignal,
): Promise<ApiResponse> {
  const started = performance.now()
  const done = (patch: Partial<ApiResponse>): ApiResponse => ({
    ok: false,
    status: 0,
    body: undefined,
    error: '',
    ...patch,
    duration: Math.round(performance.now() - started),
  })
  let plan: ApiRequestPlan
  try {
    plan = buildRequest(connection, dataset, given)
  } catch {
    return done({ error: `地址无效：${joinUrl(connection.baseUrl, dataset.path)}` })
  }
  if (plan.missing.length) return done({ error: `缺少必填参数：${plan.missing.join('、')}` })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort('timeout'), Math.max(1, connection.timeout || 15) * 1000)
  const abort = () => controller.abort('cancelled')
  signal?.addEventListener('abort', abort)
  try {
    const response = await fetch(plan.url, { ...plan.init, signal: controller.signal })
    const text = await response.text()
    let body: unknown = text
    let json = true
    try {
      body = text.trim() ? JSON.parse(text) : null
    } catch {
      json = false
    }
    if (!response.ok)
      return done({ status: response.status, body, error: describeStatus(response.status, body, plan.url) })
    if (!json) return done({ status: response.status, body, error: '返回的不是 JSON 数据，请确认接口地址是否正确' })
    const envelope = connection.envelope === 'auto' ? envelopeError(body) : ''
    return done({ ok: !envelope, status: response.status, body, error: envelope })
  } catch {
    if (controller.signal.reason === 'timeout')
      return done({ error: `请求超时（超过 ${connection.timeout || 15} 秒没有响应）` })
    if (controller.signal.reason === 'cancelled') return done({ error: '已取消' })
    return done({ error: networkError(plan.url) })
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

// ================================================================ reading responses

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** Places in a response holding a list of records, best first (longer lists, shallower paths). */
export function findLists(value: unknown, depth = 4): Array<{ path: string; length: number }> {
  const found: Array<{ path: string; length: number; depth: number }> = []
  const walk = (node: unknown, path: string, level: number) => {
    if (Array.isArray(node)) {
      if (node.some(isRecord)) found.push({ path, length: node.length, depth: level })
      return
    }
    if (!isRecord(node) || level >= depth) return
    for (const [key, child] of Object.entries(node)) walk(child, path ? `${path}.${key}` : key, level + 1)
  }
  walk(value, '', 0)
  return found.sort((a, b) => a.depth - b.depth || b.length - a.length).map(({ path, length }) => ({ path, length }))
}

const wrapperKeys = ['data', 'result', 'results', 'body', 'payload', 'content']

/** Where the data probably is: a list of records if there is one, else the wrapped object, else everything. */
export function guessResult(body: unknown): { path: string; shape: ApiDataset['resultShape'] } {
  const lists = findLists(body)
  if (lists.length) return { path: lists[0]!.path, shape: 'rows' }
  if (isRecord(body)) {
    const wrapper = wrapperKeys.find(key => key in body)
    if (wrapper) {
      const inner = body[wrapper]
      return { path: wrapper, shape: isRecord(inner) ? 'object' : 'value' }
    }
    return { path: '', shape: 'object' }
  }
  return { path: '', shape: 'value' }
}

/** Numbers sent as text ("12.5") count as numbers. */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value)
    return Number.isFinite(number) ? number : null
  }
  return null
}

const datePattern = /^\d{4}[-/.]\d{1,2}([-/.]\d{1,2})?([ T]\d{1,2}:\d{2}(:\d{2})?.*)?$/

function fieldType(values: unknown[]): ApiFieldType {
  const present = values.filter(value => value !== null && value !== undefined && value !== '')
  if (!present.length) return 'string'
  if (present.every(value => typeof value === 'boolean')) return 'boolean'
  if (present.every(value => typeof value === 'string' && datePattern.test(value))) return 'date'
  if (present.every(value => toNumber(value) !== null)) return 'number'
  return 'string'
}

/** Readable names for common field names, so most lists need no renaming. */
const knownLabels: Record<string, string> = {
  id: '编号',
  name: '名称',
  title: '标题',
  label: '名称',
  type: '类型',
  category: '分类',
  status: '状态',
  state: '状态',
  level: '级别',
  date: '日期',
  day: '日期',
  month: '月份',
  year: '年份',
  time: '时间',
  hour: '小时',
  timestamp: '时间',
  value: '数值',
  count: '数量',
  total: '合计',
  amount: '金额',
  percent: '占比',
  rate: '比率',
  ratio: '比例',
  power: '功率',
  energy: '电量',
  temperature: '温度',
  temp: '温度',
  humidity: '湿度',
  voltage: '电压',
  current: '电流',
  soc: 'SOC',
  pv: '光伏',
  wind: '风电',
  load: '负荷',
  carbon: '碳排放',
  building: '建筑',
  device: '设备',
  devicename: '设备名称',
  deviceid: '设备编号',
  area: '区域',
  region: '区域',
  address: '地址',
  message: '内容',
  content: '内容',
  description: '说明',
  remark: '备注',
  createtime: '创建时间',
  updatetime: '更新时间',
}

export function fieldLabel(key: string): string {
  const last = key.split('.').pop() ?? key
  return knownLabels[last.toLowerCase().replace(/[_-]/g, '')] ?? last
}

/** Fields of a list (or one record), one level of nesting flattened (`stats.kwh`). Known labels are kept. */
export function inferFields(data: unknown, known: ApiField[] = []): ApiField[] {
  const records = (Array.isArray(data) ? data : [data]).filter(isRecord).slice(0, 50)
  const keys: string[] = []
  const add = (key: string) => !keys.includes(key) && keys.push(key)
  for (const record of records)
    for (const [key, value] of Object.entries(record)) {
      if (isRecord(value)) for (const inner of Object.keys(value)) add(`${key}.${inner}`)
      else if (!Array.isArray(value)) add(key)
    }
  return keys.map(key => {
    const previous = known.find(field => field.key === key)
    if (previous) return previous
    return { key, label: fieldLabel(key), type: fieldType(records.map(record => getPath(record, key))) }
  })
}

/** A response cut down to keep as a sample: short lists, no huge strings. */
export function trimSample(value: unknown, depth = 0): unknown {
  if (depth > 6) return null
  if (Array.isArray(value)) return value.slice(0, 20).map(item => trimSample(item, depth + 1))
  if (isRecord(value))
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 60)
        .map(([key, item]) => [key, trimSample(item, depth + 1)]),
    )
  if (typeof value === 'string' && value.length > 300) return `${value.slice(0, 300)}…`
  return value
}
