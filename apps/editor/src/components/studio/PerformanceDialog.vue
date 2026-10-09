<script setup lang="ts">
import { Gauge, Lightbulb, RefreshCw } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { builtinModels } from '@/editor/builtinModels'
import { useAssetStore } from '@/stores/assets'
import { useSession } from '@/studio/context'
import { analyzeScene, BUDGET, formatCount, type SceneAnalysis } from '@/studio/sceneAnalysis'
import { useShell } from '@/studio/shell'

const session = useSession()
const shell = useShell()
const assetStore = useAssetStore()
const result = ref<SceneAnalysis | null>(null)

const visible = computed({
  get: () => shell.dialog === 'performance',
  set: value => {
    if (!value) shell.dialog = null
  },
})

function assetName(assetId: string): string {
  const file = assetStore.assets.find(asset => asset.id === assetId)?.name ?? ''
  return builtinModels.find(model => model.file === file)?.name ?? file.replace(/\.glb$/i, '')
}

async function run(): Promise<void> {
  await assetStore.refresh()
  await session.sync.settled()
  result.value = analyzeScene(session.doc.value, id => session.sync.objectFor(id), assetName)
}
watch(visible, open => open && void run(), { immediate: true })

const wan = formatCount
const metrics = computed(() => {
  const r = result.value
  if (!r) return []
  return [
    { label: '三角面', value: wan(r.triangles), ratio: r.triangles / BUDGET.triangles, budget: wan(BUDGET.triangles) },
    {
      label: '绘制次数',
      value: String(r.drawCalls),
      ratio: r.drawCalls / BUDGET.drawCalls,
      budget: String(BUDGET.drawCalls),
    },
    {
      label: '贴图显存',
      value: `${Math.round(r.textureMB)} MB`,
      ratio: r.textureMB / BUDGET.textureMB,
      budget: `${BUDGET.textureMB} MB`,
    },
  ]
})
const level = (ratio: number) => (ratio > 1.5 ? 'is-bad' : ratio > 1 ? 'is-warn' : 'is-ok')
</script>

<template>
  <el-dialog v-model="visible" title="性能体检" width="640px" append-to-body class="studio-dialog">
    <div v-if="result" class="perf" data-testid="performance-report">
      <div class="perf__metrics">
        <div v-for="metric in metrics" :key="metric.label" class="metric" :class="level(metric.ratio)">
          <span class="metric__label">{{ metric.label }}</span>
          <strong class="metric__value">{{ metric.value }}</strong>
          <span class="metric__bar"><i :style="{ width: `${Math.min(100, metric.ratio * 100)}%` }" /></span>
          <span class="metric__budget">普通电脑建议 ≤ {{ metric.budget }}</span>
        </div>
      </div>
      <p class="perf__live">
        <Gauge :size="13" />当前帧率 {{ session.ui.stats.fps }} FPS · 画质「{{
          { low: '流畅', medium: '均衡', high: '高清' }[session.ui.stats.quality]
        }}」· 画质设为「自动」时，大屏会按设备性能自动降低分辨率保证流畅
      </p>
      <ul class="perf__tips" data-testid="performance-tips">
        <li v-for="tip in result.tips" :key="tip"><Lightbulb :size="13" />{{ tip }}</li>
      </ul>
      <table v-if="result.models.length" class="perf__table">
        <thead>
          <tr>
            <th>模型</th>
            <th>数量</th>
            <th>单个面数</th>
            <th>总面数</th>
            <th>网格</th>
            <th>最大贴图</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="model in result.models" :key="model.assetId">
            <td>{{ model.name }}</td>
            <td>{{ model.instances }}</td>
            <td :class="{ 'is-warn': model.triangles > 200_000 }">{{ wan(model.triangles) }}</td>
            <td>{{ wan(model.triangles * model.instances) }}</td>
            <td>{{ model.meshes }}</td>
            <td :class="{ 'is-warn': model.maxTexture > 2048 }">{{ model.maxTexture || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <template #footer>
      <button class="s-btn" @click="run"><RefreshCw :size="13" />重新检测</button>
      <button class="s-btn s-btn--primary" @click="shell.dialog = null">完成</button>
    </template>
  </el-dialog>
</template>

<style scoped>
.perf {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.perf__metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--s-line);
  border-radius: 8px;
  background: var(--s-panel-2);
}
.metric__label,
.metric__budget {
  color: var(--s-fg-3);
  font-size: 11px;
}
.metric__value {
  color: var(--s-fg);
  font-size: 20px;
  font-weight: 600;
}
.metric__bar {
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--s-line);
}
.metric__bar i {
  display: block;
  height: 100%;
  background: var(--s-ok);
}
.metric.is-warn .metric__bar i {
  background: var(--s-warn);
}
.metric.is-bad .metric__bar i {
  background: var(--s-danger);
}
.metric.is-bad .metric__value {
  color: var(--s-danger);
}
.perf__live {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--s-fg-3);
  font-size: 11.5px;
}
.perf__tips {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.perf__tips li {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--s-accent-soft);
  color: var(--s-fg);
  font-size: 12px;
  line-height: 1.6;
}
.perf__tips li svg {
  flex-shrink: 0;
  margin-top: 3px;
  color: var(--s-accent);
}
.perf__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.perf__table th,
.perf__table td {
  padding: 5px 8px;
  border-bottom: 1px solid var(--s-line);
  text-align: right;
}
.perf__table th:first-child,
.perf__table td:first-child {
  text-align: left;
}
.perf__table th {
  color: var(--s-fg-3);
  font-weight: 500;
}
.perf__table td {
  color: var(--s-fg-2);
  font-family: var(--s-mono);
}
.perf__table td:first-child {
  font-family: inherit;
}
.perf__table td.is-warn {
  color: var(--s-warn);
}
</style>
