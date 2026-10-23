<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Plus, Send, Sparkles, X } from 'lucide-vue-next'
import { computed, reactive, ref, watch } from 'vue'
import { describeResponse } from '../importers'
import { recordsOf } from '../mapping'
import {
  type ApiDataset,
  type ApiFieldType,
  type ApiParam,
  type ApiParamType,
  refreshChoices,
  refreshLabel,
} from '../model'
import { type ApiResponse, getPath, inferFields, joinUrl, sendRequest, trimSample } from '../request'
import { useDataSourceStore } from '../store'
import JsonTree from './JsonTree.vue'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{ dataset: ApiDataset | null }>()
const emit = defineEmits<{ saved: [dataset: ApiDataset] }>()
const store = useDataSourceStore()

const draft = ref<ApiDataset | null>(null)
const connection = computed(() => store.connection(draft.value?.connectionId))
const groups = computed(() => [...new Set(store.datasets.map(item => item.group))])
const testValues = reactive<Record<string, string>>({})
const response = ref<ApiResponse | null>(null)
const testing = ref(false)
/** The body explored in the tree: the last test, else the stored sample. */
const body = computed(() => (response.value ? response.value.body : draft.value?.sample))

watch(visible, open => {
  if (!open || !props.dataset) return
  draft.value = JSON.parse(JSON.stringify(props.dataset)) as ApiDataset
  for (const key of Object.keys(testValues)) delete testValues[key]
  for (const param of draft.value.params) testValues[param.key] = param.default
  response.value = null
  // A new interface without fields: try it at once, so the response is there to pick from.
  if (!draft.value.fields.length && !draft.value.params.some(param => param.required && !param.default)) void test()
})

// ---------------------------------------------------------------- parameters

const paramTypes: Array<{ value: ApiParamType; label: string }> = [
  { value: 'string', label: '文字' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'month', label: '月份' },
  { value: 'enum', label: '下拉选项' },
  { value: 'boolean', label: '是 / 否' },
]
const fieldTypes: Array<{ value: ApiFieldType; label: string }> = [
  { value: 'string', label: '文字' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'boolean', label: '是 / 否' },
]

function addParam(): void {
  draft.value?.params.push({ key: '', label: '', in: 'query', type: 'string', required: false, default: '' })
}

/** `{id}` in the path becomes a path parameter. */
function syncPathParams(): void {
  const item = draft.value
  if (!item) return
  for (const [, key] of item.path.matchAll(/\{([^}]+)\}/g))
    if (key && !item.params.some(param => param.key === key))
      item.params.push({ key, label: key, in: 'path', type: 'string', required: true, default: '' })
}

const optionsText = (param: ApiParam) =>
  (param.options ?? [])
    .map(option => (option.label === option.value ? option.value : `${option.value}=${option.label}`))
    .join('，')
function setOptions(param: ApiParam, text: string): void {
  param.options = text
    .split(/[,，\n]/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [value, label] = part.split(/[=:：]/)
      return { value: value!.trim(), label: (label ?? value!).trim() }
    })
}

// ---------------------------------------------------------------- testing

async function test(): Promise<void> {
  const item = draft.value
  const target = connection.value
  if (!item || !target) return
  testing.value = true
  const result = await sendRequest(target, item, { ...testValues })
  testing.value = false
  response.value = result
  if (result.body === undefined || result.body === null || typeof result.body !== 'object') return
  item.sample = trimSample(result.body)
  // Fields already described are left alone; a new interface gets them from the response.
  if (result.ok && !item.fields.length) Object.assign(item, describeResponse(item, result.body))
}

function pickPath(path: string): void {
  const item = draft.value
  const source = body.value
  if (!item) return
  const target = getPath(source, path)
  item.resultPath = path
  item.resultShape = Array.isArray(target) ? 'rows' : target && typeof target === 'object' ? 'object' : 'value'
  item.fields = item.resultShape === 'value' ? [] : inferFields(target, item.fields)
}

function reinfer(): void {
  const item = draft.value
  if (!item || body.value === undefined) return
  item.fields = item.resultShape === 'value' ? [] : inferFields(getPath(body.value, item.resultPath))
}

