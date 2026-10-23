<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Copy,
  Download,
  FlaskConical,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings2,
  Trash2,
  UserCog,
  Users,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConnectionDialog from '@/screen/datasources/components/ConnectionDialog.vue'
import DatasetEditor from '@/screen/datasources/components/DatasetEditor.vue'
import ImportDialog from '@/screen/datasources/components/ImportDialog.vue'
import { parseCatalog } from '@/screen/datasources/importers'
import {
  type ApiConnection,
  type ApiDataset,
  createConnection,
  createDataset,
  refreshLabel,
} from '@/screen/datasources/model'
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
  try {
    await ElMessageBox.confirm(
      `删除数据服务「${connection.name}」及其 ${count} 个接口？使用这些接口的组件将没有数据。`,
      '删除数据服务',
      { type: 'warning', customClass: 'studio-dialog', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
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
  try {
    await ElMessageBox.confirm(
      users.length
        ? `「${dataset.name}」正被 ${users.length} 个大屏使用（${users.slice(0, 3).join('、')}${users.length > 3 ? ' 等' : ''}），删除后这些组件将没有数据。确定删除？`
        : `删除接口「${dataset.name}」？`,
      '删除接口',
      { type: 'warning', customClass: 'studio-dialog', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
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
      <aside class="services">
        <button
          v-for="connection in store.connections"
          :key="connection.id"
          class="service"
          :class="{ 'is-active': selected?.id === connection.id }"
          :data-testid="`connection-${connection.name}`"
          @click="selectedId = connection.id"
        >
          <Server :size="15" />
          <span class="service__text">
            <strong>{{ connection.name }}</strong>
            <small>{{ connection.baseUrl }}</small>
          </span>
          <em>{{ store.datasetsOf(connection.id).length }}</em>
        </button>
        <button
          v-if="!hasDemo"
          class="service service--demo"
          :disabled="syncing"
          data-testid="add-demo"
          @click="addDemo"
        >
          <FlaskConical :size="15" />
          <span class="service__text">
            <strong>添加演示数据服务</strong>
            <small>设备模拟器自带的演示接口</small>
          </span>
        </button>
      </aside>

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

        <div v-if="groups.length" class="datasets">
          <section v-for="[group, items] in groups" :key="group" class="group">
            <h3>
              {{ group }} <span>{{ items.length }}</span>
            </h3>
            <article
              v-for="item in items"
              :key="item.id"
              class="dataset"
              :data-testid="`dataset-${item.name}`"
              @dblclick="editDataset(item)"
            >
              <span class="method" :class="item.method">{{ item.method }}</span>
              <div class="dataset__text">
                <strong>{{ item.name }}</strong>
                <p>{{ item.description || '—' }}</p>
              </div>
              <span class="dataset__path s-mono" :title="item.path">{{ item.path }}</span>
              <span class="dataset__meta">
                {{ item.params.length }} 个参数 ·
                {{ item.resultShape === 'value' ? '单个值' : `${item.fields.length} 个字段` }} ·
                {{ refreshLabel(item.refresh) }}
              </span>
              <span class="dataset__usage" :title="(usage.get(item.id) ?? []).join('、')">
                <Users :size="12" />{{ usage.get(item.id)?.length ?? 0 }}
              </span>
              <div class="dataset__actions">
                <button class="s-icon-btn" title="编辑与测试" @click="editDataset(item)"><Pencil :size="14" /></button>
                <button class="s-icon-btn" title="复制" @click="duplicateDataset(item)"><Copy :size="14" /></button>
                <button class="s-icon-btn" title="删除" @click="removeDataset(item)"><Trash2 :size="14" /></button>
              </div>
            </article>
          </section>
        </div>
        <div v-else class="detail__empty">
          <p v-if="query">没有匹配「{{ query }}」的接口</p>
          <template v-else>
            <p>这个数据服务还没有接口。推荐按下面的顺序选择登记方式：</p>
            <div class="ways">
              <button @click="openImport('openapi')">
                <strong>① 导入 Swagger / OpenAPI 文档</strong>
                <span>后端已有接口文档时，一次导入全部接口、参数说明和字段</span>
              </button>
              <button @click="openImport('catalog')">
                <strong>② 同步接口清单</strong>
                <span>后端按约定提供清单地址，带中文名和字段说明，以后一键同步</span>
              </button>
              <button @click="openImport('curl')">
                <strong>③ 粘贴 cURL</strong>
                <span>从浏览器开发者工具复制现有业务页面的请求</span>
              </button>
              <button @click="newDataset">
                <strong>④ 手动新建</strong>
                <span>填写地址和参数，发送测试请求后自动识别字段</span>
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-else-if="store.loaded" class="center__empty">
      <Plug :size="28" />
      <h2>还没有数据服务</h2>
      <p>数据服务就是一个后端地址（例如园区业务后台）。添加后，从它的接口文档导入接口，或手动登记。</p>
      <div class="roles">
        <div>
          <UserCog :size="16" /><strong>技术人员 / 后端</strong
          ><span>登记数据服务和接口：地址、认证、参数说明、返回字段</span>
        </div>
        <div>
          <Users :size="16" /><strong>业务人员</strong
          ><span>在大屏组件的「数据」中选择接口、填写参数，不需要看接口文档</span>
        </div>
      </div>
      <div class="center__empty-actions">
        <button class="s-btn s-btn--primary" @click="addConnection"><Plus :size="14" />添加数据服务</button>
        <button class="s-btn" :disabled="syncing" data-testid="add-demo" @click="addDemo">
          <FlaskConical :size="14" />{{ syncing ? '连接中…' : '使用演示数据服务' }}
        </button>
        <button class="s-btn" @click="openImport('curl')"><Plus :size="14" />粘贴 cURL</button>
      </div>
    </div>

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
.services {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.service {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--s-fg-2);
  text-align: left;
  cursor: pointer;
}
.service:hover {
  background: var(--s-panel);
}
.service.is-active {
  border-color: var(--s-line-2);
  background: var(--s-panel);
  color: var(--s-fg);
}
.service--demo {
  border: 1px dashed var(--s-line-2);
}
.service__text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.service__text strong {
  overflow: hidden;
  font-size: 13px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.service__text small {
  overflow: hidden;
  color: var(--s-fg-3);
  font-family: var(--s-mono);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.service em {
  padding: 0 7px;
  border-radius: 9px;
  background: var(--s-raised);
  color: var(--s-fg-2);
  font-size: 11px;
  font-style: normal;
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
.group h3 {
  margin: 16px 0 6px;
  color: var(--s-fg-2);
  font-size: 12px;
  font-weight: 550;
}
.group h3 span {
  margin-left: 4px;
  color: var(--s-fg-3);
  font-weight: 400;
}
.dataset {
  display: grid;
  grid-template-columns: 48px minmax(160px, 1.3fr) minmax(120px, 1fr) auto 44px auto;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  border: 1px solid var(--s-line);
  border-radius: 8px;
  background: var(--s-panel-2);
}
.dataset + .dataset {
  margin-top: 6px;
}
.dataset:hover {
  border-color: var(--s-line-2);
}
.method {
  padding: 2px 0;
  border-radius: 3px;
  background: rgb(116 192 142 / 0.15);
  color: var(--s-ok);
  font: 600 10.5px var(--s-mono);
  text-align: center;
}
.method.POST,
.method.PUT {
  background: rgb(226 180 86 / 0.15);
  color: var(--s-warn);
}
.dataset__text {
  min-width: 0;
}
.dataset__text strong {
  font-size: 13px;
  font-weight: 550;
}
.dataset__text p,
.dataset__path {
  overflow: hidden;
  margin: 2px 0 0;
  color: var(--s-fg-3);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dataset__meta {
  color: var(--s-fg-3);
  font-size: 11.5px;
  white-space: nowrap;
}
.dataset__usage {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--s-fg-3);
  font-size: 11.5px;
}
.dataset__actions {
  display: flex;
}
.detail__empty {
  padding: 20px 0 6px;
  color: var(--s-fg-2);
}
.ways {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.ways button {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--s-line-2);
  border-radius: 8px;
  background: var(--s-panel-2);
  color: var(--s-fg);
  text-align: left;
  cursor: pointer;
}
.ways button:hover {
  border-color: var(--s-accent-line);
}
.ways span {
  color: var(--s-fg-3);
  font-size: 12px;
}
.center__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 70px 20px;
  border: 1px dashed var(--s-line-2);
  border-radius: 12px;
  color: var(--s-fg-3);
  text-align: center;
}
.center__empty h2 {
  margin: 4px 0 0;
  color: var(--s-fg);
  font-size: 17px;
}
.center__empty p {
  max-width: 520px;
  margin: 0;
}
.roles {
  display: flex;
  gap: 12px;
  margin: 10px 0;
}
.roles div {
  display: grid;
  width: 250px;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--s-panel);
  text-align: left;
}
.roles strong {
  color: var(--s-fg);
}
.roles span {
  grid-column: 1 / -1;
  font-size: 12px;
}
.center__empty-actions {
  display: flex;
  gap: 8px;
}
</style>
