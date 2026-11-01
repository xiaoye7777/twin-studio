<script setup lang="ts">
import { type SceneNodeV2 } from '@twin-studio/core'
import UiColor from '@/components/ui/UiColor.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSlider from '@/components/ui/UiSlider.vue'
import UiText from '@/components/ui/UiText.vue'
import SurfacePattern from '../SurfacePattern.vue'
import { useNodePatch } from './useNodePatch'

/** 区域的属性。 */
const props = defineProps<{ node: Extract<SceneNodeV2, { kind: 'area' }> }>()
const { patch, commit } = useNodePatch(() => props.node)
</script>

<template>
  <UiSection title="区域">
    <UiRow label="名称标注">
      <UiText
        :model-value="node.area.label"
        placeholder="区域中央显示的文字"
        @commit="patch('area', n => void (n.area.label = $event))"
      />
    </UiRow>
    <UiRow label="颜色">
      <UiColor
        :model-value="node.area.color"
        @update="patch('area', n => void (n.area.color = $event), 'color')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="不透明度">
      <UiSlider
        :model-value="node.area.opacity"
        :min="0"
        :max="1"
        @update="patch('area', n => void (n.area.opacity = $event), 'opacity')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="光墙高度">
      <UiSlider
        :model-value="node.area.wallHeight"
        :min="0"
        :max="30"
        :step="0.5"
        unit="m"
        @update="patch('area', n => void (n.area.wallHeight = $event), 'wall')"
        @commit="commit"
      />
    </UiRow>
    <SurfacePattern
      :pattern="node.area.pattern"
      @update="(pattern, key) => patch('area', n => void (n.area.pattern = pattern), key)"
      @commit="commit"
    />
    <UiRow label="顶点"
      ><span class="s-value">{{ node.area.points.length }} 个顶点</span></UiRow
    >
  </UiSection>
</template>
