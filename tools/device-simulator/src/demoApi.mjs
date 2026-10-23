// Demo business API: the simulator also stands in for a park's business backend, so data screens can be
// wired to real HTTP interfaces before the backend team delivers theirs. Results use the common
// `{ code, msg, data }` envelope. The same definitions are published two ways, as the backend would:
//
//   GET /screen/datasets   dataset catalog (docs/data-api.md in the editor)
//   GET /openapi.json      OpenAPI 3 document (what springdoc / Knife4j generate)

const buildings = [
  ['A1 研发楼', 18600],
  ['A2 办公楼', 12400],
  ['B1 数据中心', 6800],
  ['B2 生产车间', 22100],
  ['C1 仓储中心', 15200],
  ['C2 员工公寓', 9800],
  ['D1 展示中心', 5400],
  ['D2 食堂', 3200],
]
const deviceMetrics = {
  soc: { base: 64, swing: 18, unit: '%' },
  temperature: { base: 34, swing: 6, unit: '℃' },
  power: { base: 120, swing: 60, unit: 'kW' },
}
const alarmTexts = [
  ['储能柜温度过高', '严重'],
  ['光伏逆变器通讯中断', '一般'],
  ['充电桩功率异常', '一般'],
  ['变压器负载率超过 85%', '严重'],
  ['风机振动偏大', '提示'],
  ['空调机组滤网需更换', '提示'],
]

const pad = value => String(value).padStart(2, '0')
const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits
/** Smooth, repeatable "measurements": the same day always gives the same figure. */
const wave = (seed, swing = 1) => Math.sin(seed * 1.7) * 0.6 * swing + Math.sin(seed * 0.37 + 1) * 0.4 * swing

function dayLabel(offset) {
  const date = new Date(Date.now() - offset * 86400000)
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const handlers = {
  'GET /api/energy/overview': ({ tick }) => {
    const hour = new Date().getHours() + new Date().getMinutes() / 60
    const sun = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI))
    return {
      pvToday: round(hour * 410 * (0.6 + sun * 0.4) + tick * 0.3),
      windToday: round(hour * 180 + wave(tick / 30, 40) + 400),
      consumptionToday: round(hour * 720 + tick * 0.5 + 1200),
      carbonReduced: round(hour * 590 * 0.000581 + 2.4, 2),
      greenRatio: round(58 + sun * 18 + wave(tick / 40, 3)),
    }
  },
  'GET /api/energy/trend': ({ query }) => {
    const days = Math.min(90, Math.max(1, Number(query.get('days')) || 7))
    const list = []
    for (let offset = days - 1; offset >= 0; offset--) {
      const seed = Math.floor(Date.now() / 86400000) - offset
      const pv = round(3600 + wave(seed, 900))
      const wind = round(1700 + wave(seed + 11, 600))
      const load = round(8400 + wave(seed + 23, 1200))
      list.push({ date: dayLabel(offset), pv, wind, grid: round(Math.max(0, load - pv - wind)), load })
    }
    return { days, list }
  },
  'GET /api/energy/mix': ({ tick }) => ({
    list: [
      { name: '光伏', value: round(3800 + wave(tick / 50, 300)) },
      { name: '风电', value: round(1900 + wave(tick / 60 + 2, 260)) },
      { name: '储能放电', value: round(760 + wave(tick / 40 + 4, 120)) },
      { name: '市电', value: round(2400 + wave(tick / 70 + 6, 300)) },
    ],
  }),
  'GET /api/buildings/consumption': ({ query }) => {
    const month = query.get('month') || `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}`
    const seed = Number(month.replace(/\D/g, '')) || 1
    const top = Math.min(buildings.length, Math.max(1, Number(query.get('top')) || buildings.length))
    const list = buildings
      .map(([name, area], index) => {
        const kwh = Math.round(area * (4.2 + wave(seed + index * 7, 1.1)))
        return {
          building: name,
          area,
          kwh,
          perArea: round(kwh / area, 2),
          change: round(wave(seed + index * 3, 12)),
        }
      })
      .sort((a, b) => b.kwh - a.kwh)
      .slice(0, top)
    return { month, list }
  },
  'GET /api/devices/{deviceId}/history': ({ query, params, tick }) => {
    const metric = deviceMetrics[query.get('metric')] ? query.get('metric') : 'soc'
    const hours = Math.min(72, Math.max(1, Number(query.get('hours')) || 24))
    const { base, swing } = deviceMetrics[metric]
    const deviceSeed = [...params.deviceId].reduce((sum, char) => sum + char.charCodeAt(0), 0)
    const now = Date.now()
    const list = []
    for (let i = hours - 1; i >= 0; i--) {
      const time = new Date(now - i * 3600000)
      const value = round(base + wave(deviceSeed + time.getHours() / 3 + (i === 0 ? tick / 20 : 0), swing))
      list.push({ time: `${pad(time.getHours())}:00`, value })
    }
    return { deviceId: params.deviceId, metric, unit: deviceMetrics[metric].unit, list }
  },
  'POST /api/alarms/query': ({ body, tick }) => {
    const level = typeof body.level === 'string' ? body.level : ''
    const limit = Math.min(50, Math.max(1, Number(body.limit) || 10))
    const records = []
    for (let i = 0; i < 24; i++) {
      const [content, alarmLevel] = alarmTexts[(i + Math.floor(tick / 15)) % alarmTexts.length]
      const time = new Date(Date.now() - i * 47 * 60000)
      records.push({
        time: `${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`,
        device: `ESS-${pad((i % 8) + 1).padStart(3, '0')}`,
        level: alarmLevel,
        content,
        status: i < 3 ? '未处理' : '已处理',
      })
    }
    const filtered = level ? records.filter(record => record.level === level) : records
    return { total: filtered.length, records: filtered.slice(0, limit) }
  },
  'GET /api/carbon/total': ({ tick }) => ({ total: round(12846.5 + tick * 0.02, 2), unit: 't' }),
}

