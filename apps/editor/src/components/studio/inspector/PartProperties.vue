<script setup lang="ts">
import { CornerLeftUp, RotateCcw, Trash2, Undo2 } from 'lucide-vue-next'
import { computed } from 'vue'
import type { PartRef } from '@/studio/EditorSession'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'
import PartMaterial from './PartMaterial.vue'

const props = defineProps<{ part: PartRef }>()
const session = useSession()
const axes = [
  { label: 'X', color: 'var(--s-x)' },
  { label: 'Y', color: 'var(--s-y)' },
  { label: 'Z', color: 'var(--s-z)' },
] as const
const deg = (rad: number) => (rad * 180) / Math.PI
const rad = (value: number) => (value * Math.PI) / 180

const model = computed(() => session.node(props.part.nodeId))
const name = computed(() => session.partName(props.part.nodeId, props.part.assetNodeId))
const override = computed(() => session.partOverride(props.part.nodeId, props.part.assetNodeId))
const transform = computed(() => session.partTransform(props.part.nodeId, props.part.assetNodeId))
const visible = computed(() => override.value?.visible !== false)

function setTransform(kind: 'position' | 'rotation' | 'scale', axis: number, value: number): void {
  const current = transform.value
  if (!current) return
  session.updatePart(
    props.part.nodeId,
    props.part.assetNodeId,
    item => {
      const next = structuredClone({ ...current })
      next[kind][axis] = kind === 'rotation' ? rad(value) : value
      item.transform = next
    },
    kind === 'position' ? '移动部件' : kind === 'rotation' ? '旋转部件' : '缩放部件',
    `part-transform:${props.part.nodeId}:${props.part.assetNodeId}:${kind}:${axis}`,
  )
}

function rename(value: string): void {
  const trimmed = value.trim()
  session.updatePart(
    props.part.nodeId,
    props.part.assetNodeId,
    item => void (item.name = trimmed || undefined),
    '重命名部件',
  )
}
</script>

<template>
  <div class="props" data-testid="part-properties">
    <div class="part__crumb">
      <button
        class="s-btn s-btn--sm"
        title="回到整个模型（Esc）"
        data-testid="part-parent"
        @click="session.selectParent()"
      >
        <CornerLeftUp :size="12" />{{ model?.name }}
      </button>
      <span class="s-hint">数据、特效、交互页签现在作用于这个部件</span>
    </div>
    <div class="props__identity">
      <UiText :model-value="name" placeholder="名称" data-testid="part-name" @commit="rename" />
      <span class="s-badge">部件</span>
    </div>

    <UiSection v-if="transform" title="变换（相对上级）">
      <template #actions>
        <button
          v-if="override?.transform"
          class="s-icon-btn"
          title="恢复导入时的位置"
          @click="
            session.updatePart(part.nodeId, part.assetNodeId, item => void (item.transform = undefined), '重置部件变换')
          "
        >
          <RotateCcw :size="13" />
        </button>
      </template>
      <UiRow label="位置">
        <UiNumber
          v-for="(axis, index) in axes"
          :key="axis.label"
          :label="axis.label"
          :label-color="axis.color"
          :model-value="transform.position[index]!"
          :step="0.05"
          :precision="3"
          :data-testid="`part-position-${axis.label.toLowerCase()}`"
          @update="setTransform('position', index, $event)"
          @commit="session.commit()"
        />
      </UiRow>
      <UiRow label="旋转">
        <UiNumber
          v-for="(axis, index) in axes"
          :key="axis.label"
          :label="axis.label"
          :label-color="axis.color"
          :model-value="deg(transform.rotation[index]!)"
          :step="1"
          :precision="1"
          unit="°"
          @update="setTransform('rotation', index, $event)"
          @commit="session.commit()"
        />
      </UiRow>
      <UiRow label="缩放">
        <UiNumber
          v-for="(axis, index) in axes"
          :key="axis.label"
          :label="axis.label"
          :label-color="axis.color"
          :model-value="transform.scale[index]!"
          :step="0.01"
          :precision="3"
          @update="setTransform('scale', index, $event)"
          @commit="session.commit()"
        />
      </UiRow>
    </UiSection>

    <UiSection title="显示">
      <UiRow label="可见">
        <UiSwitch
          :model-value="visible"
          data-testid="part-visible"
          @update:model-value="session.setPartVisible(part.nodeId, part.assetNodeId, $event)"
        />
      </UiRow>
      <div class="props__buttons">
        <button
          class="s-btn"
          :disabled="!override"
          title="名称、位置、显示和材质恢复为模型文件中的样子"
          @click="session.resetPart(part.nodeId, part.assetNodeId)"
        >
          <Undo2 :size="13" />恢复部件
        </button>
        <button
          class="s-btn s-btn--danger"
          data-testid="part-delete"
          @click="session.deleteParts(part.nodeId, [part.assetNodeId])"
        >
          <Trash2 :size="13" />删除部件
        </button>
      </div>
    </UiSection>

    <PartMaterial :node-id="part.nodeId" :asset-node-id="part.assetNodeId" title="材质" />
  </div>
</template>

<style scoped>
.props__identity {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--s-line);
}
.props__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 12px 2px;
}
.part__crumb {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 12px 2px;
}
.part__crumb .s-hint {
  font-size: 11px;
}
</style>