const preview = computed(() => {
  const item = draft.value
  if (!item || body.value === undefined) return []
  return recordsOf(item, body.value).slice(0, 5)
})
const previewValue = computed(() =>
  draft.value?.resultShape === 'value' && body.value !== undefined
    ? getPath(body.value, draft.value.resultPath)
    : undefined,
)
const display = (value: unknown) =>
  value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)

// ---------------------------------------------------------------- saving

async function save(): Promise<void> {
  const item = draft.value
  if (!item) return
  if (!item.name.trim()) return void ElMessage.warning('请填写接口名称')
  if (item.params.some(param => !param.key.trim())) return void ElMessage.warning('有参数没有填写参数名')
  item.name = item.name.trim()
  item.group = item.group.trim() || '默认分组'
  for (const param of item.params) param.label = param.label.trim() || param.key
  for (const field of item.fields) field.label = field.label.trim() || field.key
  try {
    await store.saveDatasets([item])
    visible.value = false
    emit('saved', item)
    ElMessage.success('接口已保存，使用它的大屏会自动刷新')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '保存失败')
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="dataset && store.dataset(dataset.id) ? '编辑接口' : '新建接口'"
    width="min(1180px, 96vw)"
    top="4vh"
    append-to-body
    class="studio-dialog dataset-dialog"
  >
    <div v-if="draft" class="editor" data-testid="dataset-editor">
      <section class="column">
        <h4>基本信息</h4>
        <div class="grid">
          <label>接口名称</label>
          <input
            v-model="draft.name"
            class="s-input"
            placeholder="业务人员看到的名字，如：近 7 日发电量"
            data-testid="dataset-name"
          />
          <label>分组</label>
          <div>
            <input v-model="draft.group" class="s-input" list="dataset-groups" placeholder="如：能源、安防" />
            <datalist id="dataset-groups">
              <option v-for="group in groups" :key="group" :value="group" />
            </datalist>
          </div>
          <label>说明</label>
          <textarea
            v-model="draft.description"
            class="s-textarea"
            rows="2"
            placeholder="这个接口返回什么数据，方便业务人员挑选"
          />
        </div>

        <h4>请求</h4>
        <div class="grid">
          <label>地址</label>
          <div class="request">
            <select v-model="draft.method" class="s-select method">
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
            </select>
            <span class="request__base" :title="connection?.baseUrl">{{ connection?.baseUrl }}</span>
            <input
              v-model="draft.path"
              class="s-input s-mono"
              placeholder="/api/energy/trend"
              data-testid="dataset-path"
              @change="syncPathParams"
            />
          </div>
          <label>刷新建议</label>
          <select v-model.number="draft.refresh" class="s-select refresh">
            <option v-for="choice in refreshChoices" :key="choice.value" :value="choice.value">
              {{ choice.label }}
            </option>
            <option v-if="!refreshChoices.some(choice => choice.value === draft!.refresh)" :value="draft.refresh">
              {{ refreshLabel(draft.refresh) }}
            </option>
          </select>
        </div>

        <h4>
          参数
          <button class="s-btn s-btn--ghost s-btn--sm" data-testid="dataset-add-param" @click="addParam">
            <Plus :size="12" />添加参数
          </button>
        </h4>
        <p class="s-hint">
          「显示名」和「下拉选项」是给业务人员看的；类型决定他们在组件里看到输入框、日期选择还是下拉框。
        </p>
        <div v-if="draft.params.length" class="params">
          <div class="params__head">
            <span>参数名</span><span>显示名</span><span>位置</span><span>类型</span><span>默认值</span><span>必填</span
            ><span />
          </div>
          <template v-for="(param, index) in draft.params" :key="index">
            <div class="params__row">
              <input v-model="param.key" class="s-input s-mono" placeholder="days" />
              <input v-model="param.label" class="s-input" placeholder="天数" />
              <select v-model="param.in" class="s-select">
                <option value="query">查询</option>
                <option value="path">路径</option>
                <option value="body">请求体</option>
                <option value="header">请求头</option>
              </select>
              <select v-model="param.type" class="s-select">
                <option v-for="type in paramTypes" :key="type.value" :value="type.value">{{ type.label }}</option>
              </select>
              <input v-model="param.default" class="s-input" placeholder="（空）" />
              <input v-model="param.required" type="checkbox" />
              <button class="s-icon-btn" title="删除参数" @click="draft.params.splice(index, 1)">
                <X :size="13" />
              </button>
            </div>
            <div v-if="param.type === 'enum'" class="params__options">
              <span>选项</span>
              <input
                class="s-input"
                :value="optionsText(param)"
                placeholder="值=名称，用逗号分隔，如：pv=光伏，wind=风电"
                @change="setOptions(param, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </template>
        </div>
        <p v-else class="s-hint empty">没有参数</p>
      </section>

      <section class="column column--test">
        <h4>
          测试与返回数据
          <button class="s-btn s-btn--primary s-btn--sm" :disabled="testing" data-testid="dataset-test" @click="test">
            <Send :size="12" />{{ testing ? '请求中…' : '发送测试请求' }}
          </button>
        </h4>
        <div v-if="draft.params.length" class="test-params">
          <label v-for="param in draft.params" :key="param.key">
            <span>{{ param.label || param.key }}</span>
            <select
              v-if="param.type === 'enum' && param.options?.length"
              v-model="testValues[param.key]"
              class="s-select"
            >
              <option value="">（不传）</option>
              <option v-for="option in param.options" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <input
              v-else
              v-model="testValues[param.key]"
              class="s-input"
              :type="
                param.type === 'date'
                  ? 'date'
                  : param.type === 'month'
                    ? 'month'
                    : param.type === 'number'
                      ? 'number'
                      : 'text'
              "
            />
          </label>
        </div>
        <div v-if="response" class="result" :class="{ 'is-error': !response.ok }" data-testid="dataset-test-result">
          <strong>{{ response.ok ? `成功 · HTTP ${response.status}` : '失败' }}</strong>
          <span>{{ response.duration }} ms</span>
          <p v-if="response.error">{{ response.error }}</p>
        </div>
        <p v-else-if="connection" class="s-hint">请求 {{ joinUrl(connection.baseUrl, draft.path) }}</p>

        <template v-if="body !== undefined && body !== null && typeof body === 'object'">
          <div class="tree s-scroll">
            <JsonTree :value="body" :selected="draft.resultPath" @pick="pickPath" />
          </div>
          <p class="s-hint">
            点击蓝色的「用作数据列表」选择图表和表格要用的那组数据；只有一条记录（如今日汇总）时选那个对象。
          </p>
          <div class="grid">
            <label>数据位置</label>
            <div class="request">
              <input
                v-model="draft.resultPath"
                class="s-input s-mono"
                placeholder="（整个返回值）"
                data-testid="dataset-result-path"
                @change="reinfer"
              />
              <select v-model="draft.resultShape" class="s-select shape" @change="reinfer">
                <option value="rows">多条记录</option>
                <option value="object">单条记录</option>
                <option value="value">单个值</option>
              </select>
            </div>
          </div>
        </template>

        <h4 v-if="draft.resultShape !== 'value'">
          字段
          <button class="s-btn s-btn--ghost s-btn--sm" :disabled="body === undefined" @click="reinfer">
            <Sparkles :size="12" />重新识别
          </button>
        </h4>
        <div v-if="draft.resultShape !== 'value' && draft.fields.length" class="fields" data-testid="dataset-fields">
          <div class="fields__head"><span>字段</span><span>显示名</span><span>类型</span><span>单位</span><span /></div>
          <div v-for="(field, index) in draft.fields" :key="field.key" class="fields__row">
            <span class="s-mono" :title="field.key">{{ field.key }}</span>
            <input v-model="field.label" class="s-input" :data-testid="`dataset-field-${field.key}`" />
            <select v-model="field.type" class="s-select">
              <option v-for="type in fieldTypes" :key="type.value" :value="type.value">{{ type.label }}</option>
            </select>
            <input v-model="field.unit" class="s-input" placeholder="—" />
            <button class="s-icon-btn" title="不使用这个字段" @click="draft.fields.splice(index, 1)">
              <X :size="13" />
            </button>
          </div>
        </div>
        <p v-else-if="draft.resultShape !== 'value'" class="s-hint empty">发送测试请求后自动识别字段</p>

        <template v-if="preview.length && draft.fields.length">
          <h4>预览</h4>
          <div class="preview s-scroll">
            <table>
              <thead>
                <tr>
                  <th v-for="field in draft.fields" :key="field.key">
                    {{ field.label }}<small v-if="field.unit">（{{ field.unit }}）</small>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(record, index) in preview" :key="index">
                  <td v-for="field in draft.fields" :key="field.key">{{ display(getPath(record, field.key)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <p v-else-if="previewValue !== undefined" class="value">{{ display(previewValue) }}</p>
      </section>
    </div>
    <template #footer>
      <button class="s-btn" @click="visible = false">取消</button>
      <button class="s-btn s-btn--primary" data-testid="dataset-save" @click="save">保存接口</button>
    </template>
  </el-dialog>
</template>

<style scoped>
.editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  max-height: 74vh;
  min-height: 420px;
}
.column {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  padding-right: 4px;
}
.column--test {
  padding-left: 24px;
  border-left: 1px solid var(--s-line);
}
h4 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 10px 0 2px;
  color: var(--s-fg);
  font-size: 13px;
  font-weight: 600;
}
h4:first-child {
  margin-top: 0;
}
.s-hint {
  margin: 0;
}
.empty {
  padding: 8px 0;
}
.grid {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  align-items: center;
  gap: 8px 10px;
}
.grid > label {
  color: var(--s-fg-2);
  font-size: 12px;
}
.request {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}
.method {
  width: 82px;
  flex-shrink: 0;
}
.request__base {
  overflow: hidden;
  max-width: 40%;
  flex-shrink: 1;
  color: var(--s-fg-3);
  font-family: var(--s-mono);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.refresh {
  width: 160px;
}
.shape {
  width: 110px;
  flex-shrink: 0;
}
.params__head,
.params__row {
  display: grid;
  grid-template-columns: 1.1fr 1.1fr 82px 92px 1fr 30px 26px;
  align-items: center;
  gap: 6px;
}
.params__head,
.fields__head {
  padding-bottom: 2px;
  color: var(--s-fg-3);
  font-size: 11px;
}
.params__row,
.fields__row {
  padding: 3px 0;
}
.params__options {
  display: grid;
  grid-template-columns: 40px 1fr;
  align-items: center;
  gap: 6px;
  padding: 0 32px 6px 0;
  color: var(--s-fg-3);
  font-size: 11px;
}
.test-params {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
}
.test-params label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: var(--s-fg-2);
  font-size: 11.5px;
}
.result {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid rgb(116 192 142 / 0.35);
  border-radius: var(--s-radius-sm);
  background: rgb(116 192 142 / 0.08);
  color: var(--s-ok);
}
.result span {
  color: var(--s-fg-3);
  font-size: 11px;
}
.result p {
  width: 100%;
  margin: 0;
  line-height: 1.6;
}
.result.is-error {
  border-color: rgb(229 103 92 / 0.4);
  background: rgb(229 103 92 / 0.08);
  color: var(--s-danger);
}
.tree {
  max-height: 260px;
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--s-line);
  border-radius: var(--s-radius-sm);
  background: var(--s-field);
}
.fields__head,
.fields__row {
  display: grid;
  grid-template-columns: 1fr 1.2fr 86px 70px 26px;
  align-items: center;
  gap: 6px;
}
.fields__row > span {
  overflow: hidden;
  color: var(--s-fg-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview {
  overflow: auto;
  border: 1px solid var(--s-line);
  border-radius: var(--s-radius-sm);
}
.preview table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}
.preview th,
.preview td {
  padding: 5px 8px;
  border-bottom: 1px solid var(--s-line);
  color: var(--s-fg-2);
  text-align: left;
  white-space: nowrap;
}
.preview th {
  background: var(--s-panel-2);
  color: var(--s-fg-3);
  font-weight: 500;
}
.preview small {
  font-size: 10px;
}
.value {
  margin: 0;
  color: var(--s-fg);
  font: 600 22px var(--s-mono);
}
</style>
