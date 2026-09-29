<script setup lang="ts">
import { computed } from 'vue'
import type { TwinRuntimeValueData } from '@/domain/twin'
import type { DashboardDeviceStatusKind, DashboardDeviceView } from './dashboardRuntime'

const props = defineProps<{
  devices: readonly DashboardDeviceView[]
  selectedDeviceId: string
}>()
const emit = defineEmits<{ select: [deviceId: string] }>()

const selectedDevice = computed(() => props.devices.find((device) => device.id === props.selectedDeviceId) ?? null)

const statusClasses: Record<DashboardDeviceStatusKind, string> = {
  alarm: 'bg-rose-400',
  normal: 'bg-emerald-400',
  unresolved: 'bg-amber-400',
  waiting: 'bg-slate-500',
}

function formatValue(value: TwinRuntimeValueData | undefined): string {
  if (value === undefined) return '—'
  if (typeof value === 'number') return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value)
  return String(value)
}
</script>

<template>
  <div class="flex min-h-full flex-col" data-testid="dashboard-device-panel">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-[10px] uppercase tracking-[0.18em] text-slate-500">设备列表</p>
        <h2 class="mt-1 text-sm font-semibold text-white">实时设备</h2>
      </div>
      <span class="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-300">{{ devices.length }}</span>
    </div>

    <div v-if="devices.length" class="mt-4 max-h-[34vh] space-y-1.5 overflow-y-auto pr-1">
      <button
        v-for="device in devices"
        :key="device.id"
        type="button"
        :data-testid="`dashboard-device-${device.id}`"
        :aria-pressed="device.id === selectedDeviceId"
        class="flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition"
        :class="device.id === selectedDeviceId ? 'border-cyan-400/45 bg-cyan-400/10' : 'border-white/5 bg-slate-950/20 hover:border-white/15 hover:bg-slate-900/45'"
        @click="emit('select', device.id)"
      >
        <i class="h-2 w-2 shrink-0 rounded-full" :class="statusClasses[device.statusKind]" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-xs font-medium text-slate-100">{{ device.name }}</span>
          <span class="block truncate font-mono text-[10px] text-slate-500">{{ device.id }}</span>
        </span>
        <span class="max-w-[72px] truncate text-[10px]" :class="device.alarm ? 'text-rose-300' : 'text-slate-400'">{{ device.status }}</span>
      </button>
    </div>
    <div v-else class="mt-4 rounded-lg border border-dashed border-white/15 px-3 py-8 text-center text-xs text-slate-500">当前项目没有设备绑定</div>

    <div class="my-4 h-px bg-white/10" />

    <div v-if="selectedDevice" data-testid="dashboard-selected-device" :data-device-id="selectedDevice.id" class="min-h-0 flex-1">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-white">{{ selectedDevice.name }}</p>
          <p class="mt-0.5 font-mono text-[10px] text-cyan-300">{{ selectedDevice.id }}</p>
        </div>
        <span class="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-slate-950/25 px-2 py-1 text-[10px] text-slate-300">
          <i class="h-1.5 w-1.5 rounded-full" :class="statusClasses[selectedDevice.statusKind]" />{{ selectedDevice.status }}
        </span>
      </div>
      <div class="mt-3 flex items-center justify-between text-[11px]">
        <span class="text-slate-500">设备类型</span>
        <span class="max-w-[170px] truncate text-slate-300">{{ selectedDevice.type || '未设置' }}</span>
      </div>

      <p class="mt-5 text-[10px] uppercase tracking-[0.18em] text-slate-500">实时变量</p>
      <div v-if="selectedDevice.variables.length" class="mt-2 space-y-1.5 pb-2">
        <div
          v-for="variable in selectedDevice.variables"
          :key="variable.id"
          :data-testid="`dashboard-variable-${variable.bindingId}-${variable.key}`"
          :data-value="variable.value === undefined ? '' : String(variable.value)"
          class="flex items-baseline justify-between gap-3 rounded-lg border border-white/5 bg-slate-950/20 px-3 py-2"
        >
          <span class="min-w-0 truncate text-[11px] text-slate-400">{{ variable.name }}</span>
          <span class="shrink-0 font-mono text-sm font-medium text-white">
            {{ formatValue(variable.value) }}<small v-if="variable.unit" class="ml-1 font-sans text-[10px] font-normal text-slate-400">{{ variable.unit }}</small>
          </span>
        </div>
      </div>
      <div v-else class="mt-2 rounded-lg border border-dashed border-white/15 px-3 py-6 text-center text-xs text-slate-500">该设备没有变量定义</div>
    </div>
    <div v-else-if="devices.length" class="grid min-h-32 flex-1 place-items-center text-xs text-slate-500">请选择设备查看实时数据</div>
  </div>
</template>
