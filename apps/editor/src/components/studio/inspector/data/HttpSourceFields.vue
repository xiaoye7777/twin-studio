<script setup lang="ts">
/** 定时请求接口的配置：请求（地址、参数、请求头、请求体、认证）+ 数据解析 + 涉及设备 + 试请求。 */
import { computed, onMounted, ref } from 'vue'
import { type HttpDataSourceConfig, isSafeHttpUrl } from '@twin-studio/core'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiText from '@/components/ui/UiText.vue'
import { connectionNeedsAuthRef, sourceFromDataset } from '@/screen/datasources/sceneSource'
import { useDataSourceStore } from '@/screen/datasources/store'
import { openDataSourceCenter } from '@/screen/editor/api/openDataSourceCenter'
import { useSession } from '@/studio/context'
import KeyValueRows from './KeyValueRows.vue'
import SourceDevices from './SourceDevices.vue'
import SourceParsing from './SourceParsing.vue'
import SourceProbe from './SourceProbe.vue'
import { useSourceProbe } from './useSourceProbe'

const props = defineProps<{ source: HttpDataSourceConfig }>()
const session = useSession()
const interfaces = useDataSourceStore()
onMounted(() => void interfaces.load())
const probe = useSourceProbe(() => props.source)
const update = (patch: Partial<HttpDataSourceConfig>) => session.devices.updateSource(props.source.id, patch)

// ---------------------------------------------------------------- 地址

const urlError = ref('')
function setUrl(url: string): void {
  urlError.value = isSafeHttpUrl(url.trim())
    ? ''
    : '请输入 http(s):// 地址或以 / 开头的同域路径，不能包含账号密码或 Token 参数'
  if (!urlError.value) update({ url: url.trim() })
}
const seconds = (event: Event, max: number, fallback: number) =>
  Math.min(max, Math.max(1, Math.round(Number((event.target as HTMLInputElement).value) || fallback)))

// ---------------------------------------------------------------- 认证：不需要 / 登录 Cookie / 引用数据服务

const authChoice = computed(() =>
  props.source.authRef ? `service:${props.source.authRef}` : props.source.withCredentials ? 'cookie' : 'none',
)
const authServices = computed(() => interfaces.connections.filter(connectionNeedsAuthRef))
/** 场景引用的数据服务在这台电脑上没有（场景是别人做的、或换了电脑）。 */
const authMissing = computed(
  () => !!props.source.authRef && interfaces.loaded && !interfaces.connection(props.source.authRef),
)
function setAuth(choice: string): void {
  update({
    withCredentials: choice === 'cookie',
    authRef: choice.startsWith('service:') ? choice.slice('service:'.length) : undefined,
  })
}

// ---------------------------------------------------------------- 从「数据接口」页面已登记的接口导入

const importError = ref('')
function importDataset(id: string): void {
  const dataset = interfaces.dataset(id)
  const connection = dataset && interfaces.connection(dataset.connectionId)
  if (!dataset || !connection) return
  const config = sourceFromDataset(dataset, connection)
  importError.value = config ? '' : '这个接口的地址不能写进场景（带账号密码或 Token），请改用「认证」'
  if (config) update(config)
}
</script>

