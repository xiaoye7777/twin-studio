<script setup lang="ts">
import InspectorSection from './InspectorSection.vue'
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  bindingTargetFromObject,
  cloneTemplate,
  type EffectTemplate,
  isVisualRule,
  type RuleCondition,
  type RuleOperator,
  ruleOperators,
  twinBindingTargetKey,
  type VisualRule,
} from '@twin-studio/core'
import { useEditorStore } from '@/stores/editor'
import { useTwinStore } from '@/stores/twin'
import { useVisualRulesStore } from '@/stores/visualRules'
import { useEffectTemplatesStore } from '@/stores/effectTemplates'

const editor = useEditorStore(),
  twin = useTwinStore(),
  rules = useVisualRulesStore(),
  templates = useEffectTemplatesStore()
const target = computed(() => (editor.selectedObject ? bindingTargetFromObject(editor.selectedObject) : null))
const binding = computed(() => (target.value ? twin.getBindingByTarget(target.value) : null))
const selectedRules = computed(() =>
  target.value ? rules.rules.filter(r => twinBindingTargetKey(r.target) === twinBindingTargetKey(target.value!)) : [],
)
const open = ref(false),
  editingId = ref(''),
  savedSnapshot = ref<EffectTemplate | null>(null)
const form = reactive({
  variableKey: '',
  operator: '>' as RuleOperator,
  operand: '60' as string | number,
  templateId: '',
  priority: 10,
  enabled: true,
})
const variable = computed(() => binding.value?.variables.find(v => v.key === form.variableKey))
const operators = computed(() => ruleOperators(variable.value?.dataType ?? 'number'))
function variableChanged(): void {
  form.operator = variable.value?.dataType === 'number' ? '>' : '=='
  form.operand = variable.value?.dataType === 'boolean' ? 'true' : variable.value?.dataType === 'number' ? '60' : ''
}
async function edit(rule?: VisualRule): Promise<void> {
  if (!binding.value) return
  editingId.value = rule?.id ?? ''
  savedSnapshot.value = rule?.template ? cloneTemplate(rule.template) : null
  form.variableKey = rule?.variableKey ?? binding.value.variables[0]?.key ?? ''
  variableChanged()
  if (rule) {
    form.operator = rule.condition.operator
    form.operand = String(rule.condition.value)
  }
  form.enabled = rule?.enabled ?? true
  form.priority = rule?.priority ?? 10
  form.templateId = savedSnapshot.value ? '@snapshot' : ''
  open.value = true
  try {
    await templates.refresh()
  } catch (e) {
    ElMessage.warning(e instanceof Error ? e.message : '模板库不可用，可继续使用已保存快照')
  }
}
function save(): void {
  if (!target.value || !binding.value || !variable.value) {
    ElMessage.warning('请选择当前绑定中有效的变量')
    return
  }
  const source =
    form.templateId === '@snapshot' ? savedSnapshot.value : templates.templates.find(t => t.id === form.templateId)
  if (!source) {
    ElMessage.warning('请选择特效模板')
    return
  }
  const dataType = variable.value.dataType
  let condition: RuleCondition
  if (dataType === 'number') {
    if (!String(form.operand).trim() || !Number.isFinite(Number(form.operand))) {
      ElMessage.warning('请输入有效数字')
      return
    }
    condition = { dataType, operator: form.operator, value: Number(form.operand) }
  } else {
    if (form.operator !== '==' && form.operator !== '!=') {
      ElMessage.warning('此变量仅支持 == / !=')
      return
    }
    condition =
      dataType === 'boolean'
        ? { dataType, operator: form.operator, value: form.operand === 'true' }
        : { dataType, operator: form.operator, value: String(form.operand) }
  }
  const rule: VisualRule = {
    id: editingId.value || `visualRule_${crypto.randomUUID()}`,
    bindingId: binding.value.id,
    target: { ...target.value },
    variableKey: variable.value.key,
    condition,
    enabled: form.enabled,
    priority: Number(form.priority),
    template: cloneTemplate(source),
  }
  if (!isVisualRule(rule)) {
    ElMessage.warning('规则无效，优先级应为 0–100 的整数')
    return
  }
  rules.save(rule)
  open.value = false
}
function label(rule: VisualRule): string {
  const definition = twin.getBindingById(rule.bindingId)?.variables.find(v => v.key === rule.variableKey)
  return `${definition?.name ?? rule.variableKey} ${rule.condition.operator} ${rule.condition.value} ${definition?.unit ?? ''}`
}
const statusLabels: Record<string, string> = {
  active: '生效中',
  inactive: '未触发',
  unresolved: '未解析',
  disabled: '已禁用',
  stopped: '无实时数据',
}
function statusText(status?: string): string {
  return statusLabels[status ?? 'inactive'] ?? status ?? ''
}
function statusClass(status?: string): string {
  return status === 'active'
    ? 'st-pill--ok'
    : status === 'unresolved' || status === 'stopped'
      ? 'st-pill--warn'
      : 'st-pill--muted'
}
watch(
  () => editor.selectedObject,
  () => {
    open.value = false
  },
)
</script>

