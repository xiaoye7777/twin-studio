<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { effectDefinitions, type EffectKind } from '@/domain/effects'
import { cloneTemplate, createTemplateEffect, isEffectTemplate, type EffectTemplate, type RelativeEffectTarget } from '@/domain/effectTemplates'
import { prepareTemplateApplication } from '@/editor/services/applyEffectTemplate'
import { useEffectTemplatesStore } from '@/stores/effectTemplates'
import { useEffectsStore } from '@/stores/effects'
import { useEditorStore } from '@/stores/editor'
import EffectParameterFields from './EffectParameterFields.vue'

const templates = useEffectTemplatesStore()
const effects = useEffectsStore()
const editor = useEditorStore()
const draft = ref<EffectTemplate | null>(null)
const dialogOpen = ref(false)
const saving = ref(false)
const newKind = ref<EffectKind>('box-glow')
const error = ref('')
async function run(action: () => Promise<void>): Promise<void> {
  try { await action(); error.value = '' } catch (e) { error.value = e instanceof Error ? e.message : '模板操作失败'; ElMessage.error(error.value) }
}
function edit(template?: EffectTemplate): void {
  draft.value = template ? cloneTemplate(template) : { version: 1, id: `template_${crypto.randomUUID()}`, origin: 'local', name: '新建模板', description: '', category: '自定义', effects: [] }
  dialogOpen.value = true
}
function setTarget(index: number, event: Event): void {
  if (!draft.value) return
  const mode = (event.target as HTMLSelectElement).value as RelativeEffectTarget['mode']
  const atom = draft.value.effects[index]
  if (atom) atom.target = mode === 'asset-node' ? { mode, assetNodeId: '' } : { mode }
}
function move(index: number, offset: number): void {
  if (!draft.value) return
  const list = draft.value.effects
  const destination = index + offset
  if (destination < 0 || destination >= list.length) return
  const [atom] = list.splice(index, 1)
  if (atom) list.splice(destination, 0, atom)
}
async function save(): Promise<void> {
  const value = draft.value
  if (!value || value.origin !== 'local') return
  value.name = value.name.trim()
  if (!isEffectTemplate(value)) { ElMessage.warning('请填写模板名称、至少一个特效，并检查参数与 assetNodeId'); return }
  saving.value = true
  try { await templates.save(value); dialogOpen.value = false; ElMessage.success('模板已保存，不影响已应用的场景特效') }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '保存失败') }
  finally { saving.value = false }
}
async function remove(template: EffectTemplate): Promise<void> {
  if (template.origin === 'builtin') return
  try { await ElMessageBox.confirm(`删除模板「${template.name}」？已经应用的场景特效不会改变。`, '删除模板', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' }) }
  catch { return }
  await run(() => templates.remove(template.id))
}
function apply(template: EffectTemplate): void {
  if (!editor.runtimeReady || !editor.selectedObject) return
  try {
    const instances = prepareTemplateApplication(template, editor.selectedObject, editor.sceneRoots)
    effects.applyBatch(instances)
    ElMessage.success(`已应用 ${instances.length} 个特效，可一次撤销`)
  } catch (e) { ElMessage.warning(e instanceof Error ? e.message : '模板应用失败') }
}
onMounted(() => { void run(templates.refresh) })
</script>

<template>
  <div data-testid="template-library" class="h-[124px] overflow-auto px-4 py-2">
    <div class="mb-2 flex items-center gap-3 text-xs">
      <button data-testid="new-template" class="text-blue-400" @click="edit()">+ 新建模板</button>
      <span class="text-slate-500">本地资源 · 跨项目复用 · 应用将替换同目标同类型特效</span>
      <span v-if="error" class="text-red-400">{{ error }}</span>
    </div>
    <div class="flex gap-3">
      <article v-for="template in templates.templates" :key="template.id" :data-template-id="template.id" class="w-64 shrink-0 rounded-lg bg-slate-900/45 px-3 py-2 text-xs">
        <div class="flex justify-between gap-2"><span class="truncate font-medium" :title="template.description">{{ template.name }}</span><span class="shrink-0 text-slate-500">{{ template.origin === 'builtin' ? '内置' : '自定义' }} · {{ template.category }}</span></div>
        <p class="my-1 truncate text-[10px] text-slate-500" :title="template.effects.map(e => effectDefinitions.find(d => d.kind === e.kind)?.name).join(' / ')">{{ template.effects.length }} 个特效 · {{ template.description }}</p>
        <div class="flex gap-3">
          <button data-testid="apply-template" :disabled="!editor.runtimeReady || !editor.selectedObject" class="text-blue-400 disabled:opacity-40" @click="apply(template)">应用</button>
          <button data-testid="edit-template" @click="edit(template)">{{ template.origin === 'builtin' ? '查看' : '编辑' }}</button>
          <button data-testid="copy-template" @click="run(() => templates.duplicate(template))">{{ template.origin === 'builtin' ? '复制为自定义' : '复制' }}</button>
          <button v-if="template.origin === 'local'" data-testid="delete-template" class="text-red-400" @click="remove(template)">删除</button>
        </div>
      </article>
    </div>
    <el-dialog v-model="dialogOpen" :title="draft?.origin === 'builtin' ? '查看内置模板（只读）' : '编辑特效模板'" width="680px" append-to-body destroy-on-close :close-on-click-modal="false">
      <div v-if="draft" data-testid="template-editor" @keydown.stop>
        <fieldset :disabled="draft.origin === 'builtin' || saving" class="space-y-3">
          <label class="block">名称<input v-model="draft.name" data-testid="template-name" maxlength="80" class="ml-3 rounded bg-slate-700 p-2 text-white" /></label>
          <label class="block">分类<input v-model="draft.category" data-testid="template-category" maxlength="40" class="ml-3 rounded bg-slate-700 p-2 text-white" /></label>
          <label class="block">描述<input v-model="draft.description" data-testid="template-description" maxlength="500" class="ml-3 w-4/5 rounded bg-slate-700 p-2 text-white" /></label>
          <p class="text-xs text-slate-500">相对目标不保存具体实例。指定节点需输入稳定 assetNodeId（可在 Inspector 查看），不是节点名称。应用失败不会生成部分特效。</p>
          <div class="max-h-[42vh] space-y-3 overflow-y-auto">
            <section v-for="(atom, index) in draft.effects" :key="atom.id" :data-template-atom="index" class="space-y-2 rounded bg-slate-800 p-3 text-slate-200">
              <div class="flex justify-between text-sm"><span>{{ index + 1 }}. {{ effectDefinitions.find(d => d.kind === atom.kind)?.name }}</span><div class="flex gap-3"><button :disabled="index === 0" @click="move(index, -1)">上移</button><button :disabled="index === draft.effects.length - 1" @click="move(index, 1)">下移</button><button data-testid="remove-template-atom" class="text-red-400" @click="draft.effects.splice(index, 1)">移除</button></div></div>
              <label class="block text-xs">目标 <select data-testid="template-target-mode" :value="atom.target.mode" class="rounded bg-slate-700 p-1" @change="setTarget(index, $event)"><option value="current-target">当前对象</option><option value="root-instance">所属模型根</option><option value="asset-node">指定模型节点</option></select></label>
              <input v-if="atom.target.mode === 'asset-node'" v-model="atom.target.assetNodeId" data-testid="template-asset-node-id" placeholder="assetNodeId" class="w-full rounded bg-slate-700 p-1 text-xs" />
              <EffectParameterFields :kind="atom.kind" :parameters="atom.parameters" :test-prefix="`template-atom-${index}`" @change="parameters => atom.parameters = parameters" />
            </section>
          </div>
          <div class="flex gap-3"><select v-model="newKind" data-testid="template-new-kind" class="rounded bg-slate-700 p-2 text-white"><option v-for="definition in effectDefinitions" :key="definition.kind" :value="definition.kind">{{ definition.name }}</option></select><el-button data-testid="add-template-atom" :disabled="draft.origin === 'builtin' || draft.effects.length >= 50" @click="draft.effects.push(createTemplateEffect(newKind))">添加特效</el-button></div>
        </fieldset>
      </div>
      <template #footer><el-button @click="dialogOpen = false">取消</el-button><el-button v-if="draft?.origin === 'local'" data-testid="save-template" type="primary" :loading="saving" @click="save">保存模板</el-button></template>
    </el-dialog>
  </div>
</template>
