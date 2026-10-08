<script setup lang="ts">
import { ElMessage } from 'element-plus'
import {
  Box,
  Expand,
  Focus,
  Grid3x3,
  Lightbulb,
  Magnet,
  MousePointer2,
  Move,
  Pause,
  Play,
  Rotate3d,
  Scaling,
  SkipBack,
  SkipForward,
  Spline,
  Square,
  SquareDashed,
  Tag,
} from 'lucide-vue-next'
import { computed, inject, ref } from 'vue'
import type { PrimitiveShape } from '@twin-studio/core'
import { readAssetDragPayload, ASSET_DRAG_MIME } from '@/editor/assetDrag'
import { getBuiltinModel, importBuiltinModel } from '@/editor/builtinModels'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { useAssetStore } from '@/stores/assets'
import { SessionKey } from '@/studio/context'
import type { EditorTool } from '@/studio/EditorSession'

const sessionRef = inject(SessionKey)!
const canvas = ref<HTMLCanvasElement>()
defineExpose({ canvas })
const assetStore = useAssetStore()
const dropping = ref(false)
const busy = ref(false)

const session = computed(() => sessionRef.value)
const ui = computed(() => sessionRef.value?.ui)
const nodeCount = computed(() => sessionRef.value?.doc.value.nodes.length ?? 0)
const editing = computed(() => ui.value?.mode === 'edit')

const tools: Array<{ id: EditorTool; icon: unknown; label: string; key: string }> = [
  { id: 'select', icon: MousePointer2, label: '选择', key: 'Q' },
  { id: 'translate', icon: Move, label: '移动', key: 'W' },
  { id: 'rotate', icon: Rotate3d, label: '旋转', key: 'E' },
  { id: 'scale', icon: Scaling, label: '缩放', key: 'R' },
]
const drawTools = [
  { id: 'path', icon: Spline, label: '绘制能流线（单击加点，双击/回车完成）' },
  { id: 'area', icon: SquareDashed, label: '绘制区域（单击加点，双击/回车完成）' },
  { id: 'label', icon: Tag, label: '放置文字标签' },
  { id: 'light', icon: Lightbulb, label: '放置灯光' },
] as const

const drawHint = computed(() => {
  const draw = ui.value?.draw
  if (!draw) return ''
  const points = ui.value?.drawPoints ?? 0
  if (draw === 'label') return '在场景中单击放置标签 · Esc 取消'
  if (draw === 'light') return '在场景中单击放置灯光 · Esc 取消'
  const need = draw === 'area' ? 3 : 2
  const name = draw === 'area' ? '区域' : '能流线'
  return `绘制${name}：已放置 ${points} 个点 · 单击加点 · ${points >= need ? '双击或回车完成' : `至少 ${need} 个点`} · Backspace 撤销点 · Esc 取消`
})

const qualityLabel = computed(() => {
  const stats = ui.value?.stats
  if (!stats) return ''
  const names = { low: '流畅', medium: '均衡', high: '高清' } as const
  return `${stats.setting === 'auto' ? '自动 · ' : ''}${names[stats.quality]}`
})

function triangles(count: number): string {
  return count >= 1e6 ? `${(count / 1e6).toFixed(1)}M` : count >= 1e3 ? `${(count / 1e3).toFixed(0)}K` : String(count)
}

function onDragOver(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes(ASSET_DRAG_MIME) || !editing.value) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
  dropping.value = true
}