/** What the interfaces mean, in the catalog's terms; the OpenAPI document is generated from this too. */
const datasets = [
  {
    id: 'energy-overview',
    name: '今日能源概览',
    group: '能源',
    description: '今日光伏、风电发电量，用电量，碳减排与绿电占比（一条记录）',
    method: 'GET',
    path: '/api/energy/overview',
    params: [],
    resultPath: 'data',
    resultShape: 'object',
    fields: [
      { key: 'pvToday', label: '今日光伏发电', type: 'number', unit: 'kWh' },
      { key: 'windToday', label: '今日风电发电', type: 'number', unit: 'kWh' },
      { key: 'consumptionToday', label: '今日用电', type: 'number', unit: 'kWh' },
      { key: 'carbonReduced', label: '今日碳减排', type: 'number', unit: 't' },
      { key: 'greenRatio', label: '绿电占比', type: 'number', unit: '%' },
    ],
    refresh: 30,
  },
  {
    id: 'energy-trend',
    name: '近 N 日能源趋势',
    group: '能源',
    description: '每日光伏、风电、市电与总负荷',
    method: 'GET',
    path: '/api/energy/trend',
    params: [
      {
        key: 'days',
        label: '天数',
        type: 'enum',
        in: 'query',
        default: '7',
        options: [
          { value: '7', label: '近 7 天' },
          { value: '14', label: '近 14 天' },
          { value: '30', label: '近 30 天' },
        ],
      },
    ],
    resultPath: 'data.list',
    resultShape: 'rows',
    fields: [
      { key: 'date', label: '日期', type: 'string' },
      { key: 'pv', label: '光伏', type: 'number', unit: 'kWh' },
      { key: 'wind', label: '风电', type: 'number', unit: 'kWh' },
      { key: 'grid', label: '市电', type: 'number', unit: 'kWh' },
      { key: 'load', label: '总负荷', type: 'number', unit: 'kWh' },
    ],
    refresh: 300,
  },
  {
    id: 'energy-mix',
    name: '能源结构占比',
    group: '能源',
    description: '今日各类能源供电量，适合饼图',
    method: 'GET',
    path: '/api/energy/mix',
    params: [],
    resultPath: 'data.list',
    resultShape: 'rows',
    fields: [
      { key: 'name', label: '能源类型', type: 'string' },
      { key: 'value', label: '供电量', type: 'number', unit: 'kWh' },
    ],
    refresh: 60,
  },
  {
    id: 'building-consumption',
    name: '建筑能耗排行',
    group: '建筑',
    description: '各建筑当月用电量、单位面积能耗与环比',
    method: 'GET',
    path: '/api/buildings/consumption',
    params: [
      { key: 'month', label: '月份', type: 'month', in: 'query', default: '' },
      { key: 'top', label: '前几名', type: 'number', in: 'query', default: '8' },
    ],
    resultPath: 'data.list',
    resultShape: 'rows',
    fields: [
      { key: 'building', label: '建筑', type: 'string' },
      { key: 'area', label: '面积', type: 'number', unit: '㎡' },
      { key: 'kwh', label: '用电量', type: 'number', unit: 'kWh' },
      { key: 'perArea', label: '单位面积能耗', type: 'number', unit: 'kWh/㎡' },
      { key: 'change', label: '环比', type: 'number', unit: '%' },
    ],
    refresh: 600,
  },
  {
    id: 'device-history',
    name: '设备历史曲线',
    group: '设备',
    description: '某台设备最近若干小时的逐时数据；设备编号可跟随三维中选中的设备',
    method: 'GET',
    path: '/api/devices/{deviceId}/history',
    params: [
      { key: 'deviceId', label: '设备编号', type: 'string', in: 'path', required: true, default: 'ESS-001' },
      {
        key: 'metric',
        label: '指标',
        type: 'enum',
        in: 'query',
        default: 'soc',
        options: [
          { value: 'soc', label: 'SOC' },
          { value: 'temperature', label: '温度' },
          { value: 'power', label: '功率' },
        ],
      },
      { key: 'hours', label: '小时数', type: 'number', in: 'query', default: '24' },
    ],
    resultPath: 'data.list',
    resultShape: 'rows',
    fields: [
      { key: 'time', label: '时间', type: 'string' },
      { key: 'value', label: '数值', type: 'number' },
    ],
    refresh: 60,
  },
  {
    id: 'alarm-records',
    name: '告警记录',
    group: '安全',
    description: '最近的告警记录，可按级别筛选（POST 请求）',
    method: 'POST',
    path: '/api/alarms/query',
    params: [
      {
        key: 'level',
        label: '级别',
        type: 'enum',
        in: 'body',
        default: '',
        options: [
          { value: '严重', label: '严重' },
          { value: '一般', label: '一般' },
          { value: '提示', label: '提示' },
        ],
      },
      { key: 'limit', label: '条数', type: 'number', in: 'body', default: '10' },
    ],
    resultPath: 'data.records',
    resultShape: 'rows',
    fields: [
      { key: 'time', label: '时间', type: 'string' },
      { key: 'device', label: '设备', type: 'string' },
      { key: 'level', label: '级别', type: 'string' },
      { key: 'content', label: '内容', type: 'string' },
      { key: 'status', label: '状态', type: 'string' },
    ],
    refresh: 30,
  },
  {
    id: 'carbon-total',
    name: '累计碳减排',
    group: '能源',
    description: '园区投运以来累计碳减排量（单个数值）',
    method: 'GET',
    path: '/api/carbon/total',
    params: [],
    resultPath: 'data.total',
    resultShape: 'value',
    fields: [],
    refresh: 60,
  },
]

