import { isScreenDocument, type ScreenDocument } from '../model'

const DATABASE_NAME = 'digital-twin-studio-screens'
const STORE = 'screens'

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
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DATABASE_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('无法打开数据大屏存储'))
    })
    return this.database
  }
}

export const screenRepository = new ScreenRepository()
