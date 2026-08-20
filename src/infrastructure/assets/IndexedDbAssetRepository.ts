import type { AssetRecord, AssetRepository } from './AssetRepository'

const DATABASE_NAME = 'digital-twin-studio-assets'
const DATABASE_VERSION = 1
const STORE_NAME = 'assets'
const FINGERPRINT_INDEX = 'by-fingerprint'

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}
function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function createAssetId(): string {
  return `asset_${globalThis.crypto.randomUUID()}`
}

export class IndexedDbAssetRepository implements AssetRepository {
  private databasePromise: Promise<IDBDatabase> | null = null

  async saveFile(file: File): Promise<AssetRecord> {
    const database = await this.openDatabase()
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}`

    const readTransaction = database.transaction(STORE_NAME, 'readonly')
    const existing = await requestResult(
      readTransaction.objectStore(STORE_NAME).index(FINGERPRINT_INDEX).get(fingerprint),
    ) as AssetRecord | undefined
    if (existing) return existing

    const record: AssetRecord = {
      id: createAssetId(),
      fingerprint,
      name: file.name,
      mimeType: file.type || 'model/gltf-binary',
      size: file.size,
      lastModified: file.lastModified,
      blob: file,
      createdAt: new Date().toISOString(),
    }
    const writeTransaction = database.transaction(STORE_NAME, 'readwrite')
    writeTransaction.objectStore(STORE_NAME).add(record)
    await transactionComplete(writeTransaction)
    return record
  }

  async get(assetId: string): Promise<AssetRecord | null> {
    const database = await this.openDatabase()
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const record = await requestResult(transaction.objectStore(STORE_NAME).get(assetId))
    return (record as AssetRecord | undefined) ?? null
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise

    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex(FINGERPRINT_INDEX, 'fingerprint', { unique: true })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('无法打开本地资产数据库'))
    })
    return this.databasePromise
  }
}
