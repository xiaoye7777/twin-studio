<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Box, Image as ImageIcon, Trash2, Upload } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref } from 'vue'
import { builtinModels } from '@/editor/builtinModels'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { LocalSceneRepository } from '@/infrastructure/scenes'
import { useAssetStore } from '@/stores/assets'
import { useProjectStore } from '@/stores/project'
import { modelThumbnail } from '@/studio/modelThumbnails'

const assetStore = useAssetStore()
const projects = useProjectStore()
const repository = new IndexedDbAssetRepository()
const thumbs = reactive<Record<string, string>>({})
const filter = ref<'all' | 'model' | 'environment'>('all')
const fileInput = ref<HTMLInputElement>()
const uploading = ref(false)
const builtinFiles = new Set(builtinModels.map(model => model.file))

const assets = computed(() =>
  assetStore.assets.filter(asset => filter.value === 'all' || asset.assetType === filter.value),
)
const totals = computed(() => ({
  models: assetStore.assets.filter(asset => asset.assetType === 'model').length,
  environments: assetStore.assets.filter(asset => asset.assetType === 'environment').length,
  bytes: assetStore.assets.reduce((sum, asset) => sum + asset.size, 0),
}))

onMounted(async () => {
  await assetStore.refresh()
  for (const asset of assetStore.assets) if (asset.assetType === 'model') void loadThumb(asset.id)
})

async function loadThumb(id: string): Promise<void> {
  const record = await repository.get(id)
  if (!record) return
  const url = URL.createObjectURL(record.blob)
  const image = await modelThumbnail(`asset:${record.fingerprint}`, url)
  URL.revokeObjectURL(url)
  if (image) thumbs[id] = image
}

function size(bytes: number): string {
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

async function upload(event: Event): Promise<void> {
  const files = [...((event.target as HTMLInputElement).files ?? [])]
  ;(event.target as HTMLInputElement).value = ''
  uploading.value = true
  try {
    for (const file of files) {
      const lower = file.name.toLowerCase()
      const type = lower.endsWith('.glb') ? 'model' : lower.endsWith('.hdr') ? 'environment' : null
      if (!type) {
        ElMessage.warning(`${file.name}：支持 .glb 模型和 .hdr 环境贴图`)
        continue
      }
      const { asset } = await assetStore.importAsset(file, type)
      if (type === 'model') void loadThumb(asset.id)
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导入失败')
  } finally {
    uploading.value = false
  }
}

async function usage(id: string): Promise<string[]> {
  const scenes = new LocalSceneRepository()
  const names: string[] = []
  for (const project of projects.projects) {
    try {
      const doc = await scenes.load(project.id)
      if (
        doc?.nodes.some(node => node.kind === 'model' && node.model.assetId === id) ||
        doc?.settings.sky.hdrAssetId === id
      )
        names.push(project.name)
    } catch {
      // Unreadable projects cannot use the asset.
    }
  }
  return names
}

async function remove(id: string, name: string): Promise<void> {
  const used = await usage(id)
  try {
    await ElMessageBox.confirm(
      used.length
        ? `「${name}」正在被 ${used.join('、')} 使用，删除后这些场景中的模型将无法加载。确定删除？`
        : `删除「${name}」？`,
      '删除资源',
      { type: 'warning', customClass: 'studio-dialog', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
    await repository.removeBatch([id])
    await assetStore.refresh()
  } catch {
    // Cancelled.
  }
}
</script>

<template>
  <section class="assets">
    <header class="assets__head">
      <div>
        <h1>资源库</h1>
        <p>
          {{ totals.models }} 个模型 · {{ totals.environments }} 张环境贴图 · 共 {{ size(totals.bytes) }}，所有项目共用
        </p>
      </div>
      <div class="assets__actions">
        <div class="assets__filter">
          <button :class="{ 'is-active': filter === 'all' }" @click="filter = 'all'">全部</button>
          <button :class="{ 'is-active': filter === 'model' }" @click="filter = 'model'">模型</button>
          <button :class="{ 'is-active': filter === 'environment' }" @click="filter = 'environment'">环境贴图</button>
        </div>
        <button class="s-btn s-btn--primary" :disabled="uploading" @click="fileInput?.click()">
          <Upload :size="14" />{{ uploading ? '导入中…' : '导入资源' }}
        </button>
        <input ref="fileInput" type="file" accept=".glb,.hdr" multiple hidden @change="upload" />
      </div>
    </header>

    <div v-if="assets.length" class="assets__grid">
      <article v-for="asset in assets" :key="asset.id" class="asset">
        <div class="asset__thumb">
          <img v-if="thumbs[asset.id]" :src="thumbs[asset.id]" alt="" />
          <Box v-else-if="asset.assetType === 'model'" :size="26" />
          <ImageIcon v-else :size="26" />
        </div>
        <div class="asset__body">
          <strong :title="asset.name">{{ asset.name.replace(/\.(glb|hdr)$/i, '') }}</strong>
          <span>
            {{ asset.assetType === 'model' ? '模型' : '环境贴图' }} · {{ size(asset.size) }}
            <em v-if="builtinFiles.has(asset.name)">内置</em>
          </span>
        </div>
        <button class="s-icon-btn" title="删除" @click="remove(asset.id, asset.name)"><Trash2 :size="14" /></button>
      </article>
    </div>
    <div v-else class="assets__empty">
      <Box :size="28" />
      <h2>还没有资源</h2>
      <p>
        导入建模同事交付的 .glb 模型（支持 Meshopt / Draco 压缩和 KTX2 贴图）或 .hdr
        环境贴图；内置模型在编辑器中首次使用时自动入库。
      </p>
    </div>
  </section>
</template>

<style scoped>
.assets {
  max-width: 1480px;
}
.assets__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
.assets__head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
}
.assets__head p {
  margin: 4px 0 0;
  color: var(--s-fg-3);
}
.assets__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.assets__actions .s-btn {
  height: 32px;
  padding: 0 14px;
}
.assets__filter {
  display: flex;
  padding: 2px;
  border: 1px solid var(--s-line-2);
  border-radius: 6px;
  background: var(--s-field);
}
.assets__filter button {
  height: 26px;
  padding: 0 12px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--s-fg-3);
  cursor: pointer;
}
.assets__filter button.is-active {
  background: var(--s-active);
  color: var(--s-fg);
}
.assets__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.asset {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--s-line);
  border-radius: 10px;
  background: var(--s-panel);
}
.asset__thumb {
  display: grid;
  aspect-ratio: 4 / 3;
  place-items: center;
  background: radial-gradient(circle at 50% 40%, #2c2e33, #17191c 75%);
  color: #4c4e54;
}
.asset__thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.asset__body {
  display: flex;
  flex-direction: column;
  padding: 8px 12px 0;
}
.asset__body strong {
  overflow: hidden;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset__body span {
  color: var(--s-fg-3);
  font-size: 11.5px;
}
.asset__body em {
  margin-left: 6px;
  color: var(--s-accent-2);
  font-style: normal;
}
.asset .s-icon-btn {
  align-self: flex-end;
  margin: 0 6px 6px 0;
}
.assets__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 80px 20px;
  border: 1px dashed var(--s-line-2);
  border-radius: 12px;
  color: var(--s-fg-3);
  text-align: center;
}
.assets__empty h2 {
  margin: 0;
  color: var(--s-fg);
  font-size: 16px;
}
.assets__empty p {
  max-width: 460px;
  margin: 0;
}
</style>
