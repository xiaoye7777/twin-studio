<script setup lang="ts">
/**
 * 场景的「数据」页签：选择设备数据从哪里来，并查看所有绑定的设备。
 *
 *   不启用      没有数值
 *   推送        WebSocket 网关实时推送（生产环境）
 *   定时请求    每隔几秒请求一个 HTTP 接口（返回格式与推送消息相同）
 *   静态数据    在这里或对象的「数据」页签里手填数值，立即看到三维效果（调试、演示）
 */
import { Camera, Radio, Send } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { computed, ref } from 'vue'
import {
  type ActiveDataSourceConfig,
  isSafeHttpUrl,
  isSafeRealtimeUrl,
  readPath,
  targetNodeId,
} from '@twin-studio/core'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'
import StaticValueInput from './StaticValueInput.vue'

const session = useSession()
const twin = session.twin

type Choice = ActiveDataSourceConfig['type'] | 'none'
const choice = computed<Choice>(() => session.devices.activeSource?.type ?? 'none')
const choices: Array<{ value: Choice; label: string; title: string }> = [
  { value: 'none', label: '不启用', title: '没有数据源，不显示数值' },
  { value: 'websocket', label: '推送', title: 'WebSocket 网关实时推送' },
  { value: 'http', label: '定时请求', title: '每隔几秒请求一个 HTTP 接口' },
  { value: 'static', label: '静态数据', title: '手填固定数值，用于调试和演示' },
]
const ws = computed(() => session.devices.dataSourceOf('websocket'))
const http = computed(() => session.devices.dataSourceOf('http'))
const fixed = computed(() => session.devices.dataSourceOf('static'))

// ---------------------------------------------------------------- 状态

const statusLabel = computed(() => {
  if (choice.value === 'static') return '静态数据'
  return (
    {
      unconfigured: '未启用',
      connecting: choice.value === 'http' ? '请求中…' : '连接中…',
      connected: choice.value === 'http' ? '请求成功' : '已连接',
      disconnected: '已断开',
      error: choice.value === 'http' ? '请求失败' : '连接错误',
    }[twin.dataSourceStatus] ?? twin.dataSourceStatus
  )
})
const statusClass = computed(() =>
  twin.dataSourceStatus === 'connected'
    ? 's-badge--ok'
    : twin.dataSourceStatus === 'error'
      ? 's-badge--danger'
      : 's-badge--warn',
)

// ---------------------------------------------------------------- 推送

const wsError = ref('')
function setWsUrl(url: string): void {
  wsError.value = isSafeRealtimeUrl(url.trim()) ? '' : '请输入 ws:// 或 wss:// 地址'
  if (!wsError.value) session.devices.updateDataSource('websocket', { url: url.trim() })
}

// ---------------------------------------------------------------- 定时请求

const httpError = ref('')
function setHttpUrl(url: string): void {
  httpError.value = isSafeHttpUrl(url.trim()) ? '' : '请输入 http(s):// 地址或以 / 开头的同域路径，不能包含账号密码'
  if (!httpError.value) session.devices.updateDataSource('http', { url: url.trim() })
}

