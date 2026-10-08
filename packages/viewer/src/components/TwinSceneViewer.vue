<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  idleTourState,
  type LoadedTwinPackage,
  loadTwinPackage,
  type TwinBindingTarget,
  type TwinPackageSource,
  TwinSceneRuntime,
  type TwinSceneViewerEvents,
  type TwinSceneViewerPublicApi,
  type ViewerQuality,
  type ViewerTargetClick,
  type ViewerTourState,
} from '@twin-studio/core'

const props = withDefaults(
  defineProps<{
    source: TwinPackageSource
    /** Render quality; 'auto' adapts to the device and screen. */
    quality?: ViewerQuality
    /** Kiosk mode: seconds without input before the project's autoplay tour starts (overrides the project). */
    idleSeconds?: number
    /** Show tour captions over the scene. Hosts with their own caption UI can turn this off. */
    captions?: boolean
  }>(),
  { quality: 'auto', idleSeconds: undefined, captions: true },
)
const emit = defineEmits<TwinSceneViewerEvents>()
const canvas = ref<HTMLCanvasElement>()
const canvasKey = ref(0)
const session = shallowRef<TwinSceneRuntime | null>(null)
const loadedPackage = shallowRef<LoadedTwinPackage | null>(null)
const loading = ref(false)
const error = ref('')
const warnings = ref<string[]>([])
const tour = ref<ViewerTourState>(idleTourState())
let mounted = false
let generation = 0
let controller: AbortController | null = null

function release(): void {
  controller?.abort()
  controller = null
  session.value?.dispose()
  session.value = null
  loadedPackage.value?.dispose()
  loadedPackage.value = null
}
async function load(): Promise<void> {
  const request = ++generation
  release()
  canvasKey.value += 1
  await nextTick()
  if (!mounted || request !== generation || !canvas.value) return
  error.value = ''
  warnings.value = []
  loading.value = true
  controller = new AbortController()
  try {
    const portable = await loadTwinPackage(props.source, { signal: controller.signal })
    if (!mounted || request !== generation) {
      portable.dispose()
      return
    }
    loadedPackage.value = portable
    const runtime = new TwinSceneRuntime(
      canvas.value,
      portable.sceneRepository,
      portable.assetRepository,
      event => {
        if (!mounted || request !== generation) return
        const payload: ViewerTargetClick = {
          ...event,
          target: { ...event.target },
          bindingTarget: event.bindingTarget ? { ...event.bindingTarget } : undefined,
          device: event.device ? { ...event.device } : undefined,
        }
        emit('target-click', payload)
        if (payload.device) emit('device-click', payload)
      },
      selection => {
        if (mounted && request === generation) emit('selection-change', selection)
      },
      event => {
        if (mounted && request === generation) emit('interaction-event', event)
      },
      {
        quality: props.quality,
        idleSeconds: props.idleSeconds,
        onTourChange: state => {
          if (!mounted || request !== generation) return
          tour.value = state
          emit('tour-change', state)
        },
        onAlarmChange: alarms => {
          if (mounted && request === generation) emit('alarm-change', alarms)
        },
        onHoverChange: event => {
          if (mounted && request === generation) emit('hover-change', event)
        },
      },
    )
    session.value = runtime
    const result = await runtime.load(portable.projectId)
    if (!mounted || request !== generation) return
    warnings.value = result
    emit('loaded', {
      projectId: portable.projectId,
      projectName: portable.projectName,
      objectCount: runtime.document?.nodes.length ?? runtime.roots.length,
      bindingCount: runtime.twin.bindings.length,
      warnings: result,
    })
  } catch (cause) {
    if (request !== generation || (cause instanceof DOMException && cause.name === 'AbortError')) return
    error.value = cause instanceof Error ? cause.message : String(cause)
    emit('error', error.value)
  } finally {
    if (request === generation) {
      loading.value = false
      controller = null
    }
  }
}
onMounted(() => {
  mounted = true
  void load()
})
watch(
  () => props.source,
  () => {
    if (mounted) void load()
  },
)
watch(
  () => props.quality,
  quality => session.value?.setQuality(quality),
)
onBeforeUnmount(() => {
  mounted = false
  generation++
  release()
})

