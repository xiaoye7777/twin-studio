<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { formatNumber, numberFont } from '../format'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

interface KpiProps {
  title: string
  unit: string
  decimals: number
  fontSize: number
  titleSize: number
  color: string
  titleColor: string
  style: 'card' | 'bar' | 'plain'
}
const props = defineProps<WidgetComponentProps>()
const p = computed(() => propsOf<KpiProps>(props.widget))
const emit = defineEmits<{ action: [click: { item?: string }] }>()

// Numbers count up to new values, like a ticker.
const shown = ref<number | null>(null)
let frame = 0
watch(
  () => props.data?.value,
  value => {
    cancelAnimationFrame(frame)
    if (typeof value !== 'number' || !Number.isFinite(value)) return void (shown.value = null)
    const from = shown.value ?? 0
    const start = performance.now()
    const step = (time: number) => {
      const t = Math.min(1, (time - start) / 800)
      shown.value = from + (value - from) * (1 - (1 - t) ** 3)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  },
  { immediate: true },
)
onBeforeUnmount(() => cancelAnimationFrame(frame))

const value = computed(() => {
  const raw = props.data?.value
  return typeof raw === 'number' ? formatNumber(shown.value ?? raw, p.value.decimals) : formatNumber(raw)
})
</script>

<template>
  <div class="kpi" :class="`is-${p.style}`" :style="{ '--accent': p.color }" @click="emit('action', {})">
    <span class="kpi__title" :style="{ color: p.titleColor, fontSize: `${p.titleSize}px` }">{{ p.title }}</span>
    <span class="kpi__value" :style="{ fontSize: `${p.fontSize}px`, fontFamily: numberFont }"
      >{{ value }}<small v-if="p.unit">{{ p.unit }}</small></span
    >
  </div>
</template>

<style scoped>
.kpi {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  overflow: hidden;
  padding: 0 16px;
}
.kpi.is-card {
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  border-radius: 6px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%);
  box-shadow: inset 0 0 24px color-mix(in srgb, var(--accent) 12%, transparent);
}
.kpi.is-bar {
  border-left: 4px solid var(--accent);
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 18%, transparent), transparent);
}
.kpi__title {
  white-space: nowrap;
}
.kpi__value {
  color: var(--accent);
  font-weight: 700;
  line-height: 1.1;
  text-shadow: 0 0 16px color-mix(in srgb, var(--accent) 45%, transparent);
  white-space: nowrap;
}
.kpi__value small {
  margin-left: 6px;
  font-size: 0.45em;
  font-weight: 500;
  opacity: 0.8;
}
</style>
