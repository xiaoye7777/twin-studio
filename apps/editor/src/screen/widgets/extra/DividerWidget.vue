<script setup lang="ts">
import { computed } from 'vue'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

const props = defineProps<WidgetComponentProps>()
const p = computed(() => propsOf<{ style: 'glow' | 'dashed' | 'dots'; color: string; vertical: boolean }>(props.widget))
</script>

<template>
  <div class="divider" :class="[`is-${p.style}`, { 'is-vertical': p.vertical }]" :style="{ '--c': p.color }"><i /></div>
</template>

<style scoped>
.divider {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
}
.divider i {
  display: block;
  width: 100%;
  height: 2px;
}
.divider.is-vertical i {
  width: 2px;
  height: 100%;
}
.divider.is-glow i {
  background: linear-gradient(90deg, transparent, var(--c), transparent);
  box-shadow: 0 0 8px var(--c);
}
.divider.is-vertical.is-glow i {
  background: linear-gradient(180deg, transparent, var(--c), transparent);
}
.divider.is-dashed i {
  background: repeating-linear-gradient(90deg, var(--c) 0 12px, transparent 12px 20px);
}
.divider.is-vertical.is-dashed i {
  background: repeating-linear-gradient(180deg, var(--c) 0 12px, transparent 12px 20px);
}
.divider.is-dots i {
  height: 4px;
  background: radial-gradient(circle, var(--c) 1.5px, transparent 2px) 0 0 / 10px 4px;
}
.divider.is-vertical.is-dots i {
  width: 4px;
  height: 100%;
  background-size: 4px 10px;
}
</style>
