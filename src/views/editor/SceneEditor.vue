<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EditorResourcePanel from '@/components/editor/EditorResourcePanel.vue'
import EditorToolbar from '@/components/editor/EditorToolbar.vue'
import InspectorPanel from '@/components/editor/InspectorPanel.vue'
import SceneHierarchy from '@/components/editor/SceneHierarchy.vue'
import ThreeViewport from '@/components/editor/ThreeViewport.vue'
import { useProjectStore } from '@/stores/project'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()

const projectId = computed(() => String(route.params.projectId))
const projectName = computed(() => projectStore.getProjectById(projectId.value)?.name ?? '未命名项目')
</script>

<template>
  <div class="flex h-screen min-w-[1200px] flex-col overflow-hidden bg-slate-900">
    <EditorToolbar :project-name="projectName" @back="router.push('/projects')" />
    <div class="flex min-h-0 flex-1">
      <SceneHierarchy />
      <ThreeViewport
        :key="projectId"
        :project-id="projectId"
        :project-name="projectName"
      />
      <InspectorPanel />
    </div>
    <EditorResourcePanel />
  </div>
</template>
