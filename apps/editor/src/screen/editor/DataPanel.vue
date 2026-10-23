<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import { apiUse } from '../datasources/mapping'
import type { DataBinding, DataSourceKind, Widget } from '../model'
import { deviceTypeName } from '../runtime/ScreenRuntime'
import { widgetDefinition } from '../widgets'
import { formatNumber } from '../widgets/format'
import ApiBindingPanel from './ApiBindingPanel.vue'
import { useScreenSession } from './session'

const props = defineProps<{ widget: Widget }>()
const session = useScreenSession()
const runtime = session.runtime
const definition = computed(() => widgetDefinition(props.widget.type))
const binding = computed<DataBinding>(() => props.widget.data ?? { source: 'static' })
const linked = computed(() => !!session.doc.value.sceneProjectId)

const sourceNames: Record<DataSourceKind, string> = {
  static: '静态数据',
  api: '接口数据',
  device: '单个设备变量',
  aggregate: '多设备汇总',
  devices: '设备列表',
  history: '实时趋势',
  alarms: '当前告警',
  selected: '选中设备',
  stat: '场景统计',
}
const sourceHints: Record<DataSourceKind, string> = {
  static: '手动填写的数据，不随时间变化',
  api: '从后端接口读取（接口在「数据接口」中登记，这里按名称选用）',
  device: '某台设备的一个变量的实时值',
  aggregate: '多台设备同一变量的合计、平均、最大、最小或计数',
  devices: '每台设备一行，列为选择的变量',
  history: '最近一段时间的实时值，按时间排列（打开大屏后开始记录）',
  alarms: '场景告警规则当前触发的告警',
  selected: '在三维视图或其他组件中选中的设备的全部变量',
  stat: '设备数、在线数或告警数',
}
const sources = computed<DataSourceKind[]>(() => definition.value?.data?.sources ?? ['static'])
const sceneSource = (kind: DataSourceKind) => kind !== 'static' && kind !== 'api'
const use = computed(() => apiUse(props.widget.type, definition.value?.data?.shape ?? 'rows'))

const devices = computed(() => runtime.devices.value)
const types = computed(() => [...new Set(devices.value.map(device => device.type).filter(Boolean))])
const scoped = computed(() => runtime.devicesFor(binding.value))
/** Variables of the devices in scope (union), optionally numbers only. */
const variablesOf = (list: typeof devices.value, numeric = false) => {
  const map = new Map<string, { key: string; name: string; unit?: string }>()
  for (const device of list)
    for (const variable of device.variables)
      if (!numeric || variable.dataType === 'number') map.set(variable.key, variable)
  return [...map.values()]
}
const singleDevice = computed(() => runtime.device(binding.value.deviceId))
const numericOnly = computed(() => definition.value?.data?.shape === 'value' || props.widget.type.startsWith('chart-'))

function update(patch: Partial<DataBinding>, label = '修改数据'): void {
  session.updateWidget(props.widget.id, w => void (w.data = { ...(w.data ?? { source: 'static' }), ...patch }), label)
}

function setSource(source: DataSourceKind): void {
  const patch: Partial<DataBinding> = { source }
  const first = devices.value[0]
  const numeric = first?.variables.find(variable => variable.dataType === 'number')
  if (source === 'device' && !binding.value.deviceId && first)
    Object.assign(patch, { deviceId: first.id, variable: numeric?.key ?? first.variables[0]?.key })
  if (
    (source === 'aggregate' || source === 'devices' || source === 'history') &&
    !binding.value.deviceType &&
    types.value[0]
  )
    patch.deviceType = types.value[0]
  if (source === 'aggregate' && !binding.value.variable) {
    const list = runtime.devicesFor({ deviceType: patch.deviceType ?? binding.value.deviceType })
    patch.variable = variablesOf(list, true)[0]?.key
    patch.aggregate = 'sum'
  }
  if ((source === 'devices' || source === 'history') && !binding.value.variables?.length) {
    const list = runtime.devicesFor({ deviceType: patch.deviceType ?? binding.value.deviceType })
    patch.variables = variablesOf(list, true)
      .slice(0, source === 'history' ? 1 : 2)
      .map(variable => variable.key)
  }
  if (source === 'history' && !binding.value.window) patch.window = 300
  if (source === 'stat' && !binding.value.stat) patch.stat = 'devices'
  if (source === 'api' && !binding.value.api) patch.api = { datasetId: '', params: {} }
  update(patch, '数据来源')
}

function toggleVariable(key: string): void {
  const list = binding.value.variables ?? []
  update({ variables: list.includes(key) ? list.filter(item => item !== key) : [...list, key] })
}

function toggleDevice(id: string): void {
  const list = binding.value.deviceIds ?? []
  update({ deviceIds: list.includes(id) ? list.filter(item => item !== id) : [...list, id] })
}

