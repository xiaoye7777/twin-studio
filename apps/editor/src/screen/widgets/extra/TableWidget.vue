<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { formatNumber } from '../format'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

interface TableProps {
  rowHeight: number
  fontSize: number
  headerColor: string
  headerBackground: string
  textColor: string
  stripe: string
  highlight: string
  showHeader: boolean
  scroll: boolean
  interval: number
  rank: boolean
  columns: string
}
const props = defineProps<WidgetComponentProps>()
const emit = defineEmits<{ action: [click: { item?: string }] }>()
const p = computed(() => propsOf<TableProps>(props.widget))
const rows = computed(() => props.data?.rows ?? [])
/** Columns: the configured list ("key:标题, …") or every key in the data. */
const columns = computed(() => {
  const configured = p.value.columns
    .split(/[,，]/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const [key, title] = item.split(/[:：]/)
      return { key: key!.trim(), title: (title ?? key!).trim() }
    })
  if (configured.length) return configured
  const keys = [...new Set(rows.value.flatMap(row => Object.keys(row)))]
  return keys.map(key => ({ key, title: props.data?.labels[key] ?? key }))
})
const cell = (row: Record<string, unknown>, key: string) => {
  const value = row[key]
  const unit = props.data?.units[key]
  return typeof value === 'number'
    ? `${formatNumber(value, Number.isInteger(value) ? 0 : 1)}${unit ? ` ${unit}` : ''}`
    : formatNumber(value)
}

// Auto-scroll one row at a time when the rows do not fit.
const offset = ref(0)
const visibleRows = computed(() =>
  Math.max(1, Math.floor((props.widget.h - (p.value.showHeader ? p.value.rowHeight : 0)) / p.value.rowHeight)),
)
let timer: ReturnType<typeof setInterval> | null = null
watch(
  () => [p.value.scroll, p.value.interval, rows.value.length, visibleRows.value, props.editing] as const,
  ([scroll, interval, count, visible, editing]) => {
    if (timer) clearInterval(timer)
    timer = null
    offset.value = 0
    if (!scroll || editing || count <= visible) return
    timer = setInterval(() => (offset.value = (offset.value + 1) % count), Math.max(1, interval) * 1000)
  },
  { immediate: true },
)
onBeforeUnmount(() => timer && clearInterval(timer))
const shown = computed(() => {
  const list = rows.value
  if (!timer || list.length <= visibleRows.value) return list.map((row, index) => ({ row, index }))
  return Array.from({ length: visibleRows.value + 1 }, (_, i) => {
    const index = (offset.value + i) % list.length
    return { row: list[index]!, index }
  })
})
</script>

<template>
  <div class="table" :style="{ fontSize: `${p.fontSize}px`, color: p.textColor, '--row': `${p.rowHeight}px` }">
    <div
      v-if="p.showHeader"
      class="table__row table__head"
      :style="{ color: p.headerColor, background: p.headerBackground }"
    >
      <span v-if="p.rank" class="table__rank">#</span>
      <span v-for="column in columns" :key="column.key">{{ column.title }}</span>
    </div>
    <div class="table__body">
      <div
        v-for="({ row, index }, i) in shown"
        :key="`${index}-${i}`"
        class="table__row"
        :style="{ background: index % 2 ? p.stripe : 'transparent' }"
        @click="emit('action', { item: String(row[columns[0]?.key ?? ''] ?? '') })"
      >
        <span v-if="p.rank" class="table__rank"
          ><i :style="{ background: index < 3 ? p.highlight : 'rgba(148,163,184,0.25)' }">{{ index + 1 }}</i></span
        >
        <span v-for="column in columns" :key="column.key" :title="cell(row, column.key)">{{
          cell(row, column.key)
        }}</span>
      </div>
      <div v-if="!rows.length" class="table__empty">暂无数据</div>
    </div>
  </div>
</template>

<style scoped>
.table {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
}
.table__row {
  display: flex;
  height: var(--row);
  flex-shrink: 0;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
}
.table__row > span {
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.table__head {
  font-weight: 600;
}
.table__body {
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.table__rank {
  max-width: 2.2em;
  flex: 0 0 2.2em !important;
}
.table__rank i {
  display: inline-grid;
  width: 1.5em;
  height: 1.5em;
  place-items: center;
  border-radius: 3px;
  color: #fff;
  font-size: 0.85em;
  font-style: normal;
}
.table__empty {
  padding: 16px;
  opacity: 0.6;
  text-align: center;
}
</style>
