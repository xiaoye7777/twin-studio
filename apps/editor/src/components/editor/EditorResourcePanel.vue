<script setup lang="ts">
import { Box, Files, Loading, Picture, Upload } from '@element-plus/icons-vue'
import EffectLibrary from './EffectLibrary.vue'
import EffectTemplateLibrary from './EffectTemplateLibrary.vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { writeAssetDragPayload, writeBuiltinModelDragPayload, writePrimitiveDragPayload } from '@/editor/assetDrag'
import { type BuiltinModel, builtinModels, importBuiltinModel } from '@/editor/builtinModels'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { primitivePresets, type PrimitivePreset } from '@/editor/primitivePresets'
import type { AssetMetadata } from '@/infrastructure/assets'
import { useAssetStore } from '@/stores/assets'
import { useEditorStore, type PrimitiveType } from '@/stores/editor'

const assetStore = useAssetStore()
const activeTab = ref('assets')
// Built-in models are always available, so an empty library never opens on a blank panel.
const activeAssetCategory = ref<'builtin' | 'models' | 'basic' | 'park' | 'environments'>('builtin')
const placingModel = ref('')
const editorStore = useEditorStore()
const fileInputRef = ref<HTMLInputElement>()
const modelAssets = computed(() => assetStore.assets.filter(asset => asset.assetType === 'model'))
const environmentAssets = computed(() => assetStore.assets.filter(asset => asset.assetType === 'environment'))

const visiblePrimitivePresets = computed(() =>
  primitivePresets.filter(preset =>
    activeAssetCategory.value === 'basic' ? preset.category === '基础几何' : preset.category === '园区构件',
  ),
)

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function openAssetPicker(): void {
  fileInputRef.value?.click()
}

async function handleAssetFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.glb')) {
    ElMessage.error('当前仅支持可独立加载的 .glb 文件')
    return
  }

  try {
    const result = await assetStore.importAsset(file)
    activeTab.value = 'assets'
    activeAssetCategory.value = 'models'
    ElMessage.success(result.isNew ? `${result.asset.name} 已导入资产库` : '资产已存在')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '资产导入失败')
  }
}

function handleAssetDragStart(event: DragEvent, asset: AssetMetadata): void {
  if (!event.dataTransfer) return
  writeAssetDragPayload(event.dataTransfer, asset.id)
}

function addPrimitive(preset: PrimitivePreset): void {
  editorStore.addPrimitive(preset.type satisfies PrimitiveType, preset.id)
}

function handlePrimitiveDragStart(event: DragEvent, preset: PrimitivePreset): void {
  if (!event.dataTransfer) return
  writePrimitiveDragPayload(event.dataTransfer, preset.id)
}

function handleBuiltinDragStart(event: DragEvent, model: BuiltinModel): void {
  if (!event.dataTransfer) return
  writeBuiltinModelDragPayload(event.dataTransfer, model.key)
}

async function placeBuiltinModel(model: BuiltinModel): Promise<void> {
  if (!editorStore.runtimeReady || placingModel.value) return
  placingModel.value = model.key
  try {
    const record = await importBuiltinModel(model, new IndexedDbAssetRepository())
    await assetStore.refresh()
    editorStore.instantiateAsset(record.id)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '内置模型加载失败')
  } finally {
    placingModel.value = ''
  }
}

function instantiateAsset(assetId: string): void {
  if (!editorStore.runtimeReady) return
  editorStore.instantiateAsset(assetId)
}

onMounted(() => {
  void assetStore.refresh().catch((error: unknown) => {
    ElMessage.error(error instanceof Error ? error.message : '资产列表加载失败')
  })
})
</script>

