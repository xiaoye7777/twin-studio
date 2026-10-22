<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ScreenRuntimeKey } from '../../runtime/ScreenRuntime'
import { type ChartOption, echarts } from './echarts'

const props = defineProps<{ option: ChartOption }>()
const emit = defineEmits<{ select: [name: string] }>()
const runtime = inject(ScreenRuntimeKey, null)
const element = ref<HTMLDivElement>()
let chart: ReturnType<typeof echarts.init> | null = null
let observer: ResizeObserver | null = null

onMounted(() => {
  // Screens are scaled up on big displays; render sharp at the final size.
  const scale = Math.max(1, runtime?.scale.value ?? 1)
  chart = echarts.init(element.value!, null, { renderer: 'canvas', devicePixelRatio: window.devicePixelRatio * scale })
  chart.setOption(props.option)
  shape = structure(props.option)
  runtime?.charts.add(chart)
  chart.on('click', params => emit('select', String((params as { name?: unknown }).name ?? '')))
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(element.value!)
})

/** What the chart is made of (series, axes); data changes keep it. */
function structure(option: ChartOption): string {
  const ids = (key: string) => {
    const value = (option as Record<string, unknown>)[key]
    const list = Array.isArray(value) ? value : value ? [value] : []
    return list.map(item => `${(item as { id?: string }).id}:${(item as { type?: string }).type}`).join(',')
  }
  return ['series', 'xAxis', 'yAxis', 'radar'].map(ids).join('|')
}
let shape = ''

// Data updates merge, so values animate from where they are. A different set of series or axes replaces the
// old ones (otherwise a removed series would linger).
watch(
  () => props.option,
  option => {
    if (!chart) return
    const next = structure(option)
    if (next === shape) chart.setOption(option)
    else chart.setOption(option, { replaceMerge: ['series', 'xAxis', 'yAxis', 'radar'] })
    shape = next
  },
  { deep: true },
)

onBeforeUnmount(() => {
  if (chart) runtime?.charts.delete(chart)
  observer?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="element" class="echart" />
</template>

<style scoped>
.echart {
  width: 100%;
  height: 100%;
}
</style>
