<script setup lang="ts">
import { ArrowLeft, EditPen, Monitor } from '@element-plus/icons-vue'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TwinSceneViewer } from '@twin-studio/viewer'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { ProjectPackageService } from '@/infrastructure/packages/ProjectPackageService'
import { LocalSceneRepository } from '@/infrastructure/scenes'
import type {
  DataSourceConnectionStatus,
  TwinSceneViewerPublicApi,
  ViewerInteractionEvent,
  ViewerRuntimeState,
  ViewerSelection,
} from '@twin-studio/core'
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
// Preview through the exact delivery path: export the saved project to .twin.zip and load it with the SDK.
const packages = new ProjectPackageService(new LocalSceneRepository(), new IndexedDbAssetRepository(), projects)
const packageSource = shallowRef<Blob | null>(null)

// Venues differ: check the composition on their screen shapes, and the look on weaker hardware.
const ratios = [
  { id: 'fill', label: '铺满窗口', value: 0 },
  { id: '16:9', label: '16:9 标准大屏', value: 16 / 9 },
  { id: '21:9', label: '21:9 影院宽银幕', value: 21 / 9 },
  { id: '32:9', label: '32:9 超宽拼接屏', value: 32 / 9 },
  { id: '4:3', label: '4:3 投影', value: 4 / 3 },
  { id: '9:16', label: '9:16 竖屏', value: 9 / 16 },
] as const
const ratio = ref<(typeof ratios)[number]['id']>('fill')
const quality = ref<'auto' | 'low' | 'medium' | 'high'>('auto')
const windowSize = ref({ width: window.innerWidth, height: window.innerHeight })
const onResize = () => (windowSize.value = { width: window.innerWidth, height: window.innerHeight })
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
const frame = computed(() => {
  const value = ratios.find(item => item.id === ratio.value)!.value
  if (!value) return null
  const width = Math.max(200, windowSize.value.width - 32)
  const height = Math.max(200, windowSize.value.height - 84 - 16)
  return width / height > value
    ? { width: Math.round(height * value), height }
    : { width, height: Math.round(width / value) }
})

