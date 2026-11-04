<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { formatDate, numberFont } from '../format'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

const props = defineProps<WidgetComponentProps>()
const now = ref(new Date())
const timer = setInterval(() => (now.value = new Date()), 1000)
onBeforeUnmount(() => clearInterval(timer))
const p = computed(() =>
  propsOf<{ format: string; fontSize: number; color: string; align: 'left' | 'center' | 'right' }>(props.widget),
)
const text = computed(() => formatDate(now.value, p.value.format))
const style = computed(() => ({
  fontSize: `${p.value.fontSize}px`,
  color: p.value.color,
  justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[p.value.align],
  fontFamily: numberFont,
}))
</script>

<template>
  <div class="clock" :style="style">{{ text }}</div>
</template>

<style scoped>
.clock {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
  white-space: nowrap;
}
</style>
