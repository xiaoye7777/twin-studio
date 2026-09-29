<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useDataSourcesStore } from '@/stores/dataSources'
import { useTwinStore } from '@/stores/twin'
const store = useDataSourcesStore()
const twin = useTwinStore()
const name = ref('')
const type = ref<'mock' | 'websocket'>('mock')
const url = ref('')
const enabled = ref(true)
watch(() => store.sources, sources => {
  const source = sources.find(item => item.enabled) ?? sources[0]
  name.value = source?.name ?? '实时设备数据'
  type.value = source?.type ?? 'mock'
  enabled.value = source?.enabled ?? false
  url.value = source?.type === 'websocket' ? source.url : ''
}, { immediate: true })
function apply() {
  try {
    const base = { id: store.sources[0]?.id ?? crypto.randomUUID(), name: name.value.trim(), enabled: enabled.value }
    store.update([type.value === 'mock' ? { ...base, type: 'mock' } : { ...base, type: 'websocket', url: url.value.trim() }])
    ElMessage.success('数据源已应用，保存场景后持久化')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : String(error)) }
}
</script>
<template>
  <section class="space-y-3" data-testid="data-source-settings">
    <p class="text-xs font-semibold">项目数据源</p>
    <input v-model="name" data-testid="data-source-name" aria-label="数据源名称" class="w-full rounded bg-slate-900 p-2" placeholder="数据源名称" />
    <select v-model="type" data-testid="data-source-type" aria-label="数据源类型" class="w-full rounded bg-slate-900 p-2"><option value="mock">Mock</option><option value="websocket">WebSocket</option></select>
    <input v-if="type === 'websocket'" v-model="url" data-testid="data-source-url" aria-label="WebSocket URL" class="w-full rounded bg-slate-900 p-2" placeholder="ws://host:port/realtime" />
    <label class="flex gap-2"><input v-model="enabled" type="checkbox" data-testid="data-source-enabled" />启用数据源</label>
    <el-button data-testid="data-source-apply" size="small" @click="apply">应用数据源</el-button>
    <p data-testid="data-source-status">{{ twin.dataSourceStatus }} · {{ twin.dataSourceMessageCount }} 条消息</p>
    <p v-if="twin.dataSourceError" class="text-amber-400">{{ twin.dataSourceError }}</p>
    <p class="text-slate-500">配置随项目保存、导出。仅支持一个启用的数据源；请勿在地址中放入密钥。</p>
  </section>
</template>
