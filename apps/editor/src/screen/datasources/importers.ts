/**
 * Turning what backends already have into datasets, so nobody types interface documents by hand:
 * OpenAPI / Swagger documents (springdoc, Knife4j, FastAPI… publish one), the dataset catalog protocol
 * (docs/data-api.md) and a request copied from the browser as cURL.
 */
import type { ApiAuth, ApiDataset, ApiField, ApiFieldType, ApiHeader, ApiMethod, ApiParam, ApiParamType } from './model'
import { fieldLabel, getPath, guessResult, inferFields } from './request'

/** A dataset before it belongs to a connection. */
export type DatasetDraft = Omit<ApiDataset, 'id' | 'connectionId' | 'createdAt' | 'updatedAt'>

type Json = Record<string, unknown>
const isJson = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** A short label from a description: "统计天数，默认 7 天" → "统计天数". */
export function labelFrom(description: string, fallback: string): string {
  const first =
    description
      .split(/[，,。;；:：\n]/)[0]
      ?.replace(/[（(][^）)]*[）)]\s*$/, '')
      .trim() ?? ''
  return first && first.length <= 20 ? first : fallback
}

/** A unit in a description: "发电量（kWh）", "温度(℃)", "单位：kW". */
export function unitFrom(description: string): string | undefined {
  const bracket = description.match(/[（(]\s*([^（()）]{1,8}?)\s*[）)]/)
  if (bracket && !/[一-龥]{3,}/.test(bracket[1]!)) return bracket[1]
  return description.match(/单位[:：]\s*([^\s，,。;；]{1,8})/)?.[1]
}

// ================================================================ OpenAPI / Swagger

export interface OpenApiOperation {
  /** `GET /api/energy/trend` */
  key: string
  draft: DatasetDraft
}

export interface OpenApiResult {
  title: string
  operations: OpenApiOperation[]
}

function resolver(doc: Json) {
  const resolve = (schema: unknown, seen = new Set<string>()): Json => {
    if (!isJson(schema)) return {}
    const ref = text(schema.$ref)
    if (ref.startsWith('#/')) {
      if (seen.has(ref)) return {}
      seen.add(ref)
      let target: unknown = doc
      for (const part of ref.slice(2).split('/')) target = isJson(target) ? target[decodeURIComponent(part)] : undefined
      return resolve(target, seen)
    }
    const parts = [schema.allOf, schema.oneOf, schema.anyOf].find(Array.isArray) as unknown[] | undefined
    if (parts) {
      const merged: Json = { type: 'object', properties: {} }
      for (const part of parts) {
        const resolved = resolve(part, new Set(seen))
        Object.assign(merged.properties as Json, isJson(resolved.properties) ? resolved.properties : {})
        if (resolved.type === 'array') return resolved
      }
      return { ...schema, ...merged }
    }
    return schema
  }
  return resolve
}

function schemaFieldType(schema: Json): ApiFieldType {
  const type = text(schema.type)
  if (type === 'integer' || type === 'number') return 'number'
  if (type === 'boolean') return 'boolean'
  if (/date/.test(text(schema.format))) return 'date'
  return 'string'
}

function schemaParamType(schema: Json): ApiParamType {
  if (Array.isArray(schema.enum)) return 'enum'
  const type = text(schema.type)
  if (type === 'integer' || type === 'number') return 'number'
  if (type === 'boolean') return 'boolean'
  if (/date/.test(text(schema.format))) return 'date'
  return 'string'
}

/** Fields of an object schema, one level of nested objects flattened. */
function schemaFields(schema: Json, resolve: (value: unknown) => Json, prefix = '', depth = 0): ApiField[] {
  const properties = isJson(schema.properties) ? schema.properties : {}
  return Object.entries(properties).flatMap(([key, raw]): ApiField[] => {
    const property = resolve(raw)
    const description = text(property.description) || text(property.title) || text((raw as Json)?.description)
    const path = prefix ? `${prefix}.${key}` : key
    if (text(property.type) === 'object' || isJson(property.properties)) {
      return depth < 1 ? schemaFields(property, resolve, path, depth + 1) : []
    }
    if (text(property.type) === 'array') return []
    return [
      {
        key: path,
        label: description ? labelFrom(description, fieldLabel(key)) : fieldLabel(key),
        type: schemaFieldType(property),
        unit: description ? unitFrom(description) : undefined,
      },
    ]
  })
}

