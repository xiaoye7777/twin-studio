<script setup lang="ts">
import EffectInspector from './EffectInspector.vue'
import VisualRuleSection from './VisualRuleSection.vue'
import InteractionSection from './InteractionSection.vue'
import { computed, reactive, watch } from 'vue'
import { MathUtils } from 'three'
import { getEditorMetadata } from '@twin-studio/core'
import { captureTransform } from '@/editor/history'
import type { InspectorFormState, Vector3FormValue } from '@/editor/types'
import { useEditorStore } from '@/stores/editor'
import TwinBindingSection from './TwinBindingSection.vue'
import InspectorSection from './InspectorSection.vue'
import { Pointer, RefreshLeft } from '@element-plus/icons-vue'

type TransformSection = 'position' | 'rotation' | 'scale'
type Axis = keyof Vector3FormValue

interface TransformField {
  key: TransformSection
  label: string
  step: number
  precision: number
  min?: number
  unit?: string
}

const axes: readonly Axis[] = ['x', 'y', 'z']
const transformFields: readonly TransformField[] = [
  { key: 'position', label: '位置', step: 0.1, precision: 3 },
  { key: 'rotation', label: '旋转', step: 1, precision: 2, unit: '°' },
  { key: 'scale', label: '缩放', step: 0.1, precision: 3, min: 0.001 },
]

const editorStore = useEditorStore()
const selectedMetadata = computed(() =>
  editorStore.selectedObject ? getEditorMetadata(editorStore.selectedObject) : null,
)
const kindLabel = computed(() => {
  const object = editorStore.selectedObject
  if (!object) return ''
  if (selectedMetadata.value?.kind === 'assetInstance') return '模型实例'
  if (selectedMetadata.value?.kind === 'primitive') return '几何体'
  return typeof object.userData.assetNodeId === 'string' ? '模型节点' : object.type
})
const form = reactive<InspectorFormState>({
  name: '',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
})
let nameEditBefore = ''

function copyVector(target: Vector3FormValue, source: readonly [number, number, number]): void {
  target.x = source[0]
  target.y = source[1]
  target.z = source[2]
}

function syncFormFromSelectedObject(): void {
  const object = editorStore.selectedObject
  if (!object) return

  form.name = object.name
  copyVector(form.position, [object.position.x, object.position.y, object.position.z])
  copyVector(form.rotation, [
    MathUtils.radToDeg(object.rotation.x),
    MathUtils.radToDeg(object.rotation.y),
    MathUtils.radToDeg(object.rotation.z),
  ])
  copyVector(form.scale, [object.scale.x, object.scale.y, object.scale.z])
}

function updateName(value: string): void {
  form.name = value
  const object = editorStore.selectedObject
  if (!object) return

  object.name = value
  editorStore.notifySceneChanged(object)
}
function commitName(): void {
  const object = editorStore.selectedObject
  if (object && nameEditBefore !== object.name) editorStore.commitRename(object, nameEditBefore, object.name)
}
function updateTransformValue(section: TransformSection, axis: Axis, value: number | undefined): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) return

  const object = editorStore.selectedObject
  if (!object) return
  const before = captureTransform(object)
  form[section][axis] = section === 'scale' ? Math.max(value, 0.001) : value
  applyTransformToSelectedObject()
  editorStore.commitTransform(object, before, captureTransform(object))
}

function applyTransformToSelectedObject(): void {
  const object = editorStore.selectedObject
  if (!object) return

  object.position.set(form.position.x, form.position.y, form.position.z)
  object.rotation.set(
    MathUtils.degToRad(form.rotation.x),
    MathUtils.degToRad(form.rotation.y),
    MathUtils.degToRad(form.rotation.z),
  )
  object.scale.set(form.scale.x, form.scale.y, form.scale.z)
  object.updateMatrix()
  object.updateMatrixWorld(true)
  editorStore.notifyTransformChanged('inspector', object)
}

watch(
  () => editorStore.selectedObject,
  () => syncFormFromSelectedObject(),
  { immediate: true },
)

watch(
  () => editorStore.transformRevision,
  () => {
    if (editorStore.transformChangeSource === 'gizmo') syncFormFromSelectedObject()
  },
  { flush: 'sync' },
)
</script>

