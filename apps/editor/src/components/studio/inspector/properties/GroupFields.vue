<script setup lang="ts">
import { computed } from 'vue'
import { type SceneNodeV2 } from '@twin-studio/core'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import { useSession } from '@/studio/context'

/** 分组的属性。 */
const props = defineProps<{ node: Extract<SceneNodeV2, { kind: 'group' }> }>()
const session = useSession()
const childCount = computed(() => session.doc.value.nodes.filter(item => item.parentId === props.node.id).length)
</script>

<template>
  <UiSection title="分组">
    <UiRow label="成员"
      ><span class="s-value">{{ childCount }} 个对象</span></UiRow
    >
    <p class="s-note s-hint">分组可作为图层：在导览步骤或交互中整体显示 / 隐藏，大屏也可通过 SDK 控制显隐。</p>
    <div class="s-buttons">
      <button class="s-btn" @click="session.nodes.ungroupSelection()">取消组合</button>
    </div>
  </UiSection>
</template>
