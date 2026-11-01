<script setup lang="ts">
import { type SceneNodeV2 } from '@twin-studio/core'
import UiColor from '@/components/ui/UiColor.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSlider from '@/components/ui/UiSlider.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useNodePatch } from './useNodePatch'

/** 灯光的属性。 */
const props = defineProps<{ node: Extract<SceneNodeV2, { kind: 'light' }> }>()
const { patch, commit } = useNodePatch(() => props.node)
</script>

<template>
  <UiSection title="灯光">
    <UiRow label="类型">
      <UiSegmented
        :model-value="node.light.type"
        :options="[
          { value: 'point', label: '点光源' },
          { value: 'spot', label: '聚光灯' },
        ]"
        @update:model-value="patch('light', n => void (n.light.type = $event))"
      />
    </UiRow>
    <UiRow label="颜色">
      <UiColor
        :model-value="node.light.color"
        @update="patch('light', n => void (n.light.color = $event), 'color')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="强度">
      <UiSlider
        :model-value="node.light.intensity"
        :min="0"
        :max="2000"
        :step="10"
        :precision="0"
        @update="patch('light', n => void (n.light.intensity = $event), 'intensity')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="照射距离">
      <UiSlider
        :model-value="node.light.distance"
        :min="0"
        :max="200"
        :step="1"
        :precision="0"
        unit="m"
        @update="patch('light', n => void (n.light.distance = $event), 'distance')"
        @commit="commit"
      />
    </UiRow>
    <UiRow v-if="node.light.type === 'spot'" label="光锥角度">
      <UiSlider
        :model-value="node.light.angle"
        :min="5"
        :max="85"
        :step="1"
        :precision="0"
        unit="°"
        @update="patch('light', n => void (n.light.angle = $event), 'angle')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="投射阴影" hint="开销较大，建议只给关键灯光开启">
      <UiSwitch
        :model-value="node.light.castShadow"
        @update:model-value="patch('light', n => void (n.light.castShadow = $event))"
      />
    </UiRow>
  </UiSection>
</template>