const devices = computed(() => {
  const state = runtime.value
  if (!state) return []
  // Explicitly consume revisions so this presentation projection follows every runtime update.
  void state.bindingRevision
  void state.runtimeRevision
  void state.resolutionRevision
  return buildDashboardDevices(state.bindings, state.runtimeValues, state.resolutionByBindingId)
})
const liveLabels: Record<DataSourceConnectionStatus, string> = {
  unconfigured: '未配置实时数据源 · 无数据',
  connecting: '实时数据连接中 · 无数据',
  connected: 'WebSocket 实时数据',
  disconnected: '实时数据未连接 · 无数据',
  error: '实时数据连接错误 · 无数据',
}
const liveStatus = computed<DataSourceConnectionStatus>(() => runtime.value?.dataSourceStatus ?? 'disconnected')
const bindingCount = computed(() => runtime.value?.bindings.length ?? 0)
const resolvedBindingCount = computed(() => {
  const state = runtime.value
  return state?.bindings.filter(binding => state.resolutionByBindingId[binding.id] === 'resolved').length ?? 0
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

watch(
  projectId,
  async (id, _previous, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    lastInteraction.value = null
    runtime.value = null
    selectedDeviceId.value = ''
    packageSource.value = null
    status.value = '正在加载场景…'
    // A saved scene without a project card (e.g. restored storage) still previews under its ID.
    const now = new Date().toISOString()
    const project = projects.getProjectById(id) ?? { id, name: id, createdAt: now, updatedAt: now }
    try {
      const blob = await packages.exportProject(project)
      if (!cancelled) packageSource.value = blob
    } catch (error) {
      if (!cancelled) status.value = error instanceof Error ? error.message : '项目包生成失败'
    }
  },
  { immediate: true },
)
watch(
  devices,
  nextDevices => {
    if (!nextDevices.some(device => device.id === selectedDeviceId.value)) selectedDeviceId.value = ''
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  runtime.value = null
})
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
    <section
      data-testid="dashboard-viewer-region"
      :class="frame ? 'top-[84px] bottom-4 flex items-center justify-center' : 'inset-y-0'"
      class="absolute inset-x-0 overflow-hidden bg-slate-950"
    >
      <div
        data-testid="dashboard-frame"
        :style="frame ? { width: `${frame.width}px`, height: `${frame.height}px` } : undefined"
        :class="frame ? 'relative rounded-sm ring-1 ring-white/20 shadow-2xl shadow-black/60' : 'absolute inset-0'"
      >
        <TwinSceneViewer
          v-if="packageSource"
          ref="viewer"
          :key="projectId"
          :source="packageSource"
          :quality="quality"
          @loaded="handleLoaded"
          @selection-change="handleSelection"
          @interaction-event="lastInteraction = $event"
          @error="status = $event"
        />
        <span
          v-if="frame"
          class="pointer-events-none absolute bottom-2 right-3 rounded bg-black/50 px-2 py-0.5 font-mono text-[10px] text-slate-300"
          >{{ ratio }} · {{ frame.width }}×{{ frame.height }}</span
        >
      </div>
    </section>

    <header
      class="absolute inset-x-4 top-4 z-20 flex h-14 items-center rounded-xl border border-white/10 bg-slate-950/55 px-4 shadow-xl shadow-black/20 backdrop-blur-md"
    >
      <button
        data-testid="dashboard-back"
        aria-label="返回项目管理"
        class="grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-slate-800 hover:text-white"
        type="button"
        @click="router.push('/projects')"
      >
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <span class="mx-3 h-5 w-px bg-slate-700" />
      <span class="grid h-8 w-8 place-items-center rounded-lg bg-blue-600/15 text-blue-400"
        ><el-icon><Monitor /></el-icon
      ></span>
      <div class="ml-3 min-w-0">
        <h1 data-testid="dashboard-project-name" class="truncate text-sm font-medium text-white">{{ projectName }}</h1>
        <p class="text-[10px] text-slate-500">数据大屏 · {{ status }}</p>
      </div>
      <span
        data-testid="dashboard-source-status"
        :data-status="liveStatus"
        :title="runtime?.dataSourceError ?? ''"
        :class="
          liveStatus === 'connected'
            ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
            : 'border-amber-400/40 bg-amber-500/15 text-amber-300'
        "
        class="ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
      >
        <span
          :class="liveStatus === 'connected' ? 'animate-pulse bg-emerald-400' : 'bg-amber-400'"
          class="h-1.5 w-1.5 rounded-full"
        />
        {{ liveLabels[liveStatus] }}
      </span>
      <select
        v-model="ratio"
        data-testid="dashboard-ratio"
        title="按场馆屏幕比例预览构图"
        class="ml-3 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 outline-none hover:border-blue-500"
      >
        <option v-for="item in ratios" :key="item.id" :value="item.id">{{ item.label }}</option>
      </select>
      <select
        v-model="quality"
        data-testid="dashboard-quality"
        title="画质：选择「流畅」可模拟普通电脑上的效果"
        class="ml-2 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 outline-none hover:border-blue-500"
      >
        <option value="auto">画质：自动</option>
        <option value="low">画质：流畅（普通电脑）</option>
        <option value="medium">画质：均衡</option>
        <option value="high">画质：高清</option>
      </select>
      <button
        data-testid="dashboard-edit"
        class="ml-3 flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition hover:border-blue-500 hover:text-white"
        type="button"
        @click="router.push({ name: 'editor', params: { projectId } })"
      >
        <el-icon><EditPen /></el-icon>进入编辑器
      </button>
    </header>

    <div
      v-if="!frame"
      class="pointer-events-none absolute inset-x-4 bottom-4 top-[84px] z-10 flex justify-between gap-6"
    >
      <aside
        data-testid="dashboard-left-panel"
        class="pointer-events-auto w-[260px] shrink-0 overflow-auto rounded-xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl shadow-black/20 backdrop-blur-md"
      >
        <DashboardOverviewPanel
          :project-name="projectName"
          :devices="devices"
          :binding-count="bindingCount"
          :resolved-binding-count="resolvedBindingCount"
        />
        <div class="mt-4 space-y-2 text-[11px] leading-5 text-slate-400">
          <p>单击设备查看数据 · 双击聚焦<br />悬停高亮 · 拖动旋转 · 滚轮缩放</p>
          <p>点击空白返回全场上下文。设备列表可选中并定位设备。</p>
          <p
            v-if="lastInteraction"
            data-testid="dashboard-interaction-event"
            aria-live="polite"
            class="rounded-lg border border-cyan-400/20 bg-cyan-950/30 p-2 text-cyan-200"
          >
            场景业务事件<br />{{ lastInteraction.eventName }}<br />{{ lastInteraction.deviceId ?? '场景对象' }}
          </p>
        </div>
      </aside>

      <aside
        data-testid="dashboard-right-panel"
        class="pointer-events-auto w-[320px] shrink-0 overflow-auto rounded-xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl shadow-black/20 backdrop-blur-md"
      >
        <DashboardDevicePanel :devices="devices" :selected-device-id="selectedDeviceId" @select="selectDevice" />
      </aside>
    </div>
  </main>
</template>
