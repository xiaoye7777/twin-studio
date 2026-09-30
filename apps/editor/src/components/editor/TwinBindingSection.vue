<script setup lang="ts">
import InspectorSection from './InspectorSection.vue'
import { Delete, Link as LinkIcon, Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'
import {
  bindingTargetFromObject,
  type TwinBinding,
  twinBindingTargetKey,
  type TwinRuntimeValueData,
  type TwinVariableDataType,
  type TwinVariableDefinition,
} from '@twin-studio/core'
import { useEditorStore } from '@/stores/editor'
import { useTwinStore } from '@/stores/twin'

interface VariableForm {
  id: string
  key: string
  name: string
  dataType: TwinVariableDataType
  unit: string
}

const editorStore = useEditorStore()
const twinStore = useTwinStore()
const dialogVisible = ref(false)
const form = reactive({
  deviceId: '',
  deviceName: '',
  deviceType: '',
  variables: [] as VariableForm[],
})

const target = computed(() => {
  const object = editorStore.selectedObject
  return object ? bindingTargetFromObject(object) : null
})
const binding = computed(() => {
  void twinStore.bindingRevision
  return target.value ? twinStore.getBindingByTarget(target.value) : null
})
const resolution = computed(() => {
  void twinStore.resolutionRevision
  return binding.value ? twinStore.resolutionByBindingId[binding.value.id] ?? 'unresolved' : null
})
const runtimeRows = computed(() => {
  void twinStore.runtimeRevision
  if (!binding.value) return []
  return binding.value.variables.map((variable) => ({
    variable,
    runtime: twinStore.getRuntimeValue(binding.value!.id, variable.key),
  }))
})
const targetLabel = computed(() => {
  if (!target.value) return '当前节点缺少稳定平台身份'
  if (target.value.type === 'primitive') return `Primitive · ${target.value.nodeId}`
  if (target.value.type === 'asset-instance') return `Asset Root · ${target.value.instanceId}`
  return `Asset Node · ${target.value.instanceId} / ${target.value.assetNodeId}`
})

function createId(prefix: 'binding' | 'variable'): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`
}

function toVariableForm(variable: TwinVariableDefinition): VariableForm {
  return { ...variable, unit: variable.unit ?? '' }
}

function addVariable(initial?: Partial<VariableForm>): void {
  form.variables.push({
    id: initial?.id ?? createId('variable'),
    key: initial?.key ?? '',
    name: initial?.name ?? '',
    dataType: initial?.dataType ?? 'number',
    unit: initial?.unit ?? '',
  })
}

function removeVariable(index: number): void {
  form.variables.splice(index, 1)
}

function applyEnergyStorageDemo(): void {
  form.deviceType = 'energy-storage-cabinet'
  form.variables = [
    { id: createId('variable'), key: 'soc', name: 'SOC', dataType: 'number', unit: '%' },
    { id: createId('variable'), key: 'temperature', name: '温度', dataType: 'number', unit: '℃' },
    { id: createId('variable'), key: 'power', name: '功率', dataType: 'number', unit: 'kW' },
    { id: createId('variable'), key: 'alarm', name: '告警', dataType: 'boolean', unit: '' },
    { id: createId('variable'), key: 'status', name: '状态', dataType: 'string', unit: '' },
  ]
}

function openBindingDialog(): void {
  const current = binding.value
  form.deviceId = current?.device.id ?? ''
  form.deviceName = current?.device.name ?? ''
  form.deviceType = current?.device.type ?? ''
  form.variables = current?.variables.map(toVariableForm) ?? []
  dialogVisible.value = true
}

function saveBinding(): void {
  const currentTarget = target.value
  if (!currentTarget) return
  const deviceId = form.deviceId.trim()
  if (!deviceId) {
    ElMessage.warning('Device ID 为必填项')
    return
  }
  const variables = form.variables.map((variable) => ({
    id: variable.id,
    key: variable.key.trim(),
    name: variable.name.trim(),
    dataType: variable.dataType,
    unit: variable.unit.trim() || undefined,
  }))
  if (variables.some((variable) => !variable.key || !variable.name)) {
    ElMessage.warning('每个变量都必须填写 Key 和 Name')
    return
  }
  if (new Set(variables.map((variable) => variable.key)).size !== variables.length) {
    ElMessage.warning('变量 Key 不能重复')
    return
  }

  const nextBinding: TwinBinding = {
    id: binding.value?.id ?? createId('binding'),
    target: { ...currentTarget },
    device: {
      id: deviceId,
      name: form.deviceName.trim() || deviceId,
      type: form.deviceType.trim() || undefined,
    },
    variables,
  }
  const wasEditing = binding.value !== null
  twinStore.upsertBinding(nextBinding)
  dialogVisible.value = false
  ElMessage.success(wasEditing ? '设备绑定已更新' : '设备绑定成功')
}

function unbind(): void {
  if (!target.value) return
  twinStore.removeBindingByTarget(target.value)
  ElMessage.success('设备绑定已解除')
}

function formatRuntimeValue(variable: TwinVariableDefinition, value: TwinRuntimeValueData | undefined): string {
  if (value === undefined) return '—'
  if (variable.dataType === 'boolean') {
    if (variable.key.toLowerCase().includes('alarm')) return value ? '告警' : '正常'
    return value ? 'true' : 'false'
  }
  return String(value)
}

watch(() => editorStore.selectedObject, () => { dialogVisible.value = false })
</script>

<template>
  <InspectorSection
    title="数字孪生"
    data-testid="twin-binding-section"
    :data-binding-id="binding?.id ?? ''"
    :data-device-id="binding?.device.id ?? ''"
    :data-target-type="target?.type ?? ''"
    :data-target-key="target ? twinBindingTargetKey(target) : ''"
    :data-resolution="resolution ?? ''"
    :data-variable-count="binding?.variables.length ?? 0"
    :data-runtime-revision="twinStore.runtimeRevision"
  >
    <template #actions>
      <span v-if="binding && twinStore.dataSourceStatus === 'connected'" class="st-pill st-pill--ok">{{ twinStore.dataSourceType === 'mock' ? 'MOCK' : '实时' }}</span>
      <span v-else-if="binding" data-testid="binding-no-live-data" class="st-pill st-pill--warn">无实时数据</span>
    </template>

    <p class="st-mono truncate text-fg-3" :title="targetLabel">{{ targetLabel }}</p>

    <div v-if="!target" class="rounded-md border border-warn/25 bg-warn/10 px-3 py-2 text-[11px] leading-5 text-warn">
      当前节点没有可用于业务绑定的 instanceId / assetNodeId / nodeId。
    </div>

    <template v-else-if="binding">
      <div class="st-item flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p data-testid="twin-device-name" class="truncate text-[12px] font-medium text-fg">{{ binding.device.name }}</p>
          <p class="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-fg-3">
            <code data-testid="twin-device-id" class="st-mono text-accent-fg">{{ binding.device.id }}</code>
            <span class="truncate">· {{ binding.device.type || '未设置设备类型' }}</span>
          </p>
        </div>
        <span v-if="resolution === 'unresolved'" class="st-pill st-pill--warn">未解析</span>
      </div>

      <div data-testid="twin-runtime-values" class="overflow-hidden rounded-[5px] border border-line">
        <div v-for="row in runtimeRows" :key="row.variable.id" :data-variable-key="row.variable.key" class="value-row">
          <span class="truncate text-fg-2">{{ row.variable.name }}</span>
          <span class="shrink-0 font-mono text-[11.5px]" :class="row.runtime ? 'text-fg' : 'text-fg-3'">
            {{ formatRuntimeValue(row.variable, row.runtime?.value) }}<span v-if="row.variable.unit" class="ml-1 text-fg-3">{{ row.variable.unit }}</span>
          </span>
        </div>
        <p v-if="runtimeRows.length === 0" class="py-3 text-center text-[11px] text-fg-3">暂无变量</p>
      </div>

      <div class="grid grid-cols-2 gap-1.5">
        <button data-testid="edit-twin-binding" class="st-btn" type="button" @click="openBindingDialog">编辑绑定</button>
        <button data-testid="unbind-twin-device" class="st-btn hover:text-danger!" type="button" @click="unbind">解除绑定</button>
      </div>
    </template>

    <button v-else data-testid="bind-twin-device" class="st-btn w-full" type="button" @click="openBindingDialog">
      <el-icon><LinkIcon /></el-icon>绑定设备
    </button>

    <el-dialog v-model="dialogVisible" data-testid="twin-binding-dialog" title="设备与变量绑定" width="680px" append-to-body destroy-on-close>
      <div class="space-y-5">
        <div class="grid grid-cols-3 gap-3">
          <label class="block"><span class="field-label">设备 ID <em>*</em></span><el-input v-model="form.deviceId" data-testid="binding-device-id" placeholder="ESS-001" /></label>
          <label class="block"><span class="field-label">设备名称</span><el-input v-model="form.deviceName" data-testid="binding-device-name" placeholder="储能柜 01" /></label>
          <label class="block"><span class="field-label">设备类型</span><el-input v-model="form.deviceType" data-testid="binding-device-type" placeholder="energy-storage-cabinet" /></label>
        </div>

        <div>
          <div class="mb-2 flex items-center justify-between">
            <p class="text-[12px] font-semibold text-fg">变量定义 <span class="ml-1 font-normal text-fg-3">{{ form.variables.length }}</span></p>
            <div class="flex gap-1.5">
              <button data-testid="energy-storage-demo" class="st-btn" type="button" @click="applyEnergyStorageDemo">填入储能柜示例</button>
              <button data-testid="add-twin-variable" class="st-btn" type="button" @click="addVariable()"><el-icon><Plus /></el-icon>添加变量</button>
            </div>
          </div>
          <div class="grid grid-cols-[1fr_1fr_110px_80px_28px] gap-2 px-2 pb-1.5 text-[11px] text-fg-3">
            <span>Key</span><span>名称</span><span>类型</span><span>单位</span><span />
          </div>
          <div class="max-h-72 space-y-1 overflow-y-auto pr-1">
            <div v-for="(variable, index) in form.variables" :key="variable.id" :data-testid="`binding-variable-${index}`" class="grid grid-cols-[1fr_1fr_110px_80px_28px] items-center gap-2 rounded-[5px] bg-field px-2 py-1.5">
              <el-input v-model="variable.key" size="small" aria-label="Key" />
              <el-input v-model="variable.name" size="small" aria-label="名称" />
              <el-select v-model="variable.dataType" size="small" aria-label="类型"><el-option label="number" value="number" /><el-option label="boolean" value="boolean" /><el-option label="string" value="string" /></el-select>
              <el-input v-model="variable.unit" size="small" aria-label="单位" />
              <button :aria-label="`删除变量 ${variable.name || index + 1}`" class="grid h-7 w-7 place-items-center rounded text-fg-3 hover:bg-hover hover:text-danger" type="button" @click="removeVariable(index)"><el-icon><Delete /></el-icon></button>
            </div>
            <div v-if="!form.variables.length" class="rounded-[5px] border border-dashed border-line-strong py-7 text-center text-[12px] text-fg-3">尚未添加变量</div>
          </div>
        </div>
      </div>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button data-testid="save-twin-binding" type="primary" @click="saveBinding">保存绑定</el-button></template>
    </el-dialog>
  </InspectorSection>
</template>

<style scoped>
.field-label { display:block; margin-bottom:.375rem; font-size:11px; color:var(--color-fg-2); }
.field-label em { font-style:normal; color:var(--color-accent-fg); }
.value-row {
  display: flex;
  min-height: 26px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 10px;
  font-size: 12px;
}
.value-row:nth-child(odd) { background: var(--color-field); }
.value-row:nth-child(even) { background: rgb(28 29 31 / 0.55); }
</style>
