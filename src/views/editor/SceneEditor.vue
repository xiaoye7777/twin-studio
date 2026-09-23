<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EditorResourcePanel from '@/components/editor/EditorResourcePanel.vue'
import EditorToolbar from '@/components/editor/EditorToolbar.vue'
import InspectorPanel from '@/components/editor/InspectorPanel.vue'
import SceneSettingsPanel from '@/components/editor/SceneSettingsPanel.vue'
import SceneHierarchy from '@/components/editor/SceneHierarchy.vue'
import ThreeViewport from '@/components/editor/ThreeViewport.vue'
import { useProjectStore } from '@/stores/project'
import { useSceneSettingsStore } from '@/stores/sceneSettings'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const sceneSettingsStore = useSceneSettingsStore()

const projectId = computed(() => String(route.params.projectId))
const projectName = computed(() => projectStore.getProjectById(projectId.value)?.name ?? '未命名项目')

type ResizablePanel = 'left' | 'right' | 'bottom'

const editorAreaRef = ref<HTMLElement | null>(null)
const leftPanelWidth = ref(240)
const rightPanelWidth = ref(280)
const bottomPanelHeight = ref(160)
let activePanel: ResizablePanel | null = null
let previousCursor = ''
let previousUserSelect = ''

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function handleResize(event: PointerEvent): void {
  const bounds = editorAreaRef.value?.getBoundingClientRect()
  if (!bounds || !activePanel) return

  if (activePanel === 'left') {
    leftPanelWidth.value = clamp(event.clientX - bounds.left, 180, Math.min(480, bounds.width - rightPanelWidth.value - 420))
  } else if (activePanel === 'right') {
    rightPanelWidth.value = clamp(bounds.right - event.clientX, 240, Math.min(520, bounds.width - leftPanelWidth.value - 420))
  } else {
    bottomPanelHeight.value = clamp(bounds.bottom - event.clientY, 112, Math.min(420, bounds.height - 240))
  }
}

function stopResize(): void {
  if (!activePanel) return
  activePanel = null
  window.removeEventListener('pointermove', handleResize)
  window.removeEventListener('pointerup', stopResize)
  window.removeEventListener('pointercancel', stopResize)
  document.body.style.cursor = previousCursor
  document.body.style.userSelect = previousUserSelect
}

function startResize(panel: ResizablePanel, event: PointerEvent): void {
  event.preventDefault()
  stopResize()
  activePanel = panel
  previousCursor = document.body.style.cursor
  previousUserSelect = document.body.style.userSelect
  document.body.style.cursor = panel === 'bottom' ? 'row-resize' : 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', handleResize)
  window.addEventListener('pointerup', stopResize)
  window.addEventListener('pointercancel', stopResize)
}

onBeforeUnmount(stopResize)
</script>

<template>
  <div class="flex h-screen min-w-[1200px] flex-col overflow-hidden bg-slate-900">
    <EditorToolbar :project-name="projectName" @back="router.push('/projects')" />
    <div ref="editorAreaRef" class="flex min-h-0 flex-1 flex-col">
      <div class="flex min-h-0 flex-1">
        <div class="h-full shrink-0 overflow-hidden" :style="{ width: `${leftPanelWidth}px` }">
          <SceneHierarchy />
        </div>
        <div
          data-testid="resize-left-panel"
          aria-label="调整场景列表宽度"
          class="panel-resizer panel-resizer--vertical"
          role="separator"
          @pointerdown="startResize('left', $event)"
        />
        <ThreeViewport
          :key="projectId"
          :project-id="projectId"
          :project-name="projectName"
        />
        <div
          data-testid="resize-right-panel"
          aria-label="调整属性面板宽度"
          class="panel-resizer panel-resizer--vertical"
          role="separator"
          @pointerdown="startResize('right', $event)"
        />
        <div class="h-full shrink-0 overflow-hidden" :style="{ width: `${rightPanelWidth}px` }">
          <SceneSettingsPanel v-if="sceneSettingsStore.panelOpen" />
          <InspectorPanel v-else />
        </div>
      </div>
      <div
        data-testid="resize-resource-panel"
        aria-label="调整资源面板高度"
        class="panel-resizer panel-resizer--horizontal"
        role="separator"
        @pointerdown="startResize('bottom', $event)"
      />
      <div class="shrink-0 overflow-hidden" :style="{ height: `${bottomPanelHeight}px` }">
        <EditorResourcePanel />
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-resizer {
  position: relative;
  z-index: 30;
  flex: none;
  background: rgb(51 65 85 / 0.72);
  transition: background-color 150ms ease;
  touch-action: none;
}

.panel-resizer::after {
  content: '';
  position: absolute;
  inset: -3px;
}

.panel-resizer:hover {
  background: rgb(56 189 248 / 0.8);
}

.panel-resizer--vertical {
  width: 3px;
  cursor: col-resize;
}

.panel-resizer--horizontal {
  height: 3px;
  cursor: row-resize;
}
</style>
