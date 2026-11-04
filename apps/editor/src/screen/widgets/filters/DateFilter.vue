<script setup lang="ts">
import { computed, inject } from 'vue'
import { ScreenRuntimeKey } from '../../runtime/ScreenRuntime'
import { formatDate } from '../format'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

/** A date or month picker that sets a screen variable (YYYY-MM-DD / YYYY-MM). */
const props = defineProps<WidgetComponentProps>()
const emit = defineEmits<{ action: [click: { item?: string }] }>()
const runtime = inject(ScreenRuntimeKey)!
const p = computed(() =>
  propsOf<{
    variable: string
    mode: 'date' | 'month'
    label: string
    fontSize: number
    color: string
    textColor: string
    background: string
    radius: number
  }>(props.widget),
)
const value = computed(() => {
  const current = p.value.variable ? runtime.variable(p.value.variable) : ''
  return current || formatDate(new Date(), p.value.mode === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD')
})

function change(next: string): void {
  if (props.editing || !next) return
  if (p.value.variable) runtime.setVariable(p.value.variable, next)
  emit('action', { item: next })
}
</script>

<template>
  <label
    class="date"
    :style="{
      fontSize: `${p.fontSize}px`,
      '--c': p.color,
      '--bg': p.background,
      '--r': `${p.radius}px`,
      color: p.textColor,
    }"
  >
    <span v-if="p.label" class="date__label">{{ p.label }}</span>
    <input
      class="date__input"
      :type="p.mode"
      :value="value"
      :disabled="editing"
      data-testid="filter-date"
      @change="change(($event.target as HTMLInputElement).value)"
    />
  </label>
</template>

<style scoped>
.date {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  gap: 0.6em;
}
.date__label {
  flex-shrink: 0;
  opacity: 0.8;
}
.date__input {
  height: 100%;
  min-width: 0;
  flex: 1;
  padding: 0 0.6em;
  border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
  border-radius: var(--r);
  background: var(--bg);
  color: inherit;
  color-scheme: dark;
  font: inherit;
  outline: none;
}
.date__input:disabled {
  opacity: 1;
}
.date__input:focus {
  border-color: var(--c);
}
</style>
