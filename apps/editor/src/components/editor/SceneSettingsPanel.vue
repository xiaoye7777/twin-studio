<script setup lang="ts">
import DataSourceSettings from './DataSourceSettings.vue'
import InspectorSection from './InspectorSection.vue'
import { Close, Picture, Upload } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import type { Vector3Tuple } from '@twin-studio/core'
import { useAssetStore } from '@/stores/assets'
import { useEditorStore, type CommonView } from '@/stores/editor'
import { useSceneSettingsStore } from '@/stores/sceneSettings'

const sceneSettingsStore = useSceneSettingsStore()
const assetStore = useAssetStore()
const editorStore = useEditorStore()
const hdrInputRef = ref<HTMLInputElement>()
const environmentAssets = computed(() => assetStore.assets.filter((asset) => asset.assetType === 'environment'))
const cameraViews: Array<{ value: CommonView; label: string }> = [
  { value: 'top', label: '顶视图' },
  { value: 'front', label: '前视图' },
  { value: 'right', label: '右视图' },
  { value: 'perspective', label: '透视图' },
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
  <aside data-testid="scene-settings-panel" class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-panel text-fg-2">
    <header class="st-panel-header justify-between pr-1.5">
      <span>场景设置</span>
      <button data-testid="close-scene-settings" class="close-btn" type="button" aria-label="关闭场景设置" @click="sceneSettingsStore.closePanel()">
        <el-icon><Close /></el-icon>
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <InspectorSection title="实时数据源">
        <DataSourceSettings />
      </InspectorSection>

      <InspectorSection title="辅助显示">
        <label class="setting-row"><span>网格</span><el-switch data-testid="scene-grid-toggle" size="small" :model-value="sceneSettingsStore.settings.gridEnabled" @change="sceneSettingsStore.setGridEnabled(Boolean($event))" /></label>
        <label class="setting-row"><span>坐标轴</span><el-switch data-testid="scene-axes-toggle" size="small" :model-value="sceneSettingsStore.settings.axesEnabled" @change="sceneSettingsStore.setAxesEnabled(Boolean($event))" /></label>
      </InspectorSection>

      <InspectorSection title="地面">
        <label class="setting-row"><span>显示地面</span><el-switch data-testid="scene-ground-toggle" size="small" :model-value="sceneSettingsStore.settings.ground.enabled" @change="sceneSettingsStore.setGroundEnabled(Boolean($event))" /></label>
        <label class="setting-row"><span>尺寸</span><el-input-number data-testid="scene-ground-size" :model-value="sceneSettingsStore.settings.ground.size" :min="1" :max="10000" :step="10" size="small" controls-position="right" @change="sceneSettingsStore.setGroundSize(Number($event))" /></label>
        <label class="setting-row"><span>颜色</span><input data-testid="scene-ground-color" type="color" class="st-input" :value="sceneSettingsStore.settings.ground.color" @input="sceneSettingsStore.setGroundColor(($event.target as HTMLInputElement).value)" /></label>
      </InspectorSection>

      <InspectorSection title="灯光">
        <label class="setting-row"><span>环境光</span><el-input-number data-testid="scene-ambient-intensity" :model-value="sceneSettingsStore.settings.lighting.ambientIntensity" :min="0" :max="20" :step="0.1" :precision="1" size="small" controls-position="right" @change="sceneSettingsStore.setAmbientIntensity(Number($event))" /></label>
        <label class="setting-row"><span>方向光</span><el-input-number data-testid="scene-directional-intensity" :model-value="sceneSettingsStore.settings.lighting.directionalIntensity" :min="0" :max="20" :step="0.1" :precision="1" size="small" controls-position="right" @change="sceneSettingsStore.setDirectionalIntensity(Number($event))" /></label>
        <div class="setting-row items-start!">
          <span class="pt-1">光源位置</span>
          <div class="grid grid-cols-3 gap-1">
            <el-input-number v-for="(axis, index) in ['X', 'Y', 'Z']" :key="axis" :aria-label="`方向光 ${axis}`" :model-value="sceneSettingsStore.settings.lighting.directionalPosition[index]" :controls="false" size="small" class="w-full!" @change="updateDirectionalAxis(index, $event)" />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="环境贴图">
        <select data-testid="scene-environment-select" class="st-select w-full" :value="sceneSettingsStore.settings.environmentAssetId ?? ''" @change="sceneSettingsStore.setEnvironmentAssetId(($event.target as HTMLSelectElement).value || null)">
          <option value="">无</option>
          <option v-for="asset in environmentAssets" :key="asset.id" :value="asset.id">{{ asset.name }}</option>
        </select>
        <input ref="hdrInputRef" data-testid="environment-file-input" class="hidden" type="file" accept=".hdr,image/vnd.radiance" @change="handleHdrFile" />
        <button data-testid="import-environment" class="st-btn w-full" type="button" @click="hdrInputRef?.click()">
          <el-icon><Upload /></el-icon>导入 HDR 环境贴图
        </button>
        <p class="st-hint flex items-center gap-1.5"><el-icon><Picture /></el-icon>HDR 作为环境资产保存，不创建场景节点。</p>
      </InspectorSection>

      <InspectorSection title="相机">
        <div class="grid grid-cols-2 gap-1">
          <button v-for="view in cameraViews" :key="view.value" :data-testid="`scene-view-${view.value}`" class="st-btn" type="button" @click="editorStore.setCommonView(view.value)">{{ view.label }}</button>
        </div>
        <button data-testid="scene-fit-view" class="st-btn w-full" type="button" @click="editorStore.fitScene()">显示全部</button>
        <p class="st-hint">保存场景时记录当前相机视角；旋转、平移、缩放视角不计入撤销历史。</p>
      </InspectorSection>
    </div>
  </aside>
</template>

<style scoped>
.setting-row { display:grid; grid-template-columns:72px minmax(0,1fr); min-height:26px; align-items:center; gap:10px; font-size:12px; color:var(--color-fg-2); }
.setting-row > :last-child { justify-self:end; }
.setting-row :deep(.el-input-number) { width:8rem; }
.close-btn { display:grid; height:22px; width:22px; place-items:center; border-radius:4px; color:var(--color-fg-3); }
.close-btn:hover { background:var(--color-hover); color:var(--color-fg); }
</style>