// ---------------------------------------------------------------- OpenAPI, as a backend framework would emit it

function schemaName(dataset) {
  return dataset.id
    .split('-')
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join('')
}

function fieldSchema(field) {
  return {
    type: field.type === 'number' ? 'number' : 'string',
    description: field.unit ? `${field.label}（${field.unit}）` : field.label,
  }
}

function openApiDocument(serverUrl) {
  const schemas = {}
  const paths = {}
  for (const dataset of datasets) {
    const name = schemaName(dataset)
    const record = {
      type: 'object',
      properties: Object.fromEntries(dataset.fields.map(field => [field.key, fieldSchema(field)])),
    }
    // Put the record schema where resultPath says, inside the { code, msg, data } wrapper.
    let inner =
      dataset.resultShape === 'rows'
        ? { type: 'array', items: { $ref: `#/components/schemas/${name}` } }
        : dataset.resultShape === 'object'
          ? { $ref: `#/components/schemas/${name}` }
          : { type: 'number', description: dataset.description }
    if (dataset.resultShape !== 'value') schemas[name] = record
    for (const key of dataset.resultPath.split('.').slice(1).reverse())
      inner = { type: 'object', properties: { [key]: inner } }
    const wrapper = {
      type: 'object',
      properties: { code: { type: 'integer', description: '0 表示成功' }, msg: { type: 'string' }, data: inner },
    }
    const parameters = dataset.params
      .filter(param => param.in !== 'body')
      .map(param => ({
        name: param.key,
        in: param.in,
        required: param.in === 'path' || !!param.required,
        description: param.label,
        schema: {
          type: param.type === 'number' ? 'integer' : 'string',
          ...(param.options ? { enum: param.options.map(option => option.value) } : {}),
          ...(param.default ? { default: param.default } : {}),
        },
      }))
    const bodyParams = dataset.params.filter(param => param.in === 'body')
    paths[dataset.path] = {
      [dataset.method.toLowerCase()]: {
        tags: [dataset.group],
        summary: dataset.name,
        description: dataset.description,
        operationId: dataset.id,
        parameters,
        ...(bodyParams.length
          ? {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: Object.fromEntries(
                        bodyParams.map(param => [
                          param.key,
                          {
                            type: param.type === 'number' ? 'integer' : 'string',
                            description: param.label,
                            ...(param.options ? { enum: param.options.map(option => option.value) } : {}),
                          },
                        ]),
                      ),
                    },
                  },
                },
              },
            }
          : {}),
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: wrapper } } } },
      },
    }
  }
  return {
    openapi: '3.0.1',
    info: { title: '零碳园区业务接口（演示）', version: '1.0.0' },
    servers: [{ url: serverUrl }],
    paths,
    components: { schemas },
  }
}

