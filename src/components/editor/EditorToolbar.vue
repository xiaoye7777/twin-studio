<script setup lang="ts">
import { Aim, ArrowLeft, CopyDocument, Delete, Promotion, Rank, RefreshLeft, RefreshRight, Upload, View } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useEditorStore, type TransformMode } from '@/stores/editor'

defineProps<{
  projectName: string
}>()

defineEmits<{
  back: []
}>()

const editorStore = useEditorStore()
const fileInputRef = ref<HTMLInputElement>()

const transformTools: Array<{
  mode: TransformMode
  name: string
  shortcut: string
  icon: typeof Rank
}> = [
  { mode: 'translate', name: '移动', shortcut: 'W', icon: Rank },
  { mode: 'rotate', name: '旋转', shortcut: 'E', icon: RefreshRight },
  { mode: 'scale', name: '缩放', shortcut: 'R', icon: Aim },
]

function showDemoMessage(action: string) {
  ElMessage.info(`${action}功能将在后续版本中接入`)
}

function openModelPicker(): void {
  fileInputRef.value?.click()
}

function handleModelFile(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (!file.name.toLowerCase().endsWith('.glb')) {
    ElMessage.error('当前仅支持可独立加载的 .glb 文件')
    return
  }
  editorStore.requestModelImport(file)
}

function handleKeydown(event: KeyboardEvent): void {
  const target = event.target
  if (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') || target.isContentEditable)
  ) {
    return
  }

  const modifier = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  if (modifier && key === 'z') { event.preventDefault(); event.shiftKey ? editorStore.redo() : editorStore.undo(); return }
  if (modifier && key === 'y') { event.preventDefault(); editorStore.redo(); return }
  if (modifier && key === 'd') { event.preventDefault(); editorStore.duplicateSelected(); return }
  if (event.altKey || modifier) return
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); editorStore.deleteSelected(); return }
  if (key === 'f') { event.preventDefault(); editorStore.focusSelected(); return }

  const modeByKey: Partial<Record<string, TransformMode>> = {
    w: 'translate',
    e: 'rotate',
    r: 'scale',
  }
  const mode = modeByKey[event.key.toLowerCase()]
  if (mode) editorStore.setTransformMode(mode)
}

function handleSnapChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  editorStore.setSnap(value === '' ? null : Number(value))
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <header class="flex h-12 shrink-0 items-center border-b border-slate-700 bg-slate-900 px-3 text-slate-200">
    <div class="flex w-[320px] items-center gap-2">
      <el-tooltip content="返回项目管理" placement="bottom">
        <button data-testid="editor-back" aria-label="返回项目管理" class="flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-slate-700" type="button" @click="$emit('back')">
          <el-icon><ArrowLeft /></el-icon>
        </button>
      </el-tooltip>
      <span class="h-5 w-px bg-slate-700" />
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-white">{{ projectName }}</p>
        <p class="text-[10px] text-slate-500">场景编辑器</p>
      </div>
    </div>

    <div class="flex flex-1 items-center justify-center gap-1">
      <button data-testid="history-undo" aria-label="撤销" :disabled="!editorStore.canUndo" class="toolbar-icon" type="button" @click="editorStore.undo()"><el-icon><RefreshLeft /></el-icon></button>
      <button data-testid="history-redo" aria-label="重做" :disabled="!editorStore.canRedo" class="toolbar-icon" type="button" @click="editorStore.redo()"><el-icon><RefreshRight /></el-icon></button>
      <el-tooltip v-for="tool in transformTools" :key="tool.mode" :content="`${tool.name} (${tool.shortcut})`" placement="bottom">
        <button
          :data-testid="`transform-mode-${tool.mode}`"
          :aria-label="tool.name"
          :aria-pressed="editorStore.transformMode === tool.mode"
          class="flex h-8 w-8 items-center justify-center rounded-md transition"
          :class="editorStore.transformMode === tool.mode
            ? 'bg-blue-500/20 text-blue-300 ring-1 ring-inset ring-blue-400/40'
            : 'text-slate-400 hover:bg-slate-700 hover:text-white'"
          type="button"
          @click="editorStore.setTransformMode(tool.mode)"
        >
          <el-icon><component :is="tool.icon" /></el-icon>
        </button>
      </el-tooltip>
      <span class="mx-1 h-5 w-px bg-slate-700" />
      <button data-testid="duplicate-selected" aria-label="复制" :disabled="!editorStore.selectedObject" class="toolbar-icon" type="button" @click="editorStore.duplicateSelected()"><el-icon><CopyDocument /></el-icon></button>
      <button data-testid="delete-selected" aria-label="删除" :disabled="!editorStore.selectedObject" class="toolbar-icon" type="button" @click="editorStore.deleteSelected()"><el-icon><Delete /></el-icon></button>
      <button data-testid="focus-selected" aria-label="聚焦选中" :disabled="!editorStore.selectedObject" class="toolbar-icon" type="button" @click="editorStore.focusSelected()"><el-icon><View /></el-icon></button>
      <button data-testid="fit-scene" aria-label="适应全部" class="toolbar-icon" type="button" @click="editorStore.fitScene()"><el-icon><Aim /></el-icon></button>
      <select data-testid="transform-snap" aria-label="变换吸附" class="ml-1 h-8 rounded border border-slate-700 bg-slate-800 px-2 text-[11px] text-slate-300" @change="handleSnapChange">
        <option value="">Snap Off</option><option value="0.1">0.1</option><option value="0.5">0.5</option><option value="1">1</option><option value="15">15°</option><option value="45">45°</option>
      </select>
    </div>

    <div class="flex w-[320px] items-center justify-end gap-2">
      <input ref="fileInputRef" data-testid="model-file-input" class="hidden" type="file" accept=".glb,model/gltf-binary" @change="handleModelFile" />
      <el-button data-testid="import-model" size="small" dark @click="openModelPicker">
        <el-icon class="mr-1"><Upload /></el-icon>导入模型
      </el-button>
      <el-button data-testid="save-scene" size="small" dark @click="editorStore.requestSceneSave()">保存{{ editorStore.isDirty ? ' *' : '' }}</el-button>
      <el-button size="small" dark @click="showDemoMessage('预览')">
        <el-icon class="mr-1"><Promotion /></el-icon>预览
      </el-button>
      <el-button size="small" type="primary" @click="showDemoMessage('发布')">
        <el-icon class="mr-1"><Upload /></el-icon>发布
      </el-button>
    </div>
  </header>
</template>

<style scoped>
.toolbar-icon { display:flex; height:2rem; width:2rem; align-items:center; justify-content:center; border-radius:.375rem; color:#94a3b8; }
.toolbar-icon:hover:not(:disabled) { background:#334155; color:white; }
.toolbar-icon:disabled { cursor:not-allowed; opacity:.3; }
</style>