<template>
  <section data-testid="asset-panel" class="flex h-full min-h-0 flex-col bg-panel text-fg-2">
    <div class="flex h-[30px] shrink-0 items-stretch justify-between border-b border-line pr-2">
      <div class="flex items-stretch" role="tablist">
        <button
          class="res-tab"
          :class="{ 'is-active': activeTab === 'assets' }"
          role="tab"
          :aria-selected="activeTab === 'assets'"
          type="button"
          @click="activeTab = 'assets'"
        >
          资源
        </button>
        <button
          data-testid="effects-tab"
          class="res-tab"
          :class="{ 'is-active': activeTab === 'effects' }"
          role="tab"
          :aria-selected="activeTab === 'effects'"
          type="button"
          @click="activeTab = 'effects'"
        >
          特效
        </button>
        <button
          data-testid="templates-tab"
          class="res-tab"
          :class="{ 'is-active': activeTab === 'templates' }"
          role="tab"
          :aria-selected="activeTab === 'templates'"
          type="button"
          @click="activeTab = 'templates'"
        >
          特效模板
        </button>
      </div>
      <div class="flex items-center">
        <input
          ref="fileInputRef"
          data-testid="asset-file-input"
          class="hidden"
          type="file"
          accept=".glb,model/gltf-binary"
          @change="handleAssetFile"
        />
        <button
          data-testid="import-asset"
          class="st-btn h-6! px-2!"
          type="button"
          :disabled="assetStore.loading"
          @click="openAssetPicker"
        >
          <el-icon><Upload /></el-icon>导入 GLB
        </button>
      </div>
    </div>

    <EffectLibrary v-if="activeTab === 'effects'" />
    <EffectTemplateLibrary v-else-if="activeTab === 'templates'" />
    <div v-else class="flex min-h-0 flex-1 flex-col">
      <nav class="flex h-8 shrink-0 items-center gap-1 px-3" aria-label="资产分类">
        <button
          data-testid="asset-category-builtin"
          class="chip"
          :class="{ 'is-active': activeAssetCategory === 'builtin' }"
          type="button"
          @click="activeAssetCategory = 'builtin'"
        >
          内置模型 <span>{{ builtinModels.length }}</span>
        </button>
        <button
          data-testid="asset-category-models"
          class="chip"
          :class="{ 'is-active': activeAssetCategory === 'models' }"
          type="button"
          @click="activeAssetCategory = 'models'"
        >
          我的模型 <span>{{ modelAssets.length }}</span>
        </button>
        <button
          data-testid="asset-category-basic"
          class="chip"
          :class="{ 'is-active': activeAssetCategory === 'basic' }"
          type="button"
          @click="activeAssetCategory = 'basic'"
        >
          基础几何
        </button>
        <button
          data-testid="asset-category-park"
          class="chip"
          :class="{ 'is-active': activeAssetCategory === 'park' }"
          type="button"
          @click="activeAssetCategory = 'park'"
        >
          园区构件
        </button>
        <button
          v-if="environmentAssets.length"
          data-testid="asset-category-environments"
          class="chip"
          :class="{ 'is-active': activeAssetCategory === 'environments' }"
          type="button"
          @click="activeAssetCategory = 'environments'"
        >
          环境 <span>{{ environmentAssets.length }}</span>
        </button>
        <span class="ml-auto text-[11px] text-fg-3">{{
          activeAssetCategory === 'builtin' ? '拖入视口放置 · 点击放到中心 · CC0 可商用' : '拖入视口放置 · 双击放到中心'
        }}</span>
      </nav>

      <div v-if="activeAssetCategory === 'builtin'" class="min-h-0 flex-1 overflow-auto px-3 pb-2.5">
        <div class="flex min-w-max gap-2">
          <button
            v-for="model in builtinModels"
            :key="model.key"
            :data-testid="`builtin-model-${model.key}`"
            :disabled="!editorStore.runtimeReady || !!placingModel"
            :draggable="editorStore.runtimeReady"
            class="tile w-44 cursor-grab text-left active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            :title="`${model.name}：拖入视口放置，点击放到中心`"
            @click="placeBuiltinModel(model)"
            @dragstart="handleBuiltinDragStart($event, model)"
          >
            <span class="tile__icon"
              ><el-icon :size="16" :class="{ 'is-loading': placingModel === model.key }"
                ><component :is="placingModel === model.key ? Loading : Files" /></el-icon
            ></span>
            <span class="min-w-0">
              <span class="block truncate text-[12px] text-fg">{{ model.name }}</span>
              <span class="mt-0.5 block truncate text-[11px] text-fg-3"
                >{{ model.category }} · {{ model.description }}</span
              >
            </span>
          </button>
        </div>
      </div>

      <div v-else-if="activeAssetCategory === 'models'" class="min-h-0 flex-1 overflow-auto px-3 pb-2.5">
        <div v-if="modelAssets.length" class="flex min-w-max gap-2">
          <article
            v-for="asset in modelAssets"
            :key="asset.id"
            :data-testid="`asset-card-${asset.id}`"
            :data-asset-id="asset.id"
            :draggable="editorStore.runtimeReady"
            class="tile group w-60 cursor-grab active:cursor-grabbing"
            @dragstart="handleAssetDragStart($event, asset)"
            @dblclick="instantiateAsset(asset.id)"
          >
            <span class="tile__icon"
              ><el-icon :size="17"><Files /></el-icon
            ></span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-[12px] font-medium text-fg">{{ asset.name }}</p>
              <p class="mt-0.5 truncate text-[11px] text-fg-3">GLB · {{ formatSize(asset.size) }}</p>
            </div>
            <button
              :data-testid="`add-asset-${asset.id}`"
              :disabled="!editorStore.runtimeReady"
              class="st-btn h-6! px-2! opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              type="button"
              title="添加到场景中心"
              @click.stop="instantiateAsset(asset.id)"
            >
              添加
            </button>
          </article>
        </div>
        <div
          v-else
          class="flex h-full min-h-14 items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-[12px] text-fg-3"
        >
          暂无模型资产
          <button class="st-link st-link--accent" type="button" @click="openAssetPicker">导入 GLB</button>
        </div>
      </div>

      <div
        v-else-if="activeAssetCategory === 'basic' || activeAssetCategory === 'park'"
        class="min-h-0 flex-1 overflow-auto px-3 pb-2.5"
      >
        <div class="flex min-w-max gap-2">
          <button
            v-for="preset in visiblePrimitivePresets"
            :key="preset.id"
            :data-testid="`asset-primitive-${preset.id}`"
            :disabled="!editorStore.runtimeReady"
            :draggable="editorStore.runtimeReady"
            class="tile w-36 cursor-grab text-left active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            :title="`${preset.label}：拖入场景自由放置，点击放到中心`"
            @click="addPrimitive(preset)"
            @dragstart="handlePrimitiveDragStart($event, preset)"
          >
            <span class="tile__icon"
              ><el-icon :size="16"><Box /></el-icon
            ></span>
            <span class="min-w-0">
              <span class="block truncate text-[12px] text-fg">{{ preset.label }}</span>
              <span class="mt-0.5 block truncate text-[11px] text-fg-3">{{ preset.description }}</span>
            </span>
          </button>
        </div>
      </div>

      <div v-else class="min-h-0 flex-1 overflow-auto px-3 pb-2.5">
        <div class="flex min-w-max gap-2">
          <article
            v-for="asset in environmentAssets"
            :key="asset.id"
            :data-testid="`environment-card-${asset.id}`"
            class="tile w-56"
          >
            <span class="tile__icon"
              ><el-icon :size="17"><Picture /></el-icon
            ></span>
            <div class="min-w-0">
              <p class="truncate text-[12px] font-medium text-fg">{{ asset.name }}</p>
              <p class="mt-0.5 text-[11px] text-fg-3">HDR · {{ formatSize(asset.size) }}</p>
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.res-tab {
  position: relative;
  padding: 0 14px;
  font-size: 12px;
  color: var(--color-fg-3);
  transition: color 120ms ease;
}

