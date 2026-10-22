<script setup lang="ts">
import { computed } from 'vue'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

interface TitleProps {
  text: string
  fontSize: number
  fontWeight: number
  letterSpacing: number
  align: 'left' | 'center' | 'right'
  color: string
  gradient: boolean
  gradientTo: string
  glow: boolean
}
const props = defineProps<WidgetComponentProps>()
const p = computed(() => propsOf<TitleProps>(props.widget))
const style = computed(() => {
  const { color, gradient, glow } = p.value
  return {
    fontSize: `${p.value.fontSize}px`,
    fontWeight: p.value.fontWeight,
    letterSpacing: `${p.value.letterSpacing}px`,
    justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[p.value.align] ?? 'center',
    color,
    ...(gradient
      ? {
          backgroundImage: `linear-gradient(180deg, ${color}, ${p.value.gradientTo})`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }
      : {}),
    textShadow: glow && !gradient ? `0 0 18px ${color}` : undefined,
    filter: glow && gradient ? `drop-shadow(0 0 12px ${color}88)` : undefined,
  }
})
</script>

<template>
  <div class="title" :style="style">
    <span>{{ p.text }}</span>
  </div>
</template>

<style scoped>
.title {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
}
</style>
