<script setup lang="ts">
import { computed } from 'vue'
import { formatNumber } from '../format'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

interface TextProps {
  text: string
  fontSize: number
  color: string
  lineHeight: number
  align: 'left' | 'center' | 'right'
  decimals: number
}
const props = defineProps<WidgetComponentProps>()
const p = computed(() => propsOf<TextProps>(props.widget))
/** `{value}` in the text shows the bound value. */
const text = computed(() => p.value.text.replace(/\{value\}/g, formatNumber(props.data?.value, p.value.decimals)))
const style = computed(() => ({
  fontSize: `${p.value.fontSize}px`,
  color: p.value.color,
  lineHeight: p.value.lineHeight,
  textAlign: p.value.align,
}))
</script>

<template>
  <div class="text" :style="style">{{ text }}</div>
</template>

<style scoped>
.text {
  width: 100%;
  height: 100%;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
