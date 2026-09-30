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
watch(
  () => store.sources,
  sources => {
    // Legacy 'mock' entries are shown as an unconfigured WebSocket form; they never produce data.
    const source = sources.find(item => item.type === 'websocket')
    name.value = source?.name ?? '实时设备数据'
    url.value = source?.type === 'websocket' ? source.url : DEFAULT_REALTIME_URL
    enabled.value = source?.enabled ?? false
  },
  { immediate: true },
)
const statusLabels: Record<DataSourceConnectionStatus, string> = {
  unconfigured: '未配置 · 无数据',
  connecting: '连接中 · 无数据',
  connected: '已连接',
  disconnected: '未连接 · 无数据',
  error: '连接错误 · 无数据',
}
const statusLabel = computed(() => statusLabels[twin.dataSourceStatus])
function apply() {
  try {
    const id = store.sources.find(item => item.type === 'websocket')?.id ?? 'realtime'
    store.update([{ id, name: name.value.trim(), type: 'websocket', enabled: enabled.value, url: url.value.trim() }])
    ElMessage.success('数据源已应用，保存场景后才会写入项目并随导出生效')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}
</script>
<template>
  <section class="space-y-2.5" data-testid="data-source-settings">
    <label class="field"
      ><span>名称</span
      ><input
        v-model="name"
        data-testid="data-source-name"
        aria-label="数据源名称"
        class="st-input w-full"
        placeholder="数据源名称"
    /></label>
    <label class="field"
      ><span>地址</span
      ><input
        v-model="url"
        data-testid="data-source-url"
        aria-label="WebSocket URL"
        class="st-input st-input--mono w-full"
        placeholder="ws://host:port/realtime"
    /></label>
    <div class="flex items-center justify-between">
      <label class="flex items-center gap-2 text-[12px] text-fg-2"
        ><input
          v-model="enabled"
          type="checkbox"
          data-testid="data-source-enabled"
          class="accent-[var(--color-accent)]"
        />启用数据源</label
      >
      <button data-testid="data-source-apply" class="st-btn" type="button" @click="apply">应用</button>
    </div>
    <div class="flex items-center justify-between rounded-[5px] border border-line bg-field px-2.5 py-2">
      <p
        data-testid="data-source-status"
        :data-status="twin.dataSourceStatus"
        class="st-pill px-0!"
        :class="twin.dataSourceStatus === 'connected' ? 'text-ok' : 'text-warn'"
      >
        {{ statusLabel }}
      </p>
      <span class="text-[11px] text-fg-3">{{ twin.dataSourceMessageCount }} 条消息</span>
    </div>
    <p v-if="twin.dataSourceError" class="text-[11px] text-warn">{{ twin.dataSourceError }}</p>
    <p class="st-hint">
      界面上的实时值只来自此
      WebSocket，未连接时不显示任何数据。应用后需保存场景，配置才会写入项目并随导出生效。请勿在地址中放入密钥。
    </p>
  </section>
</template>

<style scoped>
.field {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-fg-2);
}
</style>
