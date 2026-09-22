<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { TwinSceneViewerPublicApi, TwinSceneViewerEvents } from './viewerContract'
import type { TwinBindingTarget } from '@/domain/twin'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { LocalSceneRepository } from '@/infrastructure/scenes'
import { TwinSceneRuntime } from '@/runtime/twin/TwinSceneRuntime'
import type { ViewerTargetClick } from '@/runtime/twin/ViewerPointerEvents'

const props = defineProps<{ projectId: string }>()
const emit = defineEmits<TwinSceneViewerEvents>()
const canvas = ref<HTMLCanvasElement>()
const canvasKey = ref(0)
const session = shallowRef<TwinSceneRuntime | null>(null)
const loading = ref(false)
const error = ref('')
const warnings = ref<string[]>([])
let mounted = false
let generation = 0

async function load(): Promise<void> {
  session.value?.clearSelection()
  const request = ++generation
  session.value?.dispose()
  session.value = null
  canvasKey.value += 1
  await nextTick()
  if (request !== generation) return
  if (!canvas.value || !props.projectId.trim()) { error.value = '请指定 Project ID'; loading.value = false; return }
  error.value = ''
  warnings.value = []
  loading.value = true
  const runtime = new TwinSceneRuntime(canvas.value, new LocalSceneRepository(), new IndexedDbAssetRepository(), (event) => {
    if (!mounted || request !== generation) return
    const payload: ViewerTargetClick = { ...event, target: { ...event.target },
      bindingTarget: event.bindingTarget ? { ...event.bindingTarget } : undefined,
      device: event.device ? { ...event.device } : undefined }
    emit('target-click', payload)
    if (payload.device) emit('device-click', payload)
  }, (selection) => {
    if (mounted && request === generation) emit('selection-change', selection)
  }, (event) => {
    if (mounted && request === generation) emit('interaction-event', event)
  })
  session.value = runtime
  try {
    const result = await runtime.load(props.projectId)
    if (request !== generation) return
    warnings.value = result
    emit('loaded', { projectId: props.projectId, objectCount: runtime.roots.length, bindingCount: runtime.twin.bindings.length, warnings: result })
  } catch (cause) {
    if (request !== generation) return
    error.value = cause instanceof Error ? cause.message : String(cause)
    emit('error', error.value)
  } finally { if (request === generation) loading.value = false }
}
onMounted(() => { mounted = true; void load() })
watch(() => props.projectId, () => { if (mounted) void load() })
onBeforeUnmount(() => { mounted = false; generation += 1; session.value?.dispose(); session.value = null })
const publicApi: TwinSceneViewerPublicApi = {
  focusTarget: (target: TwinBindingTarget) => session.value?.focusTarget(target) ?? Promise.resolve(false),
  focusDevice: (deviceId: string) => session.value?.focusDevice(deviceId) ?? Promise.resolve(false),
  selectDevice: (deviceId: string) => session.value?.selectDevice(deviceId) ?? false,
  selectTarget: (target: TwinBindingTarget) => session.value?.selectTarget(target) ?? false,
  clearSelection: () => session.value?.clearSelection(),
  getSelection: () => session.value?.getSelection() ?? null,
  getRuntimeState: () => session.value?.runtimeState ?? null,
}
defineExpose({
  ...publicApi,
  // Legacy diagnostics; excluded from the supported host integration interface.
  getRuntimeObject: (target: TwinBindingTarget) => session.value?.getRuntimeObject(target) ?? null,
  getRuleDiagnostics: () => session.value?.visualRules?.getDiagnostics() ?? null,
  getInteractionDiagnostics: () => session.value?.interactions?.getDiagnostics() ?? null,
  getEffectDiagnostics: () => session.value?.effects?.getDiagnostics() ?? null,
})
</script>

<template>
  <div class="relative h-full min-h-0 w-full overflow-hidden bg-slate-900" data-testid="twin-scene-viewer"
    :data-loaded="!loading && !error && !!session" :data-object-count="session?.roots.length ?? 0"
    :data-binding-count="session?.twin.bindings.length ?? 0" :data-mock-running="session?.twin.mockRunning ?? false"
    :data-mock-ticks="session?.twin.mockTickCount ?? 0">
    <canvas :key="canvasKey" ref="canvas" class="block h-full w-full" aria-label="数字孪生场景" />
    <div v-if="loading || error" role="status" class="absolute inset-0 grid place-items-center bg-slate-950/70 p-8 text-sm text-slate-200">{{ error || '正在加载场景…' }}</div>
    <div v-else-if="warnings.length" role="status" class="absolute bottom-3 left-3 max-w-md rounded bg-amber-950/80 px-3 py-2 text-xs text-amber-200">{{ warnings.join('；') }}</div>
  </div>
</template>