// ---------------------------------------------------------------- routing

function match(method, pathname) {
  for (const [route, handler] of Object.entries(handlers)) {
    const [routeMethod, routePath] = route.split(' ')
    if (routeMethod !== method) continue
    const names = []
    const pattern = new RegExp(
      `^${routePath.replace(/\{(\w+)\}/g, (_, name) => {
        names.push(name)
        return '([^/]+)'
      })}$`,
    )
    const found = pathname.match(pattern)
    if (found)
      return { handler, params: Object.fromEntries(names.map((name, i) => [name, decodeURIComponent(found[i + 1])])) }
  }
  return null
}

function readBody(request) {
  return new Promise(resolve => {
    let text = ''
    request.on('data', chunk => (text += chunk))
    request.on('end', () => {
      try {
        resolve(text ? JSON.parse(text) : {})
      } catch {
        resolve({})
      }
    })
  })
}

/** Answers demo API requests; returns false for paths it does not serve. */
export async function handleDemoApi(request, response, tick) {
  const url = new URL(request.url, 'http://localhost')
  const send = (status, value) => {
    response.statusCode = status
    response.end(JSON.stringify(value))
  }
  if (url.pathname === '/screen/datasets' && request.method === 'GET') {
    send(200, { version: 1, name: '零碳园区业务接口（演示）', datasets })
    return true
  }
  if (url.pathname === '/openapi.json' && request.method === 'GET') {
    send(200, openApiDocument(`http://${request.headers.host ?? 'localhost'}`))
    return true
  }
  if (!url.pathname.startsWith('/api/')) return false
  const found = match(request.method, url.pathname)
  if (!found) {
    send(404, { code: 404, msg: `接口不存在：${request.method} ${url.pathname}` })
    return true
  }
  const body = request.method === 'GET' ? {} : await readBody(request)
  send(200, { code: 0, msg: 'ok', data: found.handler({ query: url.searchParams, params: found.params, body, tick }) })
  return true
}
