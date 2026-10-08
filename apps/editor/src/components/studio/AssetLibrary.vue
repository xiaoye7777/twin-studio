<script setup lang="ts">
import { ElMessage } from 'element-plus'
import {
  Box,
  Circle,
  Cone,
  Cylinder,
  Lightbulb,
  RectangleHorizontal,
  Spline,
  SquareDashed,
  Tag,
  Upload,
} from 'lucide-vue-next'
import { computed, onMounted, reactive, ref } from 'vue'
import type { PrimitiveShape } from '@twin-studio/core'
import { writeAssetDragPayload, writeBuiltinModelDragPayload, writePrimitiveDragPayload } from '@/editor/assetDrag'
import { builtinModels, importBuiltinModel, type BuiltinModel } from '@/editor/builtinModels'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { useAssetStore } from '@/stores/assets'
import { useSession } from '@/studio/context'
import { modelThumbnail } from '@/studio/modelThumbnails'
import UiSection from '@/components/ui/UiSection.vue'

const session = useSession()
const assetStore = useAssetStore()
const repository = new IndexedDbAssetRepository()
const thumbs = reactive<Record<string, string>>({})
const uploading = ref(false)
const fileInput = ref<HTMLInputElement>()
const filter = ref('')

const categories = computed(() => {
  const groups = new Map<string, BuiltinModel[]>()
  for (const model of builtinModels) {
    if (filter.value && !model.name.includes(filter.value)) continue
    groups.set(model.category, [...(groups.get(model.category) ?? []), model])
  }
  return [...groups]
})
const builtinFiles = new Set(builtinModels.map(model => model.file))
const myModels = computed(() =>
  assetStore.assets.filter(
    asset =>
      asset.assetType === 'model' &&
      !builtinFiles.has(asset.name) &&
      (!filter.value || asset.name.includes(filter.value)),
  ),
)

const primitives: Array<{ shape: PrimitiveShape; label: string; icon: unknown }> = [
  { shape: 'box', label: '立方体', icon: Box },
  { shape: 'plane', label: '平面', icon: RectangleHorizontal },
  { shape: 'cylinder', label: '圆柱', icon: Cylinder },
  { shape: 'sphere', label: '球体', icon: Circle },
  { shape: 'cone', label: '圆锥', icon: Cone },
]
const drawing = [
  { kind: 'path', label: '能流线', hint: '管线、电缆、能量流向', icon: Spline },
  { kind: 'area', label: '区域', hint: '功能分区、地块、围栏', icon: SquareDashed },
  { kind: 'label', label: '文字标签', hint: '楼宇名称、区域标题', icon: Tag },
  { kind: 'light', label: '灯光', hint: '夜景点光源、射灯', icon: Lightbulb },
] as const

onMounted(async () => {
  await assetStore.refresh()
  for (const model of builtinModels) {
    void modelThumbnail(`builtin:${model.file}`, `${import.meta.env.BASE_URL}demo-assets/${model.file}`).then(image => {
      if (image) thumbs[model.key] = image
    })
  }
  for (const asset of myModels.value) void loadThumb(asset.id)
})

async function loadThumb(assetId: string): Promise<void> {
  const record = await repository.get(assetId)
  if (!record) return
  const url = URL.createObjectURL(record.blob)
  const image = await modelThumbnail(`asset:${record.fingerprint}`, url)
  URL.revokeObjectURL(url)
  if (image) thumbs[assetId] = image
}

async function addBuiltin(model: BuiltinModel): Promise<void> {
  try {
    const record = await importBuiltinModel(model, repository)
    void assetStore.refresh()
    await session.addModel(record.id)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '模型加载失败')
  }
}

async function addAsset(assetId: string): Promise<void> {
  try {
    await session.addModel(assetId)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '模型加载失败')
  }
}

async function upload(event: Event): Promise<void> {
  const files = [...((event.target as HTMLInputElement).files ?? [])]
  ;(event.target as HTMLInputElement).value = ''
  if (!files.length) return
  uploading.value = true
  try {
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.glb')) {
        ElMessage.warning(`${file.name}：目前支持 .glb 模型（建议导出时开启 Meshopt 压缩）`)
        continue
      }
      const { asset, isNew } = await assetStore.importAsset(file, 'model')
      void loadThumb(asset.id)
      ElMessage.success(isNew ? `已导入 ${asset.name}` : `${asset.name} 已在资源库中`)
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导入失败')
  } finally {
    uploading.value = false
  }
}

