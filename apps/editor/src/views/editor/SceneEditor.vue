<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BottomDock from '@/components/studio/BottomDock.vue'
import ResizeHandle from '@/components/studio/ResizeHandle.vue'
import InspectorPanel from '@/components/studio/InspectorPanel.vue'
import LeftPanel from '@/components/studio/LeftPanel.vue'
import StatusBar from '@/components/studio/StatusBar.vue'
import ReplaceModelDialog from '@/components/studio/ReplaceModelDialog.vue'
import StudioDialogs from '@/components/studio/StudioDialogs.vue'
import StudioViewport from '@/components/studio/StudioViewport.vue'
import TopBar from '@/components/studio/TopBar.vue'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { LocalSceneRepository } from '@/infrastructure/scenes'
import { useProjectStore } from '@/stores/project'
import { SessionKey } from '@/studio/context'
import { EditorSession } from '@/studio/EditorSession'
import { createShellState, panelLimits, ShellKey } from '@/studio/shell'
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
    <div
      class="studio__body"
      :style="{ '--left-width': `${shell.leftWidth}px`, '--right-width': `${shell.rightWidth}px` }"
    >
      <div v-if="session?.ui.ready && !preview" class="studio__left">
        <LeftPanel class="studio__panel" />
        <ResizeHandle v-model="shell.leftWidth" edge="right" v-bind="panelLimits.left" />
      </div>
      <div class="studio__center">
        <StudioViewport ref="viewport" />
        <BottomDock v-if="session?.ui.ready && !preview" />
      </div>
      <div v-if="session?.ui.ready && !preview" class="studio__right">
        <InspectorPanel class="studio__panel" />
        <ResizeHandle v-model="shell.rightWidth" edge="left" v-bind="panelLimits.right" />
      </div>
    </div>
    <StatusBar v-if="session" />
    <StudioDialogs v-if="session?.ui.ready" />
    <ReplaceModelDialog v-if="session?.ui.ready" />
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
  grid-template-columns: var(--left-width) minmax(0, 1fr) var(--right-width);
}
.studio.is-preview .studio__body {
  grid-template-columns: minmax(0, 1fr);
}
.studio.is-preview .studio__center {
  grid-column: 1;
}
.studio__left {
  position: relative;
  display: flex;
  min-height: 0;
  grid-column: 1;
  border-right: 1px solid var(--s-line);
}
.studio__panel {
  min-width: 0;
  flex: 1;
}
.studio__right {
  position: relative;
  display: flex;
  min-height: 0;
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
