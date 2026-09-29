<script setup lang="ts">
import { ArrowLeft, EditPen, Monitor } from '@element-plus/icons-vue'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TwinSceneViewer from '@/components/twin/TwinSceneViewer.vue'
import type { ViewerSelection, ViewerRuntimeState, TwinSceneViewerPublicApi, ViewerInteractionEvent } from '@/components/twin/viewerContract'
import { useProjectStore } from '@/stores/project'
import DashboardDevicePanel from './DashboardDevicePanel.vue'
import DashboardOverviewPanel from './DashboardOverviewPanel.vue'
import { buildDashboardDevices } from './dashboardRuntime'

const route = useRoute()
const router = useRouter()
const projects = useProjectStore()
const projectId = computed(() => String(route.params.projectId ?? ''))
const projectName = computed(() => projects.getProjectById(projectId.value)?.name ?? '未命名项目')
const status = ref('正在加载场景…')
const viewer = ref<TwinSceneViewerPublicApi | null>(null)
const runtime = shallowRef<ViewerRuntimeState | null>(null)
const selectedDeviceId = ref('')
const lastInteraction = shallowRef<ViewerInteractionEvent | null>(null)

const devices = computed(() => {
  const state = runtime.value
  if (!state) return []
  // Explicitly consume revisions so this presentation projection follows every runtime update.
  void state.bindingRevision
  void state.runtimeRevision
  void state.resolutionRevision
  return buildDashboardDevices(state.bindings, state.runtimeValues, state.resolutionByBindingId)
})
const bindingCount = computed(() => runtime.value?.bindings.length ?? 0)
const resolvedBindingCount = computed(() => {
  const state = runtime.value
  return state?.bindings.filter((binding) => state.resolutionByBindingId[binding.id] === 'resolved').length ?? 0
})

function handleLoaded(info: { objectCount: number; bindingCount: number }): void {
  status.value = `已加载 ${info.objectCount} 个对象 · ${info.bindingCount} 个绑定`
  runtime.value = viewer.value?.getRuntimeState() ?? null
}

function handleSelection(selection: ViewerSelection): void {
  selectedDeviceId.value = selection?.deviceId ?? ''
}

async function selectDevice(deviceId: string): Promise<void> {
  viewer.value?.selectDevice(deviceId)
  await viewer.value?.focusDevice(deviceId)
}

watch(projectId, () => {
  lastInteraction.value = null
  runtime.value = null
  selectedDeviceId.value = ''
  status.value = '正在加载场景…'
})
watch(devices, (nextDevices) => {
  if (!nextDevices.some((device) => device.id === selectedDeviceId.value)) selectedDeviceId.value = ''
}, { immediate: true })
onBeforeUnmount(() => { runtime.value = null })
</script>

<template>
  <main
    data-testid="project-dashboard"
    :data-project-id="projectId"
    :data-device-count="devices.length"
    :data-selected-device-id="selectedDeviceId"
    :data-runtime-revision="runtime?.runtimeRevision ?? 0"
    class="relative h-screen min-h-[640px] min-w-[1100px] overflow-hidden bg-slate-950 text-slate-200"
  >
    <section data-testid="dashboard-viewer-region" class="absolute inset-0 overflow-hidden bg-slate-950">
      <TwinSceneViewer
        ref="viewer"
        :key="projectId"
        :project-id="projectId"
        @loaded="handleLoaded"
        @selection-change="handleSelection"
        @interaction-event="lastInteraction = $event"
        @error="status = $event"
      />
    </section>

    <header class="absolute inset-x-4 top-4 z-20 flex h-14 items-center rounded-xl border border-white/10 bg-slate-950/55 px-4 shadow-xl shadow-black/20 backdrop-blur-md">
      <button data-testid="dashboard-back" aria-label="返回项目管理" class="grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-slate-800 hover:text-white" type="button" @click="router.push('/projects')">
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <span class="mx-3 h-5 w-px bg-slate-700" />
      <span class="grid h-8 w-8 place-items-center rounded-lg bg-blue-600/15 text-blue-400"><el-icon><Monitor /></el-icon></span>
      <div class="ml-3 min-w-0">
        <h1 data-testid="dashboard-project-name" class="truncate text-sm font-medium text-white">{{ projectName }}</h1>
        <p class="text-[10px] text-slate-500">数据大屏 · {{ status }}</p>
      </div>
      <button data-testid="dashboard-edit" class="ml-auto flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition hover:border-blue-500 hover:text-white" type="button" @click="router.push({ name: 'editor', params: { projectId } })">
        <el-icon><EditPen /></el-icon>进入编辑器
      </button>
    </header>

    <div class="pointer-events-none absolute inset-x-4 bottom-4 top-[84px] z-10 flex justify-between gap-6">
      <aside data-testid="dashboard-left-panel" class="pointer-events-auto w-[260px] shrink-0 overflow-auto rounded-xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl shadow-black/20 backdrop-blur-md">
        <DashboardOverviewPanel
          :project-name="projectName"
          :devices="devices"
          :binding-count="bindingCount"
          :resolved-binding-count="resolvedBindingCount"
        />
        <div class="mt-4 space-y-2 text-[11px] leading-5 text-slate-400">
          <p>单击设备查看数据 · 双击聚焦<br />悬停高亮 · 拖动旋转 · 滚轮缩放</p>
          <p>点击空白返回全场上下文。设备列表可选中并定位设备。</p>
          <p v-if="lastInteraction" data-testid="dashboard-interaction-event" aria-live="polite" class="rounded-lg border border-cyan-400/20 bg-cyan-950/30 p-2 text-cyan-200">
            场景业务事件<br />{{ lastInteraction.eventName }}<br />{{ lastInteraction.deviceId ?? '场景对象' }}
          </p>
        </div>
      </aside>

      <aside data-testid="dashboard-right-panel" class="pointer-events-auto w-[320px] shrink-0 overflow-auto rounded-xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl shadow-black/20 backdrop-blur-md">
        <DashboardDevicePanel :devices="devices" :selected-device-id="selectedDeviceId" @select="selectDevice" />
      </aside>
    </div>
  </main>
</template>
