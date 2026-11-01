import { describe, expect, it } from 'vitest'
import {
  activeDataSource,
  DEFAULT_REALTIME_URL,
  defaultDataSources,
  isProjectDataSources,
} from '../src/domain/dataSources'

const ws = {
  id: 'realtime',
  name: '实时设备数据',
  type: 'websocket',
  enabled: true,
  url: 'ws://127.0.0.1:8787/realtime',
} as const
const mock = { id: 'legacy', name: '演示数据', type: 'mock', enabled: false } as const

describe('isProjectDataSources', () => {
  it.each([
    ['empty list', []],
    ['defaults', defaultDataSources()],
    ['websocket', [ws]],
    ['wss with port and query', [{ ...ws, url: 'wss://gateway.example.com:9443/rt?site=1' }]],
    ['legacy mock entry', [{ ...mock, enabled: true }]],
    ['one enabled among several', [ws, mock, { ...ws, id: 'backup', enabled: false }]],
    ['all disabled', [{ ...ws, enabled: false }, mock]],
    ['sixteen sources', Array.from({ length: 16 }, (_, i) => ({ ...ws, id: `s${i}`, enabled: i === 0 }))],
    ['empty hash marker', [{ ...ws, url: 'ws://host/rt#' }]],
  ])('accepts %s', (_label, value) => expect(isProjectDataSources(value)).toBe(true))

  it.each([
    ['not an array', ws],
    ['seventeen sources', Array.from({ length: 17 }, (_, i) => ({ ...ws, id: `s${i}`, enabled: false }))],
    ['two enabled', [ws, { ...ws, id: 'other' }]],
    ['duplicate id', [ws, { ...ws, enabled: false }]],
    ['blank id', [{ ...ws, id: '  ' }]],
    ['blank name', [{ ...ws, name: ' ' }]],
    ['non-boolean enabled', [{ ...ws, enabled: 'yes' }]],
    ['unknown type', [{ ...ws, type: 'mqtt' }]],
    ['http url', [{ ...ws, url: 'http://host/rt' }]],
    ['javascript url', [{ ...ws, url: 'javascript:alert(1)' }]],
    ['credentials in url', [{ ...ws, url: 'ws://user:secret@host/rt' }]],
    ['password only', [{ ...ws, url: 'ws://:secret@host/rt' }]],
    ['url fragment', [{ ...ws, url: 'ws://host/rt#token' }]],
    ['not a url', [{ ...ws, url: 'not a url' }]],
    ['missing url', [{ id: 'x', name: 'x', type: 'websocket', enabled: true }]],
    ['extra key on websocket', [{ ...ws, token: 'secret' }]],
    ['url on mock', [{ ...mock, url: 'ws://host/rt' }]],
    ['null entry', [null]],
  ])('rejects %s', (_label, value) => expect(isProjectDataSources(value)).toBe(false))
})

describe('activeDataSource', () => {
  it('uses only an enabled websocket source', () => {
    expect(activeDataSource([ws])).toEqual(ws)
    expect(activeDataSource([{ ...ws, enabled: false }])).toBeNull()
    expect(activeDataSource([{ ...mock, enabled: true }])).toBeNull()
    expect(activeDataSource([])).toBeNull()
    expect(activeDataSource(undefined)).toBeNull()
  })

  it('throws on invalid configuration', () => {
    expect(() => activeDataSource([ws, { ...ws, id: 'b' }])).toThrow('数据源配置无效')
  })

  it('defaults to the local simulator', () => {
    expect(defaultDataSources()).toEqual([
      { id: 'realtime', name: '实时设备数据', type: 'websocket', enabled: true, url: DEFAULT_REALTIME_URL },
    ])
  })
})

describe('http and static sources', () => {
  const http = {
    id: 'http',
    name: '定时请求',
    type: 'http',
    enabled: true,
    url: 'https://api.example.com/devices/latest',
    method: 'GET',
    interval: 5,
    resultPath: 'data.list',
    withCredentials: false,
  } as const
  const fixed = {
    id: 'static',
    name: '静态数据',
    type: 'static',
    enabled: true,
    values: { 'ESS-001': { soc: 72 } },
  } as const

  it.each([
    ['http', [http]],
    ['same-origin path', [{ ...http, url: '/park-api/devices' }]],
    ['post with body', [{ ...http, method: 'POST', body: '{"site":1}' }]],
    ['static values', [fixed]],
    ['one enabled among types', [http, { ...fixed, enabled: false }, { ...ws, enabled: false }]],
  ])('accepts %s', (_label, value) => expect(isProjectDataSources(value)).toBe(true))

  it.each([
    ['ws url on http', [{ ...http, url: 'ws://host/rt' }]],
    ['protocol-relative url', [{ ...http, url: '//evil.example.com/x' }]],
    ['credentials in http url', [{ ...http, url: 'https://user:pw@host/x' }]],
    ['zero interval', [{ ...http, interval: 0 }]],
    ['token header', [{ ...http, headers: { Authorization: 'Bearer x' } }]],
    ['object as a static value', [{ ...fixed, values: { 'ESS-001': { soc: { nested: 1 } } } }]],
    ['two enabled of different types', [http, fixed]],
  ])('rejects %s', (_label, value) => expect(isProjectDataSources(value)).toBe(false))

  it('makes http and static sources active like websocket', () => {
    expect(activeDataSource([http])?.type).toBe('http')
    expect(activeDataSource([{ ...ws, enabled: false }, fixed])?.type).toBe('static')
  })
})