function sizeLabel(bytes: number): string {
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
</script>

<template>
  <div class="library s-scroll" data-testid="asset-library">
    <div class="library__search">
      <input v-model="filter" class="s-input" placeholder="搜索资源" />
    </div>

    <UiSection
      v-for="[category, models] in categories"
      :key="category"
      :title="`内置模型 · ${category}`"
      :count="models.length"
    >
      <div class="library__grid">
        <button
          v-for="model in models"
          :key="model.key"
          class="card"
          draggable="true"
          :title="`${model.description} — 拖入视口或单击放置`"
          :data-testid="`builtin-${model.key}`"
          @dragstart="writeBuiltinModelDragPayload($event.dataTransfer!, model.key)"
          @click="addBuiltin(model)"
        >
          <span class="card__thumb">
            <img v-if="thumbs[model.key]" :src="thumbs[model.key]" alt="" />
            <Box v-else :size="22" />
          </span>
          <span class="card__name">{{ model.name }}</span>
        </button>
      </div>
    </UiSection>

    <UiSection title="我的模型" :count="myModels.length">
      <template #actions>
        <button class="s-btn s-btn--sm" :disabled="uploading" @click="fileInput?.click()">
          <Upload :size="12" />{{ uploading ? '导入中…' : '导入 GLB' }}
        </button>
        <input ref="fileInput" type="file" accept=".glb,model/gltf-binary" multiple hidden @change="upload" />
      </template>
      <div v-if="myModels.length" class="library__grid">
        <button
          v-for="asset in myModels"
          :key="asset.id"
          class="card"
          draggable="true"
          :title="`${asset.name} · ${sizeLabel(asset.size)}`"
          @dragstart="writeAssetDragPayload($event.dataTransfer!, asset.id)"
          @click="addAsset(asset.id)"
        >
          <span class="card__thumb">
            <img v-if="thumbs[asset.id]" :src="thumbs[asset.id]" alt="" />
            <Box v-else :size="22" />
          </span>
          <span class="card__name">{{ asset.name.replace(/\.glb$/i, '') }}</span>
        </button>
      </div>
      <p v-else class="library__note s-hint">建模同事交付的 .glb 模型导入后出现在这里，可在多个项目中复用。</p>
    </UiSection>

    <UiSection title="基本体" :count="primitives.length">
      <div class="library__row">
        <button
          v-for="item in primitives"
          :key="item.shape"
          class="chip"
          draggable="true"
          :title="`${item.label} — 拖入视口或单击放置`"
          :data-testid="`primitive-${item.shape}`"
          @dragstart="writePrimitiveDragPayload($event.dataTransfer!, item.shape)"
          @click="session.addPrimitive(item.shape)"
        >
          <component :is="item.icon" :size="16" />
          <span>{{ item.label }}</span>
        </button>
      </div>
    </UiSection>

    <UiSection title="绘制与标注">
      <div class="library__list">
        <button v-for="item in drawing" :key="item.kind" class="tool" @click="session.startDrawing(item.kind)">
          <component :is="item.icon" :size="16" class="tool__icon" />
          <span class="tool__text">
            <strong>{{ item.label }}</strong>
            <small>{{ item.hint }}</small>
          </span>
        </button>
      </div>
    </UiSection>
  </div>
</template>

<style scoped>
.library {
  padding-bottom: 16px;
}
.library__search {
  padding: 8px 8px 4px;
}
.library__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 0 8px;
}
.card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  padding: 4px 4px 6px;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-panel-2);
  color: var(--s-fg);
  text-align: left;
  cursor: grab;
  transition:
    border-color 120ms ease,
    background-color 120ms ease;
}
.card:hover {
  border-color: var(--s-accent-line);
  background: var(--s-raised);
}
.card__thumb {
  display: grid;
  aspect-ratio: 4 / 3;
  place-items: center;
  overflow: hidden;
  border-radius: 4px;
  background: radial-gradient(circle at 50% 40%, #2c2e33, #1a1b1e 75%);
  color: #4c4e54;
}
.card__thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.card__name {
  overflow: hidden;
  padding: 0 2px;
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.library__row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  padding: 0 8px;
}
.chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 2px 6px;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-panel-2);
  color: var(--s-fg-2);
  font-size: 10.5px;
  cursor: grab;
}
.chip:hover {
  border-color: var(--s-accent-line);
  color: var(--s-fg);
}
.library__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px;
}
.tool {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-panel-2);
  text-align: left;
  cursor: pointer;
}
.tool:hover {
  border-color: var(--s-accent-line);
}
.tool__icon {
  color: var(--s-accent-2);
}
.tool__text {
  display: flex;
  flex-direction: column;
}
.tool__text strong {
  font-size: 12px;
  font-weight: 500;
}
.tool__text small {
  color: var(--s-fg-3);
  font-size: 10.5px;
}
.library__note {
  margin: 0;
  padding: 0 12px;
}
</style>
