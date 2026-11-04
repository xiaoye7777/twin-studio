import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import { type ApiConnection, type ApiDataset, isConnection, isDataset } from './model'

const DATABASE_NAME = 'digital-twin-studio-datasources'
const CONNECTIONS = 'connections'
const DATASETS = 'datasets'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

/** Connections and datasets of this browser (IndexedDB; secrets never leave it). */
class DataSourceRepository {
  private database: Promise<IDBDatabase> | null = null

  async all(): Promise<{ connections: ApiConnection[]; datasets: ApiDataset[] }> {
    const db = await this.open()
    const transaction = db.transaction([CONNECTIONS, DATASETS], 'readonly')
    const [connections, datasets] = await Promise.all([
      request(transaction.objectStore(CONNECTIONS).getAll()) as Promise<unknown[]>,
      request(transaction.objectStore(DATASETS).getAll()) as Promise<unknown[]>,
    ])
    return {
      connections: connections.filter(isConnection).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      datasets: datasets.filter(isDataset),
    }
  }

  async put(store: typeof CONNECTIONS | typeof DATASETS, items: Array<ApiConnection | ApiDataset>): Promise<void> {
    if (!items.length) return
    const db = await this.open()
    const transaction = db.transaction(store, 'readwrite')
    // Stored as plain data: items from forms may be reactive.
    for (const item of items) transaction.objectStore(store).put(JSON.parse(JSON.stringify(item)))
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('保存失败'))
    })
  }

  async delete(store: typeof CONNECTIONS | typeof DATASETS, ids: string[]): Promise<void> {
    if (!ids.length) return
    const db = await this.open()
    const transaction = db.transaction(store, 'readwrite')
    for (const id of ids) transaction.objectStore(store).delete(id)
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('删除失败'))
    })
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DATABASE_NAME, 1)
      req.onupgradeneeded = () => {
        for (const store of [CONNECTIONS, DATASETS])
          if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('无法打开数据接口存储'))
    })
    return this.database
  }
}

const repository = new DataSourceRepository()
/** Tells other tabs (an open preview, the editor) that interfaces changed. */
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('twin-studio-datasources')

/** Data interfaces (数据接口): connections to backends and the datasets registered on them. */
export const useDataSourceStore = defineStore('datasources', () => {
  const connections = shallowRef<ApiConnection[]>([])
  const datasets = shallowRef<ApiDataset[]>([])
  const loaded = shallowRef(false)
  /** Bumped on every change, so running screens re-request what changed. */
  const revision = shallowRef(0)
  let loading: Promise<void> | null = null

  async function refresh(): Promise<void> {
    const all = await repository.all()
    connections.value = all.connections
    datasets.value = all.datasets
    loaded.value = true
    revision.value++
  }

  function load(): Promise<void> {
    loading ??= refresh()
    return loading
  }

  channel?.addEventListener('message', () => void refresh())
  const changed = async () => {
    await refresh()
    channel?.postMessage('changed')
  }

  const connection = (id: string | undefined) => connections.value.find(item => item.id === id)
  const dataset = (id: string | undefined) => datasets.value.find(item => item.id === id)
  const datasetsOf = (connectionId: string) => datasets.value.filter(item => item.connectionId === connectionId)
  const groups = computed(() => {
    const map = new Map<string, ApiDataset[]>()
    for (const item of datasets.value) map.set(item.group, [...(map.get(item.group) ?? []), item])
    return map
  })

  async function saveConnection(item: ApiConnection): Promise<void> {
    await repository.put(CONNECTIONS, [{ ...item, updatedAt: new Date().toISOString() }])
    await changed()
  }

  async function removeConnection(id: string): Promise<void> {
    await repository.delete(
      DATASETS,
      datasetsOf(id).map(item => item.id),
    )
    await repository.delete(CONNECTIONS, [id])
    await changed()
  }

  async function saveDatasets(items: ApiDataset[]): Promise<void> {
    const now = new Date().toISOString()
    await repository.put(
      DATASETS,
      items.map(item => ({ ...item, updatedAt: now })),
    )
    await changed()
  }

  async function removeDataset(id: string): Promise<void> {
    await repository.delete(DATASETS, [id])
    await changed()
  }

  /** Adds connections and datasets from a screen file; ones already here are kept as they are. */
  async function merge(items: { connections: ApiConnection[]; datasets: ApiDataset[] }): Promise<number> {
    await load()
    const newConnections = items.connections.filter(item => isConnection(item) && !connection(item.id))
    const newDatasets = items.datasets.filter(item => isDataset(item) && !dataset(item.id))
    await repository.put(CONNECTIONS, newConnections)
    await repository.put(DATASETS, newDatasets)
    if (newConnections.length || newDatasets.length) await changed()
    return newDatasets.length
  }

  return {
    connections,
    datasets,
    loaded,
    revision,
    groups,
    load,
    refresh,
    connection,
    dataset,
    datasetsOf,
    saveConnection,
    removeConnection,
    saveDatasets,
    removeDataset,
    merge,
  }
})
