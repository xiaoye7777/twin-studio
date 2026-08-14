<script setup lang="ts">
import { Calendar, MoreFilled } from '@element-plus/icons-vue'
import type { Project } from '@/stores/project'

defineProps<{
  project: Project
}>()

defineEmits<{
  open: [project: Project]
}>()

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}
</script>

<template>
  <article
    class="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg hover:shadow-slate-200/70"
    role="button"
    tabindex="0"
    @click="$emit('open', project)"
    @keydown.enter="$emit('open', project)"
  >
    <div
      class="relative aspect-[16/10] overflow-hidden"
      :style="{ background: project.cover ?? '#dbeafe' }"
    >
      <div class="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgba(15,23,42,0.16))]" />
      <div class="absolute left-[18%] top-[22%] h-[43%] w-[64%] rounded-xl border border-white/35 bg-white/20 shadow-2xl backdrop-blur-[2px] transition duration-300 group-hover:scale-[1.03]">
        <div class="m-3 grid h-[calc(100%-24px)] grid-cols-4 gap-1.5 opacity-70">
          <span v-for="item in 8" :key="item" class="rounded-sm bg-white/45" />
        </div>
      </div>
      <span class="absolute left-4 top-4 rounded-md bg-white/85 px-2 py-1 text-[11px] font-medium text-slate-600 backdrop-blur">
        数字孪生项目
      </span>
    </div>

    <div class="flex items-start justify-between gap-3 p-4">
      <div class="min-w-0">
        <h3 class="truncate text-[15px] font-semibold text-slate-800">{{ project.name }}</h3>
        <p class="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
          <el-icon><Calendar /></el-icon>
          更新于 {{ formatDate(project.updatedAt) }}
        </p>
      </div>
      <el-icon class="mt-1 shrink-0 text-slate-400"><MoreFilled /></el-icon>
    </div>
  </article>
</template>
