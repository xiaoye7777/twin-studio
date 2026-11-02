<script setup lang="ts">
import { useShell } from '@/studio/shell'
import SceneTree from './SceneTree.vue'
import ViewsPanel from './ViewsPanel.vue'

const shell = useShell()
</script>

<template>
  <aside class="s-panel">
    <div class="s-panel-head">
      <button
        class="s-tab"
        :class="{ 'is-active': shell.leftTab === 'scene' }"
        data-testid="tab-scene"
        @click="shell.leftTab = 'scene'"
      >
        场景
      </button>
      <button
        class="s-tab"
        :class="{ 'is-active': shell.leftTab === 'views' }"
        data-testid="tab-views"
        @click="shell.leftTab = 'views'"
      >
        视角
      </button>
    </div>
    <SceneTree v-show="shell.leftTab === 'scene'" />
    <ViewsPanel v-if="shell.leftTab === 'views'" />
  </aside>
</template>
