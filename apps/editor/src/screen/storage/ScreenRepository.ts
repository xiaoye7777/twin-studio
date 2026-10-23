import { isScreenDocument, type ScreenDocument, type ScreenVersion } from '../model'

const DATABASE_NAME = 'digital-twin-studio-screens'
const STORE = 'screens'
const VERSIONS = 'versions'
/** Automatic versions kept per screen (published and hand-saved ones are kept until deleted). */
const AUTO_VERSIONS = 20

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

/** Data screens of this browser. IndexedDB, since pages may carry pictures. */
export class ScreenRepository {
  private database: Promise<IDBDatabase> | null = null

  async list(): Promise<ScreenDocument[]> {
    const db = await this.open()
    const items = (await request(db.transaction(STORE, 'readonly').objectStore(STORE).getAll())) as unknown[]
    return items.filter(isScreenDocument).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async get(id: string): Promise<ScreenDocument | null> {
    const db = await this.open()
    const item: unknown = await request(db.transaction(STORE, 'readonly').objectStore(STORE).get(id))
    return isScreenDocument(item) ? item : null
  }

  async save(document: ScreenDocument): Promise<void> {
    const db = await this.open()
    // Stored as plain data: documents from the editor may be reactive or Immer-frozen.
    await request(
      db
        .transaction(STORE, 'readwrite')
        .objectStore(STORE)
        .put(JSON.parse(JSON.stringify(document))),
    )
  }

  async remove(id: string): Promise<void> {
    const db = await this.open()
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id))
    for (const version of await this.listVersions(id)) await this.removeVersion(version.id)
  }

  // ---------------------------------------------------------------- versions

  /** Newest first. */
  async listVersions(screenId: string): Promise<ScreenVersion[]> {
    const db = await this.open()
    const items = (await request(
      db.transaction(VERSIONS, 'readonly').objectStore(VERSIONS).index('screenId').getAll(screenId),
    )) as ScreenVersion[]
    return items.filter(item => isScreenDocument(item.document)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getVersion(id: string): Promise<ScreenVersion | null> {
    const db = await this.open()
    const item = (await request(db.transaction(VERSIONS, 'readonly').objectStore(VERSIONS).get(id))) as
      ScreenVersion | undefined
    return item && isScreenDocument(item.document) ? item : null
  }

  async saveVersion(version: ScreenVersion): Promise<void> {
    const db = await this.open()
    await request(
      db
        .transaction(VERSIONS, 'readwrite')
        .objectStore(VERSIONS)
        .put(JSON.parse(JSON.stringify(version))),
    )
    // Only the latest automatic versions are kept.
    const autos = (await this.listVersions(version.screenId)).filter(item => item.kind === 'auto')
    for (const old of autos.slice(AUTO_VERSIONS)) await this.removeVersion(old.id)
  }

  async removeVersion(id: string): Promise<void> {
    const db = await this.open()
    await request(db.transaction(VERSIONS, 'readwrite').objectStore(VERSIONS).delete(id))
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DATABASE_NAME, 2)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
        if (!req.result.objectStoreNames.contains(VERSIONS))
          req.result.createObjectStore(VERSIONS, { keyPath: 'id' }).createIndex('screenId', 'screenId')
      }
      req.onsuccess = () => {
        // A newer version opening in another tab (after an update) must not wait for this one.
        req.result.onversionchange = () => {
          req.result.close()
          this.database = null
        }
        resolve(req.result)
      }
      req.onerror = () => reject(req.error ?? new Error('无法打开数据大屏存储'))
    })
    return this.database
  }
}

export const screenRepository = new ScreenRepository()
