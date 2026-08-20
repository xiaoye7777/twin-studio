<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { MathUtils } from 'three'
import { getEditorMetadata } from '@/editor/editorMetadata'
import { captureTransform } from '@/editor/history'
import type { TransformState } from '@/editor/history'
import type { InspectorFormState, Vector3FormValue } from '@/editor/types'
import { useEditorStore } from '@/stores/editor'

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
  { key: 'position', label: 'Position', step: 0.1, precision: 3 },
  { key: 'rotation', label: 'Rotation', step: 1, precision: 2, unit: '°' },
  { key: 'scale', label: 'Scale', step: 0.1, precision: 3, min: 0.001 },
]

const editorStore = useEditorStore()
const selectedMetadata = computed(() =>
  editorStore.selectedObject ? getEditorMetadata(editorStore.selectedObject) : null,
)
const form = reactive<InspectorFormState>({
  name: '',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
})
let nameEditBefore = ''
let transformEditBefore: TransformState | null = null

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
function beginTransformEdit(): void {
  const object = editorStore.selectedObject
  if (object && !transformEditBefore) transformEditBefore = captureTransform(object)
}
function commitTransformEdit(): void {
  const object = editorStore.selectedObject
  if (object && transformEditBefore) editorStore.commitTransform(object, transformEditBefore, captureTransform(object))
  transformEditBefore = null
}

function updateTransformValue(
  section: TransformSection,
  axis: Axis,
  value: number | undefined,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) return

  form[section][axis] = section === 'scale' ? Math.max(value, 0.001) : value
  applyTransformToSelectedObject()
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
    class="w-[280px] shrink-0 border-l border-slate-700 bg-slate-800 text-slate-300"
  >
    <div class="flex h-10 items-center border-b border-slate-700 px-4 text-xs font-semibold text-slate-200">
      属性
    </div>

    <div
      v-if="!editorStore.selectedObject"
      data-testid="inspector-empty"
      class="flex h-[260px] flex-col items-center justify-center px-6 text-center"
    >
      <div class="mb-3 grid h-10 w-10 place-items-center rounded-lg border border-slate-700 bg-slate-900 text-lg text-slate-600">
        ◇
      </div>
      <p class="text-xs text-slate-400">未选择对象</p>
      <p class="mt-1 text-[10px] leading-4 text-slate-600">从场景或视口中选择一个对象</p>
    </div>

    <div v-else data-testid="inspector-form" class="space-y-5 p-4">
      <label class="block">
        <span class="mb-2 block text-xs text-slate-400">名称</span>
        <el-input
          data-testid="inspector-name"
          :model-value="form.name"
          size="small"
          @update:model-value="updateName"
          @focus="nameEditBefore = editorStore.selectedObject?.name ?? ''"
          @change="commitName"
        />
      </label>

      <div class="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
        <p class="text-[10px] uppercase tracking-wide text-slate-500">BID</p>
        <p data-testid="inspector-bid" class="mt-1 truncate font-mono text-[10px] text-sky-300">
          {{ editorStore.selectedBid ?? '—' }}
        </p>
      </div>

      <div class="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
        <p class="text-[10px] uppercase tracking-wide text-slate-500">Asset Node ID</p>
        <p data-testid="inspector-asset-node-id" class="mt-1 truncate font-mono text-[10px] text-slate-300">
          {{ editorStore.selectedObject.userData.assetNodeId ?? '—' }}
        </p>
      </div>

      <div v-for="field in transformFields" :key="field.key">
        <p class="mb-2 flex items-center justify-between text-xs font-medium text-slate-300">
          <span>{{ field.label }}</span>
          <span v-if="field.unit" class="text-[10px] font-normal text-slate-600">{{ field.unit }}</span>
        </p>
        <div class="grid grid-cols-3 gap-1.5">
          <label v-for="axis in axes" :key="axis" class="min-w-0">
            <span class="mb-1 block text-[10px] font-medium uppercase text-slate-500">{{ axis }}</span>
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
              @focus="beginTransformEdit"
              @change="commitTransformEdit"
            />
          </label>
        </div>
      </div>
      <el-button data-testid="reset-transform" size="small" class="w-full" @click="editorStore.resetSelectedTransform()">重置变换</el-button>
    </div>
  </aside>
</template>