const publicApi: TwinSceneViewerPublicApi = {
  focusTarget: (target: TwinBindingTarget) => session.value?.focusTarget(target) ?? Promise.resolve(false),
  focusDevice: (id: string) => session.value?.focusDevice(id) ?? Promise.resolve(false),
  selectDevice: (id: string) => session.value?.selectDevice(id) ?? false,
  selectTarget: (target: TwinBindingTarget) => session.value?.selectTarget(target) ?? false,
  clearSelection: () => session.value?.clearSelection(),
  getSelection: () => session.value?.getSelection() ?? null,
  getRuntimeState: () => session.value?.runtimeState ?? null,
  getDiagnostics: () =>
    session.value?.getDiagnostics() ?? {
      dataSource: { type: 'websocket', status: 'disconnected', messageCount: 0, error: null },
      visualRules: { activations: 0, activeRules: 0 },
      effects: { effects: 0, transientOwners: 0, helpers: 0, outlined: 0 },
    },
  getBookmarks: () => session.value?.getBookmarks() ?? [],
  flyToBookmark: (id: string, duration?: number) =>
    session.value?.flyToBookmark(id, duration) ?? Promise.resolve(false),
  resetView: (duration?: number) => session.value?.resetView(duration) ?? Promise.resolve(false),
  getTours: () => session.value?.getTours() ?? [],
  playTour: (id: string, fromStep?: number) => session.value?.playTour(id, fromStep) ?? Promise.resolve(false),
  pauseTour: () => session.value?.tours.pause(),
  resumeTour: () => session.value?.tours.resume(),
  stopTour: () => session.value?.tours.stop(),
  nextTourStep: () => session.value?.tours.next(),
  previousTourStep: () => session.value?.tours.previous(),
  getTourState: () => session.value?.tours.getState() ?? idleTourState(),
  getNodes: () => session.value?.getNodes() ?? [],
  setNodeVisible: (id: string, visible: boolean) => session.value?.setNodeVisible(id, visible) ?? false,
  getAlarms: () => session.value?.getAlarms() ?? [],
  setQuality: (quality: ViewerQuality) => session.value?.setQuality(quality),
  getPerformance: () =>
    session.value?.getPerformance() ?? { fps: 0, quality: 'medium', setting: props.quality, pixelRatio: 1 },
  screenshot: () => session.value?.screenshot() ?? Promise.resolve(null),
}
defineExpose({
  ...publicApi,
  // QA diagnostics for the Twin Studio browser test suites. Deliberately absent from index.d.ts:
  // hosts integrate only through TwinSceneViewerPublicApi.
  getRuntimeObject: (target: TwinBindingTarget) => session.value?.getRuntimeObject(target) ?? null,
  getRuleDiagnostics: () => session.value?.visualRules?.getDiagnostics() ?? null,
  getInteractionDiagnostics: () => session.value?.interactions?.getDiagnostics() ?? null,
  getEffectDiagnostics: () => session.value?.effects?.getDiagnostics() ?? null,
})
</script>

<template>
  <div
    class="twin-viewer"
    data-testid="twin-scene-viewer"
    :data-loaded="!loading && !error && !!session"
    :data-object-count="session?.roots.length ?? 0"
    :data-binding-count="session?.twin.bindings.length ?? 0"
    :data-mock-running="session?.twin.mockRunning ?? false"
    :data-mock-ticks="session?.twin.mockTickCount ?? 0"
    :data-source-type="session?.twin.dataSourceType ?? 'websocket'"
    :data-source-status="session?.twin.dataSourceStatus ?? 'disconnected'"
    :data-source-messages="session?.twin.dataSourceMessageCount ?? 0"
    :data-active-visual-rules="session?.visualRules?.getDiagnostics().activeRules ?? 0"
    :data-effect-helpers="session?.effects?.getDiagnostics().helpers ?? 0"
  >
    <canvas :key="canvasKey" ref="canvas" class="twin-viewer__canvas" aria-label="数字孪生场景" />
    <div v-if="loading || error" role="status" class="twin-viewer__overlay">
      <span v-if="!error" class="twin-viewer__spinner" aria-hidden="true" />{{ error || '正在加载项目包…' }}
    </div>
    <div v-else-if="warnings.length" role="status" class="twin-viewer__warning">{{ warnings.join('；') }}</div>
    <transition name="twin-viewer-caption">
      <div
        v-if="captions && tour.playing && tour.caption"
        :key="tour.stepIndex"
        class="twin-viewer__caption"
        data-testid="tour-caption"
      >
        {{ tour.caption }}
      </div>
    </transition>
  </div>
</template>

<style>
.twin-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #15181c;
}
.twin-viewer__canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.twin-viewer__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75em;
  padding: 2rem;
  background: rgba(14, 16, 19, 0.82);
  color: #e6e4df;
  /* Scales with the viewer so the message stays readable on large screens. */
  font:
    clamp(14px, 1.6vmin, 28px) / 1.5 system-ui,
    sans-serif;
}
.twin-viewer__spinner {
  width: 1.1em;
  height: 1.1em;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #e08a45;
  border-radius: 50%;
  animation: twin-viewer-spin 0.9s linear infinite;
}
@keyframes twin-viewer-spin {
  to {
    transform: rotate(360deg);
  }
}
.twin-viewer__caption {
  position: absolute;
  left: 50%;
  bottom: 7%;
  max-width: min(80%, 60em);
  transform: translateX(-50%);
  padding: 0.6em 1.4em;
  border-radius: 0.5em;
  background: rgba(10, 12, 15, 0.62);
  backdrop-filter: blur(6px);
  color: #f4f2ee;
  text-align: center;
  letter-spacing: 0.02em;
  font:
    500 clamp(15px, 2.4vmin, 44px) / 1.45 system-ui,
    'PingFang SC',
    'Microsoft YaHei',
    sans-serif;
  pointer-events: none;
}
.twin-viewer-caption-enter-active,
.twin-viewer-caption-leave-active {
  transition:
    opacity 0.45s ease,
    transform 0.45s ease;
}
.twin-viewer-caption-enter-from,
.twin-viewer-caption-leave-to {
  opacity: 0;
  transform: translate(-50%, 0.6em);
}
.twin-viewer__warning {
  position: absolute;
  left: 0.75rem;
  bottom: 0.75rem;
  max-width: 28rem;
  border-radius: 0.4rem;
  padding: 0.5rem 0.75rem;
  background: rgba(69, 26, 3, 0.86);
  color: #fde68a;
  font:
    12px/1.5 system-ui,
    sans-serif;
}
</style>
