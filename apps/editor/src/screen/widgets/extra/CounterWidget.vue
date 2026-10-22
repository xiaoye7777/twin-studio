<script setup lang="ts">
import { computed } from 'vue'
import { numberFont } from '../format'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

interface CounterProps {
  title: string
  digits: number
  decimals: number
  unit: string
  fontSize: number
  color: string
  boxColor: string
  titleColor: string
}
const props = defineProps<WidgetComponentProps>()
const p = computed(() => propsOf<CounterProps>(props.widget))
/** Each character in its own box; digits roll to their new value. */
const chars = computed(() => {
  const raw = Number(props.data?.value)
  const value = Number.isFinite(raw) ? raw : 0
  const text = value.toFixed(p.value.decimals)
  const [whole = '0', fraction] = text.split('.')
  const padded = whole.padStart(p.value.digits, '0')
  const grouped = padded.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return [...(fraction ? `${grouped}.${fraction}` : grouped)]
})
</script>

<template>
  <div class="counter">
    <span v-if="p.title" class="counter__title" :style="{ color: p.titleColor, fontSize: `${p.fontSize * 0.4}px` }">{{
      p.title
    }}</span>
    <div
      class="counter__row"
      :style="{ fontSize: `${p.fontSize}px`, fontFamily: numberFont, '--c': p.color, '--box': p.boxColor }"
    >
      <template v-for="(char, index) in chars" :key="index">
        <span v-if="/\d/.test(char)" class="digit">
          <span class="digit__roll" :style="{ transform: `translateY(-${Number(char) * 10}%)` }">
            <span v-for="n in 10" :key="n">{{ n - 1 }}</span>
          </span>
        </span>
        <span v-else class="sep">{{ char }}</span>
      </template>
      <span v-if="p.unit" class="unit">{{ p.unit }}</span>
    </div>
  </div>
</template>

<style scoped>
.counter {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}
.counter__row {
  display: flex;
  align-items: center;
  gap: 0.12em;
  color: var(--c);
  font-weight: 700;
}
.digit {
  display: inline-block;
  overflow: hidden;
  width: 0.78em;
  height: 1.3em;
  border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
  border-radius: 0.1em;
  background: var(--box);
  box-shadow: inset 0 0 0.3em color-mix(in srgb, var(--c) 30%, transparent);
  line-height: 1.3em;
  text-align: center;
}
.digit__roll {
  display: flex;
  flex-direction: column;
  transition: transform 900ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.digit__roll span {
  height: 1.3em;
}
.sep {
  opacity: 0.8;
}
.unit {
  margin-left: 0.2em;
  font-size: 0.4em;
  opacity: 0.8;
}
</style>
