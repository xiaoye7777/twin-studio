<script setup lang="ts">
import { type SceneNodeV2 } from '@twin-studio/core'
import UiColor from '@/components/ui/UiColor.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSlider from '@/components/ui/UiSlider.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useNodePatch } from './useNodePatch'

/** 能流线（路径）的属性。 */
const props = defineProps<{ node: Extract<SceneNodeV2, { kind: 'path' }> }>()
const { patch, commit } = useNodePatch(() => props.node)
</script>

<template>
  <UiSection title="能流线">
    <UiRow label="样式">
      <UiSegmented
        :model-value="node.path.style"
        :options="[
          { value: 'flow', label: '流光管线' },
          { value: 'line', label: '地面流向' },
          { value: 'tube', label: '实体管道' },
        ]"
        @update:model-value="patch('path', n => void (n.path.style = $event))"
      />
    </UiRow>
    <UiRow label="颜色">
      <UiColor
        :model-value="node.path.color"
        @update="patch('path', n => void (n.path.color = $event), 'color')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="宽度">
      <UiSlider
        :model-value="node.path.width"
        :min="0.05"
        :max="10"
        :step="0.05"
        unit="m"
        @update="patch('path', n => void (n.path.width = $event), 'width')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="流速" hint="负值表示反向流动">
      <UiSlider
        :model-value="node.path.speed"
        :min="-10"
        :max="10"
        :step="0.1"
        @update="patch('path', n => void (n.path.speed = $event), 'speed')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="不透明度">
      <UiSlider
        :model-value="node.path.opacity"
        :min="0"
        :max="1"
        @update="patch('path', n => void (n.path.opacity = $event), 'opacity')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="闭合">
      <UiSwitch
        :model-value="node.path.closed"
        @update:model-value="patch('path', n => void (n.path.closed = $event))"
      />
    </UiRow>
    <UiRow label="路径点"
      ><span class="s-value">{{ node.path.points.length }} 个点</span></UiRow
    >
  </UiSection>
</template>
