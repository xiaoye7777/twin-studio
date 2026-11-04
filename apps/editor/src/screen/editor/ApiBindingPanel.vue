<script setup lang="ts">
import { ExternalLink, Link2, RefreshCw } from 'lucide-vue-next'
import { computed } from 'vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import { type ApiUse, defaultMapping } from '../datasources/mapping'
import { type ApiBinding, type ApiDataset, type ParamBinding, refreshChoices, refreshLabel } from '../datasources/model'
import { builtinVariables, type Widget } from '../model'
import ApiFieldMapping from './api/ApiFieldMapping.vue'
import ApiParamInput from './api/ApiParamInput.vue'
import DatasetPicker from './api/DatasetPicker.vue'
import { openDataSourceCenter } from './api/openDataSourceCenter'
import { useScreenSession } from './session'

/**
 * 组件「数据」栏里「接口数据」的配置：选接口 → 填参数 → 选字段 → 刷新频率，下面显示请求状态。
 * 各部分在 api/ 目录：DatasetPicker（选接口）、ApiParamInput（一个参数）、ApiFieldMapping（字段怎么用）。
 */
const props = defineProps<{ widget: Widget; use: ApiUse }>()
const session = useScreenSession()
const runtime = session.runtime
const sources = runtime.sources

const binding = computed<ApiBinding>(() => props.widget.data?.api ?? { datasetId: '', params: {} })
const dataset = computed(() => sources.dataset(binding.value.datasetId))
const state = computed(() => runtime.apiState(props.widget))
/** 参数可以跟随的变量：页面设置里的自定义变量，加上内置的（选中设备、今天、本月）。 */
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

/** 换了接口：参数清空，字段按新接口自动选一套默认的。 */
function pick(item: ApiDataset): void {
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

function setParam(key: string, value: ParamBinding): void {
  update({ params: { ...binding.value.params, [key]: value } }, '修改参数')
}

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
      <DatasetPicker :dataset-id="binding.datasetId" @pick="pick" />
      <p v-if="dataset?.description" class="s-note s-hint">{{ dataset.description }}</p>
      <p v-if="!sources.datasets.length" class="s-note s-hint">
        接口由技术人员在「数据接口」中登记一次（可从后端的 Swagger 文档一键导入），之后在这里按名称选用即可。
      </p>
      <div v-if="dataset" class="links">
        <button class="s-btn s-btn--ghost s-btn--sm" @click="openDataSourceCenter(dataset.id)">
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
        <ApiParamInput
          :param="param"
          :binding="binding.params[param.key] ?? {}"
          :variables="variables"
          @update="setParam(param.key, $event)"
        />
      </UiRow>
      <p class="s-note s-hint">
        点击 <Link2 :size="11" /> 让参数跟随大屏变量：筛选器、点击其他组件或三维中选中设备时自动重新请求。
      </p>
    </UiSection>

    <UiSection v-if="dataset && dataset.resultShape !== 'value'" title="字段">
      <ApiFieldMapping :binding="binding" :dataset="dataset" :use="use" @update="update" />
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
      <p class="s-note s-hint">同一接口、同样参数的组件共用一次请求；请求失败时保留上次的数据并自动重试。</p>
    </UiSection>
  </div>
</template>

<style scoped>
.links {
  padding: 4px 8px 0;
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
