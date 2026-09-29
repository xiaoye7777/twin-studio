<script setup lang="ts">
import InspectorSection from './InspectorSection.vue'
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  bindingTargetFromObject,
  createInteraction,
  type InteractionAction,
  type InteractionActionType,
  interactionActionTypes,
  type InteractionTrigger,
  interactionTriggers,
  isSceneInteraction,
  type SceneInteraction,
  twinBindingTargetKey,
} from '@twin-studio/core'
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
  <InspectorSection title="交互" :meta="selected.length || ''" data-testid="interaction-section">
    <template #actions>
      <button data-testid="add-interaction" :disabled="!target || !editor.runtimeReady" class="st-link st-link--accent" type="button" @click="edit()">+ 添加</button>
    </template>
    <p v-if="!target" class="st-hint">当前对象没有稳定的业务标识，无法配置交互</p>
    <p v-else-if="!selected.length" class="st-hint">触发条件 → 动作，只影响运行态，不修改场景</p>
    <div v-for="item in selected" :key="item.id" :data-interaction-id="item.id" class="st-item space-y-1.5" :class="{ 'opacity-55': !item.enabled }">
      <p class="text-[12px] text-fg">{{ triggerLabels[item.trigger] }} <span class="text-fg-3">→</span> {{ actionLabels[item.action.type] }}</p>
      <p v-if="item.action.type === 'emit-event'" class="st-mono truncate text-accent-fg">{{ item.action.eventName }}</p>
      <div class="flex gap-3 pt-0.5">
        <button data-testid="toggle-interaction" class="st-link" type="button" @click="store.save({ ...item, enabled: !item.enabled })">{{ item.enabled ? '禁用' : '启用' }}</button>
        <button data-testid="edit-interaction" class="st-link" type="button" @click="edit(item)">编辑</button>
        <button data-testid="delete-interaction" class="st-link st-link--danger" type="button" @click="store.remove(item.id)">删除</button>
      </div>
    </div>
    <p v-if="store.diagnostics.unresolved.length" data-testid="interaction-unresolved" class="text-[11px] text-warn">未解析 {{ store.diagnostics.unresolved.length }} 项</p>
    <el-dialog v-model="open" title="场景交互" width="520px" append-to-body destroy-on-close :close-on-click-modal="false">
      <div class="space-y-3" @keydown.stop>
        <label class="st-form-row"><span>触发条件</span><select v-model="form.trigger" data-testid="interaction-trigger" class="st-select w-full" @change="triggerChanged"><option v-for="value in interactionTriggers" :key="value" :value="value">{{ triggerLabels[value] }}</option></select></label>
        <label class="st-form-row"><span>动作</span><select v-model="form.action" data-testid="interaction-action" class="st-select w-full" @change="actionChanged"><option v-for="value in interactionActionTypes" :key="value" :value="value">{{ actionLabels[value] }}</option></select></label>
        <template v-if="form.action === 'emit-event'">
          <label class="st-form-row"><span>事件名称</span><input v-model="form.eventName" data-testid="interaction-event-name" class="st-input st-input--mono w-full" /></label>
          <label class="st-form-row items-start!"><span class="pt-1.5">附加数据</span><textarea v-model="form.metadata" data-testid="interaction-metadata" rows="4" class="st-input st-input--mono w-full" /></label>
        </template>
        <p class="st-hint rounded-[5px] bg-field px-3 py-2">动作默认作用于当前对象。显示 / 隐藏与高亮仅影响运行态；业务事件会通过 Viewer 的 interaction-event 通知大屏。</p>
      </div>
      <template #footer><el-button @click="open = false">取消</el-button><el-button data-testid="save-interaction" type="primary" @click="save">保存交互</el-button></template>
    </el-dialog>
  </InspectorSection>
</template>
