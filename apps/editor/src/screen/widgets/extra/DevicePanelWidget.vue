<script setup lang="ts">
import { Cpu } from 'lucide-vue-next'
import { computed } from 'vue'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

const props = defineProps<WidgetComponentProps>()
const p = computed(() =>
  propsOf<{ title: string; color: string; textColor: string; fontSize: number; emptyText: string }>(props.widget),
)
const name = computed(() => (props.data?.value ? String(props.data.value) : ''))
const rows = computed(() => props.data?.rows ?? [])
</script>

<template>
  <div class="panel" :style="{ '--c': p.color, color: p.textColor, fontSize: `${p.fontSize}px` }">
    <div class="panel__head">
      <Cpu :size="p.fontSize * 1.2" />
      <span class="panel__title">{{ p.title }}</span>
      <strong v-if="name" class="panel__name">{{ name }}</strong>
    </div>
    <div v-if="name" class="panel__rows">
      <div v-for="row in rows" :key="String(row['变量'])" class="panel__row">
        <span>{{ row['变量'] }}</span
        ><strong>{{ row['数值'] }}</strong>
      </div>
    </div>
    <p v-else class="panel__empty">{{ p.emptyText }}</p>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
}
.panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 0.6em;
  border-bottom: 1px solid color-mix(in srgb, var(--c) 35%, transparent);
  color: var(--c);
}
.panel__title {
  color: inherit;
  opacity: 0.8;
}
.panel__name {
  margin-left: auto;
  color: #f1f5f9;
  font-size: 1.15em;
}
.panel__rows {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5em 1em;
  padding-top: 0.8em;
}
.panel__row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0.4em 0.6em;
  border-left: 2px solid var(--c);
  background: linear-gradient(90deg, color-mix(in srgb, var(--c) 14%, transparent), transparent);
}
.panel__row span {
  opacity: 0.7;
  font-size: 0.85em;
}
.panel__row strong {
  color: #f1f5f9;
  font-weight: 600;
}
.panel__empty {
  margin: auto;
  opacity: 0.6;
  text-align: center;
}
</style>
