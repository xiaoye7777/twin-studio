<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Box, Upload } from 'lucide-vue-next'
import { computed, reactive, ref, watch } from 'vue'
import { MODEL_ROOT_PART } from '@twin-studio/core'
import { builtinModels, importBuiltinModel } from '@/editor/builtinModels'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { useAssetStore } from '@/stores/assets'
import { useSession } from '@/studio/context'
import { modelThumbnail } from '@/studio/modelThumbnails'
import { useShell } from '@/studio/shell'

const session = useSession()
const shell = useShell()
const assetStore = useAssetStore()
const repository = new IndexedDbAssetRepository()
const fileInput = ref<HTMLInputElement>()
const thumbs = reactive<Record<string, string>>({})
const state = reactive({ choice: '' as string, scope: 'one' as 'one' | 'all', busy: false })

const visible = computed({
  get: () => shell.dialog === 'replace-model',
  set: value => {
    if (!value) shell.dialog = null
  },
})
const node = computed(() => {
  const selected = session.selectedNodes
  return selected.length === 1 && selected[0]!.kind === 'model' ? selected[0]! : null
})
const currentAssetId = computed(() => (node.value?.kind === 'model' ? node.value.model.assetId : ''))
const sameAsset = computed(() => (currentAssetId.value ? session.nodesUsingAsset(currentAssetId.value) : []))
const builtinFiles = new Set(builtinModels.map(model => model.file))
// Library entries: built-ins by key, imported models by asset id.
const options = computed(() => [
  ...builtinModels.map(model => ({
    key: `builtin:${model.key}`,
    name: model.name,
    assetId: assetStore.assets.find(asset => asset.name === model.file)?.id,
  })),
  ...assetStore.assets
    .filter(asset => asset.assetType === 'model' && !builtinFiles.has(asset.name))
    .map(asset => ({ key: `asset:${asset.id}`, name: asset.name.replace(/\.glb$/i, ''), assetId: asset.id })),
])

watch(
  visible,
  async open => {
    if (!open) return
    state.choice = ''
    state.scope = 'one'
    await assetStore.refresh()
    for (const model of builtinModels)
      void modelThumbnail(`builtin:${model.file}`, `${import.meta.env.BASE_URL}demo-assets/${model.file}`).then(
        image => image && (thumbs[`builtin:${model.key}`] = image),
      )
    for (const asset of assetStore.assets) {
      if (asset.assetType !== 'model' || builtinFiles.has(asset.name)) continue
      const record = await repository.get(asset.id)
      if (!record) continue
      const url = URL.createObjectURL(record.blob)
      const image = await modelThumbnail(`asset:${record.fingerprint}`, url)
      URL.revokeObjectURL(url)
      if (image) thumbs[`asset:${asset.id}`] = image
    }
  },
  { immediate: true },
)

async function upload(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.glb')) return void ElMessage.warning('请选择 .glb 模型')
  const { asset } = await assetStore.importAsset(file, 'model')
  state.choice = `asset:${asset.id}`
}

async function resolveAssetId(choice: string): Promise<string> {
  if (choice.startsWith('asset:')) return choice.slice(6)
  const model = builtinModels.find(item => `builtin:${item.key}` === choice)
  if (!model) throw new Error('模型不存在')
  const record = await importBuiltinModel(model, repository)
  void assetStore.refresh()
  return record.id
}

async function confirm(): Promise<void> {
  const current = node.value
  if (!current || !state.choice) return
  state.busy = true
  try {
    const assetId = await resolveAssetId(state.choice)
    const ids = state.scope === 'all' ? sameAsset.value.map(item => item.id) : [current.id]
    session.replaceModel(ids, assetId)
    await session.sync.settled()
    // Part edits and part bindings follow the part ids; report the ones the new file does not have.
    const missing = new Set<string>()
    for (const id of ids) {
      const replaced = session.node(id)
      if (replaced?.kind !== 'model') continue
      const parts = new Set(session.sync.partsOf(id).map(part => part.id))
      const used = [
        ...Object.keys(replaced.model.overrides),
        ...(replaced.model.motions ?? []).map(motion => motion.assetNodeId),
        ...session.doc.value.bindings.flatMap(binding =>
          binding.target.type === 'asset-node' && binding.target.instanceId === id ? [binding.target.assetNodeId] : [],
        ),
      ]
      for (const part of used) if (part !== MODEL_ROOT_PART && !parts.has(part)) missing.add(part)
    }
    shell.dialog = null
    if (missing.size)
      ElMessage.warning(`已替换 ${ids.length} 个模型；新模型中缺少 ${missing.size} 个部件，相关的修改和绑定暂不生效`)
    else ElMessage.success(`已替换 ${ids.length} 个模型，部件修改和绑定全部保留`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '替换失败')
  } finally {
    state.busy = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="替换模型" width="560px" append-to-body class="studio-dialog">
    <p class="intro">
      位置、部件修改、设备绑定和特效都会保留。建模同事交付新版本时，部件按 <code>assetNodeId</code>
      对应，名称和层级可以调整。
    </p>
    <div class="grid" data-testid="replace-model-options">
      <button
        v-for="option in options"
        :key="option.key"
        class="option"
        :class="{ 'is-active': state.choice === option.key, 'is-current': option.assetId === currentAssetId }"
        :title="option.name"
        :data-testid="`replace-option-${option.name}`"
        @click="state.choice = option.key"
      >
        <span class="option__thumb">
          <img v-if="thumbs[option.key]" :src="thumbs[option.key]" alt="" />
          <Box v-else :size="20" />
        </span>
        <span class="option__name">{{ option.name }}</span>
      </button>
      <button class="option option--upload" @click="fileInput?.click()">
        <span class="option__thumb"><Upload :size="20" /></span>
        <span class="option__name">导入新文件…</span>
      </button>
      <input ref="fileInput" type="file" accept=".glb,model/gltf-binary" hidden @change="upload" />
    </div>
    <div v-if="sameAsset.length > 1" class="scope">
      <label><input v-model="state.scope" type="radio" value="one" /> 仅替换选中的对象</label>
      <label>
        <input v-model="state.scope" type="radio" value="all" data-testid="replace-scope-all" />
        替换场景中全部 {{ sameAsset.length }} 个使用此模型的对象
      </label>
    </div>
    <template #footer>
      <button class="s-btn" @click="shell.dialog = null">取消</button>
      <button
        class="s-btn s-btn--primary"
        :disabled="!state.choice || state.busy"
        data-testid="replace-confirm"
        @click="confirm"
      >
        替换
      </button>
    </template>
  </el-dialog>
</template>

<style scoped>
.intro {
  margin: 0 0 12px;
  color: #a9a6a0;
  font-size: 12px;
  line-height: 1.6;
}
.grid {
  display: grid;
  max-height: 320px;
  overflow: auto;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}
.option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--s-line);
  border-radius: 8px;
  background: var(--s-panel-2);
  color: var(--s-fg-2);
  cursor: pointer;
}
.option:hover {
  border-color: var(--s-line-2);
}
.option.is-active {
  border-color: var(--s-accent);
  background: var(--s-accent-soft);
  color: var(--s-fg);
}
.option.is-current .option__name::after {
  content: ' · 当前';
  color: var(--s-fg-3);
}
.option__thumb {
  display: grid;
  width: 100%;
  aspect-ratio: 4 / 3;
  place-items: center;
  overflow: hidden;
  border-radius: 5px;
  background: var(--s-bg);
}
.option__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.option__name {
  overflow: hidden;
  max-width: 100%;
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scope {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 14px;
  color: var(--s-fg-2);
  font-size: 12px;
}
</style>
