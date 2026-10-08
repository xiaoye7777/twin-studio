<script setup lang="ts">
import { Radio } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { DEFAULT_REALTIME_URL, isSafeRealtimeUrl, targetNodeId } from '@twin-studio/core'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useSession } from '@/studio/context'

const session = useSession()
const twin = session.twin
const source = computed(() => session.doc.value.dataSources?.find(item => item.type === 'websocket'))
const url = ref(source.value?.type === 'websocket' ? source.value.url : DEFAULT_REALTIME_URL)
watch(source, value => {
  if (value?.type === 'websocket') url.value = value.url
})
const enabled = computed(() => !!source.value?.enabled)
const urlError = computed(() => (isSafeRealtimeUrl(url.value) ? '' : '请输入 ws:// 或 wss:// 地址'))

const statusLabel: Record<string, string> = {
  unconfigured: '未启用',
  connecting: '连接中…',
  connected: '已连接',
  disconnected: '已断开',
  error: '连接错误',
}
const statusClass = computed(() =>
  twin.dataSourceStatus === 'connected'
    ? 's-badge--ok'
    : twin.dataSourceStatus === 'error'
      ? 's-badge--danger'
      : 's-badge--warn',
)

function apply(nextEnabled = enabled.value): void {
  if (urlError.value) return
  session.setDataSource(url.value.trim(), nextEnabled)
}

const devices = computed(() => {
  void twin.runtimeRevision
  const doc = session.doc.value
  return doc.bindings.map(binding => {
    const nodeId = targetNodeId(binding.target)
    const node = doc.nodes.find(item => item.id === nodeId)
    const values = binding.variables.filter(variable => twin.getRuntimeValue(binding.id, variable.key)).length
    return { binding, nodeId, nodeName: node?.name ?? '（对象已删除）', values }
  })
})
</script>

<template>
  <div data-testid="scene-data">
    <UiSection title="实时数据源">
      <UiRow label="WebSocket">
        <input v-model="url" class="s-input s-mono" data-testid="datasource-url" @change="apply()" />
      </UiRow>
      <p v-if="urlError" class="data__error">{{ urlError }}</p>
      <UiRow label="启用">
        <UiSwitch :model-value="enabled" data-testid="datasource-enabled" @update:model-value="apply($event)" />
      </UiRow>
      <UiRow label="状态">
        <span class="s-badge" :class="statusClass" data-testid="datasource-status">
          <span class="s-dot" />{{ statusLabel[twin.dataSourceStatus] ?? twin.dataSourceStatus }}
        </span>
        <span class="s-hint">{{ twin.dataSourceMessageCount }} 条消息</span>
      </UiRow>
      <p v-if="twin.dataSourceError" class="data__error">{{ twin.dataSourceError }}</p>
      <p class="data__note s-hint">
        网关每条消息格式：<code class="s-mono">{"deviceId":"ESS-001","soc":72}</code>，可批量发送数组。 本地调试可运行
        <code class="s-mono">pnpm simulator</code>：模拟服务会自动为本项目已绑定的设备生成数据。数值只来自
        WebSocket，断开即清空。
      </p>
    </UiSection>

    <UiSection title="设备" :count="devices.length">
      <div v-if="!devices.length" class="s-empty">
        <Radio :size="20" />
        <span>还没有绑定设备</span>
        <span class="s-hint">选中对象 →「数据」页签绑定；多选可批量绑定</span>
      </div>
      <button v-for="item in devices" :key="item.binding.id" class="device" @click="session.select([item.nodeId])">
        <span class="device__dot" :class="{ 'is-live': item.values > 0 }" />
        <span class="device__text">
          <strong>{{ item.binding.device.name || item.binding.device.id }}</strong>
          <small class="s-mono">{{ item.binding.device.id }} · {{ item.nodeName }}</small>
        </span>
        <span class="s-hint">{{ item.values }}/{{ item.binding.variables.length }}</span>
      </button>
    </UiSection>
  </div>
</template>

<style scoped>
.data__note {
  margin: 4px 0 0;
  padding: 0 12px;
}
.data__note code {
  color: var(--s-fg-2);
}
.data__error {
  margin: 0;
  padding: 0 12px 4px 98px;
  color: var(--s-danger);
  font-size: 11px;
}
.device {
  display: flex;
  width: calc(100% - 16px);
  align-items: center;
  gap: 8px;
  margin: 0 8px 3px;
  padding: 6px 8px;
  border: 1px solid var(--s-line);
  border-radius: 5px;
  background: var(--s-panel-2);
  text-align: left;
  cursor: pointer;
}
.device:hover {
  border-color: var(--s-accent-line);
}
.device__dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #4a4b50;
}
.device__dot.is-live {
  background: var(--s-ok);
  box-shadow: 0 0 6px var(--s-ok);
}
.device__text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.device__text strong {
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.device__text small {
  overflow: hidden;
  color: var(--s-fg-3);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