async function onDrop(event: DragEvent): Promise<void> {
  event.preventDefault()
  dropping.value = false
  const s = session.value
  const payload = readAssetDragPayload(event.dataTransfer)
  if (!s || !payload || !editing.value) return
  const point = s.engine.pointAt(event.clientX, event.clientY)
  busy.value = true
  try {
    if (payload.type === 'asset') await s.addModel(payload.assetId, point)
    else if (payload.type === 'builtin') {
      const model = getBuiltinModel(payload.modelKey)
      if (!model) throw new Error('内置模型不存在')
      const record = await importBuiltinModel(model, new IndexedDbAssetRepository())
      void assetStore.refresh()
      await s.addModel(record.id, point)
    } else s.addPrimitive(payload.presetId as PrimitiveShape, point)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '放置失败')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    class="viewport"
    :class="{ 'is-dropping': dropping, 'is-drawing': !!ui?.draw }"
    data-testid="viewport"
    @dragover="onDragOver"
    @dragleave="dropping = false"
    @drop="onDrop"
  >
    <canvas ref="canvas" class="viewport__canvas" data-testid="viewport-canvas" tabindex="-1" />

    <template v-if="session && ui?.ready">
      <!-- Tools -->
      <div v-if="editing" class="viewport__tools s-float" data-testid="viewport-tools">
        <button
          v-for="tool in tools"
          :key="tool.id"
          class="s-icon-btn"
          :class="{ 'is-active': ui.tool === tool.id && !ui.draw }"
          :title="`${tool.label}（${tool.key}）`"
          :data-testid="`tool-${tool.id}`"
          @click="session.setTool(tool.id)"
        >
          <component :is="tool.icon" :size="15" />
        </button>
        <span class="viewport__tools-sep" />
        <button
          v-for="tool in drawTools"
          :key="tool.id"
          class="s-icon-btn"
          :class="{ 'is-active': ui.draw === tool.id }"
          :title="tool.label"
          :data-testid="`draw-${tool.id}`"
          @click="ui.draw === tool.id ? session.cancelDrawing() : session.startDrawing(tool.id)"
        >
          <component :is="tool.icon" :size="15" />
        </button>
        <span class="viewport__tools-sep" />
        <button
          class="s-icon-btn"
          :class="{ 'is-active': ui.snap.enabled }"
          :title="`吸附（移动 ${ui.snap.translate} m · 旋转 ${ui.snap.rotate}°）`"
          @click="session.setSnap(!ui.snap.enabled)"
        >
          <Magnet :size="15" />
        </button>
        <button
          class="s-icon-btn viewport__space"
          :title="ui.space === 'world' ? '世界坐标（点击切换为本地）' : '本地坐标（点击切换为世界）'"
          @click="session.setSpace(ui.space === 'world' ? 'local' : 'world')"
        >
          {{ ui.space === 'world' ? '世界' : '本地' }}
        </button>
      </div>

      <!-- Views -->
      <div class="viewport__views s-float">
        <button class="viewport__view" title="透视（0）" @click="session.viewFrom('perspective')">透视</button>
        <button class="viewport__view" title="顶视图（7）" @click="session.viewFrom('top')">顶</button>
        <button class="viewport__view" title="前视图（1）" @click="session.viewFrom('front')">前</button>
        <button class="viewport__view" title="右视图（3）" @click="session.viewFrom('right')">右</button>
        <span class="viewport__tools-sep viewport__tools-sep--v" />
        <button class="s-icon-btn" title="聚焦选中（F）" @click="session.focusSelection()"><Focus :size="14" /></button>
        <button class="s-icon-btn" title="全景" @click="session.engine.fitAll()"><Expand :size="14" /></button>
      </div>

      <!-- Performance -->
      <div class="viewport__stats" data-testid="viewport-stats">
        <span>{{ nodeCount }} 个对象</span>
        <span>{{ triangles(ui.stats.triangles) }} 三角面</span>
        <span :class="{ 'is-low': ui.stats.fps < 30 }">{{ ui.stats.fps }} FPS</span>
        <span>{{ qualityLabel }}</span>
      </div>

      <!-- Preview mode hint -->
      <div v-if="!editing" class="viewport__preview-badge s-float">
        <span class="s-dot" />预览模式 · 交互、告警规则与导览按大屏效果运行 · <span class="s-kbd">Esc</span> 退出
      </div>

      <!-- Drawing hint -->
      <div v-if="drawHint" class="viewport__hint s-float" data-testid="draw-hint">{{ drawHint }}</div>

      <!-- Tour playback -->
      <div v-if="ui.tour.playing" class="viewport__tour" data-testid="tour-bar">
        <div v-if="ui.tour.caption" class="viewport__caption">{{ ui.tour.caption }}</div>
        <div class="viewport__tour-controls s-float">
          <span class="viewport__tour-name">{{ ui.tour.tourName }}</span>
          <span class="s-mono">{{ ui.tour.stepIndex + 1 }} / {{ ui.tour.stepCount }}</span>
          <button class="s-icon-btn" title="上一步" @click="session.tours.previous()"><SkipBack :size="14" /></button>
          <button
            class="s-icon-btn"
            :title="ui.tour.paused ? '继续' : '暂停'"
            @click="ui.tour.paused ? session.tours.resume() : session.tours.pause()"
          >
            <Play v-if="ui.tour.paused" :size="14" /><Pause v-else :size="14" />
          </button>
          <button class="s-icon-btn" title="下一步" @click="session.tours.next()"><SkipForward :size="14" /></button>
          <button class="s-icon-btn" title="停止" @click="session.stopTour()"><Square :size="13" /></button>
        </div>
      </div>

      <!-- Empty scene -->
      <div v-if="editing && nodeCount === 0 && !ui.draw" class="viewport__empty">
        <Box :size="30" />
        <strong>从这里开始搭建场景</strong>
        <span>从左侧「资源」拖入模型，或用左侧工具绘制能流线与区域</span>
        <div class="viewport__empty-actions">
          <button class="s-btn" @click="session.addPrimitive('plane')"><Grid3x3 :size="13" />添加地块</button>
          <button class="s-btn" @click="session.startDrawing('area')"><SquareDashed :size="13" />绘制区域</button>
          <button class="s-btn" @click="session.applyPreset('night')">科技夜景氛围</button>
        </div>
      </div>
    </template>

    <div v-if="session && !ui?.ready" class="viewport__overlay" role="status">
      <template v-if="ui?.error">
        <strong>场景无法打开</strong>
        <span>{{ ui.error }}</span>
      </template>
      <template v-else><span class="viewport__spinner" />正在加载场景…</template>
    </div>
    <div v-if="busy" class="viewport__busy"><span class="viewport__spinner" />正在加载模型…</div>
  </div>
</template>

<style scoped>
.viewport {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background: #16181b;
}
.viewport.is-dropping::after {
  position: absolute;
  inset: 8px;
  border: 1.5px dashed var(--s-accent-line);
  border-radius: 10px;
  background: rgb(232 137 74 / 0.06);
  pointer-events: none;
  content: '';
}
.viewport.is-drawing .viewport__canvas {
  cursor: crosshair;
}
.viewport__canvas {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}
.viewport__tools {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
}
.viewport__tools-sep {
  height: 1px;
  margin: 3px 4px;
  background: var(--s-line-2);
}
.viewport__tools-sep--v {
  width: 1px;
  height: 16px;
  margin: 0 3px;
}
.viewport__space {
  font-size: 10px;
  font-weight: 600;
}
.viewport__views {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 3px;
}
.viewport__view {
  height: 26px;
  min-width: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--s-fg-2);
  font-size: 11.5px;
  cursor: pointer;
}
.viewport__view:hover {
  background: var(--s-hover);
  color: var(--s-fg);
}
.viewport__stats {
  position: absolute;
  bottom: 10px;
  left: 10px;
  display: flex;
  gap: 10px;
  padding: 4px 9px;
  border-radius: 5px;
  background: rgb(14 15 17 / 0.55);
  color: var(--s-fg-2);
  font-family: var(--s-mono);
  font-size: 10.5px;
  pointer-events: none;
}
.viewport__stats .is-low {
  color: var(--s-warn);
}
.viewport__preview-badge {
  position: absolute;
  top: 12px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  color: var(--s-fg-2);
  transform: translateX(-50%);
}
.viewport__preview-badge .s-dot {
  color: var(--s-ok);
}
.viewport__hint {
  position: absolute;
  bottom: 14px;
  left: 50%;
  padding: 7px 14px;
  color: var(--s-fg);
  font-size: 12px;
  transform: translateX(-50%);
  white-space: nowrap;
}
.viewport__tour {
  position: absolute;
  right: 0;
  bottom: 16px;
  left: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}
