<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { computed, inject, ref } from 'vue'
import { ScreenRuntimeKey } from '../../runtime/ScreenRuntime'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

/**
 * A drop-down or a row of tabs that sets a screen variable. Options come from the widget's data: the first
 * column is the value, a second text column (when there is one) the label.
 */
const props = defineProps<WidgetComponentProps>()
const emit = defineEmits<{ action: [click: { item?: string }] }>()
const runtime = inject(ScreenRuntimeKey)!
const p = computed(() =>
  propsOf<{
    variable: string
    label: string
    allOption: boolean
    allLabel: string
    fontSize: number
    color: string
    textColor: string
    background: string
    radius: number
  }>(props.widget),
)
const tabs = computed(() => props.widget.type === 'filter-tabs')

const options = computed(() => {
  const rows = props.data?.rows ?? []
  const keys = rows.length ? Object.keys(rows[0]!) : []
  const [valueKey, labelKey] = keys
  const list = rows.flatMap(row => {
    const value = row[valueKey!]
    if (value === null || value === undefined || value === '') return []
    const label = labelKey && typeof row[labelKey] === 'string' ? (row[labelKey] as string) : String(value)
    return [{ value: String(value), label }]
  })
  return p.value.allOption ? [{ value: '', label: p.value.allLabel }, ...list] : list
})

/** Without a variable the choice is only remembered here (and still runs click actions). */
const local = ref('')
const current = computed(() => (p.value.variable ? runtime.variable(p.value.variable) : local.value))
const currentLabel = computed(
  () => options.value.find(option => option.value === current.value)?.label ?? (current.value || p.value.allLabel),
)
const open = ref(false)

function choose(value: string): void {
  open.value = false
  if (props.editing) return
  if (p.value.variable) runtime.setVariable(p.value.variable, value)
  else local.value = value
  emit('action', { item: value })
}
</script>

<template>
  <div
    class="filter"
    :class="{ 'is-tabs': tabs }"
    :style="{
      fontSize: `${p.fontSize}px`,
      '--c': p.color,
      '--bg': p.background,
      '--r': `${p.radius}px`,
      color: p.textColor,
    }"
    data-testid="filter"
  >
    <span v-if="p.label" class="filter__label">{{ p.label }}</span>
    <template v-if="tabs">
      <div class="tabs">
        <button
          v-for="option in options"
          :key="option.value"
          class="tab"
          :class="{ 'is-active': option.value === current }"
          :data-testid="`filter-option-${option.label}`"
          @click="choose(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </template>
    <div v-else class="select" @mouseleave="open = false">
      <button class="select__current" @click="open = !editing && !open">
        <span>{{ currentLabel }}</span>
        <ChevronDown :size="p.fontSize" />
      </button>
      <div v-if="open" class="select__menu">
        <button
          v-for="option in options"
          :key="option.value"
          :class="{ 'is-active': option.value === current }"
          :data-testid="`filter-option-${option.label}`"
          @click="choose(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  gap: 0.6em;
}
.filter__label {
  flex-shrink: 0;
  opacity: 0.8;
}
.tabs {
  display: flex;
  height: 100%;
  min-width: 0;
  flex: 1;
  gap: 0.4em;
}
.tab {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  padding: 0 0.8em;
  border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
  border-radius: var(--r);
  background: var(--bg);
  color: inherit;
  font: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    box-shadow 160ms ease;
}
.tab.is-active {
  border-color: var(--c);
  background: color-mix(in srgb, var(--c) 28%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--c) 45%, transparent) inset;
  color: #fff;
}
.select {
  position: relative;
  height: 100%;
  min-width: 0;
  flex: 1;
}
.select__current {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.5em;
  padding: 0 0.7em;
  border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
  border-radius: var(--r);
  background: var(--bg);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.select__current span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.select__current svg {
  flex-shrink: 0;
  color: var(--c);
}
.select__menu {
  position: absolute;
  z-index: 10;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  display: flex;
  max-height: 12em;
  flex-direction: column;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
  border-radius: var(--r);
  background: #071324;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.5);
}
.select__menu button {
  padding: 0.45em 0.7em;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.select__menu button:hover,
.select__menu button.is-active {
  background: color-mix(in srgb, var(--c) 22%, transparent);
}
</style>
