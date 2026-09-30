// Publishes the Zod schemas as language-neutral JSON Schema files under docs/schema/.
// The test fails when a committed file is out of date; `pnpm --filter @twin-studio/core schema:update` rewrites them.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { SCENE_DOCUMENT_VERSION, SceneDocumentSchemaV1 } from '../src/domain/scene'
import { PackageManifestSchema } from '../src/infrastructure/packages/packageFormat'

const outputDirectory = new URL('../../../docs/schema/', import.meta.url)

function jsonSchema(schema: z.ZodType, title: string, description: string): string {
  const generated = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    // Custom checks (JSON metadata depth, unique ids, URL safety) are enforced by the SDK, not expressible here.
    unrepresentable: 'any',
  })
  return `${JSON.stringify({ title, description, ...generated }, null, 2)}\n`
}

const files: Record<string, string> = {
  [`scene-document.v${SCENE_DOCUMENT_VERSION}.schema.json`]: jsonSchema(
    SceneDocumentSchemaV1,
    `Twin Studio scene document v${SCENE_DOCUMENT_VERSION}`,
    'scene.json inside a .twin.zip project package. Generated from the Zod schema in @twin-studio/core; ' +
      'unique ids, safe WebSocket URLs and metadata depth are additionally enforced at load time.',
  ),
  'package-manifest.v1.schema.json': jsonSchema(
    PackageManifestSchema,
    'Twin Studio project package manifest v1',
    'manifest.json inside a .twin.zip project package. Generated from the Zod schema in @twin-studio/core.',
  ),
}

describe('published JSON Schema', () => {
  if (process.env.UPDATE_SCHEMAS) {
    mkdirSync(outputDirectory, { recursive: true })
    for (const [name, content] of Object.entries(files)) writeFileSync(new URL(name, outputDirectory), content)
  }

  it.each(Object.keys(files))('%s is up to date', name => {
    const path = new URL(name, outputDirectory)
    expect(existsSync(path), `missing docs/schema/${name}; run schema:update`).toBe(true)
    expect(readFileSync(path, 'utf8'), `docs/schema/${name} is stale; run schema:update`).toBe(files[name])
  })
})
