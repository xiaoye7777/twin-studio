<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TwinSceneViewer from '@/components/twin/TwinSceneViewer.vue'
import type { ViewerTargetClick } from '@/runtime/twin/ViewerPointerEvents'
const route = useRoute()
const router = useRouter()
const projectId = computed(() => typeof route.query.projectId === 'string' ? route.query.projectId : '')
const input = ref(projectId.value)
const clicked = ref<ViewerTargetClick | null>(null)
const status = ref('等待加载')
watch(projectId, (id) => { input.value = id; clicked.value = null; status.value = '正在加载' })
function load(): void { clicked.value = null; status.value = '正在加载'; void router.replace({ query: { projectId: input.value.trim() } }) }
</script>
<template>
  <main class="flex h-screen flex-col bg-slate-950 text-slate-200">
    <form class="flex shrink-0 items-center gap-3 border-b border-slate-800 px-4 py-2 text-xs" @submit.prevent="load">
      <span>Twin Scene Viewer</span>
      <label>Project ID <input v-model="input" aria-label="Project ID" class="ml-2 w-64 rounded bg-slate-800 px-2 py-1" /></label>
      <button type="submit" class="rounded bg-slate-700 px-3 py-1">加载</button>
      <span>{{ status }}</span>
      <RouterLink to="/projects" class="ml-auto text-slate-400">项目列表</RouterLink>
    </form>
    <div class="min-h-0 flex-1">
      <TwinSceneViewer v-if="projectId" :project-id="projectId"
        @loaded="status = `已加载 · ${$event.objectCount} Objects · ${$event.bindingCount} Bindings`"
        @error="status = $event" @target-click="clicked = $event" />
      <p v-else class="p-8 text-sm text-slate-400">输入已在 Editor 保存过的 Project ID。</p>
    </div>
    <pre v-if="clicked" data-testid="viewer-click-event" class="max-h-28 shrink-0 overflow-auto px-4 py-2 text-xs">{{ JSON.stringify(clicked, null, 2) }}</pre>
  </main>
</template>
