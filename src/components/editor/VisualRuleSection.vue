<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { cloneTemplate, type EffectTemplate } from '@/domain/effectTemplates'
import { isVisualRule, ruleOperators, type RuleCondition, type RuleOperator, type VisualRule } from '@/domain/visualRules'
import { twinBindingTargetKey } from '@/domain/twin'
import { bindingTargetFromObject } from '@/editor/services/BindingTargetResolver'
import { useEditorStore } from '@/stores/editor'
import { useTwinStore } from '@/stores/twin'
import { useVisualRulesStore } from '@/stores/visualRules'
import { useEffectTemplatesStore } from '@/stores/effectTemplates'

const editor = useEditorStore(), twin = useTwinStore(), rules = useVisualRulesStore(), templates = useEffectTemplatesStore()
const target = computed(() => editor.selectedObject ? bindingTargetFromObject(editor.selectedObject) : null)
const binding = computed(() => target.value ? twin.getBindingByTarget(target.value) : null)
const selectedRules = computed(() => target.value ? rules.rules.filter(r => twinBindingTargetKey(r.target) === twinBindingTargetKey(target.value!)) : [])
const open = ref(false), editingId = ref(''), savedSnapshot = ref<EffectTemplate | null>(null)
const form = reactive({ variableKey: '', operator: '>' as RuleOperator, operand: '60' as string | number, templateId: '', priority: 10, enabled: true })
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
  if (rule) { form.operator = rule.condition.operator; form.operand = String(rule.condition.value) }
  form.enabled = rule?.enabled ?? true; form.priority = rule?.priority ?? 10
  form.templateId = savedSnapshot.value ? '@snapshot' : ''
  open.value = true
  try { await templates.refresh() } catch (e) { ElMessage.warning(e instanceof Error ? e.message : '模板库不可用，可继续使用已保存快照') }
}
function save(): void {
  if (!target.value || !binding.value || !variable.value) { ElMessage.warning('请选择当前绑定中有效的变量'); return }
  const source = form.templateId === '@snapshot' ? savedSnapshot.value : templates.templates.find(t => t.id === form.templateId)
  if (!source) { ElMessage.warning('请选择特效模板'); return }
  const dataType = variable.value.dataType
  let condition: RuleCondition
  if (dataType === 'number') {
    if (!String(form.operand).trim() || !Number.isFinite(Number(form.operand))) { ElMessage.warning('请输入有效数字'); return }
    condition = { dataType, operator: form.operator, value: Number(form.operand) }
  } else {
    if (form.operator !== '==' && form.operator !== '!=') { ElMessage.warning('此变量仅支持 == / !='); return }
    condition = dataType === 'boolean' ? { dataType, operator: form.operator, value: form.operand === 'true' } : { dataType, operator: form.operator, value: String(form.operand) }
  }
  const rule: VisualRule = { id: editingId.value || `visualRule_${crypto.randomUUID()}`, bindingId: binding.value.id, target: { ...target.value }, variableKey: variable.value.key, condition, enabled: form.enabled, priority: Number(form.priority), template: cloneTemplate(source) }
  if (!isVisualRule(rule)) { ElMessage.warning('规则无效，优先级应为 0–100 的整数'); return }
  rules.save(rule); open.value = false
}
function label(rule: VisualRule): string {
  const definition = twin.getBindingById(rule.bindingId)?.variables.find(v => v.key === rule.variableKey)
  return `${definition?.name ?? rule.variableKey} ${rule.condition.operator} ${rule.condition.value} ${definition?.unit ?? ''}`
}
watch(() => editor.selectedObject, () => { open.value = false })
</script>

<template>
  <section data-testid="visual-rule-section" class="space-y-3 border-t border-slate-700 pt-3">
    <div class="flex justify-between text-xs"><h3 class="font-semibold text-slate-200">可视化规则</h3><button data-testid="add-visual-rule" :disabled="!binding?.variables.length || !editor.runtimeReady" class="text-blue-400 disabled:opacity-40" @click="edit()">添加规则</button></div>
    <p v-if="!binding" class="text-xs text-slate-500">请先绑定设备并配置变量</p>
    <p v-else-if="!selectedRules.length" class="text-xs text-slate-500">一个变量条件 → 一个特效模板</p>
    <div v-for="rule in selectedRules" :key="rule.id" :data-rule-id="rule.id" :data-status="rules.diagnostics[rule.id]?.status" class="space-y-2 rounded bg-slate-900/40 p-2 text-xs">
      <p>{{ label(rule) }}</p><p class="text-slate-400">→ {{ rule.template?.name ?? '缺少模板快照' }} · 优先级 {{ rule.priority }}</p>
      <p data-testid="rule-status" class="text-[10px] text-sky-400">{{ rules.diagnostics[rule.id]?.status ?? 'inactive' }} · 生效 {{ rules.diagnostics[rule.id]?.visibleEffects ?? 0 }}/{{ rules.diagnostics[rule.id]?.effects ?? 0 }} {{ rules.diagnostics[rule.id]?.reason }}</p>
      <div class="flex gap-3"><button data-testid="toggle-visual-rule" @click="rules.save({ ...rule, enabled: !rule.enabled })">{{ rule.enabled ? '禁用' : '启用' }}</button><button data-testid="edit-visual-rule" :disabled="!binding" @click="edit(rule)">编辑</button><button data-testid="delete-visual-rule" class="text-red-400" @click="rules.remove(rule.id)">删除</button></div>
    </div>
    <el-dialog v-model="open" title="可视化规则" width="520px" append-to-body destroy-on-close :close-on-click-modal="false">
      <div class="space-y-4" @keydown.stop>
        <label class="block">变量 <select v-model="form.variableKey" data-testid="rule-variable" class="rounded bg-slate-100 p-2" @change="variableChanged"><option v-for="v in binding?.variables" :key="v.key" :value="v.key">{{ v.name }} ({{ v.key }})</option></select></label>
        <div class="flex gap-3"><select v-model="form.operator" data-testid="rule-operator" aria-label="条件" class="rounded bg-slate-100 p-2"><option v-for="op in operators" :key="op" :value="op">{{ op }}</option></select><select v-if="variable?.dataType === 'boolean'" v-model="form.operand" data-testid="rule-operand" class="rounded bg-slate-100 p-2"><option value="true">true</option><option value="false">false</option></select><input v-else v-model="form.operand" data-testid="rule-operand" aria-label="阈值" :type="variable?.dataType === 'number' ? 'number' : 'text'" class="min-w-0 flex-1 rounded bg-slate-100 p-2" /></div>
        <label class="block">模板 <select v-model="form.templateId" data-testid="rule-template" class="max-w-full rounded bg-slate-100 p-2"><option value="" disabled>选择模板</option><option v-if="savedSnapshot" value="@snapshot">保留已保存快照：{{ savedSnapshot.name }}</option><option v-for="t in templates.templates" :key="t.id" :value="t.id">{{ t.name }}</option></select></label>
        <label class="block">优先级 <input v-model.number="form.priority" data-testid="rule-priority" type="number" min="0" max="100" step="1" class="w-24 rounded bg-slate-100 p-2" /></label>
        <p class="text-xs text-slate-500">保存独立模板快照，不自动同步模板库。相同目标与类型：优先级高的规则覆盖低优先级与手工特效；条件解除后恢复。相同优先级按规则 ID 排序。</p>
      </div>
      <template #footer><el-button @click="open = false">取消</el-button><el-button data-testid="save-visual-rule" type="primary" @click="save">保存规则</el-button></template>
    </el-dialog>
  </section>
</template>
