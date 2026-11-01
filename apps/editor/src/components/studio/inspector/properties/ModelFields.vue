<script setup lang="ts">
import { Replace, RotateCcw } from 'lucide-vue-next'
import { computed } from 'vue'
import { MODEL_ROOT_PART, type SceneNodeV2 } from '@twin-studio/core'
import { builtinModels } from '@/editor/builtinModels'
import { useAssetStore } from '@/stores/assets'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import { useSession } from '@/studio/context'
import { useShell } from '@/studio/shell'
import PartMaterial from '../PartMaterial.vue'
import ModelMotion from '../ModelMotion.vue'
import { useNodePatch } from './useNodePatch'

/** 模型的属性。 */
const props = defineProps<{ node: Extract<SceneNodeV2, { kind: 'model' }> }>()
const session = useSession()
const { patch } = useNodePatch(() => props.node)
const shell = useShell()
const assetStore = useAssetStore()
/** 模型文件的名字（内置模型显示中文名）。 */
const assetName = computed(() => {
  const file = assetStore.assets.find(asset => asset.id === props.node.model.assetId)?.name ?? ''
  return builtinModels.find(model => model.file === file)?.name ?? file.replace(/\.glb$/i, '')
})
const partCount = computed(() => {
  void session.ui.syncRevision
  return session.sync.partsOf(props.node.id).length
})
/** 改过的部件数、删掉的部件数。 */
const modelEdits = computed(() => {
  const parts = Object.keys(props.node.model.overrides).filter(id => id !== MODEL_ROOT_PART)
  return { overrides: parts.length, deleted: props.node.model.deleted.length }
})
</script>

<template>
  <UiSection title="模型">
    <UiRow label="资源">
      <span class="s-value" data-testid="model-asset">{{ assetName }}</span>
      <button
        class="s-btn s-btn--sm"
        title="换成另一个模型或新版本"
        data-testid="replace-model"
        @click="shell.dialog = 'replace-model'"
      >
        <Replace :size="12" />替换
      </button>
    </UiRow>
    <UiRow label="部件"
      ><span class="s-value" :title="'再次单击模型或双击，选中其中的部件'"
        >{{ partCount }} 个 · {{ modelEdits.overrides }} 处修改 · {{ modelEdits.deleted }} 个已删除</span
      ></UiRow
    >
    <p class="s-note s-hint">再次单击模型（或双击）选中其中的部件，可单独绑定设备、改材质、隐藏。</p>
    <div v-if="modelEdits.overrides || modelEdits.deleted" class="s-buttons">
      <button v-if="modelEdits.deleted" class="s-btn" @click="session.modelParts.restoreDeletedParts(node.id)">
        <RotateCcw :size="13" />恢复删除的部件
      </button>
      <button
        class="s-btn"
        @click="
          patch('model', n => {
            n.model.overrides = {}
            n.model.deleted = []
          })
        "
      >
        <RotateCcw :size="13" />恢复原始模型
      </button>
    </div>
  </UiSection>
  <PartMaterial :node-id="node.id" :asset-node-id="MODEL_ROOT_PART" title="整体材质" />
  <ModelMotion :node="node" />
</template>