/** Where the records are in a response schema: the first list of objects, else the wrapped object. */
function schemaResult(
  schema: Json,
  resolve: (value: unknown) => Json,
): { path: string; shape: ApiDataset['resultShape']; fields: ApiField[] } {
  const queue: Array<{ schema: Json; path: string; depth: number }> = [{ schema, path: '', depth: 0 }]
  while (queue.length) {
    const { schema: node, path, depth } = queue.shift()!
    if (text(node.type) === 'array') {
      const items = resolve(node.items)
      if (isJson(items.properties)) return { path, shape: 'rows', fields: schemaFields(items, resolve) }
      continue
    }
    if (!isJson(node.properties) || depth > 3) continue
    for (const [key, child] of Object.entries(node.properties))
      queue.push({ schema: resolve(child), path: path ? `${path}.${key}` : key, depth: depth + 1 })
  }
  const properties = isJson(schema.properties) ? schema.properties : {}
  const wrapper = ['data', 'result', 'body'].find(key => key in properties)
  if (wrapper) {
    const inner = resolve(properties[wrapper])
    if (isJson(inner.properties)) return { path: wrapper, shape: 'object', fields: schemaFields(inner, resolve) }
    return { path: wrapper, shape: 'value', fields: [] }
  }
  return { path: '', shape: 'object', fields: schemaFields(schema, resolve) }
}

function openApiParam(raw: unknown, resolve: (value: unknown) => Json): ApiParam | null {
  const param = resolve(raw)
  const where = text(param.in)
  if (!['query', 'path', 'header'].includes(where)) return null
  const key = text(param.name)
  if (!key || (where === 'header' && /^authorization$/i.test(key))) return null
  // Swagger 2 puts type / enum on the parameter itself.
  const schema = isJson(param.schema) ? resolve(param.schema) : param
  const description = text(param.description)
  const type = schemaParamType(schema)
  const fallback = schema.default ?? param.example ?? schema.example
  return {
    key,
    label: description ? labelFrom(description, key) : fieldLabel(key),
    in: where as ApiParam['in'],
    type,
    required: param.required === true || where === 'path',
    default: fallback === undefined || fallback === null ? '' : String(fallback),
    options:
      type === 'enum'
        ? (schema.enum as unknown[]).map(item => ({ value: String(item), label: String(item) }))
        : undefined,
    description: description || undefined,
  }
}

function bodyParams(schema: Json, resolve: (value: unknown) => Json): ApiParam[] {
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : []
  return Object.entries(isJson(schema.properties) ? schema.properties : {}).flatMap(([key, raw]) => {
    const property = resolve(raw)
    if (text(property.type) === 'object' || text(property.type) === 'array') return []
    const description = text(property.description) || text(property.title)
    const type = schemaParamType(property)
    const fallback = property.default ?? property.example
    return [
      {
        key,
        label: description ? labelFrom(description, key) : fieldLabel(key),
        in: 'body' as const,
        type,
        required: required.includes(key),
        default: fallback === undefined || fallback === null ? '' : String(fallback),
        options:
          type === 'enum'
            ? (property.enum as unknown[]).map(item => ({ value: String(item), label: String(item) }))
            : undefined,
        description: description || undefined,
      },
    ]
  })
}

/**
 * Reads an OpenAPI 3 or Swagger 2 document. `basePath` is the connection address's path, so a server path
 * already in it is not added twice.
 */
