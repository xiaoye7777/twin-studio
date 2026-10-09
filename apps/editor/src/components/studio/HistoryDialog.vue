<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { History, ImageOff, RotateCcw, Trash2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { SceneHistoryRepository, type SceneSnapshotMeta } from '@/infrastructure/history/SceneHistoryRepository'
import { useSession } from '@/studio/context'
import { useShell } from '@/studio/shell'

const session = useSession()
const shell = useShell()
const repository = new SceneHistoryRepository()
const items = ref<SceneSnapshotMeta[]>([])
const name = ref('')
const busy = ref(false)

const visible = computed({
  get: () => shell.dialog === 'history',
  set: value => {
    if (!value) shell.dialog = null
  },
})

const kinds = { manual: '手动', auto: '自动', restore: '恢复前' } as const

async function refresh(): Promise<void> {
  items.value = await repository.list(session.projectId)
}
watch([visible, () => session.ui.historyRevision], ([open]) => open && void refresh(), { immediate: true })

function when(iso: string): string {
  const date = new Date(iso)
  const today = new Date().toDateString() === date.toDateString()
  return date.toLocaleString('zh-CN', {
    month: today ? undefined : 'numeric',
    day: today ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const size = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`

async function create(): Promise<void> {
  busy.value = true
  try {
    const stored = await session.snapshot(name.value.trim() || '手动版本', 'manual')
    if (!stored) ElMessage.info('当前场景与上一个版本相同')
    name.value = ''
  } finally {
    busy.value = false
  }
}

async function restore(item: SceneSnapshotMeta): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `用「${item.label}」（${when(item.createdAt)}）替换当前场景？当前场景会先保存为一个版本，也可以撤销。`,
      '恢复版本',
      { customClass: 'studio-dialog', confirmButtonText: '恢复', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await session.restoreSnapshot(item.id)
    shell.dialog = null
    ElMessage.success('已恢复，可用撤销回到恢复前')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '恢复失败')
  }
}

async function remove(item: SceneSnapshotMeta): Promise<void> {
  await repository.remove(item.id)
  await refresh()
}
</script>

<template>
  <el-dialog v-model="visible" title="历史版本" width="600px" append-to-body class="studio-dialog">
    <div class="create">
      <input
        v-model="name"
        class="s-input"
        placeholder="版本名称，例如：汇报前定稿"
        data-testid="snapshot-name"
        @keydown.enter="create"
      />
      <button class="s-btn s-btn--primary" :disabled="busy" data-testid="snapshot-create" @click="create">
        <History :size="13" />保存为版本
      </button>
    </div>
    <p class="note">
      每次按 Ctrl/⌘ + S 都会保存一个版本，自动保存时每 10 分钟保存一个；每个项目保留最近 30 个，存放在本机浏览器中。
    </p>
    <div class="list s-scroll" data-testid="snapshot-list">
      <div v-for="item in items" :key="item.id" class="item" :data-testid="`snapshot-${item.label}`">
        <span class="item__thumb">
          <img v-if="item.thumbnail" :src="item.thumbnail" alt="" />
          <ImageOff v-else :size="16" />
        </span>
        <span class="item__text">
          <strong>{{ item.label }}</strong>
          <span
            >{{ when(item.createdAt) }} · {{ kinds[item.kind] }} · {{ item.nodeCount }} 个对象 ·
            {{ size(item.size) }}</span
          >
        </span>
        <button class="s-btn s-btn--sm" data-testid="snapshot-restore" @click="restore(item)">
          <RotateCcw :size="12" />恢复
        </button>
        <button class="s-icon-btn" title="删除这个版本" @click="remove(item)"><Trash2 :size="13" /></button>
      </div>
      <div v-if="!items.length" class="empty">还没有保存的版本。按 Ctrl/⌘ + S 或上方按钮保存一个。</div>
    </div>
  </el-dialog>
</template>

<style scoped>
.create {
  display: flex;
  gap: 8px;
}
.create .s-input {
  flex: 1;
}
.note {
  margin: 8px 0 12px;
  color: #a9a6a0;
  font-size: 11.5px;
  line-height: 1.6;
}
.list {
  display: flex;
  max-height: 380px;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--s-line);
  border-radius: 8px;
  background: var(--s-panel-2);
}
.item__thumb {
  display: grid;
  width: 72px;
  height: 46px;
  flex-shrink: 0;
  place-items: center;
  overflow: hidden;
  border-radius: 5px;
  background: var(--s-bg);
  color: var(--s-fg-3);
}
.item__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.item__text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}
.item__text strong {
  overflow: hidden;
  color: var(--s-fg);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item__text span {
  color: var(--s-fg-3);
  font-size: 11px;
}
.empty {
  padding: 24px 0;
  color: var(--s-fg-3);
  font-size: 12px;
  text-align: center;
}
</style>
