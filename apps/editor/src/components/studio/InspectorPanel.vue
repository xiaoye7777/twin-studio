<script setup lang="ts">
import { computed } from 'vue'
import { nodeKindLabels, useSession } from '@/studio/context'
import { useShell } from '@/studio/shell'
import NodeData from './inspector/NodeData.vue'
import NodeEffects from './inspector/NodeEffects.vue'
import NodeInteractions from './inspector/NodeInteractions.vue'
import NodeProperties from './inspector/NodeProperties.vue'
import SceneData from './inspector/SceneData.vue'
import SceneEnvironment from './inspector/SceneEnvironment.vue'
import ScenePresentation from './inspector/ScenePresentation.vue'

const session = useSession()
const shell = useShell()
const nodes = computed(() => session.selection.value.flatMap(id => session.node(id) ?? []))
const title = computed(() => {
  if (!nodes.value.length) return '场景'
  if (nodes.value.length > 1) return `已选 ${nodes.value.length} 个对象`
  return nodeKindLabels[nodes.value[0]!.kind] ?? '对象'
})
const nodeTabs = [
  { id: 'properties', label: '属性' },
  { id: 'data', label: '数据' },
  { id: 'effects', label: '特效' },
  { id: 'interactions', label: '交互' },
] as const
const sceneTabs = [
  { id: 'environment', label: '环境' },
  { id: 'data', label: '数据' },
  { id: 'presentation', label: '放映' },
] as const
</script>

<template>
  <aside class="s-panel inspector" data-testid="inspector">
    <div class="s-panel-head">
      <template v-if="nodes.length">
        <button
          v-for="tab in nodeTabs"
          :key="tab.id"
          class="s-tab"
          :class="{ 'is-active': shell.nodeTab === tab.id }"
          :data-testid="`inspector-tab-${tab.id}`"
          @click="shell.nodeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </template>
      <template v-else>
        <button
          v-for="tab in sceneTabs"
          :key="tab.id"
          class="s-tab"
          :class="{ 'is-active': shell.sceneTab === tab.id }"
          :data-testid="`scene-tab-${tab.id}`"
          @click="shell.sceneTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </template>
      <span class="inspector__title">{{ title }}</span>
    </div>
    <div class="s-scroll">
      <template v-if="nodes.length">
        <NodeProperties v-if="shell.nodeTab === 'properties'" :nodes="nodes" />
        <NodeData v-else-if="shell.nodeTab === 'data'" :nodes="nodes" />
        <NodeEffects v-else-if="shell.nodeTab === 'effects'" :nodes="nodes" />
        <NodeInteractions v-else :nodes="nodes" />
      </template>
      <template v-else>
        <SceneEnvironment v-if="shell.sceneTab === 'environment'" />
        <SceneData v-else-if="shell.sceneTab === 'data'" />
        <ScenePresentation v-else />
      </template>
    </div>
  </aside>
</template>

<style scoped>
.inspector__title {
  overflow: hidden;
  margin-left: auto;
  padding-right: 6px;
  color: var(--s-fg-3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
