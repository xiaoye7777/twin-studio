<script setup lang="ts">
import { computed } from 'vue'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

/** A button; what it does is set in 交互 (any click action: views, tours, variables, links…). */
const props = defineProps<WidgetComponentProps>()
const emit = defineEmits<{ action: [click: { item?: string }] }>()
const p = computed(() =>
  propsOf<{
    text: string
    look: 'solid' | 'outline' | 'glow'
    fontSize: number
    color: string
    textColor: string
    radius: number
  }>(props.widget),
)
</script>

<template>
  <button
    class="button"
    :class="`is-${p.look}`"
    :style="{ fontSize: `${p.fontSize}px`, '--c': p.color, '--r': `${p.radius}px`, color: p.textColor }"
    @click="!editing && emit('action', { item: p.text })"
  >
    {{ p.text }}
  </button>
</template>

<style scoped>
.button {
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 0 0.8em;
  border: 1px solid var(--c);
  border-radius: var(--r);
  font: inherit;
  letter-spacing: 0.06em;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition:
    filter 160ms ease,
    box-shadow 160ms ease;
}
.button.is-solid {
  background: var(--c);
}
.button.is-outline {
  background: transparent;
}
.button.is-glow {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--c) 10%, transparent),
    color-mix(in srgb, var(--c) 35%, transparent)
  );
  box-shadow:
    0 0 14px color-mix(in srgb, var(--c) 45%, transparent) inset,
    0 0 10px color-mix(in srgb, var(--c) 30%, transparent);
}
.button:hover {
  filter: brightness(1.18);
}
.button:active {
  filter: brightness(0.92);
}
</style>
