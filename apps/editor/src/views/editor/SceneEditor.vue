<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BottomDock from '@/components/studio/BottomDock.vue'
import InspectorPanel from '@/components/studio/InspectorPanel.vue'
import LeftPanel from '@/components/studio/LeftPanel.vue'
import StatusBar from '@/components/studio/StatusBar.vue'
import StudioDialogs from '@/components/studio/StudioDialogs.vue'
import StudioViewport from '@/components/studio/StudioViewport.vue'
import TopBar from '@/components/studio/TopBar.vue'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { LocalSceneRepository } from '@/infrastructure/scenes'
import { useProjectStore } from '@/stores/project'
import { SessionKey } from '@/studio/context'
import { EditorSession } from '@/studio/EditorSession'
import { createShellState, ShellKey } from '@/studio/shell'
import { useStudioShortcuts } from '@/studio/useShortcuts'
import '@/studio/studio.css'

const route = useRoute()
const router = useRouter()
const projects = useProjectStore()
const projectId = String(route.params.projectId ?? '')
const project = projects.getProjectById(projectId)
const session = shallowRef<EditorSession | null>(null)
const shell = createShellState()
const viewport = ref<InstanceType<typeof StudioViewport>>()
provide(SessionKey, session)
provide(ShellKey, shell)
useStudioShortcuts(session, shell)

const preview = computed(() => session.value?.ui.mode === 'preview')

onMounted(async () => {
  if (!project) {
    await router.replace('/projects')
    return
  }
  const canvas = viewport.value?.canvas
  if (!canvas) return
  const opened = new EditorSession(canvas, {
    projectId,
    projectName: project.name,
    assets: new IndexedDbAssetRepository(),
    scenes: new LocalSceneRepository(),
    onCover: cover => projects.updateProject(projectId, { cover }),
  })
  session.value = opened
  if (import.meta.env.DEV) (window as unknown as { __studio?: EditorSession }).__studio = opened
  await opened.open()
  document.title = `${project.name} · Twin Studio`
})

onBeforeUnmount(() => {
  session.value?.dispose()
  session.value = null
})
</script>

<template>
  <div class="studio" :class="{ 'is-preview': preview, 'is-dock-closed': !shell.dockOpen }" data-testid="studio">
    <TopBar v-if="session" />
    <div v-else class="studio__topbar-placeholder" />
    <div class="studio__body">
      <LeftPanel v-if="session?.ui.ready && !preview" class="studio__left" />
      <div class="studio__center">
        <StudioViewport ref="viewport" />
        <BottomDock v-if="session?.ui.ready && !preview" />
      </div>
      <InspectorPanel v-if="session?.ui.ready && !preview" class="studio__right" />
    </div>
    <StatusBar v-if="session" />
    <StudioDialogs v-if="session?.ui.ready" />
  </div>
</template>

<style scoped>
.studio__topbar-placeholder {
  border-bottom: 1px solid var(--s-line);
  background: var(--s-panel);
}
.studio__body {
  display: grid;
  min-height: 0;
  grid-template-columns: 264px minmax(0, 1fr) 316px;
}
.studio.is-preview .studio__body {
  grid-template-columns: minmax(0, 1fr);
}
.studio.is-preview .studio__center {
  grid-column: 1;
}
.studio__left {
  grid-column: 1;
  border-right: 1px solid var(--s-line);
}
.studio__right {
  grid-column: 3;
  border-left: 1px solid var(--s-line);
}
.studio__center {
  grid-column: 2;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}
</style>
