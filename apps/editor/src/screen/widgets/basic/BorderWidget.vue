<script setup lang="ts">
import { computed } from 'vue'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

const props = defineProps<WidgetComponentProps>()
const p = computed(() =>
  propsOf<{ style: string; color: string; fill: string; title: string; titleColor: string }>(props.widget),
)
const color = computed(() => p.value.color)
const kind = computed(() => p.value.style)
const title = computed(() => p.value.title)
</script>

<template>
  <div class="border" :class="`is-${kind}`" :style="{ '--c': color, '--fill': p.fill, '--title': p.titleColor }">
    <template v-if="kind === 'corners'">
      <i class="corner tl" /><i class="corner tr" /><i class="corner bl" /><i class="corner br" />
    </template>
    <div v-if="title" class="border__title"><span class="border__mark" />{{ title }}</div>
  </div>
</template>

<style scoped>
.border {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--fill);
}
.border.is-corners {
  border: 1px solid color-mix(in srgb, var(--c) 25%, transparent);
}
.corner {
  position: absolute;
  width: 18px;
  height: 18px;
  border-color: var(--c);
  border-style: solid;
  filter: drop-shadow(0 0 4px var(--c));
}
.corner.tl {
  top: -1px;
  left: -1px;
  border-width: 3px 0 0 3px;
}
.corner.tr {
  top: -1px;
  right: -1px;
  border-width: 3px 3px 0 0;
}
.corner.bl {
  bottom: -1px;
  left: -1px;
  border-width: 0 0 3px 3px;
}
.corner.br {
  right: -1px;
  bottom: -1px;
  border-width: 0 3px 3px 0;
}
.border.is-double {
  border: 1px solid color-mix(in srgb, var(--c) 70%, transparent);
  outline: 1px solid color-mix(in srgb, var(--c) 25%, transparent);
  outline-offset: 4px;
}
.border.is-glow {
  border: 1px solid color-mix(in srgb, var(--c) 60%, transparent);
  border-radius: 6px;
  box-shadow:
    0 0 18px color-mix(in srgb, var(--c) 35%, transparent),
    inset 0 0 28px color-mix(in srgb, var(--c) 20%, transparent);
}
.border.is-panel {
  border-top: 2px solid var(--c);
  background: linear-gradient(180deg, color-mix(in srgb, var(--c) 14%, transparent), var(--fill) 38%);
}
.border__title {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  height: 40px;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--c) 28%, transparent), transparent 75%);
  color: var(--title);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 2px;
}
.border__mark {
  width: 4px;
  height: 18px;
  background: var(--c);
  box-shadow: 0 0 8px var(--c);
}
</style>