/** 试请求一次，告诉用户返回里认出了几台已绑定的设备。 */
const testing = ref(false)
const testResult = ref('')
async function testHttp(): Promise<void> {
  const config = http.value
  if (!config) return
  testing.value = true
  testResult.value = ''
  try {
    const response = await fetch(config.url, {
      method: config.method,
      headers: config.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: config.method === 'POST' ? config.body?.trim() || '{"type":"subscribe","devices":[]}' : undefined,
      credentials: config.withCredentials ? 'include' : 'same-origin',
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const result = readPath(await response.json(), config.resultPath)
    const messages = (Array.isArray(result) ? result : [result]).filter(
      (item): item is { deviceId: string } => !!item && typeof (item as { deviceId?: unknown }).deviceId === 'string',
    )
    const bound = new Set(session.doc.value.bindings.map(binding => binding.device.id))
    const matched = messages.filter(message => bound.has(message.deviceId)).length
    testResult.value = messages.length
      ? `成功：返回 ${messages.length} 条设备消息，其中 ${matched} 台是本场景绑定的设备`
      : `请求成功，但在「${config.resultPath || '整个返回值'}」没有找到带 deviceId 的消息，请检查数据位置`
  } catch (error) {
    testResult.value = `失败：${error instanceof TypeError ? '无法连接（服务未启动、地址有误或跨域被拒绝）' : (error as Error).message}`
  } finally {
    testing.value = false
  }
}

// ---------------------------------------------------------------- 静态数据

function captureLive(): void {
  const count = session.devices.captureStaticValues()
  if (count) ElMessage.success(`已记下 ${count} 个当前数值`)
  else ElMessage.info('现在没有收到任何数值：先用「推送」或「定时请求」连上数据')
}
const staticValue = (deviceId: string, key: string) => fixed.value?.values[deviceId]?.[key]

// ---------------------------------------------------------------- 设备列表

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
    <UiSection title="数据源">
      <UiRow label="来源">
        <UiSegmented
          :model-value="choice"
          :options="choices"
          data-testid="datasource-type"
          @update:model-value="session.devices.useDataSource($event === 'none' ? null : $event)"
        />
      </UiRow>

      <!-- 推送 -->
      <template v-if="choice === 'websocket'">
        <UiRow label="地址">
          <UiText :model-value="ws?.url ?? ''" mono data-testid="datasource-url" @commit="setWsUrl" />
        </UiRow>
        <p v-if="wsError" class="data__error">{{ wsError }}</p>
        <p class="data__note s-hint">
          网关每条消息：<code class="s-mono">{"deviceId":"ESS-001","soc":72}</code>，可以一次发一个数组。本地调试运行
          <code class="s-mono">pnpm simulator</code>，它会为本项目绑定的设备生成数据。
        </p>
      </template>

      <!-- 定时请求 -->
      <template v-else-if="choice === 'http' && http">
        <UiRow label="地址">
          <select
            class="s-select data__method"
            :value="http.method"
            @change="
              session.devices.updateDataSource('http', {
                method: ($event.target as HTMLSelectElement).value as 'GET' | 'POST',
              })
            "
          >
            <option>GET</option>
            <option>POST</option>
          </select>
          <UiText :model-value="http.url" mono data-testid="datasource-http-url" @commit="setHttpUrl" />
        </UiRow>
        <p v-if="httpError" class="data__error">{{ httpError }}</p>
        <UiRow label="间隔" hint="每隔多少秒请求一次">
          <input
            class="s-input data__short"
            type="number"
            min="1"
            max="3600"
            :value="http.interval"
            @change="
              session.devices.updateDataSource('http', {
                interval: Math.min(
                  3600,
                  Math.max(1, Math.round(Number(($event.target as HTMLInputElement).value) || 5)),
                ),
              })
            "
          />
          <span class="s-hint">秒</span>
        </UiRow>
        <UiRow label="数据位置" hint="设备消息数组在返回值中的位置，如 data 或 data.list；留空表示整个返回值">
          <UiText
            :model-value="http.resultPath"
            mono
            placeholder="（整个返回值）"
            @commit="session.devices.updateDataSource('http', { resultPath: $event.trim() })"
          />
        </UiRow>
        <UiRow v-if="http.method === 'POST'" label="请求体" stack>
          <textarea
            class="s-textarea s-mono"
            rows="3"
            :value="http.body ?? ''"
            placeholder="留空：自动发送本场景需要的设备清单"
            @change="session.devices.updateDataSource('http', { body: ($event.target as HTMLTextAreaElement).value })"
          />
        </UiRow>
        <UiRow label="带登录态" hint="请求时带上浏览器中该站点的 Cookie（后端需允许带凭据的跨域）">
          <UiSwitch
            :model-value="http.withCredentials"
            @update:model-value="session.devices.updateDataSource('http', { withCredentials: $event })"
          />
        </UiRow>
        <div class="data__actions">
          <button class="s-btn s-btn--sm" :disabled="testing" data-testid="datasource-http-test" @click="testHttp">
            <Send :size="12" />{{ testing ? '请求中…' : '试请求一次' }}
          </button>
        </div>
        <p v-if="testResult" class="data__note" :class="testResult.startsWith('成功') ? 'is-ok' : 'is-bad'">
          {{ testResult }}
        </p>
        <p class="data__note s-hint">
          接口返回与推送消息相同的格式：<code class="s-mono">[{"deviceId":"ESS-001","soc":72}]</code
          >。场景文件会随项目分发， 所以这里不保存 Token；需要登录的接口请走同域或打开「带登录态」。
        </p>
      </template>

      <!-- 静态数据 -->
      <template v-else-if="choice === 'static'">
        <p class="data__note s-hint">
          直接填写每台设备的数值，三维的标牌、告警特效、规则立即按这些值显示。也可以在选中对象的「数据」页签里修改。
        </p>
        <div class="data__actions">
          <button class="s-btn s-btn--sm" title="把现在收到的实时数值记下来，作为静态数据" @click="captureLive">
            <Camera :size="12" />记下当前数值
          </button>
        </div>
      </template>

      <UiRow v-if="choice !== 'none'" label="状态">
        <span class="s-badge" :class="statusClass" data-testid="datasource-status">
          <span class="s-dot" />{{ statusLabel }}
        </span>
        <span v-if="choice !== 'static'" class="s-hint">{{ twin.dataSourceMessageCount }} 条消息</span>
      </UiRow>
      <p v-if="twin.dataSourceError && choice !== 'static'" class="data__error">{{ twin.dataSourceError }}</p>
      <p v-if="choice === 'none'" class="data__note s-hint">没有数据源时不显示任何数值，告警特效也不会触发。</p>
    </UiSection>

    <UiSection title="设备" :count="devices.length">
      <div v-if="!devices.length" class="s-empty">
        <Radio :size="20" />
        <span>还没有绑定设备</span>
        <span class="s-hint">选中对象 →「数据」页签绑定；多选可批量绑定</span>
      </div>
      <template v-for="item in devices" :key="item.binding.id">
        <button class="device" @click="session.select([item.nodeId])">
          <span class="device__dot" :class="{ 'is-live': item.values > 0 }" />
          <span class="device__text">
            <strong>{{ item.binding.device.name || item.binding.device.id }}</strong>
            <small class="s-mono">{{ item.binding.device.id }} · {{ item.nodeName }}</small>
          </span>
          <span class="s-hint">{{ item.values }}/{{ item.binding.variables.length }}</span>
        </button>
        <!-- 静态数据：每个变量一个输入框 -->
        <div v-if="choice === 'static'" class="device__values">
          <label v-for="variable in item.binding.variables" :key="variable.key">
            <span :title="variable.key">{{ variable.name || variable.key }}</span>
            <StaticValueInput
              :data-type="variable.dataType"
              :value="staticValue(item.binding.device.id, variable.key)"
              :testid="`static-${item.binding.device.id}-${variable.key}`"
              @commit="session.devices.setStaticValue(item.binding.device.id, variable.key, $event)"
            />
            <small>{{ variable.unit }}</small>
          </label>
        </div>
      </template>
    </UiSection>
  </div>
</template>

<style scoped>
.data__note {
  margin: 4px 0 0;
  padding: 0 12px;
  line-height: 1.6;
}
.data__note code {
  color: var(--s-fg-2);
  word-break: break-all;
}
.data__note.is-ok {
  color: var(--s-ok);
}
.data__note.is-bad {
  color: var(--s-danger);
}
.data__error {
  margin: 0;
  padding: 0 12px 4px 98px;
  color: var(--s-danger);
  font-size: 11px;
}
.data__actions {
  display: flex;
  justify-content: flex-end;
  padding: 4px 12px 0;
}
.data__method {
  width: 74px;
  flex-shrink: 0;
}
.data__short {
  width: 80px;
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
  background: var(--s-fg-4);
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
.device__values {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 10px;
  margin: 0 8px 8px;
  padding: 6px 8px;
  border-left: 2px solid color-mix(in srgb, var(--s-data) 45%, transparent);
}
.device__values label {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px auto;
  align-items: center;
  gap: 4px;
  color: var(--s-fg-2);
  font-size: 11.5px;
}
.device__values label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.device__values small {
  color: var(--s-fg-3);
}
</style>
