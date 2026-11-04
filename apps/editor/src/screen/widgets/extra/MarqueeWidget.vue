<script setup lang="ts">
import { computed } from 'vue'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

const props = defineProps<WidgetComponentProps>()
const p = computed(() =>
  propsOf<{ text: string; fontSize: number; color: string; speed: number; background: string }>(props.widget),
)
/** Seconds for one pass, from the text length and speed (pixels per second). */
const duration = computed(() =>
  Math.max(4, (p.value.text.length * p.value.fontSize + props.widget.w) / Math.max(10, p.value.speed)),
)
</script>

<template>
  <div class="marquee" :style="{ background: p.background, fontSize: `${p.fontSize}px`, color: p.color }">
    <span class="marquee__text" :style="{ animationDuration: `${duration}s` }">{{ p.text }}</span>
  </div>
</template>

<style scoped>
.marquee {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
}
.marquee__text {
  padding-left: 100%;
  animation: scroll linear infinite;
}
@keyframes scroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-100%);
  }
}
</style>
