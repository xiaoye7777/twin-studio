import type { SceneComponentData } from '@twin-studio/core'

const DATABASE_NAME = 'digital-twin-studio-components'
const STORE = 'components'

export interface SceneComponentRecord {
  id: string
  name: string
  createdAt: string
  thumbnail?: string
  data: SceneComponentData
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

/** Components saved from scenes, shared by every project in this browser (like imported models). */
export class ComponentRepository {
  private database: Promise<IDBDatabase> | null = null

  async list(): Promise<SceneComponentRecord[]> {
    const db = await this.open()
    const items = (await request(
      db.transaction(STORE, 'readonly').objectStore(STORE).getAll(),
    )) as SceneComponentRecord[]
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async get(id: string): Promise<SceneComponentRecord | null> {
    const db = await this.open()
    return (
      ((await request(db.transaction(STORE, 'readonly').objectStore(STORE).get(id))) as SceneComponentRecord) ?? null
    )
  }

  async save(record: SceneComponentRecord): Promise<void> {
    const db = await this.open()
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put(record))
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
      req.onerror = () => reject(req.error ?? new Error('无法打开组件库'))
    })
    return this.database
  }
}
