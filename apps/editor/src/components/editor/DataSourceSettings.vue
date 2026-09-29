<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { DEFAULT_REALTIME_URL, type DataSourceConnectionStatus } from '@twin-studio/core'
import { useDataSourcesStore } from '@/stores/dataSources'
import { useTwinStore } from '@/stores/twin'
const store = useDataSourcesStore()
const twin = useTwinStore()
const name = ref('')
const url = ref('')
const enabled = ref(true)
watch(() => store.sources, sources => {
  // Legacy 'mock' entries are shown as an unconfigured WebSocket form; they never produce data.
  const source = sources.find(item => item.type === 'websocket')
  name.value = source?.name ?? '实时设备数据'
  url.value = source?.type === 'websocket' ? source.url : DEFAULT_REALTIME_URL
  enabled.value = source?.enabled ?? false
}, { immediate: true })
const statusLabels: Record<DataSourceConnectionStatus, string> = {
  unconfigured: '未配置 · 无数据', connecting: '连接中 · 无数据', connected: '已连接',
  disconnected: '未连接 · 无数据', error: '连接错误 · 无数据',
}
const statusLabel = computed(() => statusLabels[twin.dataSourceStatus])
function apply() {
  try {
    const id = store.sources.find(item => item.type === 'websocket')?.id ?? 'realtime'
    store.update([{ id, name: name.value.trim(), type: 'websocket', enabled: enabled.value, url: url.value.trim() }])
    ElMessage.success('数据源已应用，保存场景后才会写入项目并随导出生效')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : String(error)) }
}
</script>
<template>
  <section class="space-y-3" data-testid="data-source-settings">
    <p class="text-xs font-semibold">实时数据源（WebSocket）</p>
    <input v-model="name" data-testid="data-source-name" aria-label="数据源名称" class="w-full rounded bg-slate-900 p-2" placeholder="数据源名称" />
    <input v-model="url" data-testid="data-source-url" aria-label="WebSocket URL" class="w-full rounded bg-slate-900 p-2" placeholder="ws://host:port/realtime" />
    <label class="flex gap-2"><input v-model="enabled" type="checkbox" data-testid="data-source-enabled" />启用数据源</label>
    <el-button data-testid="data-source-apply" size="small" @click="apply">应用数据源</el-button>
    <p data-testid="data-source-status" :data-status="twin.dataSourceStatus" :class="twin.dataSourceStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'">
      {{ statusLabel }} · {{ twin.dataSourceMessageCount }} 条消息
    </p>
    <p v-if="twin.dataSourceError" class="text-amber-400">{{ twin.dataSourceError }}</p>
    <p class="text-slate-500">所有实时值只来自此 WebSocket；未连接时不显示任何数据。配置随项目保存、导出，请勿在地址中放入密钥。</p>
  </section>
</template>
