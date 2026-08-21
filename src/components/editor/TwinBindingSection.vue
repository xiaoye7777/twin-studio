<script setup lang="ts">
import { Delete, Link as LinkIcon, Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'
import type {
  TwinBinding,
  TwinRuntimeValueData,
  TwinVariableDataType,
  TwinVariableDefinition,
} from '@/domain/twin'
import { twinBindingTargetKey } from '@/domain/twin'
import { bindingTargetFromObject } from '@/editor/services/BindingTargetResolver'
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
  twinStore.bindingRevision
  return target.value ? twinStore.getBindingByTarget(target.value) : null
})
const resolution = computed(() => {
  twinStore.resolutionRevision
  return binding.value ? twinStore.resolutionByBindingId[binding.value.id] ?? 'unresolved' : null
})
const runtimeRows = computed(() => {
  twinStore.runtimeRevision
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
  <section
    data-testid="twin-binding-section"
    :data-binding-id="binding?.id ?? ''"
    :data-device-id="binding?.device.id ?? ''"
    :data-target-type="target?.type ?? ''"
    :data-target-key="target ? twinBindingTargetKey(target) : ''"
    :data-resolution="resolution ?? ''"
    :data-variable-count="binding?.variables.length ?? 0"
    :data-runtime-revision="twinStore.runtimeRevision"
    class="space-y-3 border-t border-slate-700 pt-4"
  >
    <div class="flex items-center justify-between">
      <p class="text-xs font-semibold text-slate-200">数字孪生</p>
      <span v-if="binding && twinStore.mockRunning" class="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium text-emerald-300">
        <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" /> MOCK LIVE
      </span>
    </div>

    <p class="truncate font-mono text-[9px] text-slate-600">{{ targetLabel }}</p>

    <div v-if="!target" class="rounded-md bg-amber-500/10 px-3 py-2 text-[10px] leading-4 text-amber-300">
      当前节点没有可用于业务绑定的 instanceId / assetNodeId / nodeId。
    </div>

    <template v-else-if="binding">
      <div class="rounded-md bg-slate-900/50 p-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p data-testid="twin-device-name" class="truncate text-xs font-medium text-slate-100">{{ binding.device.name }}</p>
            <p data-testid="twin-device-id" class="mt-1 font-mono text-[10px] text-sky-300">{{ binding.device.id }}</p>
            <p class="mt-1 truncate text-[10px] text-slate-500">{{ binding.device.type || '未设置设备类型' }}</p>
          </div>
          <span v-if="resolution === 'unresolved'" class="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-300">UNRESOLVED</span>
        </div>
      </div>

      <div>
        <p class="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">实时数据</p>
        <div data-testid="twin-runtime-values" class="divide-y divide-slate-700/70 rounded-md bg-slate-900/40 px-3">
          <div v-for="row in runtimeRows" :key="row.variable.id" :data-variable-key="row.variable.key" class="flex min-h-8 items-center justify-between gap-3 py-1.5 text-[11px]">
            <span class="truncate text-slate-400">{{ row.variable.name }}</span>
            <span class="shrink-0 font-mono text-slate-100">
              {{ formatRuntimeValue(row.variable, row.runtime?.value) }}<span v-if="row.variable.unit" class="ml-1 text-slate-500">{{ row.variable.unit }}</span>
            </span>
          </div>
          <p v-if="runtimeRows.length === 0" class="py-3 text-center text-[10px] text-slate-600">暂无变量</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <el-button data-testid="edit-twin-binding" size="small" @click="openBindingDialog">编辑绑定</el-button>
        <el-button data-testid="unbind-twin-device" size="small" type="danger" plain @click="unbind">解除绑定</el-button>
      </div>
    </template>

    <el-button v-else data-testid="bind-twin-device" class="w-full" size="small" :icon="LinkIcon" @click="openBindingDialog">绑定设备</el-button>

    <el-dialog v-model="dialogVisible" data-testid="twin-binding-dialog" title="设备与变量绑定" width="640px" append-to-body destroy-on-close>
      <div class="space-y-5">
        <div class="grid grid-cols-3 gap-3">
          <label class="block"><span class="field-label">Device ID *</span><el-input data-testid="binding-device-id" v-model="form.deviceId" placeholder="ESS-001" /></label>
          <label class="block"><span class="field-label">Device Name</span><el-input data-testid="binding-device-name" v-model="form.deviceName" placeholder="储能柜 01" /></label>
          <label class="block"><span class="field-label">Device Type</span><el-input data-testid="binding-device-type" v-model="form.deviceType" placeholder="energy-storage-cabinet" /></label>
        </div>

        <div>
          <div class="mb-3 flex items-center justify-between">
            <p class="text-sm font-medium text-slate-700">变量定义</p>
            <div class="flex gap-2">
              <el-button data-testid="energy-storage-demo" size="small" @click="applyEnergyStorageDemo">储能柜 Demo</el-button>
              <el-button data-testid="add-twin-variable" size="small" :icon="Plus" @click="addVariable()">添加变量</el-button>
            </div>
          </div>
          <div class="max-h-72 space-y-2 overflow-y-auto pr-1">
            <div v-for="(variable, index) in form.variables" :key="variable.id" :data-testid="`binding-variable-${index}`" class="grid grid-cols-[1fr_1fr_110px_80px_32px] items-end gap-2 rounded-md bg-slate-50 p-2">
              <label><span class="field-label">Key</span><el-input v-model="variable.key" size="small" /></label>
              <label><span class="field-label">Name</span><el-input v-model="variable.name" size="small" /></label>
              <label><span class="field-label">Data Type</span><el-select v-model="variable.dataType" size="small"><el-option label="number" value="number" /><el-option label="boolean" value="boolean" /><el-option label="string" value="string" /></el-select></label>
              <label><span class="field-label">Unit</span><el-input v-model="variable.unit" size="small" /></label>
              <button :aria-label="`删除变量 ${variable.name || index + 1}`" class="grid h-8 w-8 place-items-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-500" type="button" @click="removeVariable(index)"><el-icon><Delete /></el-icon></button>
            </div>
            <div v-if="!form.variables.length" class="rounded-md border border-dashed border-slate-200 py-7 text-center text-xs text-slate-400">尚未添加变量</div>
          </div>
        </div>
      </div>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button data-testid="save-twin-binding" type="primary" @click="saveBinding">保存绑定</el-button></template>
    </el-dialog>
  </section>
</template>

<style scoped>
.field-label { display:block; margin-bottom:.375rem; font-size:.6875rem; color:#64748b; }
</style>