<template>
  <aside
    data-testid="inspector-panel"
    :data-selected-bid="editorStore.selectedBid ?? ''"
    :data-position="`${form.position.x},${form.position.y},${form.position.z}`"
    :data-rotation-degrees="`${form.rotation.x},${form.rotation.y},${form.rotation.z}`"
    :data-scale="`${form.scale.x},${form.scale.y},${form.scale.z}`"
    :data-asset-id="selectedMetadata?.kind === 'assetInstance' ? selectedMetadata.assetId : ''"
    :data-instance-id="selectedMetadata?.kind === 'assetInstance' ? selectedMetadata.instanceId : ''"
    :data-node-id="selectedMetadata?.kind === 'primitive' ? selectedMetadata.nodeId : ''"
    class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-panel text-fg-2"
  >
    <div class="st-panel-header">
      <span>属性</span>
      <span v-if="kindLabel" class="ml-auto rounded-sm bg-raised px-1.5 py-px text-[10.5px] font-medium text-fg-2">{{
        kindLabel
      }}</span>
    </div>

    <div
      v-if="!editorStore.selectedObject"
      data-testid="inspector-empty"
      class="flex flex-1 flex-col items-center justify-center px-8 pb-16 text-center"
    >
      <div class="mb-3 grid h-10 w-10 place-items-center rounded-lg border border-line bg-field text-fg-3">
        <el-icon :size="18"><Pointer /></el-icon>
      </div>
      <p class="text-[12px] text-fg-2">未选择对象</p>
      <p class="mt-1 text-[11px] leading-5 text-fg-3">在场景列表或视口中点击对象，<br />即可编辑其属性、绑定与规则</p>
    </div>

    <div v-else data-testid="inspector-form" class="min-h-0 flex-1 overflow-y-auto">
      <div class="border-b border-line px-3 py-3">
        <el-input
          data-testid="inspector-name"
          aria-label="对象名称"
          :model-value="form.name"
          size="small"
          @update:model-value="updateName"
          @focus="nameEditBefore = editorStore.selectedObject?.name ?? ''"
          @change="commitName"
        />
      </div>

      <InspectorSection title="变换">
        <template #actions>
          <button
            data-testid="reset-transform"
            class="st-link flex items-center gap-1"
            type="button"
            title="恢复初始变换"
            @click="editorStore.resetSelectedTransform()"
          >
            <el-icon><RefreshLeft /></el-icon>重置
          </button>
        </template>
        <div v-for="field in transformFields" :key="field.key" class="grid grid-cols-[40px_1fr] items-center gap-2">
          <span class="text-[12px] text-fg-2">{{ field.label }}</span>
          <div class="grid grid-cols-3 gap-1">
            <label v-for="axis in axes" :key="axis" class="axis-field" :class="`axis-field--${axis}`">
              <span class="axis-field__tag">{{ axis.toUpperCase() }}</span>
              <el-input-number
                :data-testid="`inspector-${field.key}-${axis}`"
                :aria-label="`${field.label} ${axis.toUpperCase()}`"
                :model-value="form[field.key][axis]"
                :controls="false"
                :step="field.step"
                :precision="field.precision"
                :min="field.min"
                size="small"
                class="w-full!"
                @update:model-value="(value: number | undefined) => updateTransformValue(field.key, axis, value)"
              />
            </label>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="标识">
        <div class="id-row">
          <span>BID</span
          ><code data-testid="inspector-bid" :title="editorStore.selectedBid ?? ''">{{
            editorStore.selectedBid ?? '—'
          }}</code>
        </div>
        <div class="id-row">
          <span>节点 ID</span
          ><code data-testid="inspector-asset-node-id">{{
            editorStore.selectedObject.userData.assetNodeId ?? '—'
          }}</code>
        </div>
      </InspectorSection>

      <TwinBindingSection />
      <VisualRuleSection />
      <EffectInspector />
      <InteractionSection />
    </div>
  </aside>
</template>

<style scoped>
.axis-field {
  position: relative;
  min-width: 0;
}

.axis-field__tag {
  position: absolute;
  left: 1px;
  top: 1px;
  bottom: 1px;
  z-index: 1;
  display: grid;
  width: 16px;
  place-items: center;
  border-radius: 3px 0 0 3px;
  font-size: 9.5px;
  font-weight: 700;
  pointer-events: none;
}

.axis-field--x .axis-field__tag {
  color: var(--color-axis-x);
  background: rgb(208 103 92 / 0.12);
}
.axis-field--y .axis-field__tag {
  color: var(--color-axis-y);
  background: rgb(134 179 108 / 0.12);
}
.axis-field--z .axis-field__tag {
  color: var(--color-axis-z);
  background: rgb(106 147 207 / 0.12);
}

.axis-field :deep(.el-input__wrapper) {
  padding-left: 20px;
  padding-right: 6px;
}

.axis-field :deep(.el-input__inner) {
  text-align: left;
  font-family: var(--font-mono);
  font-size: 11px;
}

.id-row {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-fg-2);
}

.id-row code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--color-fg-2);
  user-select: all;
}
</style>