.viewport__caption {
  max-width: min(80%, 760px);
  padding: 9px 20px;
  border-radius: 8px;
  background: rgb(10 11 13 / 0.68);
  backdrop-filter: blur(6px);
  color: #f4f2ee;
  font-size: clamp(14px, 2vmin, 22px);
  text-align: center;
}
.viewport__tour-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px 3px 12px;
  pointer-events: auto;
}
.viewport__tour-name {
  margin-right: 6px;
  font-weight: 600;
}
.viewport__empty {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 26px 30px;
  border: 1px solid rgb(255 255 255 / 0.06);
  border-radius: 12px;
  background: rgb(22 23 26 / 0.72);
  backdrop-filter: blur(8px);
  color: var(--s-fg-2);
  text-align: center;
  transform: translate(-50%, -50%);
}
.viewport__empty strong {
  color: var(--s-fg);
  font-size: 14px;
}
.viewport__empty > svg {
  color: var(--s-accent);
}
.viewport__empty-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.viewport__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #16181b;
  color: var(--s-fg-2);
}
.viewport__overlay strong {
  color: var(--s-danger);
  font-size: 14px;
}
.viewport__busy {
  position: absolute;
  top: 12px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 6px;
  background: rgb(20 21 24 / 0.86);
  transform: translateX(-50%);
}
.viewport__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgb(255 255 255 / 0.15);
  border-top-color: var(--s-accent);
  border-radius: 50%;
  animation: viewport-spin 0.9s linear infinite;
}
@keyframes viewport-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
