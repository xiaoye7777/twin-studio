<script setup lang="ts">
import { type SceneNodeV2 } from '@twin-studio/core'
import UiColor from '@/components/ui/UiColor.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSlider from '@/components/ui/UiSlider.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiText from '@/components/ui/UiText.vue'
import { useNodePatch } from './useNodePatch'

/** 文字标签的属性。 */
const props = defineProps<{ node: Extract<SceneNodeV2, { kind: 'label' }> }>()
const { patch, commit } = useNodePatch(() => props.node)
</script>

<template>
  <UiSection title="标签">
    <UiRow label="文字" stack>
      <UiText :model-value="node.label.text" multiline @commit="patch('label', n => void (n.label.text = $event))" />
    </UiRow>
    <UiRow label="样式">
      <UiSegmented
        :model-value="node.label.style"
        :options="[
          { value: 'tag', label: '标牌' },
          { value: 'title', label: '大标题' },
          { value: 'pin', label: '气泡' },
        ]"
        @update:model-value="patch('label', n => void (n.label.style = $event))"
      />
    </UiRow>
    <UiRow label="文字色">
      <UiColor
        :model-value="node.label.color"
        @update="patch('label', n => void (n.label.color = $event), 'color')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="底色">
      <UiColor
        :model-value="node.label.background"
        @update="patch('label', n => void (n.label.background = $event), 'bg')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="大小">
      <UiSlider
        :model-value="node.label.size"
        :min="0.3"
        :max="4"
        :step="0.05"
        @update="patch('label', n => void (n.label.size = $event), 'size')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="引线">
      <UiSwitch
        :model-value="node.label.leader"
        @update:model-value="patch('label', n => void (n.label.leader = $event))"
      />
    </UiRow>
  </UiSection>
</template>
