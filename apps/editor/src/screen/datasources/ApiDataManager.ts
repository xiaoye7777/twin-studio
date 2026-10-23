import { reactive, shallowReactive } from 'vue'
import type { ApiConnection, ApiDataset } from './model'
import { sendRequest } from './request'

/** One request a screen needs: a dataset with resolved parameter values. */
export interface ApiRequestSpec {
  /** Same dataset and values = same key = one shared request. */
  key: string
  dataset: ApiDataset
  connection: ApiConnection
  values: Record<string, string>
  /** Seconds between loads; 0 = load once. The shortest of the widgets sharing the request wins. */
  interval: number
}

export interface ApiState {
  status: 'loading' | 'ok' | 'error'
  /** The last good response; kept while later loads fail, so the screen never goes blank. */
  body: unknown
  error: string
  httpStatus: number
  duration: number
  /** Last successful load (ms since epoch), 0 before the first. */
  updatedAt: number
}

interface Entry {
  spec: ApiRequestSpec
  /** Changes when the dataset or its connection is edited, to load again at once. */
  signature: string
  timer: ReturnType<typeof setTimeout> | null
  controller: AbortController | null
  failures: number
}

const signatureOf = (spec: ApiRequestSpec) => `${spec.dataset.updatedAt}|${spec.connection.updatedAt}`

export function requestKey(datasetId: string, values: Record<string, string>): string {
  return `${datasetId}|${JSON.stringify(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)))}`
}

/**
 * Loads the interfaces a screen uses: one request per dataset and parameter values however many widgets
 * show it, refreshed on the shortest interval asked for, retried with growing pauses when it fails.
 */
export class ApiDataManager {
  readonly states = shallowReactive(new Map<string, ApiState>())
  private readonly entries = new Map<string, Entry>()
  private disposed = false

  /** Makes the running requests match what the screen needs now. */
  sync(specs: ApiRequestSpec[]): void {
    if (this.disposed) return
    const wanted = new Map<string, ApiRequestSpec>()
    for (const spec of specs) {
      const current = wanted.get(spec.key)
      if (!current) wanted.set(spec.key, { ...spec })
      else current.interval = shortest(current.interval, spec.interval)
    }
    for (const [key, entry] of this.entries) if (!wanted.has(key)) this.drop(key, entry)
    for (const [key, spec] of wanted) {
      const entry = this.entries.get(key)
      if (!entry) {
        const created: Entry = { spec, signature: signatureOf(spec), timer: null, controller: null, failures: 0 }
        this.entries.set(key, created)
        this.states.set(
          key,
          reactive({ status: 'loading', body: undefined, error: '', httpStatus: 0, duration: 0, updatedAt: 0 }),
        )
        void this.load(created)
        continue
      }
      const signature = signatureOf(spec)
      const intervalChanged = spec.interval !== entry.spec.interval
      entry.spec = spec
      if (signature !== entry.signature) {
        entry.signature = signature
        void this.load(entry)
      } else if (intervalChanged && entry.controller === null) this.schedule(entry, entry.failures > 0)
    }
  }

  /** Loads again now: one request, or all of them. */
  reload(key?: string): void {
    for (const [entryKey, entry] of this.entries) if (!key || key === entryKey) void this.load(entry)
  }

  private async load(entry: Entry): Promise<void> {
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = null
    entry.controller?.abort()
    const controller = new AbortController()
    entry.controller = controller
    const state = this.states.get(entry.spec.key)
    if (state && !state.updatedAt) state.status = 'loading'
    const response = await sendRequest(entry.spec.connection, entry.spec.dataset, entry.spec.values, controller.signal)
    // Dropped, replaced by a newer load, or the screen closed meanwhile.
    if (this.disposed || entry.controller !== controller || this.entries.get(entry.spec.key) !== entry || !state) return
    entry.controller = null
    state.duration = response.duration
    state.httpStatus = response.status
    if (response.ok) {
      entry.failures = 0
      state.status = 'ok'
      state.error = ''
      state.body = response.body
      state.updatedAt = Date.now()
    } else {
      entry.failures++
      state.status = 'error'
      state.error = response.error
      console.warn(`[数据接口] ${entry.spec.dataset.name}：${response.error}`)
    }
    this.schedule(entry, !response.ok)
  }

  private schedule(entry: Entry, failed: boolean): void {
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = null
    const interval = entry.spec.interval
    // After failures: 5 s, 10 s, 20 s … up to a minute (never later than the normal refresh).
    const retry = Math.min(60, 5 * 2 ** Math.max(0, entry.failures - 1))
    const seconds = failed ? (interval > 0 ? Math.min(interval, retry) : retry) : interval
    if (seconds > 0) entry.timer = setTimeout(() => void this.load(entry), seconds * 1000)
  }

  private drop(key: string, entry: Entry): void {
    if (entry.timer) clearTimeout(entry.timer)
    entry.controller?.abort()
    entry.controller = null
    this.entries.delete(key)
    this.states.delete(key)
  }

  dispose(): void {
    this.disposed = true
    for (const [key, entry] of this.entries) this.drop(key, entry)
  }
}

function shortest(a: number, b: number): number {
  if (a <= 0) return b
  if (b <= 0) return a
  return Math.min(a, b)
}
