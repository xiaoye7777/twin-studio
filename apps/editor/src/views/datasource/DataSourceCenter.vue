<script setup lang="ts">
import { confirmAction } from '@/components/ui/confirm'
import { ElMessage } from 'element-plus'
import { Download, Plus, RefreshCw, Search, Settings2, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConnectionDialog from '@/screen/datasources/components/ConnectionDialog.vue'
import DatasetList from '@/screen/datasources/components/DatasetList.vue'
import ImportWays from '@/screen/datasources/components/ImportWays.vue'
import NoServices from '@/screen/datasources/components/NoServices.vue'
import ServiceList from '@/screen/datasources/components/ServiceList.vue'
import DatasetEditor from '@/screen/datasources/components/DatasetEditor.vue'
import ImportDialog from '@/screen/datasources/components/ImportDialog.vue'
import { parseCatalog } from '@/screen/datasources/importers'
import { type ApiConnection, type ApiDataset, createConnection, createDataset } from '@/screen/datasources/model'
import { sendRequest } from '@/screen/datasources/request'
import { useDataSourceStore } from '@/screen/datasources/store'
import { useScreenStore } from '@/screen/storage/screens'

const store = useDataSourceStore()
const screens = useScreenStore()
if (import.meta.env.DEV) (window as unknown as { __dataSources?: typeof store }).__dataSources = store
const route = useRoute()
const router = useRouter()

const selectedId = ref('')
const query = ref('')
const connectionDialog = ref(false)
const editingConnection = ref<ApiConnection | null>(null)
const importDialog = ref(false)
const importKind = ref<'openapi' | 'catalog' | 'curl'>('openapi')
const datasetDialog = ref(false)
const editingDataset = ref<ApiDataset | null>(null)
const syncing = ref(false)

const selected = computed(() => store.connection(selectedId.value) ?? store.connections[0] ?? null)
const DEMO_URL = 'http://127.0.0.1:8787'
const hasDemo = computed(() => store.connections.some(item => item.baseUrl.startsWith(DEMO_URL)))

onMounted(async () => {
  await Promise.all([store.load(), screens.refresh()])
  const wanted = store.dataset(String(route.query.dataset ?? ''))
  if (wanted) {
    selectedId.value = wanted.connectionId
    editDataset(wanted)
    void router.replace({ query: {} })
  }
})
watch(
  () => store.connections.length,
  () => {
    if (!store.connection(selectedId.value)) selectedId.value = store.connections[0]?.id ?? ''
  },
)

/** Which screens use each dataset, so deleting one says what it breaks. */
const usage = computed(() => {
  const map = new Map<string, string[]>()
  for (const screen of screens.screens)
    for (const widget of screen.widgets) {
      const id = widget.data?.source === 'api' ? widget.data.api?.datasetId : undefined
      if (id && !map.get(id)?.includes(screen.name)) map.set(id, [...(map.get(id) ?? []), screen.name])
    }
  return map
})

const groups = computed(() => {
  const connection = selected.value
  if (!connection) return []
  const words = query.value.trim().toLowerCase()
  const map = new Map<string, ApiDataset[]>()
  for (const item of store.datasetsOf(connection.id)) {
    if (words && !`${item.name} ${item.path} ${item.description} ${item.group}`.toLowerCase().includes(words)) continue
    map.set(item.group, [...(map.get(item.group) ?? []), item])
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
})

const authLabel = (connection: ApiConnection) =>
  ({ none: '无需认证', bearer: 'Bearer Token', header: '自定义请求头', cookie: '浏览器登录态' })[connection.auth.type]

function addConnection(): void {
  editingConnection.value = null
  connectionDialog.value = true
}

function editConnection(connection: ApiConnection): void {
  editingConnection.value = connection
  connectionDialog.value = true
}

async function removeConnection(connection: ApiConnection): Promise<void> {
  const count = store.datasetsOf(connection.id).length
  if (
    !(await confirmAction(`删除数据服务「${connection.name}」及其 ${count} 个接口？使用这些接口的组件将没有数据。`, {
      title: '删除数据服务',
      confirm: '删除',
      danger: true,
    }))
  )
    return
  await store.removeConnection(connection.id)
}

/** The device simulator also plays a business backend: it publishes a catalog of demo interfaces. */
async function addDemo(): Promise<void> {
  syncing.value = true
  const connection = { ...createConnection('演示数据服务（设备模拟器）', DEMO_URL), timeout: 8 }
  try {
    const response = await sendRequest(connection, { method: 'GET', path: '/screen/datasets', params: [] }, {})
    if (!response.ok) throw new Error(`${response.error}。请先在项目目录运行 pnpm simulator`)
    const catalog = parseCatalog(response.body)
    connection.catalog = { kind: 'datasets', url: `${DEMO_URL}/screen/datasets`, syncedAt: new Date().toISOString() }
    await store.saveConnection(connection)
    await store.saveDatasets(catalog.datasets.map(draft => createDataset(connection.id, draft)))
    selectedId.value = connection.id
    ElMessage.success(`已添加演示数据服务，含 ${catalog.datasets.length} 个接口`)
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : String(cause))
  } finally {
    syncing.value = false
  }
}

function openImport(kind: 'openapi' | 'catalog' | 'curl'): void {
  importKind.value = kind
  importDialog.value = true
}

/** Syncs again from where the list came from last time. */
async function resync(connection: ApiConnection): Promise<void> {
  if (connection.catalog?.kind === 'datasets') {
    syncing.value = true
    try {
      const response = await sendRequest(connection, { method: 'GET', path: connection.catalog.url, params: [] }, {})
      if (!response.ok) throw new Error(response.error)
      const catalog = parseCatalog(response.body)
      const existing = store.datasetsOf(connection.id)
      await store.saveDatasets(
        catalog.datasets.map(draft => {
          const previous = existing.find(item => item.externalId === draft.externalId)
          return previous ? { ...previous, ...draft, id: previous.id } : createDataset(connection.id, draft)
        }),
      )
      await store.saveConnection({
        ...connection,
        catalog: { ...connection.catalog, syncedAt: new Date().toISOString() },
      })
      ElMessage.success(`已同步 ${catalog.datasets.length} 个接口`)
    } catch (cause) {
      ElMessage.error(cause instanceof Error ? cause.message : String(cause))
    } finally {
      syncing.value = false
    }
  } else openImport('openapi')
}

function newDataset(): void {
  if (!selected.value) return
  editDataset(createDataset(selected.value.id))
}

function editDataset(dataset: ApiDataset): void {
  editingDataset.value = dataset
  datasetDialog.value = true
}

async function duplicateDataset(dataset: ApiDataset): Promise<void> {
  const copy = createDataset(dataset.connectionId, {
    ...JSON.parse(JSON.stringify(dataset)),
    name: `${dataset.name} 副本`,
    externalId: undefined,
    source: 'manual',
  })
  await store.saveDatasets([copy])
}

async function removeDataset(dataset: ApiDataset): Promise<void> {
  const users = usage.value.get(dataset.id) ?? []
  if (
    !(await confirmAction(
      users.length
        ? `「${dataset.name}」正被 ${users.length} 个大屏使用（${users.slice(0, 3).join('、')}${users.length > 3 ? ' 等' : ''}），删除后这些组件将没有数据。确定删除？`
        : `删除接口「${dataset.name}」？`,
      { title: '删除接口', confirm: '删除', danger: true },
    ))
  )
    return
  await store.removeDataset(dataset.id)
}

const synced = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <section class="center" data-testid="datasource-center">
    <header class="center__head">
      <div>
        <h1>数据接口</h1>
        <p>技术人员把后端接口登记一次（可从 Swagger 文档一键导入），业务人员在大屏组件里按中文名直接选用</p>
      </div>
      <div class="center__actions">
        <button class="s-btn s-btn--primary" data-testid="add-connection" @click="addConnection">
          <Plus :size="14" />添加数据服务
        </button>
      </div>
    </header>

    <div v-if="store.connections.length" class="center__body">
      <ServiceList
        :selected-id="selected?.id"
        :show-demo="!hasDemo"
        :busy="syncing"
        @select="selectedId = $event.id"
        @demo="addDemo"
      />

      <div v-if="selected" class="detail">
        <div class="detail__head">
          <div class="detail__title">
            <h2>{{ selected.name }}</h2>
            <p>
              <span class="s-mono">{{ selected.baseUrl }}</span> · {{ authLabel(selected) }} · 超时
              {{ selected.timeout }} 秒
              <template v-if="selected.catalog">
                · {{ selected.catalog.kind === 'openapi' ? 'OpenAPI' : '接口清单' }}同步于
                {{ synced(selected.catalog.syncedAt) }}
              </template>
            </p>
          </div>
          <div class="detail__actions">
            <button
              v-if="selected.catalog"
              class="s-btn"
              :disabled="syncing"
              title="从上次导入的地址重新同步"
              @click="resync(selected)"
            >
              <RefreshCw :size="13" />同步
            </button>
            <button class="s-btn" data-testid="open-import" @click="openImport('openapi')">
              <Download :size="13" />导入接口
            </button>
            <button class="s-btn s-btn--primary" data-testid="new-dataset" @click="newDataset">
              <Plus :size="13" />新建接口
            </button>
            <button
              class="s-icon-btn"
              title="编辑数据服务"
              data-testid="edit-connection"
              @click="editConnection(selected)"
            >
              <Settings2 :size="15" />
            </button>
            <button class="s-icon-btn" title="删除数据服务" @click="removeConnection(selected)">
              <Trash2 :size="15" />
            </button>
          </div>
        </div>

        <label class="search">
          <Search :size="14" />
          <input v-model="query" placeholder="搜索接口名称、路径、说明" />
        </label>

        <DatasetList
          v-if="groups.length"
          :groups="groups"
          :usage="usage"
          @edit="editDataset"
          @duplicate="duplicateDataset"
          @remove="removeDataset"
        />
        <div v-else class="detail__empty">
          <p v-if="query">没有匹配「{{ query }}」的接口</p>
          <template v-else>
            <p>这个数据服务还没有接口。推荐按下面的顺序选择登记方式：</p>
            <ImportWays @import="openImport" @create="newDataset" />
          </template>
        </div>
      </div>
    </div>

    <NoServices
      v-else-if="store.loaded"
      :busy="syncing"
      @add="addConnection"
      @demo="addDemo"
      @curl="openImport('curl')"
    />

    <ConnectionDialog v-model="connectionDialog" :connection="editingConnection" @saved="selectedId = $event.id" />
    <ImportDialog
      v-model="importDialog"
      :connection="selected"
      :kind="importKind"
      @imported="selectedId = $event"
      @edit="
        dataset => {
          selectedId = dataset.connectionId
          editDataset(dataset)
        }
      "
    />
    <DatasetEditor v-model="datasetDialog" :dataset="editingDataset" />
  </section>
</template>

<style scoped>
.center {
  max-width: 1480px;
}
.center__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
.center__head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
}
.center__head p {
  margin: 4px 0 0;
  color: var(--s-fg-3);
}
.center__body {
  display: grid;
  grid-template-columns: 270px minmax(0, 1fr);
  align-items: start;
  gap: 18px;
}
.detail {
  min-width: 0;
  padding: 18px 20px;
  border: 1px solid var(--s-line);
  border-radius: 10px;
  background: var(--s-panel);
}
.detail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.detail__title {
  min-width: 0;
}
.detail__title h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.detail__title p {
  margin: 4px 0 0;
  color: var(--s-fg-3);
  font-size: 12px;
}
.detail__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0 6px;
  padding: 0 10px;
  border: 1px solid var(--s-line-2);
  border-radius: var(--s-radius-sm);
  background: var(--s-field);
  color: var(--s-fg-3);
}
.search input {
  height: 30px;
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--s-fg);
  outline: none;
}
.method.POST,
.dataset__text p,
.detail__empty {
  padding: 20px 0 6px;
  color: var(--s-fg-2);
}
</style>
