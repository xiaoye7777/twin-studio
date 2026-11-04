const DATABASE_NAME = 'digital-twin-studio-history'
const DATABASE_VERSION = 1
const META = 'snapshots'
const DOCUMENTS = 'documents'
const PROJECT_INDEX = 'by-project'

export type SnapshotKind = 'manual' | 'auto' | 'restore'

export interface SceneSnapshotMeta {
  id: string
  projectId: string
  createdAt: string
  label: string
  kind: SnapshotKind
  nodeCount: number
  /** Serialized document size in bytes. */
  size: number
  thumbnail?: string
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

/**
 * Saved versions of each project's scene, kept in this browser (IndexedDB, so large scenes do not compete
 * with the projects' own localStorage quota). Listing reads only the small metadata records.
 */
export class SceneHistoryRepository {
  private database: Promise<IDBDatabase> | null = null

  constructor(private readonly keep = 30) {}

  async list(projectId: string): Promise<SceneSnapshotMeta[]> {
    const db = await this.open()
    const index = db.transaction(META, 'readonly').objectStore(META).index(PROJECT_INDEX)
    const items = (await request(index.getAll(projectId))) as SceneSnapshotMeta[]
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /** Stores a version and drops the oldest beyond the limit. */
  async add(meta: Omit<SceneSnapshotMeta, 'id' | 'createdAt' | 'size'>, document: string): Promise<SceneSnapshotMeta> {
    const record: SceneSnapshotMeta = {
      ...meta,
      id: `snapshot_${globalThis.crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      size: new Blob([document]).size,
    }
    const db = await this.open()
    const transaction = db.transaction([META, DOCUMENTS], 'readwrite')
    const complete = done(transaction)
    transaction.objectStore(META).put(record)
    transaction.objectStore(DOCUMENTS).put({ id: record.id, document })
    await complete
    const all = await this.list(meta.projectId)
    for (const old of all.slice(this.keep)) await this.remove(old.id)
    return record
  }

  async document(id: string): Promise<string | null> {
    const db = await this.open()
    const entry = (await request(db.transaction(DOCUMENTS, 'readonly').objectStore(DOCUMENTS).get(id))) as
      { document: string } | undefined
    return entry?.document ?? null
  }

  async remove(id: string): Promise<void> {
    const db = await this.open()
    const transaction = db.transaction([META, DOCUMENTS], 'readwrite')
    const complete = done(transaction)
    transaction.objectStore(META).delete(id)
    transaction.objectStore(DOCUMENTS).delete(id)
    await complete
  }

  async removeProject(projectId: string): Promise<void> {
    for (const item of await this.list(projectId)) await this.remove(item.id)
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(META))
          db.createObjectStore(META, { keyPath: 'id' }).createIndex(PROJECT_INDEX, 'projectId')
        if (!db.objectStoreNames.contains(DOCUMENTS)) db.createObjectStore(DOCUMENTS, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('无法打开历史版本数据库'))
    })
    return this.database
  }
}
