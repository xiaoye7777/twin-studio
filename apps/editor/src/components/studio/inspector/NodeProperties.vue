<script setup lang="ts">
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDownToLine,
  Copy,
  Group,
  RotateCcw,
} from 'lucide-vue-next'
import { computed } from 'vue'
import type { SceneNodeV2 } from '@twin-studio/core'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiText from '@/components/ui/UiText.vue'
import { nodeKindLabels, useSession } from '@/studio/context'
import ModelFields from './properties/ModelFields.vue'
import PrimitiveFields from './properties/PrimitiveFields.vue'
import PathFields from './properties/PathFields.vue'
import AreaFields from './properties/AreaFields.vue'
import LabelFields from './properties/LabelFields.vue'
import LightFields from './properties/LightFields.vue'
import GroupFields from './properties/GroupFields.vue'
import { useShell } from '@/studio/shell'

const props = defineProps<{ nodes: SceneNodeV2[] }>()
const session = useSession()
const shell = useShell()
const node = computed(() => (props.nodes.length === 1 ? props.nodes[0]! : null))
const axes = [
  { label: 'X', color: 'var(--s-x)' },
  { label: 'Y', color: 'var(--s-y)' },
  { label: 'Z', color: 'var(--s-z)' },
] as const
const deg = (rad: number) => (rad * 180) / Math.PI
const rad = (value: number) => (value * Math.PI) / 180

function setTransform(part: 'position' | 'rotation' | 'scale', axis: number, value: number): void {
  const n = node.value
  if (!n) return
  session.nodes.updateNode(
    n.id,
    target => {
      target.transform[part][axis] = part === 'rotation' ? rad(value) : value
    },
    part === 'position' ? '移动' : part === 'rotation' ? '旋转' : '缩放',
    `transform:${n.id}:${part}:${axis}`,
  )
}

const commit = () => session.commit()

const allVisible = computed(() => props.nodes.every(item => item.visible))
const allLocked = computed(() => props.nodes.every(item => item.locked))
</script>

<template>
  <div class="props" data-testid="node-properties">
    <!-- Identity -->
    <div v-if="node" class="props__identity">
      <UiText
        :model-value="node.name"
        placeholder="名称"
        data-testid="node-name"
        @commit="session.nodes.rename(node.id, $event)"
      />
      <span class="s-badge">{{ nodeKindLabels[node.kind] }}</span>
    </div>

    <!-- Transform -->
    <UiSection v-if="node" title="变换">
      <template #actions>
        <button
          class="s-icon-btn"
          title="重置变换"
          @click="
            session.nodes.updateNode(
              node.id,
              n => void (n.transform = { position: n.transform.position, rotation: [0, 0, 0], scale: [1, 1, 1] }),
              '重置变换',
            )
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
          :model-value="node.transform.position[index]!"
          :step="0.1"
          :precision="3"
          :data-testid="`position-${axis.label.toLowerCase()}`"
          @update="setTransform('position', index, $event)"
          @commit="commit"
        />
      </UiRow>
      <UiRow label="旋转">
        <UiNumber
          v-for="(axis, index) in axes"
          :key="axis.label"
          :label="axis.label"
          :label-color="axis.color"
          :model-value="deg(node.transform.rotation[index]!)"
          :step="1"
          :precision="1"
          unit="°"
          @update="setTransform('rotation', index, $event)"
          @commit="commit"
        />
      </UiRow>
      <UiRow label="缩放">
        <UiNumber
          v-for="(axis, index) in axes"
          :key="axis.label"
          :label="axis.label"
          :label-color="axis.color"
          :model-value="node.transform.scale[index]!"
          :step="0.01"
          :precision="3"
          @update="setTransform('scale', index, $event)"
          @commit="commit"
        />
      </UiRow>
    </UiSection>

    <!-- Multi-selection tools -->
    <UiSection v-if="nodes.length > 1" title="对齐与分布">
      <div class="props__tools">
        <button class="s-icon-btn" title="左对齐（X 最小）" @click="session.nodes.align(0, 'min')">
          <AlignStartVertical :size="15" />
        </button>
        <button class="s-icon-btn" title="X 居中" @click="session.nodes.align(0, 'center')">
          <AlignCenterVertical :size="15" />
        </button>
        <button class="s-icon-btn" title="右对齐（X 最大）" @click="session.nodes.align(0, 'max')">
          <AlignEndVertical :size="15" />
        </button>
        <span class="props__tools-sep" />
        <button class="s-icon-btn" title="前对齐（Z 最小）" @click="session.nodes.align(2, 'min')">
          <AlignStartHorizontal :size="15" />
        </button>
        <button class="s-icon-btn" title="Z 居中" @click="session.nodes.align(2, 'center')">
          <AlignCenterHorizontal :size="15" />
        </button>
        <button class="s-icon-btn" title="后对齐（Z 最大）" @click="session.nodes.align(2, 'max')">
          <AlignEndHorizontal :size="15" />
        </button>
        <span class="props__tools-sep" />
        <button class="s-icon-btn" title="沿 X 均匀分布" @click="session.nodes.distribute(0)">
          <AlignHorizontalDistributeCenter :size="15" />
        </button>
        <button class="s-icon-btn" title="沿 Z 均匀分布" @click="session.nodes.distribute(2)">
          <AlignVerticalDistributeCenter :size="15" />
        </button>
      </div>
      <div class="s-buttons">
        <button class="s-btn" @click="session.nodes.dropToGround()"><ArrowDownToLine :size="13" />放到地面</button>
        <button class="s-btn" @click="session.nodes.groupSelection()"><Group :size="13" />组合</button>
        <button class="s-btn" @click="shell.dialog = 'array'"><Copy :size="13" />阵列</button>
      </div>
      <p class="s-note s-hint">批量绑定设备：切换到「数据」页签。</p>
    </UiSection>

    <!-- Display -->
    <UiSection title="显示">
      <UiRow label="可见">
        <UiSwitch
          :model-value="allVisible"
          @update:model-value="session.nodes.setVisible(session.selection.value, $event)"
        />
      </UiRow>
      <UiRow label="锁定" hint="锁定后无法在视口中选中或移动">
        <UiSwitch
          :model-value="allLocked"
          @update:model-value="session.nodes.setLocked(session.selection.value, $event)"
        />
      </UiRow>
      <div v-if="node" class="s-buttons">
        <button class="s-btn" @click="session.nodes.dropToGround()"><ArrowDownToLine :size="13" />放到地面</button>
        <button class="s-btn" @click="shell.dialog = 'array'"><Copy :size="13" />阵列复制</button>
      </div>
    </UiSection>

    <!-- 按对象类型显示各自的属性（每种一个组件，在 properties/ 目录） -->
    <ModelFields v-if="node?.kind === 'model'" :node="node" />
    <PrimitiveFields v-else-if="node?.kind === 'primitive'" :node="node" />
    <PathFields v-else-if="node?.kind === 'path'" :node="node" />
    <AreaFields v-else-if="node?.kind === 'area'" :node="node" />
    <LabelFields v-else-if="node?.kind === 'label'" :node="node" />
    <LightFields v-else-if="node?.kind === 'light'" :node="node" />
    <GroupFields v-else-if="node?.kind === 'group'" :node="node" />
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
.s-value {
  overflow: hidden;
  color: var(--s-fg-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.props__tools {
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 0 10px 6px;
}
.props__tools-sep {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: var(--s-line-2);
}
.s-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 12px 2px;
}
.props__note {
  margin: 4px 0 0;
  padding: 0 12px;
}
</style>
