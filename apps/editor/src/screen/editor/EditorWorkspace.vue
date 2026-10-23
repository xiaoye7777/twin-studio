<script setup lang="ts">
import { provide } from 'vue'
import { ScreenRuntimeKey } from '../runtime/ScreenRuntime'
import EditorTopBar from './EditorTopBar.vue'
import Inspector from './Inspector.vue'
import LayersPanel from './LayersPanel.vue'
import ScreenCanvas from './ScreenCanvas.vue'
import { type ScreenEditorSession, ScreenSessionKey } from './session'
import ShortcutsDialog from './ShortcutsDialog.vue'
import WidgetLibrary from './WidgetLibrary.vue'

const props = defineProps<{ session: ScreenEditorSession }>()
provide(ScreenSessionKey, props.session)
provide(ScreenRuntimeKey, props.session.runtime)
const ui = props.session.ui
</script>

<template>
  <EditorTopBar />
  <div class="workspace">
    <aside class="workspace__left">
      <div class="workspace__tabs">
        <button
          class="s-tab"
          :class="{ 'is-active': ui.leftTab === 'widgets' }"
          data-testid="tab-widgets"
          @click="ui.leftTab = 'widgets'"
        >
          组件
        </button>
        <button
          class="s-tab"
          :class="{ 'is-active': ui.leftTab === 'layers' }"
          data-testid="tab-layers"
          @click="ui.leftTab = 'layers'"
        >
          图层 <small>{{ session.doc.value.widgets.length }}</small>
        </button>
      </div>
      <WidgetLibrary v-if="ui.leftTab === 'widgets'" />
      <LayersPanel v-else />
    </aside>
    <ScreenCanvas />
    <Inspector />
  </div>
  <ShortcutsDialog v-model="ui.shortcuts" />
</template>

<style scoped>
.workspace {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: 248px minmax(0, 1fr) 312px;
}
.workspace__left {
  display: flex;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid var(--s-line);
  background: var(--s-panel);
}
.workspace__tabs {
  display: flex;
  height: 38px;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  border-bottom: 1px solid var(--s-line);
}
.workspace__tabs small {
  color: var(--s-fg-3);
}
</style>
