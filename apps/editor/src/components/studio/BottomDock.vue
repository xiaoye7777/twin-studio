<script setup lang="ts">
/** 视口下方的面板：资源库。可以收起，也可以拖动上沿调整高度。 */
import { panelLimits, useShell } from '@/studio/shell'
import AssetLibrary from './AssetLibrary.vue'
import ResizeHandle from './ResizeHandle.vue'

const shell = useShell()
</script>

<template>
  <section class="dock" :class="{ 'is-open': shell.dockOpen }" data-testid="bottom-dock">
    <ResizeHandle v-if="shell.dockOpen" v-model="shell.dockHeight" edge="top" v-bind="panelLimits.dock" />
    <AssetLibrary />
  </section>
</template>

<style scoped>
.dock {
  position: relative;
  flex-shrink: 0;
  border-top: 1px solid var(--s-line);
  background: var(--s-wash-bar), var(--s-panel);
}
</style>
