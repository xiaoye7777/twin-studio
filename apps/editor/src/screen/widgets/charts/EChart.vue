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
  chart.on('click', params => emit('select', String((params as { name?: unknown }).name ?? '')))
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(element.value!)
})

// Series and axes carry ids, so live data animates from the old values instead of redrawing.
watch(
  () => props.option,
  option => chart?.setOption(option, { replaceMerge: ['series', 'xAxis', 'yAxis', 'radar', 'legend'] }),
  { deep: true },
)

onBeforeUnmount(() => {
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
