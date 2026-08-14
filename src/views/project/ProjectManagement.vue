<script setup lang="ts">
import { ref } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import CreateProjectDialog from '@/components/project/CreateProjectDialog.vue'
import ProjectCard from '@/components/project/ProjectCard.vue'
import { useProjectStore, type Project } from '@/stores/project'

const router = useRouter()
const projectStore = useProjectStore()
const dialogVisible = ref(false)

function openProject(project: Project) {
  router.push(`/editor/${project.id}`)
}
</script>

<template>
  <section class="mx-auto max-w-[1560px]">
    <div class="mb-8 flex items-end justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-slate-900">项目管理</h1>
        <p class="mt-2 text-sm text-slate-500">创建和管理数字孪生项目</p>
      </div>
      <p class="text-sm text-slate-400">共 {{ projectStore.projectCount }} 个项目</p>
    </div>

    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      <ProjectCard
        v-for="project in projectStore.projects"
        :key="project.id"
        :project="project"
        @open="openProject"
      />

      <button
        class="group flex min-h-[264px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/55 text-slate-400 transition duration-200 hover:-translate-y-1 hover:border-blue-400 hover:bg-blue-50/60 hover:text-blue-600 hover:shadow-lg hover:shadow-blue-100/50"
        type="button"
        @click="dialogVisible = true"
      >
        <span class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 transition group-hover:bg-blue-100">
          <el-icon :size="23"><Plus /></el-icon>
        </span>
        <span class="mt-4 text-sm font-medium">创建项目</span>
        <span class="mt-1.5 text-xs text-slate-400">从空白场景开始</span>
      </button>
    </div>

    <CreateProjectDialog v-model="dialogVisible" @created="openProject" />
  </section>
</template>
