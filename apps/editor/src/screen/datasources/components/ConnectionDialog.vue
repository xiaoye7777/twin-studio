<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Plus, X } from 'lucide-vue-next'
import { reactive, ref, watch } from 'vue'
import { type ApiAuth, type ApiConnection, createConnection } from '../model'
import { useDataSourceStore } from '../store'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{ connection: ApiConnection | null }>()
const emit = defineEmits<{ saved: [connection: ApiConnection] }>()
const store = useDataSourceStore()

const form = reactive({
  name: '',
  baseUrl: '',
  authType: 'none' as ApiAuth['type'],
  token: '',
  headerName: 'X-Token',
  headerValue: '',
  headers: [] as Array<{ key: string; value: string }>,
  timeout: 15,
  envelope: true,
})
const error = ref('')

watch(visible, open => {
  if (!open) return
  const item = props.connection
  const auth = item?.auth ?? { type: 'none' }
  Object.assign(form, {
    name: item?.name ?? '',
    baseUrl: item?.baseUrl ?? '',
    authType: auth.type,
    token: auth.type === 'bearer' ? auth.token : '',
    headerName: auth.type === 'header' ? auth.name : 'X-Token',
    headerValue: auth.type === 'header' ? auth.value : '',
    headers: (item?.headers ?? []).map(header => ({ ...header })),
    timeout: item?.timeout ?? 15,
    envelope: (item?.envelope ?? 'auto') === 'auto',
  })
  error.value = ''
})

async function save(): Promise<void> {
  const baseUrl = form.baseUrl.trim().replace(/\/+$/, '')
  try {
    const url = new URL(baseUrl)
    if (!/^https?:$/.test(url.protocol)) throw new Error()
  } catch {
    error.value = '请填写完整的服务地址，如 https://api.example.com 或 http://192.168.1.10:8080/api'
    return
  }
  const auth: ApiAuth =
    form.authType === 'bearer'
      ? { type: 'bearer', token: form.token.trim() }
      : form.authType === 'header'
        ? { type: 'header', name: form.headerName.trim(), value: form.headerValue }
        : { type: form.authType }
  const base = props.connection ?? createConnection('', baseUrl)
  const connection: ApiConnection = {
    ...base,
    name: form.name.trim() || new URL(baseUrl).host,
    baseUrl,
    auth,
    headers: form.headers.filter(header => header.key.trim()),
    timeout: Math.max(1, Math.min(120, Number(form.timeout) || 15)),
    envelope: form.envelope ? 'auto' : 'off',
  }
  try {
    await store.saveConnection(connection)
    visible.value = false
    emit('saved', connection)
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '保存失败')
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="connection ? '编辑数据服务' : '添加数据服务'"
    width="560px"
    append-to-body
    class="studio-dialog"
  >
    <div class="form" data-testid="connection-form">
      <label>名称</label>
      <input v-model="form.name" class="s-input" placeholder="如：园区业务后台" data-testid="connection-name" />
      <label>服务地址</label>
      <div>
        <input
          v-model="form.baseUrl"
          class="s-input"
          placeholder="https://api.example.com/park"
          data-testid="connection-url"
        />
        <p class="s-hint">
          后端接口的公共前缀，接口里只填后面的路径。生产环境建议与大屏同域（反向代理），避免跨域问题。
        </p>
      </div>
      <label>认证方式</label>
      <div>
        <div class="segmented">
          <button
            v-for="item in [
              { id: 'none', label: '无需认证' },
              { id: 'bearer', label: 'Bearer Token' },
              { id: 'header', label: '自定义请求头' },
              { id: 'cookie', label: '浏览器登录态' },
            ]"
            :key="item.id"
            :class="{ 'is-active': form.authType === item.id }"
            @click="form.authType = item.id as ApiAuth['type']"
          >
            {{ item.label }}
          </button>
        </div>
        <p v-if="form.authType === 'cookie'" class="s-hint">
          请求时携带浏览器中该站点的登录 Cookie（大屏与后台同一套登录时使用；后端需允许带凭据的跨域请求）。
        </p>
      </div>
      <template v-if="form.authType === 'bearer'">
        <label>Token</label>
        <input v-model="form.token" class="s-input" type="password" placeholder="请求头 Authorization: Bearer …" />
      </template>
      <template v-if="form.authType === 'header'">
        <label>请求头</label>
        <div class="pair">
          <input v-model="form.headerName" class="s-input" placeholder="名称，如 X-Token" />
          <input v-model="form.headerValue" class="s-input" type="password" placeholder="值" />
        </div>
      </template>
      <label>公共请求头</label>
      <div class="headers">
        <div v-for="(header, index) in form.headers" :key="index" class="pair">
          <input v-model="header.key" class="s-input" placeholder="名称" />
          <input v-model="header.value" class="s-input" placeholder="值" />
          <button class="s-icon-btn" title="删除" @click="form.headers.splice(index, 1)"><X :size="13" /></button>
        </div>
        <button class="s-btn s-btn--ghost s-btn--sm" @click="form.headers.push({ key: '', value: '' })">
          <Plus :size="12" />添加请求头
        </button>
      </div>
      <label>超时</label>
      <div class="inline">
        <input v-model.number="form.timeout" class="s-input timeout" type="number" min="1" max="120" />秒
      </div>
      <label>结果检查</label>
      <label class="check">
        <input v-model="form.envelope" type="checkbox" />
        识别 { code, msg, data } 格式：code 不是 0 / 200 时按失败处理并显示 msg
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <p class="secret s-hint">Token 等认证信息只保存在本机浏览器，导出大屏文件时不会带出。</p>
    </div>
    <template #footer>
      <button class="s-btn" @click="visible = false">取消</button>
      <button class="s-btn s-btn--primary" data-testid="connection-save" @click="save">保存</button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  align-items: start;
  gap: 12px 12px;
}
.form > label {
  padding-top: 5px;
  color: var(--s-fg-2);
  font-size: 12px;
}
.form .s-hint {
  margin: 4px 0 0;
}
.segmented {
  display: flex;
  overflow: hidden;
  border: 1px solid var(--s-line-2);
  border-radius: var(--s-radius-sm);
}
.segmented button {
  flex: 1;
  height: 26px;
  border: 0;
  border-right: 1px solid var(--s-line-2);
  background: var(--s-field);
  color: var(--s-fg-2);
  font-size: 11.5px;
  cursor: pointer;
}
.segmented button:last-child {
  border-right: 0;
}
.segmented button.is-active {
  background: var(--s-accent-soft);
  color: var(--s-accent-2);
}
.pair {
  display: flex;
  gap: 6px;
}
.headers {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.headers .pair {
  width: 100%;
}
.inline {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--s-fg-2);
}
.timeout {
  width: 80px;
}
.form > .check {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
  color: var(--s-fg-2);
}
.error {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--s-danger);
}
.secret {
  grid-column: 1 / -1;
}
</style>
