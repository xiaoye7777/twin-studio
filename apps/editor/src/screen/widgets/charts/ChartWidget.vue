<script setup lang="ts">
import { computed } from 'vue'
import { emptyData } from '../../runtime/staticData'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'
import EChart from './EChart.vue'
import { chartBuilders, type ChartProps } from './options'

const props = defineProps<WidgetComponentProps>()
const emit = defineEmits<{ action: [click: { item?: string }] }>()
const option = computed(() => {
  const build = chartBuilders[props.widget.type]
  return build ? build(propsOf<ChartProps>(props.widget), props.data ?? emptyData()) : {}
})
</script>

<template>
  <EChart :option="option" @select="emit('action', { item: $event })" />
</template>