<template>
  <div>
    <UiRow label="名称">
      <UiText
        :model-value="source.name"
        data-testid="source-name"
        @commit="update({ name: $event.trim() || source.name })"
      />
    </UiRow>
    <UiRow label="导入" hint="复制「数据接口」页面里已登记接口的配置（可从 Swagger / YApi 批量导入）">
      <select
        v-if="interfaces.datasets.length"
        class="s-select"
        data-testid="source-import"
        @change="
          (importDataset(($event.target as HTMLSelectElement).value), (($event.target as HTMLSelectElement).value = ''))
        "
      >
        <option value="">从已登记的接口导入…</option>
        <optgroup v-for="connection in interfaces.connections" :key="connection.id" :label="connection.name">
          <option v-for="dataset in interfaces.datasetsOf(connection.id)" :key="dataset.id" :value="dataset.id">
            {{ dataset.name }}
          </option>
        </optgroup>
      </select>
      <button v-else class="s-btn s-btn--sm" @click="openDataSourceCenter()">去登记接口…</button>
    </UiRow>
    <p v-if="importError" class="fields__error">{{ importError }}</p>
    <UiRow label="地址">
      <select
        class="s-select fields__method"
        :value="source.method"
        data-testid="source-method"
        @change="update({ method: ($event.target as HTMLSelectElement).value as 'GET' | 'POST' })"
      >
        <option>GET</option>
        <option>POST</option>
      </select>
      <UiText :model-value="source.url" mono data-testid="datasource-http-url" @commit="setUrl" />
    </UiRow>
    <p v-if="urlError" class="fields__error">{{ urlError }}</p>
    <UiRow label="请求间隔" hint="每隔多少秒请求一次">
      <input
        class="s-input fields__short"
        type="number"
        min="1"
        max="3600"
        :value="source.interval"
        data-testid="source-interval"
        @change="update({ interval: seconds($event, 3600, 5) })"
      />
      <span class="s-hint">秒</span>
    </UiRow>
    <UiRow label="超时" hint="超过这么久没有响应算失败；留空：不超过请求间隔，也不超过 15 秒">
      <input
        class="s-input fields__short"
        type="number"
        min="1"
        max="120"
        :value="source.timeout"
        placeholder="自动"
        @change="update({ timeout: ($event.target as HTMLInputElement).value ? seconds($event, 120, 15) : undefined })"
      />
      <span class="s-hint">秒</span>
    </UiRow>

    <UiSection title="查询参数" nested :open="!!source.params?.length" :count="source.params?.length || null">
      <KeyValueRows
        :items="source.params ?? []"
        key-hint="参数名"
        testid="source-params"
        @update="update({ params: $event })"
      />
    </UiSection>
    <UiSection title="请求头" nested :open="!!source.headers?.length" :count="source.headers?.length || null">
      <KeyValueRows
        :items="source.headers ?? []"
        key-hint="名称"
        testid="source-headers"
        @update="update({ headers: $event })"
      />
    </UiSection>
    <UiSection v-if="source.method === 'POST'" title="请求体" nested :open="!!source.body">
      <div class="fields__body">
        <textarea
          class="s-textarea s-mono"
          rows="3"
          :value="source.body ?? ''"
          placeholder="留空：自动发送本接口涉及的设备清单"
          @change="update({ body: ($event.target as HTMLTextAreaElement).value || undefined })"
        />
      </div>
    </UiSection>
    <UiSection title="认证" nested :open="authChoice !== 'none'">
      <UiRow label="方式">
        <select
          class="s-select"
          :value="authChoice"
          data-testid="source-auth"
          @change="setAuth(($event.target as HTMLSelectElement).value)"
        >
          <option value="none">不需要</option>
          <option value="cookie">浏览器的登录 Cookie</option>
          <option v-for="service in authServices" :key="service.id" :value="`service:${service.id}`">
            数据服务：{{ service.name }}
          </option>
          <option v-if="authMissing" :value="authChoice">（这台电脑上没有这个数据服务）</option>
        </select>
      </UiRow>
      <p class="fields__note s-hint" :class="{ 'is-warn': authMissing }">
        <template v-if="authMissing"
          >场景引用的数据服务不在这台电脑上，请求不会带认证。请在「数据接口」页面登记。</template
        >
        <template v-else>
          场景文件会随项目分发，所以不保存 Token：这里只记下用哪个数据服务，Token 留在本机；SDK 集成时由
          <code>dataRequestHeaders</code> 提供。
        </template>
      </p>
    </UiSection>

    <SourceParsing :source="source" :fields="probe.fields" />
    <SourceDevices :source="source" :matched="probe.analysis?.deviceIds" />
    <SourceProbe :source="source" :probe="probe" />
  </div>
</template>

<style scoped>
.fields__method {
  width: 74px;
  flex-shrink: 0;
}
.fields__short {
  width: 80px;
}
.fields__error {
  margin: 0;
  padding: 0 12px 4px 98px;
  color: var(--s-danger);
  font-size: 11px;
}
.fields__body {
  padding: 0 12px;
}
.fields__note {
  margin: 0;
  padding: 2px 12px 0;
  line-height: 1.6;
}
.fields__note.is-warn {
  color: var(--s-warn);
}
</style>
