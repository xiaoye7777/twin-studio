<script setup lang="ts">
import { computed } from 'vue'
import { formatNumber, numberFont } from '../format'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

interface ProgressProps {
  title: string
  max: number
  unit: string
  decimals: number
  color: string
  colorTo: string
  track: string
  fontSize: number
  textColor: string
  shape: 'bar' | 'ring'
  thickness: number
}
const props = defineProps<WidgetComponentProps>()
const p = computed(() => propsOf<ProgressProps>(props.widget))
const value = computed(() =>
  typeof props.data?.value === 'number' ? props.data.value : Number(props.data?.value) || 0,
)
const ratio = computed(() => Math.max(0, Math.min(1, value.value / (p.value.max || 1))))
const label = computed(() => `${formatNumber(value.value, p.value.decimals)}${p.value.unit}`)
// Ring geometry in a 100 × 100 viewBox.
const radius = computed(() => 50 - p.value.thickness / 2 - 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const gradientId = computed(() => `progress-${props.widget.id}`)
</script>

<template>
  <div v-if="p.shape === 'bar'" class="bar" :style="{ fontSize: `${p.fontSize}px`, color: p.textColor }">
    <div class="bar__head">
      <span>{{ p.title }}</span
      ><strong :style="{ fontFamily: numberFont, color: p.color }">{{ label }}</strong>
    </div>
    <div class="bar__track" :style="{ height: `${p.thickness}px`, background: p.track }">
      <div
        class="bar__fill"
        :style="{
          width: `${ratio * 100}%`,
          background: `linear-gradient(90deg, ${p.colorTo}, ${p.color})`,
          boxShadow: `0 0 10px ${p.color}`,
        }"
      />
    </div>
  </div>
  <div v-else class="ring">
    <svg viewBox="0 0 100 100">
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" :stop-color="p.color" />
          <stop offset="1" :stop-color="p.colorTo" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" :r="radius" fill="none" :stroke="p.track" :stroke-width="p.thickness" />
      <circle
        class="ring__arc"
        cx="50"
        cy="50"
        :r="radius"
        fill="none"
        :stroke="`url(#${gradientId})`"
        :stroke-width="p.thickness"
        stroke-linecap="round"
        :stroke-dasharray="`${circumference * ratio} ${circumference}`"
        transform="rotate(-90 50 50)"
      />
    </svg>
    <div class="ring__text" :style="{ color: p.textColor }">
      <strong :style="{ fontFamily: numberFont, color: p.color, fontSize: `${p.fontSize * 1.8}px` }">{{
        label
      }}</strong>
      <span :style="{ fontSize: `${p.fontSize}px` }">{{ p.title }}</span>
    </div>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}
.bar__head {
  display: flex;
  justify-content: space-between;
}
.bar__track {
  overflow: hidden;
  border-radius: 999px;
}
.bar__fill {
  height: 100%;
  border-radius: 999px;
  transition: width 600ms ease;
}
.ring {
  position: relative;
  width: 100%;
  height: 100%;
}
.ring svg {
  width: 100%;
  height: 100%;
}
.ring__arc {
  transition: stroke-dasharray 600ms ease;
}
.ring__text {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
</style>
