<script setup lang="ts">
import { Box, Brush, Picture } from '@element-plus/icons-vue'

const resources = [
  { name: '基础模型', icon: Box },
  { name: '默认材质', icon: Brush },
  { name: '环境贴图', icon: Picture },
]
</script>

<template>
  <section class="h-32 shrink-0 border-t border-slate-700 bg-slate-800 text-slate-300">
    <div class="flex h-9 items-center justify-between border-b border-slate-700 px-4">
      <span class="text-xs font-semibold text-slate-200">资源</span>
      <span class="text-[10px] text-slate-500">拖入场景以添加对象</span>
    </div>
    <div class="flex gap-2 p-3">
      <button
        v-for="resource in resources"
        :key="resource.name"
        class="flex h-16 w-28 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/40 px-3 text-left text-xs text-slate-400 transition hover:border-blue-500/60 hover:bg-slate-700 hover:text-slate-100"
        type="button"
      >
        <el-icon :size="18"><component :is="resource.icon" /></el-icon>
        <span>{{ resource.name }}</span>
      </button>
    </div>
  </section>
</template>
