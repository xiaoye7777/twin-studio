import { describe, expect, it } from 'vitest'
import {
  loadSceneDocument,
  migrateSceneDocument,
  SCENE_DOCUMENT_VERSION,
  SceneDocumentError,
  SceneDocumentVersionError,
} from '../src/domain/scene/sceneVersioning'
import { fixture, patch } from './helpers'

const v1Fixtures = ['zero-carbon-park-models', 'zero-carbon-park-primitives', 'sdk-assets']

describe('compatibility: every v1 document ever shipped still loads', () => {
  it.each(v1Fixtures)('%s loads unchanged', name => {
    const raw = fixture(`v1/${name}.scene.json`)
    const { document, migratedFrom } = loadSceneDocument(raw)
    // Deep equality proves validation keeps every field of real documents (nothing stripped).
    expect(document).toEqual(raw)
    expect(migratedFrom).toBeNull()
  })

  it('returns a copy, not the input object', () => {
    const raw = fixture('v1/sdk-assets.scene.json')
    expect(loadSceneDocument(raw).document).not.toBe(raw)
  })
})

describe('version handling', () => {
  const park = fixture('v1/zero-carbon-park-models.scene.json')

  it('reports documents from a newer editor with an upgrade hint', () => {
    const next = SCENE_DOCUMENT_VERSION + 1
    const load = () => loadSceneDocument(patch(park, ['version'], next))
    expect(load).toThrow(SceneDocumentVersionError)
    expect(load).toThrow(`场景文件格式为 v${next}`)
    expect(load).toThrow('请升级 Viewer SDK 或编辑器')
  })

  it.each([
    ['missing version', patch(park, ['version'], undefined)],
    ['string version', patch(park, ['version'], '1')],
    ['zero version', patch(park, ['version'], 0)],
    ['fractional version', patch(park, ['version'], 1.5)],
  ])('rejects %s', (_label, value) => expect(() => loadSceneDocument(value)).toThrow('格式版本'))

  it('rejects non-objects', () => {
    expect(() => loadSceneDocument(null)).toThrow('不是 JSON 对象')
    expect(() => loadSceneDocument([])).toThrow('不是 JSON 对象')
  })
})

describe('readable validation errors', () => {
  const park = fixture('v1/zero-carbon-park-models.scene.json')

  it('names the exact location and problem in Chinese', () => {
    try {
      loadSceneDocument(patch(park, ['effects', 3, 'parameters', 'opacity'], 1.5))
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(SceneDocumentError)
      const { message, issues } = error as SceneDocumentError
      expect(issues).toHaveLength(1)
      expect(issues[0]).toMatch(/^effects\[3\]\.parameters\.opacity：/)
      expect(message).toContain('场景文件校验失败：effects[3].parameters.opacity：')
    }
  })

  it('reports custom rules with their own message', () => {
    const duplicate = patch(park, ['visualRules', 1, 'id'], 'ess-1-hot')
    expect(() => loadSceneDocument(duplicate)).toThrow('visualRules[1]：规则 ID重复：ess-1-hot')
    const badUrl = patch(park, ['dataSources', 0, 'url'], 'http://host')
    expect(() => loadSceneDocument(badUrl)).toThrow('dataSources[0].url：地址必须是 ws:// 或 wss://')
  })

  it('summarises many problems', () => {
    let doc = park
    for (let i = 0; i < 5; i++) doc = patch(doc, ['instances', i, 'name'], 0)
    expect(() => loadSceneDocument(doc)).toThrow('另有 2 处问题')
  })
})

describe('migration chain', () => {
  const table = {
    1: (doc: Record<string, unknown>) => ({ ...doc, renamed: doc.old, old: undefined }),
    2: (doc: Record<string, unknown>) => ({ ...doc, added: true }),
  }

  it('applies each step in order and stamps the version', () => {
    const input = { version: 1, old: 'x' }
    const result = migrateSceneDocument(input, 1, 3, table)
    expect(result).toEqual({ version: 3, renamed: 'x', old: undefined, added: true })
    expect(input).toEqual({ version: 1, old: 'x' })
  })

  it('fails loudly when a step is missing', () => {
    expect(() => migrateSceneDocument({ version: 1 }, 1, 4, table)).toThrow('v3 → v4')
  })
})
