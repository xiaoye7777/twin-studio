import { describe, expect, it } from 'vitest'
import { createInteraction, isSceneInteraction } from '../src/domain/interactions'
import { patch, REMOVE } from './helpers'

const source = { type: 'asset-instance', instanceId: 'instance_ess-1' }
const interaction = {
  id: 'ess-1-interaction-3',
  enabled: true,
  source,
  trigger: 'click',
  action: {
    type: 'emit-event',
    eventName: 'open-device-detail',
    metadata: { zone: '储能区', demo: 'zero-carbon-park' },
  },
}

function nested(depth: number): unknown {
  return depth === 0 ? 'leaf' : { next: nested(depth - 1) }
}

describe('isSceneInteraction', () => {
  it.each([
    ['business event', interaction],
    ['created interaction', createInteraction({ type: 'primitive', nodeId: 'n1' })],
    ['every trigger', { ...interaction, trigger: 'double-click' }],
    ['focus', { ...interaction, action: { type: 'focus' } }],
    [
      'select another target',
      { ...interaction, action: { type: 'select', target: { type: 'primitive', nodeId: 'n2' } } },
    ],
    ['show / hide', { ...interaction, action: { type: 'hide' } }],
    ['clear selection', { ...interaction, action: { type: 'clear-selection' } }],
    ['highlight on hover', { ...interaction, trigger: 'hover-enter', action: { type: 'highlight' } }],
    ['event without metadata', { ...interaction, action: { type: 'emit-event', eventName: 'a' } }],
    ['event name characters', { ...interaction, action: { type: 'emit-event', eventName: 'Device.open:detail_2-x' } }],
    ['event name 64 chars', { ...interaction, action: { type: 'emit-event', eventName: `a${'b'.repeat(63)}` } }],
    [
      'metadata values',
      patch(interaction, ['action', 'metadata'], { n: 1, b: false, z: null, list: [1, 'a', { k: [] }] }),
    ],
    ['metadata nested to depth 10', patch(interaction, ['action', 'metadata'], nested(10))],
    ['extra fields', { ...interaction, extra: 1, action: { ...interaction.action, extra: 2 } }],
  ])('accepts %s', (_label, value) => expect(isSceneInteraction(value)).toBe(true))

  it.each([
    ['empty id', ['id'], ''],
    ['non-boolean enabled', ['enabled'], 'true'],
    ['bad source', ['source'], { type: 'asset-instance' }],
    ['unknown trigger', ['trigger'], 'long-press'],
    ['action not an object', ['action'], 'select'],
    ['unknown action', ['action', 'type'], 'teleport'],
    ['bad action target', ['action', 'target'], { type: 'primitive', nodeId: '' }],
    ['missing event name', ['action', 'eventName'], REMOVE],
    ['event name starting with a digit', ['action', 'eventName'], '1open'],
    ['event name with space', ['action', 'eventName'], 'open detail'],
    ['event name over 64 chars', ['action', 'eventName'], `a${'b'.repeat(64)}`],
    ['metadata array', ['action', 'metadata'], [1, 2]],
    ['metadata string', ['action', 'metadata'], 'x'],
    ['metadata nested beyond depth 10', ['action', 'metadata'], nested(11)],
  ])('rejects %s', (_label, path, value) => expect(isSceneInteraction(patch(interaction, path, value))).toBe(false))

  it('rejects highlight on non-hover triggers', () => {
    expect(isSceneInteraction({ ...interaction, trigger: 'click', action: { type: 'highlight' } })).toBe(false)
  })
})
