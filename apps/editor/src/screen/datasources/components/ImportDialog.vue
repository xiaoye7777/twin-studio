<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { FileJson, ScanSearch, Terminal } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import {
  type DatasetDraft,
  datasetFromCurl,
  openApiPaths,
  type OpenApiResult,
  parseCatalog,
  parseCurl,
  parseOpenApi,
} from '../importers'
import { type ApiConnection, type ApiDataset, createConnection, createDataset } from '../model'
import { sendRequest } from '../request'
import { useDataSourceStore } from '../store'

type ImportKind = 'openapi' | 'catalog' | 'curl'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{ connection: ApiConnection | null; kind: ImportKind }>()
const emit = defineEmits<{ edit: [dataset: ApiDataset]; imported: [connectionId: string] }>()
const store = useDataSourceStore()

const tab = ref<ImportKind>('openapi')
const url = ref('')
const busy = ref(false)
const error = ref('')
const spec = ref<OpenApiResult | null>(null)
const chosen = ref(new Set<string>())
const curl = ref('')
const fileInput = ref<HTMLInputElement>()

watch(visible, open => {
  if (!open) return
  tab.value = props.kind
  error.value = ''
  spec.value = null
  curl.value = ''
  const base = props.connection?.baseUrl ?? ''
  const previous = props.connection?.catalog
  url.value =
    previous && previous.kind === (props.kind === 'catalog' ? 'datasets' : 'openapi')
      ? previous.url
      : props.kind === 'catalog'
        ? `${base}/screen/datasets`
        : ''
})
watch(tab, kind => {
  error.value = ''
  if (kind === 'catalog' && !url.value) url.value = `${props.connection?.baseUrl ?? ''}/screen/datasets`
  if (kind === 'openapi' && url.value.endsWith('/screen/datasets')) url.value = ''
})

/** GETs a document with the connection's sign-in (documents are often behind it too). */
async function fetchJson(target: string): Promise<unknown> {
  const connection = props.connection!
  const response = await sendRequest(
    { ...connection, envelope: 'off' },
    { method: 'GET', path: target, params: [] },
    {},
  )
  if (!response.ok) throw new Error(response.error)
  return response.body
}

async function readOpenApi(): Promise<void> {
  const connection = props.connection
  if (!connection) return
  busy.value = true
  error.value = ''
  spec.value = null
  try {
    const basePath = new URL(connection.baseUrl).pathname
    if (url.value.trim()) {
      spec.value = parseOpenApi(await fetchJson(url.value.trim()), basePath)
    } else {
      // Not given: try where frameworks usually publish it, under the service address and at the site root.
      const origin = new URL(connection.baseUrl).origin
      const candidates = [
        ...openApiPaths.map(path => `${connection.baseUrl}${path}`),
        ...openApiPaths.map(path => `${origin}${path}`),
      ]
      for (const candidate of [...new Set(candidates)]) {
        try {
          spec.value = parseOpenApi(await fetchJson(candidate), basePath)
          url.value = candidate
          break
        } catch {
          // Try the next place.
        }
      }
      if (!spec.value)
        throw new Error('没有在常见位置找到 OpenAPI 文档，请向后端同事要文档地址（如 /v3/api-docs）后填入')
    }
    chosen.value = new Set(spec.value.operations.filter(item => item.draft.method === 'GET').map(item => item.key))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

async function readFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file || !props.connection) return
  error.value = ''
  try {
    spec.value = parseOpenApi(JSON.parse(await file.text()), new URL(props.connection.baseUrl).pathname)
    url.value = ''
    chosen.value = new Set(spec.value.operations.filter(item => item.draft.method === 'GET').map(item => item.key))
  } catch (cause) {
    error.value =
      cause instanceof SyntaxError ? '文件不是 JSON（YAML 文档请先转换为 JSON）' : String((cause as Error).message)
  }
}

