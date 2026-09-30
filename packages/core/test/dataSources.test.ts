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
