<script setup lang="ts">
import { Box, Files, Picture, Upload } from '@element-plus/icons-vue'
import EffectLibrary from './EffectLibrary.vue'
import EffectTemplateLibrary from './EffectTemplateLibrary.vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { writeAssetDragPayload, writePrimitiveDragPayload } from '@/editor/assetDrag'
import { primitivePresets, type PrimitivePreset } from '@/editor/primitivePresets'
import type { AssetMetadata } from '@/infrastructure/assets'
import { useAssetStore } from '@/stores/assets'
import { useEditorStore, type PrimitiveType } from '@/stores/editor'

const assetStore = useAssetStore()
const activeTab = ref('assets')
const activeAssetCategory = ref<'models' | 'basic' | 'park' | 'environments'>('models')
const editorStore = useEditorStore()
const fileInputRef = ref<HTMLInputElement>()
const modelAssets = computed(() => assetStore.assets.filter((asset) => asset.assetType === 'model'))
const environmentAssets = computed(() => assetStore.assets.filter((asset) => asset.assetType === 'environment'))

const visiblePrimitivePresets = computed(() => primitivePresets.filter((preset) => (
  activeAssetCategory.value === 'basic' ? preset.category === '基础几何' : preset.category === '园区构件'
)))

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
  <section data-testid="asset-panel" class="flex h-full min-h-0 flex-col bg-slate-800 text-slate-300">
    <div class="flex h-9 shrink-0 items-center justify-between border-b border-slate-700 px-4">
      <div class="flex items-center gap-2">
        <button class="text-xs" :class="activeTab === 'assets' ? 'text-blue-400' : 'text-slate-400'" @click="activeTab = 'assets'">Assets</button>
        <button data-testid="effects-tab" class="text-xs" :class="activeTab === 'effects' ? 'text-blue-400' : 'text-slate-400'" @click="activeTab = 'effects'">特效</button>
        <button data-testid="templates-tab" class="text-xs" :class="activeTab === 'templates' ? 'text-blue-400' : 'text-slate-400'" @click="activeTab = 'templates'">模板</button>
      </div>
      <div>
        <input ref="fileInputRef" data-testid="asset-file-input" class="hidden" type="file" accept=".glb,model/gltf-binary" @change="handleAssetFile" />
        <el-button data-testid="import-asset" size="small" dark :loading="assetStore.loading" @click="openAssetPicker">
          <el-icon class="mr-1"><Upload /></el-icon>导入资产
        </el-button>
      </div>
    </div>

    <EffectLibrary v-if="activeTab === 'effects'" />
    <EffectTemplateLibrary v-else-if="activeTab === 'templates'" />
    <div v-else class="flex min-h-0 flex-1 flex-col">
      <nav class="flex h-8 shrink-0 items-center gap-1 border-b border-slate-700/70 px-3" aria-label="资产分类">
        <button
          data-testid="asset-category-models"
          class="asset-category"
          :class="activeAssetCategory === 'models' ? 'asset-category--active' : ''"
          type="button"
          @click="activeAssetCategory = 'models'"
        >模型 <span>{{ modelAssets.length }}</span></button>
        <button
          data-testid="asset-category-basic"
          class="asset-category"
          :class="activeAssetCategory === 'basic' ? 'asset-category--active' : ''"
          type="button"
          @click="activeAssetCategory = 'basic'"
        >基础几何</button>
        <button
          data-testid="asset-category-park"
          class="asset-category"
          :class="activeAssetCategory === 'park' ? 'asset-category--active' : ''"
          type="button"
          @click="activeAssetCategory = 'park'"
        >园区构件</button>
        <button
          v-if="environmentAssets.length"
          data-testid="asset-category-environments"
          class="asset-category"
          :class="activeAssetCategory === 'environments' ? 'asset-category--active' : ''"
          type="button"
          @click="activeAssetCategory = 'environments'"
        >环境 <span>{{ environmentAssets.length }}</span></button>
        <span class="ml-auto text-[10px] text-slate-500">拖到视口自由放置</span>
      </nav>

      <div v-if="activeAssetCategory === 'models'" class="min-h-0 flex-1 overflow-auto px-3 py-2">
        <div v-if="modelAssets.length" class="flex min-w-max gap-2">
          <article
            v-for="asset in modelAssets"
            :key="asset.id"
            :data-testid="`asset-card-${asset.id}`"
            :data-asset-id="asset.id"
            :draggable="editorStore.runtimeReady"
            class="group flex h-16 w-64 shrink-0 cursor-grab items-center gap-3 rounded-lg border border-transparent bg-slate-900/50 px-3 transition hover:border-sky-500/30 hover:bg-slate-700 active:cursor-grabbing"
            @dragstart="handleAssetDragStart($event, asset)"
            @dblclick="instantiateAsset(asset.id)"
          >
            <div class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-sky-500/10 text-sky-300">
              <el-icon :size="19"><Files /></el-icon>
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-medium text-slate-100">{{ asset.name }}</p>
              <p class="mt-1 truncate text-[10px] uppercase text-slate-500">GLB · {{ formatSize(asset.size) }}</p>
            </div>
            <button
              :data-testid="`add-asset-${asset.id}`"
              :disabled="!editorStore.runtimeReady"
              class="shrink-0 rounded-md bg-slate-700 px-2 py-1 text-[10px] text-slate-200 transition hover:bg-sky-600 hover:text-white disabled:opacity-40"
              type="button"
              title="添加到场景中心"
              @click.stop="instantiateAsset(asset.id)"
            >添加</button>
          </article>
        </div>
        <div v-else class="flex h-full min-h-14 items-center justify-center rounded-lg border border-dashed border-slate-700/80 text-xs text-slate-500">
          暂无模型资产，点击右上角“导入资产”添加 GLB
        </div>
      </div>

      <div v-else-if="activeAssetCategory === 'basic' || activeAssetCategory === 'park'" class="min-h-0 flex-1 overflow-auto px-3 py-2">
        <div class="flex min-w-max gap-2">
          <button
            v-for="preset in visiblePrimitivePresets"
            :key="preset.id"
            :data-testid="`asset-primitive-${preset.id}`"
            :disabled="!editorStore.runtimeReady"
            :draggable="editorStore.runtimeReady"
            class="group flex h-16 w-32 cursor-grab items-center gap-2 rounded-lg bg-slate-900/45 px-3 text-left transition hover:bg-slate-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            :title="`${preset.label}：拖入场景自由放置，点击放到中心`"
            @click="addPrimitive(preset)"
            @dragstart="handlePrimitiveDragStart($event, preset)"
          >
            <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-700/70 text-slate-300 group-hover:bg-slate-600">
              <el-icon :size="17"><Box /></el-icon>
            </span>
            <span class="min-w-0">
              <span class="block truncate text-xs text-slate-200">{{ preset.label }}</span>
              <span class="mt-1 block truncate text-[9px] text-slate-500">{{ preset.description }}</span>
            </span>
          </button>
        </div>
      </div>

      <div v-else class="min-h-0 flex-1 overflow-auto px-3 py-2">
        <div class="flex min-w-max gap-2">
          <article v-for="asset in environmentAssets" :key="asset.id" :data-testid="`environment-card-${asset.id}`" class="flex h-16 w-56 shrink-0 items-center gap-3 rounded-lg bg-slate-900/50 px-3">
            <div class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-700 text-slate-300"><el-icon :size="19"><Picture /></el-icon></div>
            <div class="min-w-0"><p class="truncate text-xs font-medium text-slate-200">{{ asset.name }}</p><p class="mt-1 text-[10px] uppercase text-slate-500">HDR · {{ formatSize(asset.size) }}</p></div>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.asset-category {
  display: inline-flex;
  height: 1.5rem;
  align-items: center;
  gap: .3rem;
  border-radius: .375rem;
  padding: 0 .6rem;
  font-size: .6875rem;
  color: rgb(148 163 184);
  transition: color 150ms ease, background-color 150ms ease;
}

.asset-category:hover {
  color: rgb(226 232 240);
  background: rgb(51 65 85 / .72);
}

.asset-category--active {
  color: rgb(125 211 252);
  background: rgb(14 165 233 / .12);
}

.asset-category span {
  color: rgb(100 116 139);
}
</style>
