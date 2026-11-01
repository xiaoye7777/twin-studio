<script setup lang="ts">
import { type SceneNodeV2, type PrimitiveShape } from '@twin-studio/core'
import UiColor from '@/components/ui/UiColor.vue'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSlider from '@/components/ui/UiSlider.vue'
import SurfacePattern from '../SurfacePattern.vue'
import { useNodePatch } from './useNodePatch'

/** 基本体的属性。 */
const props = defineProps<{ node: Extract<SceneNodeV2, { kind: 'primitive' }> }>()
const { patch, commit } = useNodePatch(() => props.node)
const shapeOptions: Array<{ value: PrimitiveShape; label: string }> = [
  { value: 'box', label: '立方' },
  { value: 'plane', label: '平面' },
  { value: 'cylinder', label: '圆柱' },
  { value: 'sphere', label: '球' },
  { value: 'cone', label: '锥' },
]
</script>

<template>
  <UiSection title="几何体">
    <UiRow label="形状">
      <UiSegmented
        :model-value="node.primitive.shape"
        :options="shapeOptions"
        @update:model-value="patch('primitive', n => void (n.primitive.shape = $event))"
      />
    </UiRow>
    <UiRow v-if="['box', 'plane'].includes(node.primitive.shape)" label="宽 × 长">
      <UiNumber
        label="W"
        :model-value="node.primitive.width ?? 4"
        :min="0.01"
        @update="patch('primitive', n => void (n.primitive.width = $event), 'width')"
        @commit="commit"
      />
      <UiNumber
        :label="node.primitive.shape === 'plane' ? 'L' : 'D'"
        :model-value="(node.primitive.shape === 'plane' ? node.primitive.height : node.primitive.depth) ?? 4"
        :min="0.01"
        @update="
          patch(
            'primitive',
            n => {
              if (n.primitive.shape === 'plane') n.primitive.height = $event
              else n.primitive.depth = $event
            },
            'depth',
          )
        "
        @commit="commit"
      />
    </UiRow>
    <UiRow v-if="['box', 'cylinder', 'cone'].includes(node.primitive.shape)" label="高度">
      <UiNumber
        :model-value="node.primitive.height ?? 3"
        :min="0.01"
        unit="m"
        @update="patch('primitive', n => void (n.primitive.height = $event), 'height')"
        @commit="commit"
      />
    </UiRow>
    <UiRow v-if="['cylinder', 'sphere', 'cone'].includes(node.primitive.shape)" label="半径">
      <UiNumber
        :model-value="(node.primitive.shape === 'cone' ? node.primitive.radiusBottom : node.primitive.radiusTop) ?? 1.5"
        :min="0.01"
        unit="m"
        @update="
          patch(
            'primitive',
            n => {
              if (n.primitive.shape === 'cone') n.primitive.radiusBottom = $event
              else {
                n.primitive.radiusTop = $event
                if (n.primitive.shape === 'cylinder') n.primitive.radiusBottom = $event
              }
            },
            'radius',
          )
        "
        @commit="commit"
      />
    </UiRow>
  </UiSection>
  <UiSection title="材质">
    <UiRow label="颜色">
      <UiColor
        :model-value="node.primitive.color"
        @update="patch('primitive', n => void (n.primitive.color = $event), 'color')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="不透明度">
      <UiSlider
        :model-value="node.primitive.opacity ?? 1"
        :min="0"
        :max="1"
        @update="patch('primitive', n => void (n.primitive.opacity = $event), 'opacity')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="自发光" hint="夜景下配合泛光效果最明显">
      <UiSlider
        :model-value="node.primitive.emissive ?? 0"
        :min="0"
        :max="1"
        @update="patch('primitive', n => void (n.primitive.emissive = $event), 'emissive')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="金属度">
      <UiSlider
        :model-value="node.primitive.metalness ?? 0.1"
        :min="0"
        :max="1"
        @update="patch('primitive', n => void (n.primitive.metalness = $event), 'metalness')"
        @commit="commit"
      />
    </UiRow>
    <UiRow label="粗糙度">
      <UiSlider
        :model-value="node.primitive.roughness ?? 0.6"
        :min="0"
        :max="1"
        @update="patch('primitive', n => void (n.primitive.roughness = $event), 'roughness')"
        @commit="commit"
      />
    </UiRow>
    <SurfacePattern
      :pattern="node.primitive.pattern"
      @update="(pattern, key) => patch('primitive', n => void (n.primitive.pattern = pattern), key)"
      @commit="commit"
    />
  </UiSection>
</template>
