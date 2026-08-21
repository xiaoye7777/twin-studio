<script setup lang="ts">
import { computed, markRaw, nextTick, ref, watch } from 'vue'
import { Link as LinkIcon } from '@element-plus/icons-vue'
import type { Object3D } from 'three'
import type { SceneTreeNode } from '@/editor/types'
import { bindingTargetFromObject } from '@/editor/services/BindingTargetResolver'
import { useEditorStore } from '@/stores/editor'
import { useTwinStore } from '@/stores/twin'

interface TreeController {
  setCurrentKey(key: string | null, shouldAutoExpandParent?: boolean): void
}

type ObjectWithLightFlag = Object3D & { isLight?: boolean }

const excludedObjectTypes = new Set([
  'GridHelper',
  'AxesHelper',
  'AmbientLight',
  'DirectionalLight',
  'HemisphereLight',
  'PointLight',
  'RectAreaLight',
  'SpotLight',
])

const editorStore = useEditorStore()
const twinStore = useTwinStore()
const treeRef = ref<TreeController | null>(null)

function isEditorInfrastructure(object: Object3D): boolean {
  const objectWithLightFlag = object as ObjectWithLightFlag

  return (
    object.userData.editorInternal === true ||
    objectWithLightFlag.isLight === true ||
    excludedObjectTypes.has(object.type) ||
    object.type.includes('TransformControls')
  )
}

function buildTreeNode(object: Object3D): SceneTreeNode | null {
  if (isEditorInfrastructure(object)) return null

  const bid = typeof object.userData.bid === 'string' ? object.userData.bid : undefined
  const children = object.children
    .map(buildTreeNode)
    .filter((child): child is SceneTreeNode => child !== null)

  const target = bindingTargetFromObject(object)
  return {
    id: object.uuid,
    bid,
    name: object.name || object.type,
    type: object.type,
    object: markRaw(object),
    children,
    twinBound: target ? twinStore.getBindingByTarget(target) !== null : false,
  }
}

const treeData = computed<SceneTreeNode[]>(() => {
  editorStore.sceneRevision
  twinStore.bindingRevision
  return editorStore.sceneRoots
    .map(buildTreeNode)
    .filter((node): node is SceneTreeNode => node !== null)
})

const selectedNodeKey = computed(() => editorStore.selectedObject?.uuid ?? null)

function isSceneTreeNode(value: unknown): value is SceneTreeNode {
  return typeof value === 'object' && value !== null && 'object' in value
}

function handleNodeClick(value: unknown): void {
  if (isSceneTreeNode(value)) editorStore.selectObject(value.object)
}

watch(
  [selectedNodeKey, () => editorStore.sceneRevision],
  async () => {
    await nextTick()
    treeRef.value?.setCurrentKey(selectedNodeKey.value, false)
  },
  { immediate: true },
)
</script>

<template>
  <aside
    data-testid="scene-hierarchy"
    :data-selected-bid="editorStore.selectedBid ?? ''"
    :data-node-count="treeData.length"
    class="w-60 shrink-0 border-r border-slate-700 bg-slate-800 text-slate-300"
  >
    <div class="flex h-10 items-center border-b border-slate-700 px-4 text-xs font-semibold text-slate-200">
      场景
    </div>

    <div class="p-2 text-xs">
      <div class="mb-1 flex h-8 items-center gap-2 rounded-md px-2 font-medium text-slate-300">
        <span class="text-[10px] text-slate-500">▼</span>
        <span>Scene</span>
      </div>

      <el-tree
        ref="treeRef"
        :data="treeData"
        node-key="id"
        :props="{ children: 'children', label: 'name' }"
        :current-node-key="selectedNodeKey"
        :expand-on-click-node="false"
        default-expand-all
        highlight-current
        class="scene-tree bg-transparent"
        @node-click="handleNodeClick"
      >
        <template #default="{ data }">
          <div
            :data-testid="`hierarchy-node-${data.id}`"
            :data-bid="data.bid ?? ''"
            class="flex min-w-0 flex-1 items-center gap-2"
          >
            <span class="h-3 w-3 shrink-0 rounded-sm border border-sky-400/70 bg-sky-500/20" />
            <span class="min-w-0 flex-1 truncate">{{ data.name }}</span>
            <el-tooltip v-if="data.twinBound" content="已绑定设备" placement="top">
              <el-icon :data-testid="`twin-binding-icon-${data.id}`" class="shrink-0 text-emerald-400"><LinkIcon /></el-icon>
            </el-tooltip>
            <span class="shrink-0 text-[9px] text-slate-600">{{ data.type }}</span>
            <button
              :data-testid="`visibility-${data.id}`"
              :aria-label="data.object.visible ? '隐藏对象' : '显示对象'"
              class="shrink-0 rounded px-1 text-[11px] text-slate-500 hover:bg-slate-700 hover:text-white"
              type="button"
              @click.stop="editorStore.toggleVisibility(data.object)"
            >{{ data.object.visible ? '◉' : '○' }}</button>
          </div>
        </template>
      </el-tree>

      <div v-if="treeData.length === 0" class="px-7 py-6 text-center text-[11px] text-slate-500">
        场景中暂无可编辑对象
      </div>
    </div>
  </aside>
</template>

<style scoped>
.scene-tree :deep(.el-tree-node__content) {
  height: 32px;
  border-radius: 6px;
  color: rgb(148 163 184);
  background: transparent;
}

.scene-tree :deep(.el-tree-node__content:hover) {
  color: rgb(226 232 240);
  background: rgb(51 65 85);
}

.scene-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  color: rgb(147 197 253);
  background: rgb(59 130 246 / 0.18);
}

.scene-tree :deep(.el-tree-node__expand-icon) {
  color: rgb(100 116 139);
}
</style>
