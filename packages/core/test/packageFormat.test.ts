import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SceneDocumentV1 } from '../src/domain/scene'
import { collectSceneAssets, json, sha256, validateManifest } from '../src/infrastructure/packages/packageFormat'
import { validatePortableAsset } from '../src/infrastructure/packages/validatePortableAsset'
import { clone, fixture, patch, REMOVE } from './helpers'

const manifest = fixture('v1/zero-carbon-park-models.manifest.json') as Record<string, unknown>
const scene = fixture('v1/zero-carbon-park-models.scene.json') as SceneDocumentV1

describe('validateManifest', () => {
  it.each(['zero-carbon-park-models', 'zero-carbon-park-primitives', 'sdk-assets'])('accepts fixture %s', name =>
    expect(() => validateManifest(fixture(`v1/${name}.manifest.json`))).not.toThrow(),
  )

  it.each([
    ['foreign format', ['format'], 'other', '不是 Twin Studio 项目包'],
    ['not an object', [], null, '不是 Twin Studio 项目包'],
    ['package version 2', ['packageVersion'], 2, '不支持的 packageVersion: 2'],
    ['blank project name', ['project', 'name'], '  ', 'manifest 项目或场景信息无效'],
    ['project name over 200', ['project', 'name'], 'x'.repeat(201), 'manifest 项目或场景信息无效'],
    ['invalid createdAt', ['project', 'createdAt'], 'yesterday', 'manifest 项目或场景信息无效'],
    ['scene path', ['scene', 'path'], 'other.json', 'manifest 项目或场景信息无效'],
    ['scene hash', ['scene', 'sha256'], 'ABC', 'manifest 项目或场景信息无效'],
    ['assets not an array', ['assets'], {}, 'manifest 项目或场景信息无效'],
    ['asset path outside assets/', ['assets', 0, 'path'], '../0.glb', 'manifest 资产信息无效'],
    ['asset name with slash', ['assets', 0, 'name'], 'a/b.glb', 'manifest 资产信息无效'],
    ['asset name with control char', ['assets', 0, 'name'], 'a\u0001.glb', 'manifest 资产信息无效'],
    ['asset type', ['assets', 0, 'assetType'], 'texture', 'manifest 资产信息无效'],
    ['asset size zero', ['assets', 0, 'size'], 0, 'manifest 资产信息无效'],
    ['asset size fractional', ['assets', 0, 'size'], 1.5, 'manifest 资产信息无效'],
    ['asset size over 128 MiB', ['assets', 0, 'size'], 128 * 1024 ** 2 + 1, 'manifest 资产信息无效'],
    ['asset hash', ['assets', 0, 'sha256'], 'x', 'manifest 资产信息无效'],
    ['asset createdAt', ['assets', 0, 'createdAt'], 'soon', 'manifest 资产信息无效'],
    ['model saved as .hdr', ['assets', 0, 'path'], 'assets/0.hdr', '资产文件类型不匹配'],
    ['model name without .glb', ['assets', 0, 'name'], 'container.obj', '资产文件类型不匹配'],
    ['model mime type', ['assets', 0, 'mimeType'], 'application/octet-stream', '资产文件类型不匹配'],
    ['duplicate asset path', ['assets', 1, 'path'], 'assets/0.glb', 'manifest 包含重复资产'],
  ])('rejects %s', (_label, path, value, message) => {
    const input = path.length ? patch(manifest, path, value) : value
    expect(() => validateManifest(input)).toThrow(message)
  })

  it('tolerates extra fields', () => {
    expect(() => validateManifest({ ...clone(manifest), note: 'x' })).not.toThrow()
    expect(() => validateManifest(patch(manifest, ['project', 'extra'], 1))).not.toThrow()
  })

  it('treats a missing asset list entry field as invalid', () => {
    expect(() => validateManifest(patch(manifest, ['assets', 0, 'lastModified'], REMOVE))).toThrow(
      'manifest 资产信息无效',
    )
  })
})

describe('collectSceneAssets', () => {
  it('lists each model once', () => {
    const assets = collectSceneAssets(scene)
    expect(assets.size).toBe(8)
    expect([...assets.values()].every(type => type === 'model')).toBe(true)
  })

  it('includes the environment map and rejects double use', () => {
    const withEnvironment = patch(scene, ['sceneSettings', 'environmentAssetId'], 'hdr-1')
    expect(collectSceneAssets(withEnvironment).get('hdr-1')).toBe('environment')
    const clash = patch(scene, ['sceneSettings', 'environmentAssetId'], scene.instances[0]!.assetId)
    expect(() => collectSceneAssets(clash)).toThrow('同一资产不能同时作为模型和环境')
  })
})

