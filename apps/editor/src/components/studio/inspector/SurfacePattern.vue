<script setup lang="ts">
import type { SurfacePatternV2 } from '@twin-studio/core'
import UiColor from '@/components/ui/UiColor.vue'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'

defineProps<{ pattern: SurfacePatternV2 | undefined }>()
const emit = defineEmits<{ update: [pattern: SurfacePatternV2 | undefined, key?: string]; commit: [] }>()

/** Kinds with a sensible default line colour and size, so picking one looks right straight away. */
const kinds: Array<{ value: string; label: string; color: string; scale: number }> = [
  { value: 'grid', label: '科技网格', color: '#38bdf8', scale: 4 },
  { value: 'tiles', label: '地砖', color: '#5b6068', scale: 1.2 },
  { value: 'stripes', label: '斜纹', color: '#f5c542', scale: 2 },
  { value: 'lawn', label: '草坪', color: '#b7e07a', scale: 3 },
  { value: 'asphalt', label: '沥青路面', color: '#3a3d42', scale: 2 },
  { value: 'water', label: '水面', color: '#bfe8ff', scale: 6 },
]

function choose(value: string): void {
  const kind = kinds.find(item => item.value === value)
  emit('update', kind ? { kind: kind.value, scale: kind.scale, color: kind.color } : undefined)
}
</script>

<template>
  <UiRow label="表面图案" hint="地面、道路、草坪、水面等；颜色为底色">
    <select
      class="s-select"
      :value="pattern?.kind ?? ''"
      data-testid="surface-pattern"
      @change="choose(($event.target as HTMLSelectElement).value)"
    >
      <option value="">无</option>
      <option v-for="kind in kinds" :key="kind.value" :value="kind.value">{{ kind.label }}</option>
    </select>
  </UiRow>
  <template v-if="pattern">
    <UiRow label="图案颜色">
      <UiColor
        :model-value="pattern.color"
        @update="emit('update', { ...pattern, color: $event }, 'pattern-color')"
        @commit="emit('commit')"
      />
    </UiRow>
    <UiRow label="图案尺寸" hint="每个重复单元的边长">
      <UiNumber
        :model-value="pattern.scale"
        :min="0.1"
        :max="200"
        :step="0.1"
        unit="m"
        @update="emit('update', { ...pattern, scale: $event }, 'pattern-scale')"
        @commit="emit('commit')"
      />
    </UiRow>
  </template>
</template>
