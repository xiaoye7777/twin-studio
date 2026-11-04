<script setup lang="ts">
import { computed } from 'vue'
import { formatNumber, numberFont } from '../format'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

/** TOP N: names with proportional bars, largest first. Click a row to use it in an action. */
const props = defineProps<WidgetComponentProps>()
const emit = defineEmits<{ action: [click: { item?: string }] }>()
const p = computed(() =>
  propsOf<{
    maxRows: number
    unit: string
    decimals: number
    fontSize: number
    color: string
    colorTo: string
    highlight: string
    textColor: string
    track: string
    showRank: boolean
  }>(props.widget),
)

const rows = computed(() => {
  const data = props.data
  if (!data?.rows.length) return []
  const measure = data.measures[0]
  const items = data.rows
    .map(row => ({ name: String(row[data.dimension] ?? ''), value: measure ? Number(row[measure]) || 0 : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, Math.max(1, p.value.maxRows))
  const largest = Math.max(1e-9, ...items.map(item => Math.abs(item.value)))
  return items.map(item => ({ ...item, share: Math.max(0.02, Math.abs(item.value) / largest) }))
})
const unit = computed(
  () => p.value.unit || (props.data?.measures[0] ? (props.data.units[props.data.measures[0]] ?? '') : ''),
)
</script>

<template>
  <div
    class="rank"
    :style="{
      fontSize: `${p.fontSize}px`,
      color: p.textColor,
      '--c': p.color,
      '--c2': p.colorTo,
      '--hl': p.highlight,
      '--track': p.track,
      '--rows': rows.length || 1,
    }"
  >
    <div
      v-for="(item, index) in rows"
      :key="item.name"
      class="rank__row"
      :class="{ 'is-top': index < 3 }"
      @click="!editing && emit('action', { item: item.name })"
    >
      <span v-if="p.showRank" class="rank__no">{{ index + 1 }}</span>
      <div class="rank__main">
        <div class="rank__text">
          <span class="rank__name">{{ item.name }}</span>
          <span class="rank__value" :style="{ fontFamily: numberFont }">
            {{ formatNumber(item.value, p.decimals) }}<small v-if="unit"> {{ unit }}</small>
          </span>
        </div>
        <div class="rank__track"><i :style="{ width: `${item.share * 100}%` }" /></div>
      </div>
    </div>
    <p v-if="!rows.length" class="rank__empty">暂无数据</p>
  </div>
</template>

<style scoped>
.rank {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  justify-content: space-around;
  gap: 0.3em;
  overflow: hidden;
}
.rank__row {
  display: flex;
  min-height: 0;
  align-items: center;
  gap: 0.7em;
  cursor: pointer;
}
.rank__no {
  display: grid;
  width: 1.7em;
  height: 1.7em;
  flex-shrink: 0;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
  border-radius: 3px;
  color: var(--c);
  font-size: 0.85em;
  font-weight: 600;
}
.rank__row.is-top .rank__no {
  border-color: var(--hl);
  background: color-mix(in srgb, var(--hl) 22%, transparent);
  color: var(--hl);
}
.rank__main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.3em;
}
.rank__text {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6em;
}
.rank__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rank__value {
  flex-shrink: 0;
  color: #fff;
  font-weight: 600;
}
.rank__value small {
  color: inherit;
  font-size: 0.75em;
  font-weight: 400;
  opacity: 0.7;
}
.rank__track {
  height: 0.45em;
  overflow: hidden;
  border-radius: 1em;
  background: var(--track);
}
.rank__track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--c2), var(--c));
  box-shadow: 0 0 8px color-mix(in srgb, var(--c) 60%, transparent);
  transition: width 600ms ease;
}
.rank__row.is-top .rank__track i {
  background: linear-gradient(90deg, var(--c), var(--hl));
}
.rank__empty {
  margin: auto;
  opacity: 0.6;
}
</style>
