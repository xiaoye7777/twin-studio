<script setup lang="ts">
import { Close, Picture, Upload } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import type { Vector3Tuple } from '@/domain/scene'
import { useAssetStore } from '@/stores/assets'
import { useEditorStore, type CommonView } from '@/stores/editor'
import { useSceneSettingsStore } from '@/stores/sceneSettings'

const sceneSettingsStore = useSceneSettingsStore()
const assetStore = useAssetStore()
const editorStore = useEditorStore()
const hdrInputRef = ref<HTMLInputElement>()
const environmentAssets = computed(() => assetStore.assets.filter((asset) => asset.assetType === 'environment'))
const cameraViews: Array<{ value: CommonView; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'front', label: 'Front' },
  { value: 'right', label: 'Right' },
  { value: 'perspective', label: 'Perspective' },
]

function updateDirectionalAxis(axis: number, value: number | undefined): void {
  if (value === undefined) return
  const position = [...sceneSettingsStore.settings.lighting.directionalPosition] as Vector3Tuple
  position[axis] = value
  sceneSettingsStore.setDirectionalPosition(position)
}

async function handleHdrFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.hdr')) {
    ElMessage.error('环境贴图当前仅支持 .hdr 文件')
    return
  }
  try {
    const result = await assetStore.importAsset(file, 'environment')
    sceneSettingsStore.setEnvironmentAssetId(result.asset.id)
    ElMessage.success(result.isNew ? `${result.asset.name} 已导入并应用` : '环境资产已存在并已应用')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'HDR 导入失败')
  }
}

onMounted(() => {
  if (!assetStore.assets.length) void assetStore.refresh()
})
</script>

<template>
  <aside data-testid="scene-settings-panel" class="flex w-72 shrink-0 flex-col border-l border-slate-700 bg-slate-800 text-slate-300">
    <header class="flex h-10 items-center justify-between border-b border-slate-700 px-3">
      <span class="text-xs font-semibold text-slate-100">场景设置</span>
      <button data-testid="close-scene-settings" class="toolbar-icon" type="button" aria-label="关闭场景设置" @click="sceneSettingsStore.closePanel()">
        <el-icon><Close /></el-icon>
      </button>
    </header>

    <div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 text-xs">
      <section class="space-y-3">
        <p class="panel-title">辅助显示</p>
        <label class="setting-row"><span>网格</span><el-switch data-testid="scene-grid-toggle" :model-value="sceneSettingsStore.settings.gridEnabled" @change="sceneSettingsStore.setGridEnabled(Boolean($event))" /></label>
        <label class="setting-row"><span>坐标轴</span><el-switch data-testid="scene-axes-toggle" :model-value="sceneSettingsStore.settings.axesEnabled" @change="sceneSettingsStore.setAxesEnabled(Boolean($event))" /></label>
      </section>

      <section class="space-y-3">
        <p class="panel-title">地面</p>
        <label class="setting-row"><span>显示地面</span><el-switch data-testid="scene-ground-toggle" :model-value="sceneSettingsStore.settings.ground.enabled" @change="sceneSettingsStore.setGroundEnabled(Boolean($event))" /></label>
        <label class="setting-row"><span>尺寸</span><el-input-number data-testid="scene-ground-size" :model-value="sceneSettingsStore.settings.ground.size" :min="1" :max="10000" :step="10" size="small" controls-position="right" @change="sceneSettingsStore.setGroundSize(Number($event))" /></label>
        <label class="setting-row"><span>颜色</span><input data-testid="scene-ground-color" type="color" class="h-7 w-14 cursor-pointer rounded border border-slate-600 bg-transparent" :value="sceneSettingsStore.settings.ground.color" @input="sceneSettingsStore.setGroundColor(($event.target as HTMLInputElement).value)" /></label>
      </section>

      <section class="space-y-3">
        <p class="panel-title">灯光</p>
        <label class="setting-row"><span>环境光</span><el-input-number data-testid="scene-ambient-intensity" :model-value="sceneSettingsStore.settings.lighting.ambientIntensity" :min="0" :max="20" :step="0.1" :precision="1" size="small" controls-position="right" @change="sceneSettingsStore.setAmbientIntensity(Number($event))" /></label>
        <label class="setting-row"><span>方向光</span><el-input-number data-testid="scene-directional-intensity" :model-value="sceneSettingsStore.settings.lighting.directionalIntensity" :min="0" :max="20" :step="0.1" :precision="1" size="small" controls-position="right" @change="sceneSettingsStore.setDirectionalIntensity(Number($event))" /></label>
        <div class="space-y-2">
          <span class="text-slate-400">方向光位置</span>
          <div class="grid grid-cols-3 gap-1.5">
            <el-input-number v-for="(axis, index) in ['X', 'Y', 'Z']" :key="axis" :aria-label="`方向光 ${axis}`" :model-value="sceneSettingsStore.settings.lighting.directionalPosition[index]" :controls="false" size="small" @change="updateDirectionalAxis(index, $event)" />
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <p class="panel-title">环境</p>
        <select data-testid="scene-environment-select" class="h-8 w-full rounded border border-slate-600 bg-slate-900 px-2 text-xs" :value="sceneSettingsStore.settings.environmentAssetId ?? ''" @change="sceneSettingsStore.setEnvironmentAssetId(($event.target as HTMLSelectElement).value || null)">
          <option value="">None</option>
          <option v-for="asset in environmentAssets" :key="asset.id" :value="asset.id">{{ asset.name }}</option>
        </select>
        <input ref="hdrInputRef" data-testid="environment-file-input" class="hidden" type="file" accept=".hdr,image/vnd.radiance" @change="handleHdrFile" />
        <el-button data-testid="import-environment" class="w-full" size="small" dark @click="hdrInputRef?.click()">
          <el-icon class="mr-1"><Upload /></el-icon>导入 Custom HDR
        </el-button>
        <div class="flex items-center gap-2 rounded-md bg-slate-900/40 p-2 text-[10px] text-slate-500">
          <el-icon><Picture /></el-icon><span>HDR 作为环境资产保存，不创建场景节点。</span>
        </div>
      </section>

      <section class="space-y-3">
        <p class="panel-title">Camera</p>
        <div class="grid grid-cols-2 gap-2">
          <button v-for="view in cameraViews" :key="view.value" :data-testid="`scene-view-${view.value}`" class="rounded-md bg-slate-900/60 px-2 py-2 text-[11px] text-slate-300 transition hover:bg-slate-700 hover:text-white" type="button" @click="editorStore.setCommonView(view.value)">{{ view.label }}</button>
        </div>
        <button data-testid="scene-fit-view" class="w-full rounded-md bg-slate-900/60 px-2 py-2 text-[11px] text-slate-300 transition hover:bg-slate-700 hover:text-white" type="button" @click="editorStore.fitScene()">Fit Scene</button>
        <p class="text-[10px] leading-4 text-slate-500">保存场景时会读取当前 Camera View；普通 Orbit / Pan / Zoom 不进入 History。</p>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.panel-title { font-size:.625rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:#64748b; }
.setting-row { display:flex; min-height:2rem; align-items:center; justify-content:space-between; gap:.75rem; color:#cbd5e1; }
.setting-row :deep(.el-input-number) { width:7.5rem; }
.toolbar-icon { display:grid; height:1.75rem; width:1.75rem; place-items:center; border-radius:.375rem; color:#94a3b8; }
.toolbar-icon:hover { background:#334155; color:white; }
</style>
