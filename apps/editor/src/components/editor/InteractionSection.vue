<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  createInteraction, interactionActionTypes, interactionTriggers, isSceneInteraction,
  type InteractionAction, type InteractionActionType, type InteractionTrigger, type SceneInteraction,
} from '@/domain/interactions'
import { twinBindingTargetKey } from '@/domain/twin'
import { bindingTargetFromObject } from '@/editor/services/BindingTargetResolver'
import { useEditorStore } from '@/stores/editor'
import { useInteractionsStore } from '@/stores/interactions'

const editor = useEditorStore(), store = useInteractionsStore()
const target = computed(() => editor.selectedObject ? bindingTargetFromObject(editor.selectedObject) : null)
const selected = computed(() => target.value ? store.interactions.filter(item => twinBindingTargetKey(item.source) === twinBindingTargetKey(target.value!)) : [])
const open = ref(false), editingId = ref('')
const form = reactive({ trigger: 'click' as InteractionTrigger, action: 'select' as InteractionActionType, eventName: 'open-device-detail', metadata: '{}', enabled: true })
const triggerLabels: Record<InteractionTrigger, string> = { click: '单击', 'double-click': '双击', 'hover-enter': 'Hover 进入', 'hover-leave': 'Hover 离开' }
const actionLabels: Record<InteractionActionType, string> = { select: '选择对象', 'clear-selection': '清空选择', focus: '聚焦对象', 'emit-event': '发送业务事件', show: '显示对象', hide: '隐藏对象', highlight: '临时高亮' }
function edit(item?: SceneInteraction): void {
  if (!target.value) return
  const value = item ?? createInteraction(target.value)
  editingId.value = item?.id ?? ''
  form.trigger = value.trigger; form.action = value.action.type; form.enabled = value.enabled
  form.eventName = value.action.type === 'emit-event' ? value.action.eventName : 'open-device-detail'
  form.metadata = value.action.type === 'emit-event' ? JSON.stringify(value.action.metadata ?? {}, null, 2) : '{}'
  open.value = true
}
function actionChanged(): void { if (form.action === 'highlight') form.trigger = 'hover-enter' }
function triggerChanged(): void { if (form.action === 'highlight' && form.trigger !== 'hover-enter') form.action = 'select' }
function save(): void {
  if (!target.value) return
  let action: InteractionAction
  if (form.action === 'emit-event') {
    let metadata: unknown
    try { metadata = JSON.parse(form.metadata || '{}') } catch { ElMessage.warning('Metadata 必须是有效 JSON'); return }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) { ElMessage.warning('Metadata 必须是 JSON 对象'); return }
    action = { type: 'emit-event', eventName: form.eventName.trim(), metadata: metadata as Record<string, never> }
  } else action = { type: form.action } as InteractionAction
  const value: SceneInteraction = { id: editingId.value || `interaction_${crypto.randomUUID()}`, enabled: form.enabled, source: { ...target.value }, trigger: form.trigger, action }
  if (!isSceneInteraction(value)) { ElMessage.warning('交互配置无效；高亮仅支持 Hover 进入，事件名需为字母数字及 ._:-'); return }
  store.save(value); open.value = false
}
watch(() => editor.selectedObject, () => { open.value = false })
</script>

<template>
  <section data-testid="interaction-section" class="space-y-3 border-t border-slate-700 pt-3">
    <div class="flex justify-between text-xs"><h3 class="font-semibold text-slate-200">交互</h3><button data-testid="add-interaction" :disabled="!target || !editor.runtimeReady" class="text-blue-400 disabled:opacity-40" @click="edit()">添加交互</button></div>
    <p v-if="!target" class="text-xs text-slate-500">当前对象没有稳定业务 Target</p>
    <p v-else-if="!selected.length" class="text-xs text-slate-500">Trigger → Action，运行态触发不修改场景</p>
    <div v-for="item in selected" :key="item.id" :data-interaction-id="item.id" class="space-y-2 rounded bg-slate-900/40 p-2 text-xs">
      <p>{{ triggerLabels[item.trigger] }} → {{ actionLabels[item.action.type] }}</p>
      <p v-if="item.action.type === 'emit-event'" class="truncate font-mono text-[10px] text-sky-400">{{ item.action.eventName }}</p>
      <div class="flex gap-3"><button data-testid="toggle-interaction" @click="store.save({ ...item, enabled: !item.enabled })">{{ item.enabled ? '禁用' : '启用' }}</button><button data-testid="edit-interaction" @click="edit(item)">编辑</button><button data-testid="delete-interaction" class="text-red-400" @click="store.remove(item.id)">删除</button></div>
    </div>
    <p v-if="store.diagnostics.unresolved.length" data-testid="interaction-unresolved" class="text-[10px] text-amber-400">未解析 {{ store.diagnostics.unresolved.length }} 项</p>
    <el-dialog v-model="open" title="场景交互" width="520px" append-to-body destroy-on-close :close-on-click-modal="false">
      <div class="space-y-4" @keydown.stop>
        <label class="block">Trigger <select v-model="form.trigger" data-testid="interaction-trigger" class="ml-2 rounded bg-slate-100 p-2" @change="triggerChanged"><option v-for="value in interactionTriggers" :key="value" :value="value">{{ triggerLabels[value] }}</option></select></label>
        <label class="block">Action <select v-model="form.action" data-testid="interaction-action" class="ml-2 rounded bg-slate-100 p-2" @change="actionChanged"><option v-for="value in interactionActionTypes" :key="value" :value="value">{{ actionLabels[value] }}</option></select></label>
        <template v-if="form.action === 'emit-event'">
          <label class="block">Event Name <input v-model="form.eventName" data-testid="interaction-event-name" class="ml-2 rounded bg-slate-100 p-2" /></label>
          <label class="block">Metadata<textarea v-model="form.metadata" data-testid="interaction-metadata" rows="4" class="mt-2 block w-full rounded bg-slate-100 p-2 font-mono text-xs" /></label>
        </template>
        <p class="text-xs text-slate-500">Action 默认作用于当前对象。show/hide 与 highlight 仅影响运行态。</p>
      </div>
      <template #footer><el-button @click="open = false">取消</el-button><el-button data-testid="save-interaction" type="primary" @click="save">保存交互</el-button></template>
    </el-dialog>
  </section>
</template>