describe('json and sha256', () => {
  it('parses UTF-8 JSON and reports failures', () => {
    expect(json(new TextEncoder().encode('{"a":"储能"}'), 'x')).toEqual({ a: '储能' })
    expect(() => json(undefined, 'scene.json')).toThrow('scene.json 缺失或超过大小限制')
    expect(() => json(new TextEncoder().encode('{'), 'scene.json')).toThrow('scene.json 不是有效 JSON')
    expect(() => json(new Uint8Array([0xff, 0xfe]), 'scene.json')).toThrow('不是有效 JSON')
  })

  it('hashes bytes as lowercase hex', async () => {
    expect(await sha256(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('validatePortableAsset (GLB)', () => {
  const demoModel = (name: string) =>
    new Uint8Array(readFileSync(new URL(`../../../apps/editor/public/demo-assets/${name}`, import.meta.url)))

  it.each(['energy-storage-container.glb', 'wind-turbine.glb', 'office-tower.glb'])('accepts bundled %s', name =>
    expect(() => validatePortableAsset(demoModel(name), 'model')).not.toThrow(),
  )

  function glb(document: object, binary = new Uint8Array(0)): Uint8Array {
    let text = new TextEncoder().encode(JSON.stringify(document))
    const pad = (n: number) => (4 - (n % 4)) % 4
    text = new Uint8Array([...text, ...new Array(pad(text.length)).fill(0x20)])
    const bin = new Uint8Array([...binary, ...new Array(pad(binary.length)).fill(0)])
    const length = 12 + 8 + text.length + (bin.length ? 8 + bin.length : 0)
    const bytes = new Uint8Array(length)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, 0x46546c67, true)
    view.setUint32(4, 2, true)
    view.setUint32(8, length, true)
    view.setUint32(12, text.length, true)
    view.setUint32(16, 0x4e4f534a, true)
    bytes.set(text, 20)
    if (bin.length) {
      view.setUint32(20 + text.length, bin.length, true)
      view.setUint32(24 + text.length, 0x004e4942, true)
      bytes.set(bin, 28 + text.length)
    }
    return bytes
  }

  it('accepts embedded buffers and data URIs', () => {
    expect(() => validatePortableAsset(glb({ asset: { version: '2.0' } }), 'model')).not.toThrow()
    expect(() =>
      validatePortableAsset(
        glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }] }, new Uint8Array(4)),
        'model',
      ),
    ).not.toThrow()
    expect(() =>
      validatePortableAsset(
        glb({ asset: { version: '2.0' }, images: [{ uri: 'data:image/png;base64,AAAA' }] }),
        'model',
      ),
    ).not.toThrow()
  })

  it.each([
    ['truncated', new Uint8Array(10), 'GLB 文件被截断'],
    [
      'wrong magic',
      (() => {
        const b = glb({ asset: { version: '2.0' } })
        b[0] = 0
        return b
      })(),
      'GLB 头部或版本无效',
    ],
    ['glTF 1.0 content', glb({ asset: { version: '1.0' } }), 'GLB 内容无效'],
    ['external texture', glb({ asset: { version: '2.0' }, images: [{ uri: 'Textures/colormap.png' }] }), '外部资源'],
    ['external buffer', glb({ asset: { version: '2.0' }, buffers: [{ uri: 'scene.bin', byteLength: 4 }] }), '外部资源'],
    ['buffer larger than BIN', glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 64 }] }), '二进制缓冲区不完整'],
  ])('rejects %s', (_label, bytes, message) => expect(() => validatePortableAsset(bytes, 'model')).toThrow(message))
})

describe('validatePortableAsset (HDR)', () => {
  const hdr = (header: string) => new TextEncoder().encode(header)

  it.each([
    ['missing signature', '-Y 2 +X 2\n', 'HDR 格式无效或尺寸过大'],
    ['missing dimensions', '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n', 'HDR 格式无效或尺寸过大'],
    ['over 16M pixels', '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 5000 +X 5000\n', 'HDR 格式无效或尺寸过大'],
  ])('rejects %s', (_label, header, message) =>
    expect(() => validatePortableAsset(hdr(header), 'environment')).toThrow(message),
  )

  // Known gap (current behaviour, locked here on purpose): three's RGBELoader does not throw when the
  // pixel data is missing, so a truncated HDR passes validation. Tightening it is a separate decision.
  it('currently accepts a header without pixel data', () => {
    expect(() =>
      validatePortableAsset(hdr('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 2\n'), 'environment'),
    ).not.toThrow()
  })

  it('accepts a small uncompressed image', () => {
    const header = hdr('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 2\n')
    const pixels = new Uint8Array(2 * 2 * 4).fill(128)
    expect(() => validatePortableAsset(new Uint8Array([...header, ...pixels]), 'environment')).not.toThrow()
  })
})
