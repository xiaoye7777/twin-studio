<script setup lang="ts">
import { Video } from 'lucide-vue-next'
import { computed } from 'vue'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

/** A video file (mp4 / webm) or a stream the browser plays natively. Muted so autoplay is allowed. */
const props = defineProps<WidgetComponentProps>()
const p = computed(() =>
  propsOf<{ src: string; poster: string; loop: boolean; controls: boolean; fit: string; radius: number }>(props.widget),
)
const safe = computed(() => /^(https?:|blob:|data:video\/)/i.test(p.value.src.trim()))
</script>

<template>
  <video
    v-if="safe"
    class="video"
    :src="p.src"
    :poster="p.poster || undefined"
    :loop="p.loop"
    :controls="p.controls && !editing"
    :style="{ objectFit: p.fit as 'cover', borderRadius: `${p.radius}px` }"
    autoplay
    muted
    playsinline
  />
  <div v-else class="video video--empty" :style="{ borderRadius: `${p.radius}px` }">
    <Video :size="28" />
    <span>{{ p.src ? '视频地址需以 http(s):// 开头' : '在样式中填写视频地址（mp4 / webm）' }}</span>
  </div>
</template>

<style scoped>
.video {
  display: block;
  width: 100%;
  height: 100%;
  background: #000;
}
.video--empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.6);
  color: #94a3b8;
  font-size: 14px;
}
</style>
