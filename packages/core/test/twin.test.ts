import { describe, expect, it } from 'vitest'
import { isTwinBinding, isTwinBindingTarget, twinBindingTargetKey } from '../src/domain/twin'
import { patch, REMOVE } from './helpers'

describe('isTwinBindingTarget', () => {
  it.each([
    [{ type: 'asset-instance', instanceId: 'i1' }],
    [{ type: 'asset-node', instanceId: 'i1', assetNodeId: 'legacy:root/0' }],
    [{ type: 'primitive', nodeId: 'n1' }],
    // Extra keys are tolerated.
    [{ type: 'primitive', nodeId: 'n1', note: 'x' }],
  ])('accepts %j', value => expect(isTwinBindingTarget(value)).toBe(true))

  it.each([
    [null],
    ['primitive'],
    [[]],
    [{}],
    [{ type: 'unknown', nodeId: 'n1' }],
    [{ type: 'asset-instance' }],
    [{ type: 'asset-instance', instanceId: '' }],
    [{ type: 'asset-instance', instanceId: 7 }],
    [{ type: 'asset-node', instanceId: 'i1' }],
    [{ type: 'asset-node', instanceId: 'i1', assetNodeId: '' }],
    [{ type: 'asset-node', instanceId: '', assetNodeId: 'a' }],
    [{ type: 'primitive', nodeId: '' }],
    [{ type: 'primitive', instanceId: 'i1' }],
  ])('rejects %j', value => expect(isTwinBindingTarget(value)).toBe(false))

  it('builds stable keys', () => {
    expect(twinBindingTargetKey({ type: 'asset-instance', instanceId: 'i1' })).toBe('asset-instance:i1')
    expect(twinBindingTargetKey({ type: 'asset-node', instanceId: 'i1', assetNodeId: 'a/b' })).toBe('asset-node:i1:a/b')
    expect(twinBindingTargetKey({ type: 'primitive', nodeId: 'n1' })).toBe('primitive:n1')
  })
})

const binding = {
  id: 'binding-ess-1',
  target: { type: 'asset-instance', instanceId: 'instance_ess-1' },
  device: { id: 'ESS-001', name: '储能柜 01', type: 'energy-storage-cabinet' },
  variables: [
    { id: 'v1', key: 'soc', name: 'SOC', dataType: 'number', unit: '%' },
    { id: 'v2', key: 'alarm', name: '告警', dataType: 'boolean' },
    { id: 'v3', key: 'status', name: '状态', dataType: 'string' },
  ],
}

describe('isTwinBinding', () => {
  it('accepts a complete binding', () => expect(isTwinBinding(binding)).toBe(true))

  it.each([
    ['empty id (current rule: any string)', ['id'], ''],
    ['empty device id', ['device', 'id'], ''],
    ['no device type', ['device', 'type'], REMOVE],
    ['no variables', ['variables'], []],
    ['no unit', ['variables', 0, 'unit'], REMOVE],
    ['extra binding field', ['extra'], 1],
    ['extra variable field', ['variables', 0, 'extra'], 1],
  ])('accepts %s', (_label, path, value) => expect(isTwinBinding(patch(binding, path, value))).toBe(true))

  it.each([
    ['missing id', ['id'], REMOVE],
    ['numeric id', ['id'], 1],
    ['bad target', ['target'], { type: 'primitive' }],
    ['device not an object', ['device'], 'ESS-001'],
    ['device array', ['device'], []],
    ['missing device name', ['device', 'name'], REMOVE],
    ['numeric device type', ['device', 'type'], 1],
    ['variables not an array', ['variables'], {}],
    ['variable not an object', ['variables', 0], 'soc'],
    ['unknown data type', ['variables', 0, 'dataType'], 'integer'],
    ['missing variable key', ['variables', 1, 'key'], REMOVE],
    ['numeric unit', ['variables', 0, 'unit'], 1],
  ])('rejects %s', (_label, path, value) => expect(isTwinBinding(patch(binding, path, value))).toBe(false))
})
