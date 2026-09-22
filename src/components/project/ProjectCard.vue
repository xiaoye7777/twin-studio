<script setup lang="ts">
import { Calendar, DataAnalysis, EditPen, MoreFilled } from '@element-plus/icons-vue'
import type { Project } from '@/stores/project'

defineProps<{
  project: Project
}>()

defineEmits<{
  edit: [project: Project]
  dashboard: [project: Project]
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
    :data-testid="`project-card-${project.id}`"
    class="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg hover:shadow-slate-200/70"
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
      <div
        data-testid="project-actions-overlay"
        class="absolute inset-0 z-10 flex items-center justify-center gap-3 bg-slate-950/65 opacity-0 backdrop-blur-[1px] transition duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <button
          data-testid="edit-project"
          class="flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-xs font-medium text-slate-800 shadow-lg transition hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          type="button"
          @click="$emit('edit', project)"
        >
          <el-icon><EditPen /></el-icon>编辑项目
        </button>
        <button
          data-testid="open-dashboard"
          class="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-lg transition hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          type="button"
          @click="$emit('dashboard', project)"
        >
          <el-icon><DataAnalysis /></el-icon>数据大屏
        </button>
      </div>
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