const groupedOperations = computed(() => {
  const groups = new Map<string, OpenApiResult['operations']>()
  for (const operation of spec.value?.operations ?? [])
    groups.set(operation.draft.group, [...(groups.get(operation.draft.group) ?? []), operation])
  return [...groups]
})

function toggle(key: string): void {
  const next = new Set(chosen.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  chosen.value = next
}

/** Adds drafts to the connection; ones imported before (same external id) are updated in place. */
async function upsert(connection: ApiConnection, drafts: DatasetDraft[]): Promise<{ added: number; updated: number }> {
  const existing = store.datasetsOf(connection.id)
  let added = 0
  let updated = 0
  const items = drafts.map(draft => {
    const previous = existing.find(item => item.externalId && item.externalId === draft.externalId)
    if (previous) {
      updated++
      return { ...previous, ...draft, id: previous.id, createdAt: previous.createdAt }
    }
    added++
    return createDataset(connection.id, draft)
  })
  await store.saveDatasets(items)
  return { added, updated }
}

async function importOpenApi(): Promise<void> {
  const connection = props.connection
  if (!connection || !spec.value) return
  const drafts = spec.value.operations.filter(item => chosen.value.has(item.key)).map(item => item.draft)
  if (!drafts.length) return void ElMessage.warning('请至少选择一个接口')
  busy.value = true
  try {
    const result = await upsert(connection, drafts)
    if (url.value)
      await store.saveConnection({
        ...connection,
        catalog: { kind: 'openapi', url: url.value, syncedAt: new Date().toISOString() },
      })
    ElMessage.success(`已导入：新增 ${result.added} 个，更新 ${result.updated} 个接口`)
    visible.value = false
    emit('imported', connection.id)
  } finally {
    busy.value = false
  }
}

async function syncCatalog(): Promise<void> {
  const connection = props.connection
  if (!connection) return
  busy.value = true
  error.value = ''
  try {
    const catalog = parseCatalog(await fetchJson(url.value.trim()))
    if (!catalog.datasets.length) throw new Error('清单里没有接口')
    const result = await upsert(connection, catalog.datasets)
    await store.saveConnection({
      ...connection,
      catalog: { kind: 'datasets', url: url.value.trim(), syncedAt: new Date().toISOString() },
    })
    ElMessage.success(`已同步「${catalog.name}」：新增 ${result.added} 个，更新 ${result.updated} 个接口`)
    visible.value = false
    emit('imported', connection.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

const parsedCurl = computed(() => {
  if (!curl.value.trim()) return null
  try {
    return datasetFromCurl(parseCurl(curl.value))
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause)
  }
})
const curlOrigin = computed(() => {
  const parsed = parsedCurl.value
  if (!parsed || typeof parsed === 'string' || !props.connection) return null
  return { same: parsed.origin === new URL(props.connection.baseUrl).origin, origin: parsed.origin }
})

async function createFromCurl(): Promise<void> {
  const parsed = parsedCurl.value
  if (!parsed || typeof parsed === 'string') return
  let connection = props.connection
  // Another site: it gets its own data service.
  if (!connection || parsed.origin !== new URL(connection.baseUrl).origin) {
    connection = createConnection(new URL(parsed.origin).host, parsed.origin)
  }
  const basePath = new URL(connection.baseUrl).pathname.replace(/\/+$/, '')
  const path =
    basePath && parsed.draft.path.startsWith(basePath)
      ? parsed.draft.path.slice(basePath.length) || '/'
      : parsed.draft.path
  const headers = [...connection.headers]
  for (const header of parsed.headers)
    if (!headers.some(item => item.key.toLowerCase() === header.key.toLowerCase())) headers.push(header)
  const auth = parsed.auth && connection.auth.type === 'none' ? parsed.auth : connection.auth
  await store.saveConnection({ ...connection, headers, auth })
  if (parsed.auth && connection.auth.type === 'none') ElMessage.info('已把请求里的认证信息保存到数据服务（仅本机）')
  visible.value = false
  emit('edit', createDataset(connection.id, { ...parsed.draft, path }))
}
</script>

<template>
  <el-dialog v-model="visible" title="导入接口" width="720px" top="6vh" append-to-body class="studio-dialog">
    <div class="tabs">
      <button :class="{ 'is-active': tab === 'openapi' }" data-testid="import-tab-openapi" @click="tab = 'openapi'">
        <FileJson :size="14" />Swagger / OpenAPI 文档
      </button>
      <button :class="{ 'is-active': tab === 'catalog' }" data-testid="import-tab-catalog" @click="tab = 'catalog'">
        <ScanSearch :size="14" />接口清单
      </button>
      <button :class="{ 'is-active': tab === 'curl' }" data-testid="import-tab-curl" @click="tab = 'curl'">
        <Terminal :size="14" />粘贴 cURL
      </button>
    </div>

    <div v-if="tab === 'openapi'" class="pane" data-testid="import-openapi">
      <p class="s-hint">
        后端用 springdoc、Knife4j、Swagger、FastAPI 等框架时自带接口文档。留空地址会自动在常见位置查找；也可以上传导出的
        JSON 文件。
      </p>
      <div class="row">
        <input
          v-model="url"
          class="s-input"
          placeholder="文档地址，如 https://api.example.com/v3/api-docs（留空自动查找）"
          data-testid="openapi-url"
          @keydown.enter="readOpenApi"
        />
        <button class="s-btn" :disabled="busy" data-testid="openapi-read" @click="readOpenApi">
          {{ busy ? '读取中…' : '读取' }}
        </button>
        <button class="s-btn" @click="fileInput?.click()">上传文件</button>
        <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="readFile" />
      </div>
      <template v-if="spec">
        <div class="ops-head">
          <strong>{{ spec.title }}</strong>
          <span>{{ spec.operations.length }} 个接口，已选 {{ chosen.size }} 个</span>
          <button class="s-btn s-btn--ghost s-btn--sm" @click="chosen = new Set(spec.operations.map(item => item.key))">
            全选
          </button>
          <button class="s-btn s-btn--ghost s-btn--sm" @click="chosen = new Set()">全不选</button>
        </div>
        <div class="ops s-scroll">
          <template v-for="[group, operations] in groupedOperations" :key="group">
            <div class="ops__group">{{ group }}</div>
            <label v-for="operation in operations" :key="operation.key" class="ops__item">
              <input type="checkbox" :checked="chosen.has(operation.key)" @change="toggle(operation.key)" />
              <span class="method" :class="operation.draft.method">{{ operation.draft.method }}</span>
              <strong>{{ operation.draft.name }}</strong>
              <span class="s-mono">{{ operation.draft.path }}</span>
              <small>{{ operation.draft.fields.length ? `${operation.draft.fields.length} 个字段` : '' }}</small>
            </label>
          </template>
        </div>
      </template>
    </div>

    <div v-else-if="tab === 'catalog'" class="pane" data-testid="import-catalog">
      <p class="s-hint">
        后端按约定提供一个返回「接口清单」的地址（格式见文档
        docs/data-api.md），每个接口带好中文名、参数和字段说明。以后后端增加接口，在这里点一次同步即可。
      </p>
      <div class="row">
        <input
          v-model="url"
          class="s-input"
          placeholder="清单地址"
          data-testid="catalog-url"
          @keydown.enter="syncCatalog"
        />
        <button
          class="s-btn s-btn--primary"
          :disabled="busy || !url.trim()"
          data-testid="catalog-sync"
          @click="syncCatalog"
        >
          {{ busy ? '同步中…' : '同步' }}
        </button>
      </div>
    </div>

    <div v-else class="pane" data-testid="import-curl">
      <p class="s-hint">
        在业务系统页面按 F12 打开开发者工具 → 网络（Network），找到需要的请求，右键 → 复制 → 复制为
        cURL（bash），粘贴到下面。地址、参数和认证会自动识别。
      </p>
      <textarea
        v-model="curl"
        class="s-textarea curl"
        rows="7"
        placeholder="curl 'https://api.example.com/energy/trend?days=7' -H 'Authorization: Bearer …'"
        data-testid="curl-text"
      />
      <p v-if="typeof parsedCurl === 'string'" class="error">{{ parsedCurl }}</p>
      <div v-else-if="parsedCurl" class="curl-result">
        <span class="method" :class="parsedCurl.draft.method">{{ parsedCurl.draft.method }}</span>
        <span class="s-mono">{{ parsedCurl.origin }}{{ parsedCurl.draft.path }}</span>
        <small>
          {{ parsedCurl.draft.params.length }} 个参数{{ parsedCurl.auth ? ' · 含认证信息' : ''
          }}{{ parsedCurl.headers.length ? ` · ${parsedCurl.headers.length} 个自定义请求头` : '' }}
        </small>
        <p v-if="curlOrigin && !curlOrigin.same" class="s-hint">
          地址与当前数据服务不同，会为 {{ curlOrigin.origin }} 新建一个数据服务。
        </p>
      </div>
    </div>

    <p v-if="error" class="error" data-testid="import-error">{{ error }}</p>

    <template #footer>
      <button class="s-btn" @click="visible = false">取消</button>
      <button
        v-if="tab === 'openapi'"
        class="s-btn s-btn--primary"
        :disabled="!spec || busy"
        data-testid="openapi-import"
        @click="importOpenApi"
      >
        导入选中的接口
      </button>
      <button
        v-if="tab === 'curl'"
        class="s-btn s-btn--primary"
        :disabled="!parsedCurl || typeof parsedCurl === 'string'"
        data-testid="curl-create"
        @click="createFromCurl"
      >
        识别并继续配置
      </button>
    </template>
  </el-dialog>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 14px;
  padding: 3px;
  border-radius: var(--s-radius);
  background: var(--s-field);
}
.tabs button {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  border: 0;
  border-radius: var(--s-radius-sm);
  background: transparent;
  color: var(--s-fg-2);
  font-size: 12.5px;
  cursor: pointer;
}
.tabs button.is-active {
  background: var(--s-raised);
  color: var(--s-fg);
}
.pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pane .s-hint {
  margin: 0;
}
.row {
  display: flex;
  gap: 6px;
}
.ops-head {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--s-fg-3);
  font-size: 12px;
}
.ops-head strong {
  color: var(--s-fg);
}
.ops-head span {
  margin-right: auto;
}
.ops {
  max-height: 46vh;
  overflow: auto;
  border: 1px solid var(--s-line);
  border-radius: var(--s-radius-sm);
}
.ops__group {
  position: sticky;
  top: 0;
  padding: 6px 10px;
  background: var(--s-panel-2);
  color: var(--s-fg-3);
  font-size: 11px;
}
.ops__item {
  display: grid;
  grid-template-columns: 16px 46px auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-top: 1px solid var(--s-line);
  cursor: pointer;
}
.ops__item:hover {
  background: var(--s-hover);
}
.ops__item strong {
  font-weight: 500;
}
.ops__item .s-mono {
  overflow: hidden;
  color: var(--s-fg-3);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ops__item small {
  color: var(--s-fg-3);
}
.method {
  padding: 1px 0;
  border-radius: 3px;
  background: rgb(116 192 142 / 0.15);
  color: var(--s-ok);
  font: 600 10px var(--s-mono);
  text-align: center;
}
.method.POST,
.method.PUT {
  background: rgb(226 180 86 / 0.15);
  color: var(--s-warn);
}
.curl {
  font-family: var(--s-mono);
  font-size: 11.5px;
}
.curl-result {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--s-radius-sm);
  background: var(--s-field);
}
.curl-result .method {
  width: 46px;
}
.curl-result small {
  color: var(--s-fg-3);
}
.curl-result p {
  width: 100%;
}
.error {
  margin: 10px 0 0;
  color: var(--s-danger);
  line-height: 1.6;
}
</style>
