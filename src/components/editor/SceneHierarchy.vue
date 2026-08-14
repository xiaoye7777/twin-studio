<script setup lang="ts">
import { Camera, CaretRight, MostlyCloudy, Sunny } from '@element-plus/icons-vue'

const nodes = [
  { name: 'Main Camera', icon: Camera },
  { name: 'Directional Light', icon: Sunny },
  { name: 'Environment', icon: MostlyCloudy },
]
</script>

<template>
  <aside class="w-60 shrink-0 border-r border-slate-700 bg-slate-800 text-slate-300">
    <div class="flex h-10 items-center border-b border-slate-700 px-4 text-xs font-semibold text-slate-200">场景</div>
    <div class="p-2 text-xs">
      <div class="flex h-8 items-center gap-1 rounded-md bg-blue-500/15 px-2 text-blue-300">
        <el-icon :size="12"><CaretRight /></el-icon>
        <span class="font-medium">Scene</span>
      </div>
      <div
        v-for="node in nodes"
        :key="node.name"
        class="ml-4 flex h-8 items-center gap-2 rounded-md px-2 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
      >
        <el-icon><component :is="node.icon" /></el-icon>
        <span>{{ node.name }}</span>
      </div>
      <div class="ml-4 flex h-8 items-center gap-2 rounded-md bg-slate-700 px-2 text-slate-100">
        <span class="h-3 w-3 rounded-sm border border-blue-300 bg-blue-500/30" />
        <span>Demo Cube</span>
      </div>
    </div>
  </aside>
</template>
