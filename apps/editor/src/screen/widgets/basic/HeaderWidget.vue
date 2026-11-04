<script setup lang="ts">
import { computed } from 'vue'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

const props = defineProps<WidgetComponentProps>()
const p = computed(() => propsOf<{ text: string; fontSize: number; color: string; textColor: string }>(props.widget))
const color = computed(() => p.value.color)
</script>

<template>
  <div class="header" :style="{ '--c': color }">
    <svg class="header__frame" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient :id="`header-${widget.id}`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="color" stop-opacity="0.32" />
          <stop offset="1" :stop-color="color" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 8 H300 L340 60 H660 L700 8 H1000"
        fill="none"
        :stroke="color"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
      />
      <path d="M300 8 L340 60 H660 L700 8 Z" :fill="`url(#header-${widget.id})`" />
      <path
        d="M0 22 H280 M720 22 H1000"
        :stroke="color"
        stroke-opacity="0.35"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <span class="header__text" :style="{ fontSize: `${p.fontSize}px`, color: p.textColor }">{{ p.text }}</span>
  </div>
</template>

<style scoped>
.header {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  align-items: flex-start;
  justify-content: center;
}
.header__frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 0 6px var(--c));
}
.header__text {
  position: relative;
  margin-top: 0.3em;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-shadow: 0 0 18px var(--c);
  white-space: nowrap;
}
</style>
