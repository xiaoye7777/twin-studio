<script setup lang="ts">
import { computed } from 'vue'
import type { ScreenDocument, Widget } from '../model'

const props = defineProps<{ screen: ScreenDocument }>()

/** A schematic of the layout: the 3D scene glows teal, charts blue, figures cyan, frames as outlines. */
function look(widget: Widget): { fill: string; stroke: string } {
  const type = widget.type
  if (type === 'scene') return { fill: 'rgba(45, 212, 191, 0.28)', stroke: 'rgba(45, 212, 191, 0.7)' }
  if (type.startsWith('chart-')) return { fill: 'rgba(96, 165, 250, 0.22)', stroke: 'rgba(96, 165, 250, 0.6)' }
  if (type.startsWith('decor-')) return { fill: 'transparent', stroke: 'rgba(125, 211, 252, 0.55)' }
  if (['kpi', 'counter', 'progress', 'ring'].includes(type))
    return { fill: 'rgba(34, 211, 238, 0.22)', stroke: 'rgba(34, 211, 238, 0.6)' }
  if (['title', 'text', 'clock', 'marquee'].includes(type))
    return { fill: 'rgba(255, 255, 255, 0.18)', stroke: 'transparent' }
  return { fill: 'rgba(148, 163, 184, 0.2)', stroke: 'rgba(148, 163, 184, 0.5)' }
}

const shapes = computed(() =>
  props.screen.widgets.filter(widget => !widget.hidden).map(widget => ({ widget, ...look(widget) })),
)
</script>

<template>
  <svg
    class="thumb"
    :viewBox="`0 0 ${screen.page.width} ${screen.page.height}`"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="`${screen.name} 布局`"
  >
    <rect :width="screen.page.width" :height="screen.page.height" :fill="screen.page.background.color" />
    <image
      v-if="screen.page.background.image"
      :href="screen.page.background.image"
      :width="screen.page.width"
      :height="screen.page.height"
      preserveAspectRatio="xMidYMid slice"
      opacity="0.8"
    />
    <rect
      v-for="shape in shapes"
      :key="shape.widget.id"
      :x="shape.widget.x"
      :y="shape.widget.y"
      :width="shape.widget.w"
      :height="shape.widget.h"
      :fill="shape.fill"
      :stroke="shape.stroke"
      :stroke-width="Math.max(2, screen.page.width / 480)"
      rx="6"
    />
  </svg>
</template>

<style scoped>
.thumb {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
