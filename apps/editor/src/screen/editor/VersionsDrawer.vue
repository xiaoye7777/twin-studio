<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Bookmark, Clock3, Eye, History, Rocket, RotateCcw, Trash2 } from 'lucide-vue-next'
import { computed, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { ScreenVersion } from '../model'
import { screenRepository } from '../storage/ScreenRepository'
import { useScreenSession } from './session'

const session = useScreenSession()
const router = useRouter()
const visible = computed({
  get: () => session.ui.versions,
  set: value => (session.ui.versions = value),
})
const versions = shallowRef<ScreenVersion[]>([])
const label = ref('')
const saving = ref(false)

async function load(): Promise<void> {
  versions.value = await screenRepository.listVersions(session.doc.value.id)
}
watch(
  () => [visible.value, session.ui.versionsRevision],
  () => visible.value && void load(),
)

const kinds = {
  publish: { label: '发布', icon: Rocket },
  manual: { label: '手动', icon: Bookmark },
  auto: { label: '自动', icon: Clock3 },
}
const time = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

async function save(): Promise<void> {
  saving.value = true
  try {
    await session.saveVersion(label.value || '手动保存')
    label.value = ''
    ElMessage.success('已保存为版本')
  } finally {
    saving.value = false
  }
}

function preview(version: ScreenVersion): void {
  const target = router.resolve({
    name: 'screen-preview',
    params: { screenId: version.screenId },
    query: { version: version.id },
  })
  window.open(target.href, '_blank')
}

async function restore(version: ScreenVersion): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `恢复到「${version.label}」（${time(version.createdAt)}）？当前内容会先自动保存为一个版本，恢复后也可以撤销。`,
      '恢复历史版本',
      { customClass: 'studio-dialog', confirmButtonText: '恢复', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  await session.restore(version)
  ElMessage.success('已恢复；需要放映这个版本时请重新发布')
}

async function remove(version: ScreenVersion): Promise<void> {
  await screenRepository.removeVersion(version.id)
  await load()
}
</script>

<template>
  <el-drawer v-model="visible" title="历史版本" size="400px" append-to-body class="studio-dialog versions-drawer">
    <div class="versions" data-testid="versions">
      <div class="save">
        <input
          v-model="label"
          class="s-input"
          placeholder="版本说明，如：领导评审前"
          data-testid="version-label"
          @keydown.enter="save"
        />
        <button class="s-btn s-btn--primary" :disabled="saving" data-testid="version-save" @click="save">
          保存当前版本
        </button>
      </div>
      <p class="s-hint">发布和手动保存的版本一直保留；每次编辑后自动保存的版本保留最近 20 个。</p>
      <div v-if="versions.length" class="list">
        <article
          v-for="version in versions"
          :key="version.id"
          class="version"
          :class="{ 'is-live': session.published.value?.versionId === version.id }"
          :data-testid="`version-${version.label}`"
        >
          <img v-if="version.document.cover" :src="version.document.cover" alt="" />
          <div v-else class="version__blank"><History :size="16" /></div>
          <div class="version__text">
            <strong>{{ version.label }}</strong>
            <span>
              <component :is="kinds[version.kind].icon" :size="11" />{{ kinds[version.kind].label }} ·
              {{ time(version.createdAt) }}
              <em v-if="session.published.value?.versionId === version.id">放映中</em>
            </span>
          </div>
          <div class="version__actions">
            <button class="s-icon-btn" title="预览这个版本" @click="preview(version)"><Eye :size="14" /></button>
            <button
              class="s-icon-btn"
              title="恢复到这个版本"
              :data-testid="`version-restore-${version.label}`"
              @click="restore(version)"
            >
              <RotateCcw :size="14" />
            </button>
            <button
              class="s-icon-btn"
              title="删除"
              :disabled="session.published.value?.versionId === version.id"
              @click="remove(version)"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </article>
      </div>
      <p v-else class="empty s-hint">还没有版本。发布、手动保存或离开编辑器时会产生版本。</p>
    </div>
  </el-drawer>
</template>

<style scoped>
.versions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.save {
  display: flex;
  gap: 6px;
}
.s-hint {
  margin: 0;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.version {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--s-line);
  border-radius: 8px;
  background: var(--s-panel-2);
}
.version.is-live {
  border-color: rgb(116 192 142 / 0.5);
}
.version img,
.version__blank {
  width: 72px;
  height: 41px;
  border-radius: 4px;
  object-fit: cover;
  background: #05080f;
}
.version__blank {
  display: grid;
  place-items: center;
  color: var(--s-fg-3);
}
.version__text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.version__text strong {
  overflow: hidden;
  color: var(--s-fg);
  font-size: 12.5px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.version__text span {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--s-fg-3);
  font-size: 11px;
}
.version__text em {
  padding: 0 5px;
  border-radius: 3px;
  background: rgb(116 192 142 / 0.15);
  color: var(--s-ok);
  font-style: normal;
}
.version__actions {
  display: flex;
}
.empty {
  padding: 20px 0;
  text-align: center;
}
</style>
