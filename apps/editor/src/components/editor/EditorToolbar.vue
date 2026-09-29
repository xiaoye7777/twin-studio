<script setup lang="ts">
import { Aim, ArrowLeft, CirclePlus, Compass, CopyDocument, Delete, FullScreen, Rank, RefreshLeft, RefreshRight, Setting, View } from '@element-plus/icons-vue'
import { onBeforeUnmount, onMounted } from 'vue'
import { useEditorStore, type CommonView, type PrimitiveType, type TransformMode } from '@/stores/editor'
import { useSceneSettingsStore } from '@/stores/sceneSettings'

defineProps<{
  projectName: string
}>()

defineEmits<{
  back: []
}>()

const editorStore = useEditorStore()
const sceneSettingsStore = useSceneSettingsStore()

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

function addPrimitive(command: string | number | object): void {
  if (command === 'box' || command === 'plane' || command === 'cylinder') {
    editorStore.addPrimitive(command satisfies PrimitiveType)
  }
}

function setCommonView(command: string | number | object): void {
  if (command === 'top' || command === 'front' || command === 'right' || command === 'perspective') {
    editorStore.setCommonView(command satisfies CommonView)
  }
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
  <header class="flex h-10 shrink-0 items-center border-b border-line bg-app px-2 text-fg">
    <div class="flex w-[300px] min-w-0 items-center gap-1.5">
      <el-tooltip content="返回项目管理" placement="bottom" :show-after="400">
        <button data-testid="editor-back" aria-label="返回项目管理" class="tool-btn" type="button" @click="$emit('back')">
          <el-icon><ArrowLeft /></el-icon>
        </button>
      </el-tooltip>
      <span class="tool-divider" />
      <p class="min-w-0 truncate text-[13px] font-semibold text-fg">{{ projectName }}</p>
      <span class="shrink-0 text-fg-3">/</span>
      <span class="shrink-0 text-fg-3">场景编辑器</span>
    </div>

    <div class="flex flex-1 items-center justify-center gap-1">
      <el-tooltip content="撤销 · Ctrl Z" placement="bottom" :show-after="400">
        <button data-testid="history-undo" aria-label="撤销" :disabled="!editorStore.canUndo" class="tool-btn" type="button" @click="editorStore.undo()"><el-icon><RefreshLeft /></el-icon></button>
      </el-tooltip>
      <el-tooltip content="重做 · Ctrl Shift Z" placement="bottom" :show-after="400">
        <button data-testid="history-redo" aria-label="重做" :disabled="!editorStore.canRedo" class="tool-btn" type="button" @click="editorStore.redo()"><el-icon><RefreshRight /></el-icon></button>
      </el-tooltip>

      <span class="tool-divider" />

      <div class="segmented" role="group" aria-label="变换工具">
        <el-tooltip v-for="tool in transformTools" :key="tool.mode" :content="`${tool.name} · ${tool.shortcut}`" placement="bottom" :show-after="400">
          <button
            :data-testid="`transform-mode-${tool.mode}`"
            :aria-label="tool.name"
            :aria-pressed="editorStore.transformMode === tool.mode"
            class="segmented__item"
            :class="{ 'is-active': editorStore.transformMode === tool.mode }"
            type="button"
            @click="editorStore.setTransformMode(tool.mode)"
          >
            <el-icon><component :is="tool.icon" /></el-icon>
          </button>
        </el-tooltip>
      </div>

      <span class="tool-divider" />

      <el-dropdown trigger="click" @command="addPrimitive">
        <button data-testid="add-primitive" aria-label="添加" :disabled="!editorStore.runtimeReady" class="tool-btn tool-btn--text" type="button">
          <el-icon><CirclePlus /></el-icon><span>添加</span>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="box">立方体 Box</el-dropdown-item>
            <el-dropdown-item command="plane">平面 Plane</el-dropdown-item>
            <el-dropdown-item command="cylinder">圆柱 Cylinder</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-tooltip content="复制 · Ctrl D" placement="bottom" :show-after="400">
        <button data-testid="duplicate-selected" aria-label="复制" :disabled="!editorStore.selectedObject" class="tool-btn" type="button" @click="editorStore.duplicateSelected()"><el-icon><CopyDocument /></el-icon></button>
      </el-tooltip>
      <el-tooltip content="删除 · Delete" placement="bottom" :show-after="400">
        <button data-testid="delete-selected" aria-label="删除" :disabled="!editorStore.selectedObject" class="tool-btn" type="button" @click="editorStore.deleteSelected()"><el-icon><Delete /></el-icon></button>
      </el-tooltip>

      <span class="tool-divider" />

      <el-tooltip content="聚焦选中 · F" placement="bottom" :show-after="400">
        <button data-testid="focus-selected" aria-label="聚焦选中" :disabled="!editorStore.selectedObject" class="tool-btn" type="button" @click="editorStore.focusSelected()"><el-icon><View /></el-icon></button>
      </el-tooltip>
      <el-tooltip content="显示全部" placement="bottom" :show-after="400">
        <button data-testid="fit-scene" aria-label="适应全部" class="tool-btn" type="button" @click="editorStore.fitScene()"><el-icon><FullScreen /></el-icon></button>
      </el-tooltip>
      <el-dropdown trigger="click" @command="setCommonView">
        <button data-testid="common-view" aria-label="常用视角" :disabled="!editorStore.runtimeReady" class="tool-btn tool-btn--text" type="button">
          <el-icon><Compass /></el-icon><span>视角</span>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="top">顶视图</el-dropdown-item>
            <el-dropdown-item command="front">前视图</el-dropdown-item>
            <el-dropdown-item command="right">右视图</el-dropdown-item>
            <el-dropdown-item command="perspective">透视图</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <span class="tool-divider" />

      <label class="flex items-center gap-1.5 text-fg-3">
        <span class="text-[11px]">吸附</span>
        <select data-testid="transform-snap" aria-label="变换吸附" class="st-select h-6! text-[11px]!" @change="handleSnapChange">
          <option value="">关闭</option><option value="0.1">0.1</option><option value="0.5">0.5</option><option value="1">1</option><option value="15">15°</option><option value="45">45°</option>
        </select>
      </label>
    </div>

    <div class="flex w-[300px] items-center justify-end gap-1.5">
      <el-tooltip content="场景设置" placement="bottom" :show-after="400">
        <button data-testid="toggle-scene-settings" aria-label="场景设置" :aria-pressed="sceneSettingsStore.panelOpen" class="tool-btn" :class="{ 'is-active': sceneSettingsStore.panelOpen }" type="button" @click="sceneSettingsStore.togglePanel()"><el-icon><Setting /></el-icon></button>
      </el-tooltip>
      <button
        data-testid="save-scene"
        class="st-btn ml-1 min-w-[64px]"
        :class="{ 'st-btn--primary': editorStore.isDirty }"
        type="button"
        @click="editorStore.requestSceneSave()"
      >保存{{ editorStore.isDirty ? ' *' : '' }}</button>
    </div>
  </header>
</template>

<style scoped>
.tool-btn {
  display: inline-flex;
  height: 28px;
  min-width: 28px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-radius: 4px;
  font-size: 14px;
  color: var(--color-fg-2);
  transition: background-color 120ms ease, color 120ms ease;
}

.tool-btn--text {
  padding: 0 8px;
}

.tool-btn--text span {
  font-size: 12px;
}

.tool-btn:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-fg);
}

.tool-btn.is-active {
  background: var(--color-active);
  color: var(--color-accent-fg);
}

.tool-btn:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}

.tool-divider {
  width: 1px;
  height: 16px;
  margin: 0 6px;
  background: var(--color-line-strong);
}

.segmented {
  display: inline-flex;
  gap: 2px;
  border: 1px solid var(--color-line);
  border-radius: 5px;
  background: var(--color-field);
  padding: 2px;
}

.segmented__item {
  display: grid;
  height: 22px;
  width: 26px;
  place-items: center;
  border-radius: 3px;
  font-size: 13px;
  color: var(--color-fg-3);
  transition: background-color 120ms ease, color 120ms ease;
}

.segmented__item:hover {
  color: var(--color-fg);
}

.segmented__item.is-active {
  background: var(--color-active);
  color: var(--color-accent-fg);
  box-shadow: inset 0 0 0 1px rgb(224 138 69 / 0.35);
}
</style>
