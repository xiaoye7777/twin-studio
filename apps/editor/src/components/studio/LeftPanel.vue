<script setup lang="ts">
import { useShell } from '@/studio/shell'
import AssetLibrary from './AssetLibrary.vue'
import SceneTree from './SceneTree.vue'

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
        :class="{ 'is-active': shell.leftTab === 'assets' }"
        data-testid="tab-assets"
        @click="shell.leftTab = 'assets'"
      >
        资源
      </button>
    </div>
    <SceneTree v-show="shell.leftTab === 'scene'" />
    <AssetLibrary v-if="shell.leftTab === 'assets'" />
  </aside>
</template>