export function parseOpenApi(input: unknown, basePath = ''): OpenApiResult {
  if (!isJson(input) || !isJson(input.paths) || !(input.openapi || input.swagger))
    throw new Error('不是 OpenAPI / Swagger 文档（缺少 openapi / swagger 与 paths）')
  const doc = input
  const resolve = resolver(doc)
  const info = isJson(doc.info) ? doc.info : {}
  const servers = Array.isArray(doc.servers) ? (doc.servers as Json[]) : []
  let serverPath = text(doc.basePath) || text(servers[0]?.url)
  try {
    serverPath = new URL(serverPath, 'http://x').pathname
  } catch {
    serverPath = ''
  }
  serverPath = serverPath.replace(/\/+$/, '')
  if (serverPath && basePath.replace(/\/+$/, '').endsWith(serverPath)) serverPath = ''

  const operations: OpenApiOperation[] = []
  for (const [path, rawItem] of Object.entries(doc.paths as Json)) {
    if (!isJson(rawItem)) continue
    const shared = Array.isArray(rawItem.parameters) ? rawItem.parameters : []
    for (const method of ['get', 'post', 'put'] as const) {
      const operation = rawItem[method]
      if (!isJson(operation)) continue
      const params = [...shared, ...(Array.isArray(operation.parameters) ? operation.parameters : [])]
        .map(raw => openApiParam(raw, resolve))
        .filter((param): param is ApiParam => !!param)
      // Request body: OpenAPI 3 requestBody, or a Swagger 2 `in: body` parameter.
      const body = isJson(operation.requestBody) ? resolve(operation.requestBody) : null
      const bodySchema = body
        ? resolve((isJson(body.content) ? (body.content['application/json'] as Json | undefined) : undefined)?.schema)
        : resolve(
            (operation.parameters as Json[] | undefined)?.map(item => resolve(item)).find(item => item.in === 'body')
              ?.schema,
          )
      if (method !== 'get') params.push(...bodyParams(bodySchema, resolve))

      const responses = isJson(operation.responses) ? operation.responses : {}
      const ok = resolve(responses['200'] ?? responses['201'] ?? responses.default)
      const content = isJson(ok.content) ? ok.content : null
      const media = content
        ? ((content['application/json'] ?? content['*/*'] ?? Object.values(content)[0]) as Json | undefined)
        : undefined
      const responseSchema = resolve(media?.schema ?? ok.schema)
      const result = schemaResult(responseSchema, resolve)
      const summary = text(operation.summary)
      const tags = Array.isArray(operation.tags) ? (operation.tags as string[]) : []
      operations.push({
        key: `${method.toUpperCase()} ${path}`,
        draft: {
          name: summary || text(operation.operationId) || `${method.toUpperCase()} ${path}`,
          group: tags[0] || '默认分组',
          description: text(operation.description) || (summary ? '' : path),
          method: method.toUpperCase() as ApiMethod,
          path: `${serverPath}${path}`,
          params,
          resultPath: result.path,
          resultShape: result.shape,
          fields: result.fields,
          refresh: 60,
          source: 'openapi',
          externalId: `${method.toUpperCase()} ${path}`,
        },
      })
    }
  }
  if (!operations.length) throw new Error('文档中没有 GET / POST 接口')
  return { title: text(info.title) || 'OpenAPI 文档', operations }
}

/** Where backends usually publish their OpenAPI document. */
export const openApiPaths = [
  '/v3/api-docs',
  '/openapi.json',
  '/v2/api-docs',
  '/swagger.json',
  '/api-docs',
  '/swagger/v1/swagger.json',
]

// ================================================================ dataset catalog (our own small protocol)

const paramTypes: ApiParamType[] = ['string', 'number', 'boolean', 'date', 'month', 'enum']
const fieldTypes: ApiFieldType[] = ['string', 'number', 'boolean', 'date']

