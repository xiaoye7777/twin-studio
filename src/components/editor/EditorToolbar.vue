<script setup lang="ts">
import { Aim, ArrowLeft, Promotion, Rank, RefreshRight, Upload } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { onBeforeUnmount, onMounted } from 'vue'
import { useEditorStore, type TransformMode } from '@/stores/editor'

defineProps<{
  projectName: string
}>()

defineEmits<{
  back: []
}>()

const editorStore = useEditorStore()

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

function handleKeydown(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey || event.altKey) return

  const target = event.target
  if (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') || target.isContentEditable)
  ) {
    return
  }

  const modeByKey: Partial<Record<string, TransformMode>> = {
    w: 'translate',
    e: 'rotate',
    r: 'scale',
  }
  const mode = modeByKey[event.key.toLowerCase()]
  if (mode) editorStore.setTransformMode(mode)
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
    </div>

    <div class="flex w-[320px] items-center justify-end gap-2">
      <el-button size="small" dark @click="showDemoMessage('保存')">保存</el-button>
      <el-button size="small" dark @click="showDemoMessage('预览')">
        <el-icon class="mr-1"><Promotion /></el-icon>预览
      </el-button>
      <el-button size="small" type="primary" @click="showDemoMessage('发布')">
        <el-icon class="mr-1"><Upload /></el-icon>发布
      </el-button>
    </div>
  </header>
</template>
