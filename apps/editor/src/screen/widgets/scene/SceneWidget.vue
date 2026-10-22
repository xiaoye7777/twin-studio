<script setup lang="ts">
import { Box, Loader } from 'lucide-vue-next'
import { computed, inject, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { TwinSceneViewerPublicApi, ViewerQuality, ViewerSelection } from '@twin-studio/core'
import { TwinSceneViewer } from '@twin-studio/viewer'
import { ScreenRuntimeKey } from '../../runtime/ScreenRuntime'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

const props = defineProps<WidgetComponentProps>()
const runtime = inject(ScreenRuntimeKey)!
const p = computed(() =>
  propsOf<{ quality: ViewerQuality; captions: boolean; radius: number; border: boolean; borderColor: string }>(
    props.widget,
  ),
)
const viewer = ref<TwinSceneViewerPublicApi | null>(null)
const source = shallowRef<Blob | null>(null)
const error = ref('')
const loading = ref(false)

// The package follows the screen's linked project.
watch(
  () => runtime.document.value?.sceneProjectId,
  async () => {
    source.value = null
    error.value = ''
    const pending = runtime.scenePackage()
    if (!pending) return
    loading.value = true
    try {
      source.value = await pending
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

function onLoaded(): void {
  const api = viewer.value
  if (!api) return
  runtime.viewers.set(props.widget.id, api)
  // Layers switched off on the screen stay off in a reloaded view.
  for (const id of runtime.hiddenLayers) api.setNodeVisible(id, false)
}

function onSelection(selection: ViewerSelection): void {
  if (!props.editing && selection?.deviceId) runtime.selectedDeviceId.value = selection.deviceId
}

onBeforeUnmount(() => {
  if (runtime.viewers.get(props.widget.id) === viewer.value) runtime.viewers.delete(props.widget.id)
})
</script>

<template>
  <div
    class="scene"
    :style="{ borderRadius: `${p.radius}px`, border: p.border ? `1px solid ${p.borderColor}` : undefined }"
    data-testid="scene-widget"
  >
    <TwinSceneViewer
      v-if="source"
      ref="viewer"
      :source="source"
      :quality="editing ? 'low' : p.quality"
      :captions="p.captions"
      @loaded="onLoaded"
      @selection-change="onSelection"
      @tour-change="runtime.tourPlaying.value = $event.playing"
    />
    <div v-else class="scene__empty">
      <Loader v-if="loading" :size="28" class="scene__spin" />
      <Box v-else :size="32" />
      <span>{{ loading ? '正在加载三维场景…' : error || '在页面设置中关联三维场景' }}</span>
    </div>
  </div>
</template>

<style scoped>
.scene {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.scene__empty {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px dashed rgb(45 212 191 / 0.45);
  background: radial-gradient(ellipse at center, rgb(45 212 191 / 0.12), transparent 70%);
  color: rgb(153 246 228 / 0.8);
  font-size: 16px;
}
.scene__spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