/** Reads a catalog: `{ version: 1, name, datasets: [{ id, name, method, path, params, resultPath, fields }] }`. */
export function parseCatalog(input: unknown): { name: string; datasets: DatasetDraft[] } {
  const root = isJson(input) && isJson(input.data) && !Array.isArray(input.datasets) ? input.data : input
  if (!isJson(root) || !Array.isArray(root.datasets)) throw new Error('不是数据集清单（缺少 datasets 数组）')
  const datasets = root.datasets.filter(isJson).map((item, index): DatasetDraft => {
    const params = (Array.isArray(item.params) ? item.params : []).filter(isJson).map((param): ApiParam => ({
      key: text(param.key) || text(param.name),
      label: text(param.label) || text(param.key) || text(param.name),
      in: (['query', 'path', 'body', 'header'].includes(text(param.in)) ? text(param.in) : 'query') as ApiParam['in'],
      type: (paramTypes.includes(text(param.type) as ApiParamType) ? text(param.type) : 'string') as ApiParamType,
      required: param.required === true,
      default: param.default === undefined || param.default === null ? '' : String(param.default),
      options: Array.isArray(param.options)
        ? param.options.map(option =>
            isJson(option)
              ? { value: String(option.value), label: text(option.label) || String(option.value) }
              : { value: String(option), label: String(option) },
          )
        : undefined,
      description: text(param.description) || undefined,
    }))
    const fields = (Array.isArray(item.fields) ? item.fields : []).filter(isJson).map((field): ApiField => ({
      key: text(field.key),
      label: text(field.label) || text(field.key),
      type: (fieldTypes.includes(text(field.type) as ApiFieldType) ? text(field.type) : 'string') as ApiFieldType,
      unit: text(field.unit) || undefined,
    }))
    const method = text(item.method).toUpperCase()
    return {
      name: text(item.name) || `接口 ${index + 1}`,
      group: text(item.group) || '默认分组',
      description: text(item.description),
      method: (['GET', 'POST', 'PUT'].includes(method) ? method : 'GET') as ApiMethod,
      path: text(item.path) || '/',
      params: params.filter(param => param.key),
      resultPath: text(item.resultPath),
      resultShape: (['rows', 'object', 'value'].includes(text(item.resultShape))
        ? text(item.resultShape)
        : 'rows') as ApiDataset['resultShape'],
      fields: fields.filter(field => field.key),
      refresh: typeof item.refresh === 'number' && item.refresh >= 0 ? item.refresh : 60,
      source: 'catalog',
      externalId: text(item.id) || `${method} ${text(item.path)}`,
    }
  })
  return { name: text(root.name) || '数据集清单', datasets }
}

// ================================================================ cURL

/** Splits a shell command into words: quotes, `$'…'`, backslash escapes and line continuations. */
function shellWords(command: string): string[] {
  const words: string[] = []
  let word = ''
  let started = false
  let i = 0
  const source = command.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ')
  while (i < source.length) {
    const c = source[i]!
    if (/\s/.test(c)) {
      if (started) words.push(word)
      word = ''
      started = false
      i++
    } else if (c === "'" || (c === '$' && source[i + 1] === "'")) {
      const ansi = c === '$'
      i += ansi ? 2 : 1
      started = true
      while (i < source.length && source[i] !== "'") {
        if (ansi && source[i] === '\\' && i + 1 < source.length) {
          const next = source[i + 1]!
          word += next === 'n' ? '\n' : next === 't' ? '\t' : next
          i += 2
        } else word += source[i++]
      }
      i++
    } else if (c === '"') {
      i++
      started = true
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\' && i + 1 < source.length) {
          word += source[i + 1]
          i += 2
        } else word += source[i++]
      }
      i++
    } else if (c === '\\' && i + 1 < source.length) {
      word += source[i + 1]
      started = true
      i += 2
    } else {
      word += c
      started = true
      i++
    }
  }
  if (started) words.push(word)
  return words
}

export interface CurlRequest {
  url: URL
  method: ApiMethod
  headers: ApiHeader[]
  body: unknown
}

const valueFlags = new Set([
  '-X',
  '--request',
  '-H',
  '--header',
  '-d',
  '--data',
  '--data-raw',
  '--data-binary',
  '--data-ascii',
  '--data-urlencode',
  '--json',
  '-b',
  '--cookie',
  '-u',
  '--user',
  '-A',
  '--user-agent',
  '-e',
  '--referer',
  '--url',
  '-o',
  '--output',
  '-m',
  '--max-time',
  '--connect-timeout',
])