// Static JSON is edited as text and applied on change.
const text = ref('')
const error = ref('')
watch(
  () => [props.widget.id, binding.value.json] as const,
  () => {
    text.value = binding.value.json ?? ''
    error.value = ''
  },
  { immediate: true },
)
function applyJson(): void {
  try {
    if (text.value.trim()) JSON.parse(text.value)
    error.value = ''
  } catch {
    error.value = '不是有效的 JSON（纯文本也可以，会作为一个值显示）'
  }
  update({ json: text.value })
}

const preview = computed(() => runtime.dataFor(props.widget, definition.value?.data?.shape))
const status = computed(() => {
  if (!linked.value) return ''
  if (runtime.sceneError.value) return runtime.sceneError.value
  const labels = {
    connected: '实时数据已连接',
    connecting: '正在连接实时数据…',
    unconfigured: '场景未配置实时数据源',
    disconnected: '实时数据未连接',
    error: '实时数据连接错误',
  }
  return `${labels[runtime.twin.dataSourceStatus]} · ${devices.value.length} 台设备`
})
</script>

<template>
  <div class="data" data-testid="data-panel">
    <UiSection title="数据来源">
      <UiRow label="来源" :hint="sourceHints[binding.source]">
        <select
          class="s-select"
          :value="binding.source"
          data-testid="data-source"
          @change="setSource(($event.target as HTMLSelectElement).value as DataSourceKind)"
        >
          <option v-for="kind in sources" :key="kind" :value="kind" :disabled="sceneSource(kind) && !linked">
            {{ sourceNames[kind] }}{{ sceneSource(kind) && !linked ? '（需关联场景）' : '' }}
          </option>
        </select>
      </UiRow>
      <p v-if="!linked && sources.some(sceneSource)" class="note s-hint">
        在页面设置（点击画布空白处）中关联三维场景后，可以使用设备实时数据。
      </p>
      <p
        v-else-if="status && sceneSource(binding.source)"
        class="note"
        :class="{ 'is-live': runtime.twin.dataSourceStatus === 'connected' }"
      >
        <i />{{ status }}
      </p>
    </UiSection>

    <UiSection v-if="binding.source === 'static'" title="静态数据">
      <div class="json">
        <textarea
          v-model="text"
          class="s-input json__text"
          rows="10"
          spellcheck="false"
          data-testid="static-json"
          @change="applyJson"
        />
        <p v-if="error" class="json__error">{{ error }}</p>
        <p class="s-hint">数值写一个数字；图表和表格写对象数组，第一个文字列为分类，数字列为数据。</p>
      </div>
    </UiSection>

    <ApiBindingPanel v-else-if="binding.source === 'api'" :widget="widget" :use="use" />

    <UiSection v-else-if="binding.source === 'device'" title="设备变量">
      <UiRow label="设备">
        <select
          class="s-select"
          :value="binding.deviceId ?? ''"
          data-testid="data-device"
          @change="update({ deviceId: ($event.target as HTMLSelectElement).value })"
        >
          <option v-for="device in devices" :key="device.id" :value="device.id">
            {{ device.name }}（{{ device.id }}）
          </option>
        </select>
      </UiRow>
      <UiRow label="变量">
        <select
          class="s-select"
          :value="binding.variable ?? ''"
          data-testid="data-variable"
          @change="update({ variable: ($event.target as HTMLSelectElement).value })"
        >
          <option v-for="variable in singleDevice?.variables ?? []" :key="variable.key" :value="variable.key">
            {{ variable.name || variable.key }}{{ variable.unit ? `（${variable.unit}）` : '' }}
          </option>
        </select>
      </UiRow>
    </UiSection>

    <UiSection v-else-if="['aggregate', 'devices', 'history'].includes(binding.source)" title="设备与变量">
      <UiRow label="设备类型">
        <select
          class="s-select"
          :value="binding.deviceType ?? ''"
          data-testid="data-device-type"
          @change="update({ deviceType: ($event.target as HTMLSelectElement).value, deviceIds: [] })"
        >
          <option value="">全部设备</option>
          <option v-for="type in types" :key="type" :value="type">
            {{ deviceTypeName(type) }}（{{ devices.filter(device => device.type === type).length }} 台）
          </option>
        </select>
      </UiRow>
      <UiRow label="指定设备" hint="不勾选时使用该类型的全部设备" stack>
        <div class="checks">
          <label
            v-for="device in devices.filter(device => !binding.deviceType || device.type === binding.deviceType)"
            :key="device.id"
          >
            <input
              type="checkbox"
              :checked="binding.deviceIds?.includes(device.id)"
              @change="toggleDevice(device.id)"
            />{{ device.name }}
          </label>
        </div>
      </UiRow>
      <UiRow v-if="binding.source === 'aggregate'" label="变量">
        <select
          class="s-select"
          :value="binding.variable ?? ''"
          data-testid="data-variable"
          @change="update({ variable: ($event.target as HTMLSelectElement).value })"
        >
          <option v-for="variable in variablesOf(scoped, true)" :key="variable.key" :value="variable.key">
            {{ variable.name || variable.key }}{{ variable.unit ? `（${variable.unit}）` : '' }}
          </option>
        </select>
      </UiRow>
      <UiRow v-if="binding.source === 'aggregate'" label="汇总方式">
        <select
          class="s-select"
          :value="binding.aggregate ?? 'sum'"
          @change="update({ aggregate: ($event.target as HTMLSelectElement).value as DataBinding['aggregate'] })"
        >
          <option value="sum">合计</option>
          <option value="avg">平均</option>
          <option value="max">最大</option>
          <option value="min">最小</option>
          <option value="count">有数据的设备数</option>
        </select>
      </UiRow>
      <UiRow v-if="binding.source !== 'aggregate'" label="变量" stack>
        <div class="checks">
          <label v-for="variable in variablesOf(scoped, numericOnly)" :key="variable.key">
            <input
              type="checkbox"
              :checked="binding.variables?.includes(variable.key)"
              @change="toggleVariable(variable.key)"
            />
            {{ variable.name || variable.key }}
          </label>
        </div>
      </UiRow>
      <UiRow v-if="binding.source === 'history'" label="时间范围">
        <UiNumber
          :model-value="binding.window ?? 300"
          :min="10"
          :max="1800"
          :step="10"
          :precision="0"
          unit="秒"
          @update="update({ window: Math.round($event) })"
        />
      </UiRow>
    </UiSection>

    <UiSection v-else-if="binding.source === 'stat'" title="统计">
      <UiRow label="指标">
        <select
          class="s-select"
          :value="binding.stat ?? 'devices'"
          @change="update({ stat: ($event.target as HTMLSelectElement).value as DataBinding['stat'] })"
        >
          <option value="devices">设备总数</option>
          <option value="online">有实时数据的设备数</option>
          <option value="alarms">当前告警数</option>
        </select>
      </UiRow>
    </UiSection>

    <UiSection v-else-if="binding.source === 'selected'" title="选中设备">
      <p class="note s-hint">
        显示在三维视图中点击、或由其他组件（表格行、图表、按钮）选中的设备。在编辑器中先显示
        {{ runtime.device(runtime.selectedDeviceId.value)?.name ?? '（尚未选中设备）' }}。
      </p>
    </UiSection>

    <UiSection title="数据预览" :open="true">
      <div class="preview" data-testid="data-preview">
        <template v-if="preview && preview.rows.length">
          <table>
            <thead>
              <tr>
                <th v-for="key in Object.keys(preview.rows[0]!)" :key="key">{{ preview.labels[key] ?? key }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in preview.rows.slice(-6)" :key="index">
                <td v-for="key in Object.keys(preview.rows[0]!)" :key="key">
                  {{ formatNumber(row[key], typeof row[key] === 'number' && !Number.isInteger(row[key]) ? 1 : 0) }}
                </td>
              </tr>
            </tbody>
          </table>
          <p class="s-hint">共 {{ preview.rows.length }} 行{{ preview.rows.length > 6 ? '，显示最后 6 行' : '' }}</p>
        </template>
        <p v-else-if="preview && preview.value !== null && preview.value !== undefined" class="preview__value">
          {{
            formatNumber(preview.value, typeof preview.value === 'number' && !Number.isInteger(preview.value) ? 2 : 0)
          }}
          <small>{{ preview.units.value ?? '' }}</small>
        </p>
        <p v-else class="s-hint">
          暂无数据{{
            binding.source === 'api'
              ? '（接口加载后显示）'
              : binding.source !== 'static'
                ? '（实时数据连接后显示）'
                : ''
          }}
        </p>
      </div>
    </UiSection>
  </div>
</template>

<style scoped>
.note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 0 0;
  padding: 0 12px;
  color: var(--s-fg-3);
  font-size: 11.5px;
  line-height: 1.6;
}
.note i {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--s-warn);
}
.note.is-live i {
  background: var(--s-ok);
  box-shadow: 0 0 6px var(--s-ok);
}
.json {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 12px;
}
.json__text {
  width: 100%;
  height: auto;
  padding: 8px;
  font-family: var(--s-mono);
  font-size: 11.5px;
  line-height: 1.5;
  resize: vertical;
}
.json__error {
  margin: 0;
  color: var(--s-warn);
  font-size: 11.5px;
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
.preview {
  overflow: auto;
  padding: 0 12px;
}
.preview table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}
.preview th,
.preview td {
  padding: 3px 6px;
  border-bottom: 1px solid var(--s-line);
  color: var(--s-fg-2);
  text-align: left;
  white-space: nowrap;
}
.preview th {
  color: var(--s-fg-3);
  font-weight: 500;
}
.preview__value {
  margin: 0;
  color: var(--s-fg);
  font: 600 22px var(--s-mono);
}
.preview__value small {
  color: var(--s-fg-3);
  font-size: 12px;
}
</style>
