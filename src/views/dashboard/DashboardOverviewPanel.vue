<script setup lang="ts">
import { computed } from 'vue'
import type { DashboardDeviceView } from './dashboardRuntime'

const props = defineProps<{
  projectName: string
  devices: readonly DashboardDeviceView[]
  bindingCount: number
  resolvedBindingCount: number
}>()

const alarmCount = computed(() => props.devices.filter((device) => device.alarm).length)
const normalCount = computed(() => props.devices.filter((device) => device.resolved && !device.alarm).length)
</script>

<template>
  <div class="flex min-h-full flex-col" data-testid="dashboard-overview">
    <div>
      <p class="text-[10px] uppercase tracking-[0.18em] text-slate-500">项目概览</p>
      <h2 class="mt-1 truncate text-sm font-semibold text-white">{{ projectName }}</h2>
    </div>

    <div class="mt-5 grid grid-cols-2 gap-2">
      <div class="rounded-lg border border-white/10 bg-slate-950/25 p-3">
        <p class="text-[10px] text-slate-400">设备总数</p>
        <strong data-testid="dashboard-device-count" class="mt-1 block text-xl font-semibold text-white">{{ devices.length }}</strong>
      </div>
      <div class="rounded-lg border border-white/10 bg-slate-950/25 p-3">
        <p class="text-[10px] text-slate-400">已解析绑定</p>
        <strong data-testid="dashboard-resolved-binding-count" class="mt-1 block text-xl font-semibold text-cyan-300">{{ resolvedBindingCount }}</strong>
        <span class="text-[10px] text-slate-500">共 {{ bindingCount }} 个</span>
      </div>
      <div class="rounded-lg border border-white/10 bg-slate-950/25 p-3">
        <p class="text-[10px] text-slate-400">正常设备</p>
        <strong data-testid="dashboard-normal-count" class="mt-1 block text-xl font-semibold text-emerald-300">{{ normalCount }}</strong>
      </div>
      <div class="rounded-lg border border-white/10 bg-slate-950/25 p-3">
        <p class="text-[10px] text-slate-400">告警设备</p>
        <strong data-testid="dashboard-alarm-count" class="mt-1 block text-xl font-semibold text-rose-300">{{ alarmCount }}</strong>
      </div>
    </div>

    <div class="mt-4 rounded-lg border border-white/10 bg-slate-950/20 p-3 text-[11px] leading-5 text-slate-400">
      <div class="flex items-center justify-between">
        <span>数据来源</span>
        <span class="flex items-center gap-1.5 text-emerald-300"><i class="h-1.5 w-1.5 rounded-full bg-emerald-400" />Twin Runtime</span>
      </div>
      <p class="mt-2 text-slate-500">设备、告警和实时值均来自当前 3D Viewer 的运行态。</p>
    </div>
  </div>
</template>