.res-tab:hover {
  color: var(--color-fg);
}

.res-tab.is-active {
  color: var(--color-fg);
  background: var(--color-raised);
}

.res-tab.is-active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: var(--color-accent);
}

.chip {
  display: inline-flex;
  height: 22px;
  align-items: center;
  gap: 5px;
  border-radius: 4px;
  padding: 0 9px;
  font-size: 11.5px;
  color: var(--color-fg-2);
  transition:
    color 120ms ease,
    background-color 120ms ease;
}

.chip:hover {
  background: var(--color-hover);
  color: var(--color-fg);
}

.chip.is-active {
  background: var(--color-active);
  color: var(--color-fg);
}

.chip span {
  color: var(--color-fg-3);
}

.tile {
  display: flex;
  height: 56px;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--color-line);
  border-radius: 6px;
  background: var(--color-field);
  padding: 0 10px;
  transition:
    border-color 120ms ease,
    background-color 120ms ease;
}

.tile:hover:not(:disabled) {
  border-color: var(--color-line-strong);
  background: var(--color-raised);
}

.tile__icon {
  display: grid;
  height: 34px;
  width: 34px;
  flex-shrink: 0;
  place-items: center;
  border-radius: 5px;
  background: var(--color-raised);
  color: var(--color-fg-2);
}

.tile:hover .tile__icon {
  color: var(--color-accent-fg);
}
</style>
