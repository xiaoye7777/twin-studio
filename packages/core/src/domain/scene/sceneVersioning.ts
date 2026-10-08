import { z } from 'zod'
import { isRecord } from '../schemaHelpers'
import { migrateSceneV1ToV2 } from './sceneMigrations'
import { SceneDocumentSchemaV1 } from './sceneSchema'
import { SceneDocumentSchemaV2 } from './sceneSchemaV2'
import type { SceneDocumentV1, SceneDocumentV2 } from './sceneTypes'

/** The scene format this build reads and writes. Bump it together with a migration and a schema. */
export const SCENE_DOCUMENT_VERSION = 2

/** The current document shape; an alias that moves with SCENE_DOCUMENT_VERSION. */
export type SceneDocument = SceneDocumentV2
const CurrentSceneDocumentSchema = SceneDocumentSchemaV2

/** A migration upgrades a document of version N to N + 1. It receives a private copy it may mutate. */
export type SceneMigration = (document: Record<string, unknown>) => Record<string, unknown>

/** The schema of every format this build can read, keyed by version. */
const schemas: Readonly<Record<number, z.ZodType>> = { 1: SceneDocumentSchemaV1, 2: SceneDocumentSchemaV2 }

/** migrations[N] upgrades a validated version-N document to N + 1. */
const migrations: Readonly<Record<number, SceneMigration>> = {
  1: document => migrateSceneV1ToV2(document as SceneDocumentV1),
}

export class SceneDocumentError extends Error {
  constructor(
    message: string,
    /** Human-readable problems, e.g. "effects[3].parameters.opacity：数值过大：期望 number <=1". */
    readonly issues: readonly string[] = [],
  ) {
    super(message)
    this.name = 'SceneDocumentError'
  }
}

/** The document comes from a newer editor than this build understands. */
export class SceneDocumentVersionError extends SceneDocumentError {
  constructor(readonly version: number) {
    super(
      `场景文件格式为 v${version}，当前程序只支持到 v${SCENE_DOCUMENT_VERSION}。` +
        '该项目由更新版本的编辑器导出，请升级 Viewer SDK 或编辑器后再打开。',
    )
    this.name = 'SceneDocumentVersionError'
  }
}

export interface LoadedSceneDocument {
  document: SceneDocument
  /** The original version when the document was upgraded on load; null when it was already current. */
  migratedFrom: number | null
}

/** "effects[3].parameters.opacity" */
function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (text, key) => (typeof key === 'number' ? `${text}[${key}]` : text ? `${text}.${String(key)}` : String(key)),
    '',
  )
}

const zhCN = z.locales.zhCN().localeError

/** Validation problems as readable Chinese lines with the location of each one. */
export function describeSceneIssues(error: z.ZodError): string[] {
  return error.issues.map(issue => `${formatPath(issue.path) || '场景文件'}：${issue.message}`)
}

/**
 * Upgrades a document through each migration from `from` up to `to`.
 * Exposed with an injectable table so the chain itself can be tested before a real migration exists.
 */
export function migrateSceneDocument(
  document: Record<string, unknown>,
  from: number,
  to: number,
  table: Readonly<Record<number, SceneMigration>> = migrations,
): Record<string, unknown> {
  let current = structuredClone(document)
  for (let version = from; version < to; version += 1) {
    const migrate = table[version]
    if (!migrate) throw new SceneDocumentError(`缺少场景格式 v${version} → v${version + 1} 的升级步骤`)
    current = migrate(current)
    current.version = version + 1
  }
  return current
}

/**
 * The single entry point for reading a scene document from storage or a package: checks the version,
 * upgrades older formats, validates the result and returns a clean copy of exactly the schema's shape.
 */
export function loadSceneDocument(raw: unknown): LoadedSceneDocument {
  if (!isRecord(raw)) throw new SceneDocumentError('场景文件不是 JSON 对象')
  const version = raw.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SceneDocumentError('场景文件缺少有效的格式版本（version）')
  }
  if (version > SCENE_DOCUMENT_VERSION) throw new SceneDocumentVersionError(version)
  // Validate against the file's own format first, so errors point at what is actually in the file.
  const source = validate(schemas[version], raw)
  if (version === SCENE_DOCUMENT_VERSION) return { document: source as SceneDocument, migratedFrom: null }
  const upgraded = migrateSceneDocument(source as Record<string, unknown>, version, SCENE_DOCUMENT_VERSION)
  return { document: validate(CurrentSceneDocumentSchema, upgraded) as SceneDocument, migratedFrom: version }
}

function validate(schema: z.ZodType | undefined, value: unknown): unknown {
  if (!schema) throw new SceneDocumentError('不支持的场景格式版本')
  const result = schema.safeParse(value, { error: zhCN })
  if (result.success) return result.data
  const issues = describeSceneIssues(result.error)
  const shown = issues.slice(0, 3).join('；')
  const more = issues.length > 3 ? `（另有 ${issues.length - 3} 处问题）` : ''
  throw new SceneDocumentError(`场景文件校验失败：${shown}${more}`, issues)
}

/** Any readable document (v1 or v2) as the current v2 shape. */
export function toSceneDocumentV2(raw: unknown): SceneDocumentV2 {
  return loadSceneDocument(raw).document
}