export function parseCurl(command: string): CurlRequest {
  const words = shellWords(command.trim())
  if (!/^curl(\.exe)?$/i.test(words[0] ?? ''))
    throw new Error('请粘贴以 curl 开头的命令（浏览器开发者工具 → 网络 → 右键请求 → 复制为 cURL）')
  let url = ''
  let method = ''
  const headers: ApiHeader[] = []
  const data: string[] = []
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!
    const [flag, inline] =
      word.startsWith('--') && word.includes('=')
        ? [word.slice(0, word.indexOf('=')), word.slice(word.indexOf('=') + 1)]
        : [word, undefined]
    if (valueFlags.has(flag)) {
      const value = inline ?? words[++i] ?? ''
      if (flag === '-X' || flag === '--request') method = value.toUpperCase()
      else if (flag === '-H' || flag === '--header') {
        const colon = value.indexOf(':')
        if (colon > 0) headers.push({ key: value.slice(0, colon).trim(), value: value.slice(colon + 1).trim() })
      } else if (flag.startsWith('--data') || flag === '-d' || flag === '--json') data.push(value)
      else if (flag === '--url') url = value
    } else if (!word.startsWith('-') && !url) url = word
  }
  if (!url) throw new Error('命令里没有找到请求地址')
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`请求地址无效：${url}`)
  }
  const raw = data.join('&')
  let body: unknown = undefined
  if (raw) {
    try {
      body = JSON.parse(raw)
    } catch {
      body = Object.fromEntries(new URLSearchParams(raw))
    }
  }
  const verb = method || (raw ? 'POST' : 'GET')
  return { url: parsed, method: (['GET', 'POST', 'PUT'].includes(verb) ? verb : 'GET') as ApiMethod, headers, body }
}

/** Headers browsers add by themselves; they never belong in a dataset. */
const browserHeaders =
  /^(accept|accept-encoding|accept-language|cache-control|connection|content-type|content-length|cookie|dnt|host|origin|pragma|priority|referer|user-agent|sec-.*|upgrade-insecure-requests|if-none-match|if-modified-since)$/i

function guessParamType(value: string): ApiParamType {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date'
  if (/^\d{4}-\d{2}$/.test(value)) return 'month'
  if (value !== '' && Number.isFinite(Number(value))) return 'number'
  if (value === 'true' || value === 'false') return 'boolean'
  return 'string'
}

/** A copied request as a dataset draft, plus what belongs on the connection (address, sign-in, headers). */
export function datasetFromCurl(request: CurlRequest): {
  origin: string
  auth: ApiAuth | null
  headers: ApiHeader[]
  draft: DatasetDraft
} {
  let auth: ApiAuth | null = null
  const headers: ApiHeader[] = []
  for (const header of request.headers) {
    if (browserHeaders.test(header.key)) continue
    if (/^authorization$/i.test(header.key)) {
      const bearer = header.value.match(/^Bearer\s+(.+)$/i)
      auth = bearer
        ? { type: 'bearer', token: bearer[1]! }
        : { type: 'header', name: 'Authorization', value: header.value }
    } else headers.push(header)
  }
  const params: ApiParam[] = [...request.url.searchParams].map(([key, value]) => ({
    key,
    label: fieldLabel(key),
    in: 'query',
    type: guessParamType(value),
    required: false,
    default: value,
  }))
  if (isJson(request.body))
    for (const [key, value] of Object.entries(request.body)) {
      if (value !== null && typeof value === 'object') continue
      params.push({
        key,
        label: fieldLabel(key),
        in: 'body',
        type:
          typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : guessParamType(String(value)),
        required: false,
        default: String(value ?? ''),
      })
    }
  const path = request.url.pathname
  return {
    origin: request.url.origin,
    auth,
    headers,
    draft: {
      name: path.split('/').filter(Boolean).pop() || '新接口',
      group: '默认分组',
      description: '',
      method: request.method,
      path,
      params,
      resultPath: '',
      resultShape: 'rows',
      fields: [],
      refresh: 60,
      source: 'curl',
    },
  }
}

/** Fills result path, shape and fields from a test response, keeping fields already described. */
export function describeResponse(
  dataset: Pick<ApiDataset, 'resultPath' | 'resultShape' | 'fields'>,
  body: unknown,
  pickPath = !dataset.fields.length,
): Pick<ApiDataset, 'resultPath' | 'resultShape' | 'fields'> {
  const { path, shape } = pickPath ? guessResult(body) : { path: dataset.resultPath, shape: dataset.resultShape }
  const target = getPath(body, path)
  return { resultPath: path, resultShape: shape, fields: shape === 'value' ? [] : inferFields(target, dataset.fields) }
}
