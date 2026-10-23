<script setup lang="ts">
import { ArrowDown, ArrowUp, ExternalLink, Link2, RefreshCw, Search, Unlink2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import { type ApiUse, defaultMapping } from '../datasources/mapping'
import {
  type ApiBinding,
  type ApiDataset,
  type ApiParam,
  type ApiReduce,
  type ParamBinding,
  refreshChoices,
  refreshLabel,
} from '../datasources/model'
import { builtinVariables, type Widget } from '../model'
import { useScreenSession } from './session'

const props = defineProps<{ widget: Widget; use: ApiUse }>()
const session = useScreenSession()
const runtime = session.runtime
const sources = runtime.sources
const router = useRouter()

const binding = computed<ApiBinding>(() => props.widget.data?.api ?? { datasetId: '', params: {} })
const dataset = computed(() => sources.dataset(binding.value.datasetId))
const connection = computed(() => sources.connection(dataset.value?.connectionId))
const fields = computed(() => dataset.value?.fields ?? [])
const numericFields = computed(() => fields.value.filter(field => field.type === 'number'))
const state = computed(() => runtime.apiState(props.widget))
const variables = computed(() => [
  ...(session.doc.value.variables ?? []).map(variable => ({ name: variable.name, label: variable.name })),
  ...builtinVariables.map(variable => ({ name: variable.name, label: variable.label })),
])

function update(patch: Partial<ApiBinding>, label = '修改接口数据'): void {
  session.updateWidget(
    props.widget.id,
    w => void (w.data = { ...(w.data ?? { source: 'api' }), api: { ...binding.value, ...patch } }),
    label,
  )
}

// ---------------------------------------------------------------- picking a dataset

const picking = ref(false)
const query = ref('')
const choices = computed(() => {
  const words = query.value.trim().toLowerCase()
  const groups = new Map<string, ApiDataset[]>()
  for (const item of sources.datasets) {
    const owner = sources.connection(item.connectionId)
    if (!owner) continue
    const haystack = `${item.name} ${item.group} ${item.description} ${item.path}`.toLowerCase()
    if (words && !haystack.includes(words)) continue
    const title = sources.connections.length > 1 ? `${owner.name} · ${item.group}` : item.group
    groups.set(title, [...(groups.get(title) ?? []), item])
  }
  return [...groups]
})

function pick(item: ApiDataset): void {
  picking.value = false
  query.value = ''
  if (item.id === binding.value.datasetId) return
  session.updateWidget(
    props.widget.id,
    w =>
      void (w.data = {
        ...(w.data ?? { source: 'api' }),
        source: 'api',
        api: { datasetId: item.id, params: {}, ...defaultMapping(item, props.use) },
      }),
    '选择接口',
  )
}

function openCenter(datasetId?: string): void {
  const target = router.resolve({ name: 'datasources', query: datasetId ? { dataset: datasetId } : {} })
  window.open(target.href, '_blank')
}

// ---------------------------------------------------------------- parameters

const paramOf = (param: ApiParam): ParamBinding => binding.value.params[param.key] ?? {}
function setParam(param: ApiParam, value: ParamBinding): void {
  update({ params: { ...binding.value.params, [param.key]: value } }, '修改参数')
}
function toggleVariable(param: ApiParam): void {
  const current = paramOf(param)
  setParam(param, current.variable ? {} : { variable: variables.value[0]?.name ?? '@today' })
}
const paramValue = (param: ApiParam) => paramOf(param).value ?? param.default ?? ''

// ---------------------------------------------------------------- fields

function toggleIn(list: string[] | undefined, key: string): string[] {
  const items = list ?? []
  return items.includes(key) ? items.filter(item => item !== key) : [...items, key]
}
function move(key: string, step: -1 | 1): void {
  const columns = [...(binding.value.columns ?? [])]
  const index = columns.indexOf(key)
  const target = index + step
  if (index < 0 || target < 0 || target >= columns.length) return
  ;[columns[index], columns[target]] = [columns[target]!, columns[index]!]
  update({ columns }, '调整列顺序')
}
const fieldLabel = (key: string) => fields.value.find(field => field.key === key)?.label ?? key
const reduceChoices: Array<{ value: ApiReduce; label: string }> = [
  { value: 'first', label: '第一行' },
  { value: 'last', label: '最后一行' },
  { value: 'sum', label: '合计' },
  { value: 'avg', label: '平均' },
  { value: 'max', label: '最大' },
  { value: 'min', label: '最小' },
  { value: 'count', label: '行数' },
]

// ---------------------------------------------------------------- status

const statusText = computed(() => {
  const current = state.value
  if (!current) return ''
  if (current.status === 'loading') return '正在请求…'
  const time = current.updatedAt ? new Date(current.updatedAt).toLocaleTimeString('zh-CN', { hour12: false }) : ''
  if (current.status === 'error') return current.error
  return `已加载 · ${time} · ${current.duration} ms`
})
</script>

<template>
  <div class="api" data-testid="api-binding">
    <UiSection title="接口">
      <div class="picker">
        <button class="picker__current" data-testid="api-dataset" @click="picking = !picking">
          <template v-if="dataset">
            <strong>{{ dataset.name }}</strong>
            <span>{{ connection?.name }} · {{ dataset.group }}</span>
          </template>
          <template v-else>
            <strong class="is-empty">{{ binding.datasetId ? '接口已被删除，请重新选择' : '选择接口…' }}</strong>
            <span>从「数据接口」中登记的接口里选择</span>
          </template>
        </button>
        <div v-if="picking" class="picker__menu" data-testid="api-dataset-menu">
          <label class="picker__search">
            <Search :size="13" />
            <input v-model="query" placeholder="搜索接口名称、分组" autofocus />
          </label>
          <div class="picker__list s-scroll">
            <template v-for="[group, items] in choices" :key="group">
              <div class="picker__group">{{ group }}</div>
              <button
                v-for="item in items"
                :key="item.id"
                class="picker__item"
                :class="{ 'is-active': item.id === binding.datasetId }"
                :data-testid="`api-option-${item.name}`"
                @click="pick(item)"
              >
                <strong>{{ item.name }}</strong>
                <span>{{ item.description || `${item.method} ${item.path}` }}</span>
              </button>
            </template>
            <p v-if="!choices.length" class="picker__none s-hint">
              {{ sources.datasets.length ? '没有匹配的接口' : '还没有登记任何接口' }}
            </p>
          </div>
          <button class="picker__manage" @click="openCenter()"><ExternalLink :size="12" />管理数据接口</button>
        </div>
      </div>
      <p v-if="dataset?.description" class="note s-hint">{{ dataset.description }}</p>
      <p v-if="!sources.datasets.length" class="note s-hint">
        接口由技术人员在「数据接口」中登记一次（可从后端的 Swagger 文档一键导入），之后在这里按名称选用即可。
      </p>
      <div v-if="dataset" class="links">
        <button class="s-btn s-btn--ghost s-btn--sm" @click="openCenter(dataset.id)">
          <ExternalLink :size="12" />查看接口配置
        </button>
      </div>
    </UiSection>

    <UiSection v-if="dataset && dataset.params.length" title="参数">
      <UiRow
        v-for="param in dataset.params"
        :key="param.key"
        :label="`${param.label}${param.required ? ' *' : ''}`"
        :hint="param.description || param.key"
      >
        <select
          v-if="paramOf(param).variable"
          class="s-select is-variable"
          :value="paramOf(param).variable"
          :data-testid="`api-param-${param.key}`"
          @change="setParam(param, { variable: ($event.target as HTMLSelectElement).value })"
        >
          <option v-for="variable in variables" :key="variable.name" :value="variable.name">
            变量：{{ variable.label }}
          </option>
        </select>
        <select
          v-else-if="param.type === 'enum' || param.type === 'boolean'"
          class="s-select"
          :value="paramValue(param)"
          :data-testid="`api-param-${param.key}`"
          @change="setParam(param, { value: ($event.target as HTMLSelectElement).value })"
        >
          <option v-if="!param.required" value="">（不限）</option>
          <option
            v-for="option in param.type === 'boolean'
              ? [
                  { value: 'true', label: '是' },
                  { value: 'false', label: '否' },
                ]
              : (param.options ?? [])"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <input
          v-else
          class="s-input"
          :type="
            param.type === 'number'
              ? 'number'
              : param.type === 'date'
                ? 'date'
                : param.type === 'month'
                  ? 'month'
                  : 'text'
          "
          :value="paramValue(param)"
          :placeholder="param.required ? '必填' : '留空不传'"
          :data-testid="`api-param-${param.key}`"
          @change="setParam(param, { value: ($event.target as HTMLInputElement).value })"
        />
        <button
          class="s-icon-btn"
          :class="{ 'is-active': paramOf(param).variable }"
          :title="paramOf(param).variable ? '改为固定值' : '跟随大屏变量（筛选器、点击联动）'"
          :data-testid="`api-param-link-${param.key}`"
          @click="toggleVariable(param)"
        >
          <Unlink2 v-if="paramOf(param).variable" :size="13" />
          <Link2 v-else :size="13" />
        </button>
      </UiRow>
      <p class="note s-hint">
        点击 <Link2 :size="11" /> 让参数跟随大屏变量：筛选器、点击其他组件或三维中选中设备时自动重新请求。
      </p>
    </UiSection>

    <UiSection v-if="dataset && dataset.resultShape !== 'value'" title="字段">
      <template v-if="use === 'value'">
        <UiRow label="显示字段">
          <select
            class="s-select"
            :value="binding.value ?? ''"
            data-testid="api-value-field"
            @change="update({ value: ($event.target as HTMLSelectElement).value })"
          >
            <option v-for="field in fields" :key="field.key" :value="field.key">
              {{ field.label }}{{ field.unit ? `（${field.unit}）` : '' }}
            </option>
          </select>
        </UiRow>
        <UiRow v-if="dataset.resultShape === 'rows'" label="多行时" hint="接口返回多行数据时，如何得到一个数">
          <select
            class="s-select"
            :value="binding.reduce ?? 'first'"
            @change="update({ reduce: ($event.target as HTMLSelectElement).value as ApiReduce })"
          >
            <option v-for="choice in reduceChoices" :key="choice.value" :value="choice.value">
              {{ choice.label }}
            </option>
          </select>
        </UiRow>
      </template>

      <template v-else-if="use === 'chart'">
        <UiRow label="分类（X 轴）">
          <select
            class="s-select"
            :value="binding.dimension ?? ''"
            data-testid="api-dimension"
            @change="update({ dimension: ($event.target as HTMLSelectElement).value })"
          >
            <option v-for="field in fields" :key="field.key" :value="field.key">{{ field.label }}</option>
          </select>
        </UiRow>
        <UiRow label="数值（系列）" stack>
          <div class="checks">
            <label v-for="field in numericFields" :key="field.key">
              <input
                type="checkbox"
                :checked="binding.measures?.includes(field.key)"
                :data-testid="`api-measure-${field.key}`"
                @change="update({ measures: toggleIn(binding.measures, field.key) })"
              />{{ field.label }}{{ field.unit ? `（${field.unit}）` : '' }}
            </label>
            <span v-if="!numericFields.length" class="s-hint">接口没有数值字段</span>
          </div>
        </UiRow>
      </template>

      <template v-else>
        <UiRow label="显示的列" stack>
          <div class="columns">
            <div v-for="key in binding.columns ?? []" :key="key" class="columns__item">
              <input type="checkbox" checked @change="update({ columns: toggleIn(binding.columns, key) })" />
              <span>{{ fieldLabel(key) }}</span>
              <button class="s-icon-btn" title="上移" @click="move(key, -1)"><ArrowUp :size="12" /></button>
              <button class="s-icon-btn" title="下移" @click="move(key, 1)"><ArrowDown :size="12" /></button>
            </div>
            <label
              v-for="field in fields.filter(field => !binding.columns?.includes(field.key))"
              :key="field.key"
              class="columns__item is-off"
            >
              <input type="checkbox" @change="update({ columns: toggleIn(binding.columns, field.key) })" />
              <span>{{ field.label }}</span>
            </label>
          </div>
        </UiRow>
      </template>

      <UiRow v-if="dataset.resultShape === 'rows'" label="排序">
        <select
          class="s-select"
          :value="binding.sort?.field ?? ''"
          @change="
            update({
              sort: ($event.target as HTMLSelectElement).value
                ? { field: ($event.target as HTMLSelectElement).value, order: binding.sort?.order ?? 'desc' }
                : undefined,
            })
          "
        >
          <option value="">接口原顺序</option>
          <option v-for="field in fields" :key="field.key" :value="field.key">{{ field.label }}</option>
        </select>
        <select
          v-if="binding.sort"
          class="s-select order"
          :value="binding.sort.order"
          @change="
            update({
              sort: { field: binding.sort!.field, order: ($event.target as HTMLSelectElement).value as 'asc' | 'desc' },
            })
          "
        >
          <option value="desc">从大到小</option>
          <option value="asc">从小到大</option>
        </select>
      </UiRow>
      <UiRow v-if="dataset.resultShape === 'rows'" label="最多显示">
        <UiNumber
          :model-value="binding.limit ?? 0"
          :min="0"
          :max="1000"
          :step="1"
          :precision="0"
          unit="条"
          @update="update({ limit: Math.round($event) || undefined }, '显示条数')"
        />
      </UiRow>
      <p v-if="dataset.resultShape === 'rows'" class="note s-hint">最多显示为 0 时显示全部。</p>
    </UiSection>

    <UiSection v-if="dataset" title="刷新">
      <UiRow label="刷新频率">
        <select
          class="s-select"
          :value="binding.refresh === undefined ? 'default' : String(binding.refresh)"
          data-testid="api-refresh"
          @change="
            update({
              refresh:
                ($event.target as HTMLSelectElement).value === 'default'
                  ? undefined
                  : Number(($event.target as HTMLSelectElement).value),
            })
          "
        >
          <option value="default">跟随接口（{{ refreshLabel(dataset.refresh) }}）</option>
          <option v-for="choice in refreshChoices" :key="choice.value" :value="String(choice.value)">
            {{ choice.label }}
          </option>
        </select>
      </UiRow>
      <div class="status" :class="state?.status" data-testid="api-status">
        <i />
        <span :title="statusText">{{ statusText || '等待请求' }}</span>
        <button class="s-icon-btn" title="立即刷新" @click="runtime.reloadApi(widget)">
          <RefreshCw :size="13" />
        </button>
      </div>
      <p class="note s-hint">同一接口、同样参数的组件共用一次请求；请求失败时保留上次的数据并自动重试。</p>
    </UiSection>
  </div>
</template>

<style scoped>
.note {
  margin: 4px 0 0;
  padding: 0 12px;
}
.links {
  padding: 4px 8px 0;
}
.picker {
  position: relative;
  padding: 0 12px;
}
.picker__current {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 7px 9px;
  border: 1px solid var(--s-line-2);
  border-radius: var(--s-radius-sm);
  background: var(--s-field);
  color: var(--s-fg);
  text-align: left;
  cursor: pointer;
}
.picker__current:hover {
  border-color: #45464c;
}
.picker__current strong {
  font-size: 12.5px;
  font-weight: 550;
}
.picker__current strong.is-empty {
  color: var(--s-accent-2);
}
.picker__current span {
  color: var(--s-fg-3);
  font-size: 11px;
}
.picker__menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  right: 12px;
  left: 12px;
  display: flex;
  max-height: 360px;
  flex-direction: column;
  border: 1px solid var(--s-line-2);
  border-radius: var(--s-radius);
  background: var(--s-panel-2);
  box-shadow: var(--s-shadow);
}
.picker__search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--s-line);
  color: var(--s-fg-3);
}
.picker__search input {
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--s-fg);
  font-size: 12px;
  outline: none;
}
.picker__list {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 4px;
}
.picker__group {
  padding: 8px 8px 4px;
  color: var(--s-fg-3);
  font-size: 11px;
}
.picker__item {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--s-radius-sm);
  background: transparent;
  color: var(--s-fg);
  text-align: left;
  cursor: pointer;
}
.picker__item:hover {
  background: var(--s-hover);
}
.picker__item.is-active {
  background: var(--s-accent-soft);
}
.picker__item strong {
  font-size: 12px;
  font-weight: 500;
}
.picker__item span {
  overflow: hidden;
  max-width: 100%;
  color: var(--s-fg-3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picker__none {
  padding: 12px;
  text-align: center;
}
.picker__manage {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border: 0;
  border-top: 1px solid var(--s-line);
  background: transparent;
  color: var(--s-fg-2);
  font-size: 11.5px;
  cursor: pointer;
}
.picker__manage:hover {
  color: var(--s-fg);
}
.s-select.is-variable {
  border-color: rgb(111 179 224 / 0.5);
  color: var(--s-data);
}
.order {
  width: 92px;
  flex-shrink: 0;
}
.checks {
  display: flex;
  max-height: 150px;
  flex-wrap: wrap;
  gap: 4px 10px;
  overflow: auto;
  color: var(--s-fg-2);
  font-size: 12px;
}
.checks label {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.columns {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 1px;
}
.columns__item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 0 4px;
  border-radius: var(--s-radius-sm);
  color: var(--s-fg);
  font-size: 12px;
}
.columns__item span {
  flex: 1;
}
.columns__item .s-icon-btn {
  width: 20px;
  height: 20px;
}
.columns__item.is-off {
  color: var(--s-fg-3);
  cursor: pointer;
}
.status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 12px 0;
  padding: 4px 4px 4px 8px;
  border-radius: var(--s-radius-sm);
  background: var(--s-field);
  color: var(--s-fg-2);
  font-size: 11.5px;
}
.status span {
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status i {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--s-fg-3);
}
.status.ok i {
  background: var(--s-ok);
  box-shadow: 0 0 6px var(--s-ok);
}
.status.error {
  align-items: flex-start;
  color: var(--s-danger);
}
.status.error span {
  white-space: normal;
}
.status.error i {
  margin-top: 5px;
}
.status.error i {
  background: var(--s-danger);
}
.status.loading i {
  background: var(--s-data);
}
</style>
