<script setup lang="ts">
import { BellRing, ShieldCheck } from 'lucide-vue-next'
import { computed } from 'vue'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

const props = defineProps<WidgetComponentProps>()
const emit = defineEmits<{ action: [click: { item?: string }] }>()
const p = computed(() => propsOf<{ fontSize: number; textColor: string; okText: string }>(props.widget))
const rows = computed(() => props.data?.rows ?? [])
/** Severity colour from the rule's template name. */
const tone = (level: unknown) => {
  const text = String(level)
  if (/严重|紧急|危险|critical/i.test(text)) return '#f87171'
  if (/预警|注意|warning/i.test(text)) return '#fbbf24'
  return '#fb923c'
}
</script>

<template>
  <div class="alarms" :style="{ fontSize: `${p.fontSize}px`, color: p.textColor }">
    <div
      v-for="(row, index) in rows"
      :key="index"
      class="alarm"
      :style="{ '--tone': tone(row['告警']) }"
      @click="emit('action', { item: String(row.deviceId ?? row['设备']) })"
    >
      <BellRing :size="p.fontSize * 1.1" class="alarm__icon" />
      <span class="alarm__device">{{ row['设备'] }}</span>
      <span class="alarm__what">{{ row['变量'] }} {{ row['数值'] }}</span>
      <span class="alarm__level">{{ row['告警'] }}</span>
    </div>
    <div v-if="!rows.length" class="alarms__ok"><ShieldCheck :size="p.fontSize * 1.6" />{{ p.okText }}</div>
  </div>
</template>

<style scoped>
.alarms {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  gap: 0.5em;
  overflow: hidden;
}
.alarm {
  display: flex;
  align-items: center;
  gap: 0.6em;
  padding: 0.55em 0.8em;
  border: 1px solid color-mix(in srgb, var(--tone) 40%, transparent);
  border-radius: 4px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--tone) 18%, transparent), transparent);
  animation: pulse 2.4s ease-in-out infinite;
}
.alarm__icon {
  flex-shrink: 0;
  color: var(--tone);
}
.alarm__device {
  color: #f1f5f9;
  font-weight: 600;
  white-space: nowrap;
}
.alarm__what {
  overflow: hidden;
  flex: 1;
  opacity: 0.8;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.alarm__level {
  padding: 0.1em 0.5em;
  border-radius: 3px;
  background: var(--tone);
  color: #111;
  font-size: 0.8em;
  font-weight: 600;
  white-space: nowrap;
}
.alarms__ok {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5em;
  color: #34d399;
  opacity: 0.85;
}
@keyframes pulse {
  50% {
    box-shadow: 0 0 12px color-mix(in srgb, var(--tone) 45%, transparent);
  }
}
</style>