<template>
  <InspectorSection title="可视化规则" :meta="selectedRules.length || ''" data-testid="visual-rule-section">
    <template #actions>
      <button
        data-testid="add-visual-rule"
        :disabled="!binding?.variables.length || !editor.runtimeReady"
        class="st-link st-link--accent"
        type="button"
        @click="edit()"
      >
        + 添加
      </button>
    </template>
    <p v-if="!binding" class="st-hint">请先绑定设备并配置变量</p>
    <p v-else-if="!selectedRules.length" class="st-hint">当变量满足条件时，自动为对象叠加特效模板</p>
    <div
      v-for="rule in selectedRules"
      :key="rule.id"
      :data-rule-id="rule.id"
      :data-status="rules.diagnostics[rule.id]?.status"
      class="st-item space-y-1.5"
      :class="{ 'opacity-55': !rule.enabled }"
    >
      <div class="flex items-start justify-between gap-2">
        <p class="min-w-0 text-[12px] text-fg">
          <span class="font-mono text-[11.5px]">{{ label(rule) }}</span>
        </p>
        <span class="st-pill shrink-0" :class="statusClass(rules.diagnostics[rule.id]?.status)">{{
          statusText(rules.diagnostics[rule.id]?.status)
        }}</span>
      </div>
      <p class="truncate text-[11px] text-fg-2">
        → {{ rule.template?.name ?? '缺少模板快照' }} <span class="text-fg-3">· 优先级 {{ rule.priority }}</span>
      </p>
      <p data-testid="rule-status" class="text-[10.5px] text-fg-3">
        {{ rules.diagnostics[rule.id]?.status ?? 'inactive' }} · 生效
        {{ rules.diagnostics[rule.id]?.visibleEffects ?? 0 }}/{{ rules.diagnostics[rule.id]?.effects ?? 0 }}
        {{ rules.diagnostics[rule.id]?.reason }}
      </p>
      <div class="flex gap-3 pt-0.5">
        <button
          data-testid="toggle-visual-rule"
          class="st-link"
          type="button"
          @click="rules.save({ ...rule, enabled: !rule.enabled })"
        >
          {{ rule.enabled ? '禁用' : '启用' }}
        </button>
        <button data-testid="edit-visual-rule" :disabled="!binding" class="st-link" type="button" @click="edit(rule)">
          编辑
        </button>
        <button
          data-testid="delete-visual-rule"
          class="st-link st-link--danger"
          type="button"
          @click="rules.remove(rule.id)"
        >
          删除
        </button>
      </div>
    </div>
    <el-dialog
      v-model="open"
      title="可视化规则"
      width="520px"
      append-to-body
      destroy-on-close
      :close-on-click-modal="false"
    >
      <div class="space-y-3" @keydown.stop>
        <label class="st-form-row"
          ><span>变量</span
          ><select
            v-model="form.variableKey"
            data-testid="rule-variable"
            class="st-select w-full"
            @change="variableChanged"
          >
            <option v-for="v in binding?.variables" :key="v.key" :value="v.key">{{ v.name }} ({{ v.key }})</option>
          </select></label
        >
        <div class="st-form-row">
          <span>条件</span>
          <div class="flex gap-2">
            <select v-model="form.operator" data-testid="rule-operator" aria-label="条件" class="st-select w-20">
              <option v-for="op in operators" :key="op" :value="op">{{ op }}</option>
            </select>
            <select
              v-if="variable?.dataType === 'boolean'"
              v-model="form.operand"
              data-testid="rule-operand"
              class="st-select flex-1"
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
            <input
              v-else
              v-model="form.operand"
              data-testid="rule-operand"
              aria-label="阈值"
              :type="variable?.dataType === 'number' ? 'number' : 'text'"
              class="st-input flex-1"
            />
            <span v-if="variable?.unit" class="self-center text-fg-3">{{ variable.unit }}</span>
          </div>
        </div>
        <label class="st-form-row"
          ><span>特效模板</span
          ><select v-model="form.templateId" data-testid="rule-template" class="st-select w-full">
            <option value="" disabled>选择模板</option>
            <option v-if="savedSnapshot" value="@snapshot">保留已保存快照：{{ savedSnapshot.name }}</option>
            <option v-for="t in templates.templates" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select></label
        >
        <label class="st-form-row"
          ><span>优先级</span
          ><input
            v-model.number="form.priority"
            data-testid="rule-priority"
            type="number"
            min="0"
            max="100"
            step="1"
            class="st-input w-24"
        /></label>
        <p class="st-hint rounded-[5px] bg-field px-3 py-2">
          规则保存独立的模板快照，模板库修改不会影响已有规则。同一目标、同类特效由优先级高的规则覆盖；条件解除后自动恢复。
        </p>
      </div>
      <template #footer
        ><el-button @click="open = false">取消</el-button
        ><el-button data-testid="save-visual-rule" type="primary" @click="save">保存规则</el-button></template
      >
    </el-dialog>
  </InspectorSection>
</template>
