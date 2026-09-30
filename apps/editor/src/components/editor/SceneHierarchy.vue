<script setup lang="ts">
import { computed, markRaw, nextTick, ref, watch } from 'vue'
import { Box, Files, FolderOpened, Hide, Link as LinkIcon, Search, View } from '@element-plus/icons-vue'
import type { Object3D } from 'three'
import type { SceneTreeNode } from '@/editor/types'
import { bindingTargetFromObject, getEditorMetadata } from '@twin-studio/core'
import { useEditorStore } from '@/stores/editor'
import { useTwinStore } from '@/stores/twin'

interface TreeController {
  setCurrentKey(key: string | null, shouldAutoExpandParent?: boolean): void
  filter(value: string): void
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
const query = ref('')
watch(query, value => treeRef.value?.filter(value.trim()))

function filterNode(value: string, data: unknown): boolean {
  return !value || (isSceneTreeNode(data) && data.name.toLowerCase().includes(value.toLowerCase()))
}

/** Icon by editor identity: model instance root, primitive, or a node inside a model. */
function nodeIcon(node: SceneTreeNode) {
  const kind = getEditorMetadata(node.object)?.kind
  if (kind === 'assetInstance') return Files
  if (kind === 'primitive' || node.type === 'Mesh') return Box
  return FolderOpened
}

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
  void editorStore.sceneRevision
  void twinStore.bindingRevision
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
    class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-panel text-fg-2"
  >
    <div class="st-panel-header">
      <span>场景</span>
      <span class="font-normal text-fg-3">{{ treeData.length }}</span>
    </div>

    <div class="border-b border-line px-2 py-1.5">
      <label class="search">
        <el-icon class="text-fg-3"><Search /></el-icon>
        <input v-model="query" aria-label="搜索场景对象" placeholder="搜索对象" class="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3" />
      </label>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto py-1">
      <el-tree
        ref="treeRef"
        :data="treeData"
        node-key="id"
        :props="{ children: 'children', label: 'name' }"
        :current-node-key="selectedNodeKey"
        :expand-on-click-node="false"
        :filter-node-method="filterNode"
        :indent="14"
        default-expand-all
        highlight-current
        class="scene-tree"
        @node-click="handleNodeClick"
      >
        <template #default="{ data }">
          <div
            :data-testid="`hierarchy-node-${data.id}`"
            :data-bid="data.bid ?? ''"
            :title="data.type"
            class="row flex min-w-0 flex-1 items-center gap-1.5 pr-1"
            :class="{ 'is-hidden': !data.object.visible }"
          >
            <el-icon class="row__icon shrink-0"><component :is="nodeIcon(data)" /></el-icon>
            <span class="min-w-0 flex-1 truncate">{{ data.name }}</span>
            <el-tooltip v-if="data.twinBound" content="已绑定设备" placement="top" :show-after="400">
              <el-icon :data-testid="`twin-binding-icon-${data.id}`" class="shrink-0 text-ok"><LinkIcon /></el-icon>
            </el-tooltip>
            <button
              :data-testid="`visibility-${data.id}`"
              :aria-label="data.object.visible ? '隐藏对象' : '显示对象'"
              class="row__eye"
              type="button"
              @click.stop="editorStore.toggleVisibility(data.object)"
            ><el-icon><component :is="data.object.visible ? View : Hide" /></el-icon></button>
          </div>
        </template>
      </el-tree>

      <div v-if="treeData.length === 0" class="px-6 py-8 text-center text-[11px] text-fg-3">
        场景中暂无可编辑对象
      </div>
    </div>
  </aside>
</template>

<style scoped>
.search {
  display: flex;
  height: 24px;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-line);
  border-radius: 4px;
  background: var(--color-field);
  padding: 0 8px;
  font-size: 12px;
  color: var(--color-fg);
  transition: border-color 120ms ease;
}

.search:focus-within {
  border-color: var(--color-accent);
}

.scene-tree {
  --el-tree-node-hover-bg-color: var(--color-hover);
  --el-tree-text-color: var(--color-fg-2);
  --el-tree-expand-icon-color: var(--color-fg-3);
  background: transparent;
  font-size: 12px;
}

/* Selection is shown by the ember bar; suppress the browser focus ring on tree nodes. */
.scene-tree :deep(.el-tree-node:focus) {
  outline: none;
}

.scene-tree :deep(.el-tree-node:focus > .el-tree-node__content) {
  background: var(--color-hover);
}

.scene-tree :deep(.el-tree-node__content) {
  height: 24px;
  margin: 0 4px;
  border-radius: 3px;
  color: var(--color-fg-2);
}

.scene-tree :deep(.el-tree-node__content:hover) {
  color: var(--color-fg);
}

.scene-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  position: relative;
  background: var(--color-accent-soft);
  color: var(--color-fg);
}

.scene-tree :deep(.el-tree-node.is-current > .el-tree-node__content)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 5px;
  bottom: 5px;
  width: 2px;
  border-radius: 1px;
  background: var(--color-accent);
}

.scene-tree :deep(.el-tree-node.is-current > .el-tree-node__content .row__icon) {
  color: var(--color-accent-fg);
}

.row__icon {
  font-size: 13px;
  color: var(--color-fg-3);
}

.row.is-hidden {
  opacity: 0.45;
}

.row__eye {
  display: grid;
  height: 18px;
  width: 18px;
  place-items: center;
  border-radius: 3px;
  font-size: 12px;
  color: var(--color-fg-3);
  opacity: 0;
  transition: opacity 120ms ease, background-color 120ms ease;
}

.row:hover .row__eye,
.row.is-hidden .row__eye {
  opacity: 1;
}

.row__eye:hover {
  background: var(--color-active);
  color: var(--color-fg);
}
</style>
