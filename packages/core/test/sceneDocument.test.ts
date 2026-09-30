import { describe, expect, it } from 'vitest'
import { isSceneDocumentV1 } from '../src/domain/scene'
import { fixture, patch, REMOVE } from './helpers'

const fixtures = ['zero-carbon-park-models', 'zero-carbon-park-primitives', 'sdk-assets']
const park = fixture('v1/zero-carbon-park-models.scene.json') as Record<string, unknown>

const minimal = {
  version: 1,
  projectId: 'p1',
  metadata: { updatedAt: '2026-10-01T00:00:00.000Z' },
  instances: [],
  primitives: [],
}

describe('isSceneDocumentV1 — real documents', () => {
  it.each(fixtures)('accepts fixture %s', name =>
    expect(isSceneDocumentV1(fixture(`v1/${name}.scene.json`))).toBe(true),
  )

  it('accepts the minimal document', () => expect(isSceneDocumentV1(minimal)).toBe(true))
})

describe('isSceneDocumentV1 — tolerated variations', () => {
  it.each([
    ['empty project id', ['projectId'], ''],
    ['metadata name', ['metadata', 'name'], '园区'],
    ['no scene settings', ['sceneSettings'], REMOVE],
    ['no camera view', ['cameraView'], REMOVE],
    ['camera without fov', ['cameraView', 'fov'], REMOVE],
    ['no bindings', ['bindings'], REMOVE],
    ['duplicate binding ids (not checked)', ['bindings', 1, 'id'], 'binding-ess-1'],
    ['no effects', ['effects'], REMOVE],
    ['no rules', ['visualRules'], REMOVE],
    ['no interactions', ['interactions'], REMOVE],
    ['no data sources', ['dataSources'], REMOVE],
    ['empty data sources', ['dataSources'], []],
    ['environment asset', ['sceneSettings', 'environmentAssetId'], 'asset-hdr'],
    ['zero lighting', ['sceneSettings', 'lighting', 'ambientIntensity'], 0],
    ['extra top-level field', ['extra'], { anything: true }],
    ['extra instance field', ['instances', 0, 'extra'], 1],
    ['deleted asset nodes', ['instances', 0, 'deletedAssetNodeIds'], ['legacy:root/0']],
    ['empty instance name', ['instances', 0, 'name'], ''],
    [
      'node override',
      ['instances', 0, 'nodeOverrides'],
      [{ assetNodeId: 'a', name: 'n', transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }],
    ],
    ['primitive colour only', ['primitives', 0, 'properties'], { color: '#ffffff' }],
  ])('accepts %s', (_label, path, value) => expect(isSceneDocumentV1(patch(park, path, value))).toBe(true))
})

describe('isSceneDocumentV1 — rejected documents', () => {
  it.each([
    ['version 2', ['version'], 2],
    ['version as string', ['version'], '1'],
    ['missing project id', ['projectId'], REMOVE],
    ['missing metadata', ['metadata'], REMOVE],
    ['missing updatedAt', ['metadata', 'updatedAt'], REMOVE],
    ['instances not an array', ['instances'], {}],
    ['missing primitives', ['primitives'], REMOVE],
    // Scene settings
    ['grid flag not boolean', ['sceneSettings', 'gridEnabled'], 'yes'],
    ['ground size zero', ['sceneSettings', 'ground', 'size'], 0],
    ['ground colour not string', ['sceneSettings', 'ground', 'color'], 0x333333],
    ['negative light', ['sceneSettings', 'lighting', 'directionalIntensity'], -1],
    ['light position of two numbers', ['sceneSettings', 'lighting', 'directionalPosition'], [1, 2]],
    ['environment id missing', ['sceneSettings', 'environmentAssetId'], REMOVE],
    ['environment id numeric', ['sceneSettings', 'environmentAssetId'], 7],
    // Camera
    ['camera target missing', ['cameraView', 'target'], REMOVE],
    ['camera fov zero', ['cameraView', 'fov'], 0],
    // Instances
    ['instance without asset', ['instances', 0, 'assetId'], REMOVE],
    ['instance transform of strings', ['instances', 0, 'transform', 'position'], ['0', '0', '0']],
    ['instance scale of four', ['instances', 0, 'transform', 'scale'], [1, 1, 1, 1]],
    ['overrides not an array', ['instances', 0, 'nodeOverrides'], REMOVE],
    ['override without transform', ['instances', 0, 'nodeOverrides'], [{ assetNodeId: 'a', name: 'n' }]],
    ['deleted nodes of numbers', ['instances', 0, 'deletedAssetNodeIds'], [1]],
    // Primitives
    ['unknown primitive type', ['primitives', 0, 'type'], 'sphere'],
    ['primitive without colour', ['primitives', 0, 'properties'], { width: 1 }],
    ['primitive without transform', ['primitives', 0, 'transform'], REMOVE],
    // Nested collections
    ['invalid binding', ['bindings', 0, 'device'], REMOVE],
    ['invalid effect', ['effects', 0, 'kind'], 'sparkles'],
    ['duplicate effect ids', ['effects', 1, 'id'], (park.effects as { id: string }[])[0]!.id],
    ['invalid rule', ['visualRules', 0, 'priority'], 1000],
    ['duplicate rule ids', ['visualRules', 1, 'id'], (park.visualRules as { id: string }[])[0]!.id],
    ['invalid interaction', ['interactions', 0, 'trigger'], 'tap'],
    ['duplicate interaction ids', ['interactions', 1, 'id'], (park.interactions as { id: string }[])[0]!.id],
    ['invalid data sources', ['dataSources', 0, 'url'], 'http://host'],
  ])('rejects %s', (_label, path, value) => expect(isSceneDocumentV1(patch(park, path, value))).toBe(false))

  it.each([[null], ['{}'], [[]], [{ ...minimal, version: undefined }]])('rejects %j', value =>
    expect(isSceneDocumentV1(value)).toBe(false),
  )
})

describe('scene settings helpers', () => {
  it('creates valid defaults and deep copies', async () => {
    const { cloneSceneSettings, createDefaultSceneSettings } = await import('../src/domain/scene')
    const defaults = createDefaultSceneSettings()
    expect(isSceneDocumentV1({ ...minimal, sceneSettings: defaults })).toBe(true)
    const copy = cloneSceneSettings(defaults)
    copy.lighting.directionalPosition[0] = 99
    copy.ground.size = 1
    expect(defaults.lighting.directionalPosition[0]).toBe(5)
    expect(defaults.ground.size).toBe(200)
  })
})
