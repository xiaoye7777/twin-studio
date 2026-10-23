<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Copy,
  Eye,
  FileUp,
  LayoutDashboard,
  MonitorPlay,
  MoreHorizontal,
  PenLine,
  Plus,
  Trash2,
  Type,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import CreateScreenDialog from '@/screen/components/CreateScreenDialog.vue'
import ScreenThumbnail from '@/screen/components/ScreenThumbnail.vue'
import { isConnection, isDataset, shareableConnection } from '@/screen/datasources/model'
import { useDataSourceStore } from '@/screen/datasources/store'
import { contentSignature, isScreenDocument, newScreenId, type ScreenDocument } from '@/screen/model'
import { useScreenStore } from '@/screen/storage/screens'

const router = useRouter()
const screens = useScreenStore()
const projects = useProjectStore()
const sources = useDataSourceStore()
const creating = ref(false)
const menu = ref('')
const importInput = ref<HTMLInputElement>()

onMounted(() => void screens.refresh())

const sceneName = (screen: ScreenDocument) =>
  screen.sceneProjectId ? (projects.getProjectById(screen.sceneProjectId)?.name ?? '场景已删除') : '未关联场景'
const updated = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

function edit(screen: ScreenDocument): void {
  void router.push({ name: 'screen-editor', params: { screenId: screen.id } })
}

function preview(screen: ScreenDocument): void {
  menu.value = ''
  window.open(router.resolve({ name: 'screen-preview', params: { screenId: screen.id } }).href, '_blank')
}

/** The big screen: the published version (the draft until there is one). */
function play(screen: ScreenDocument): void {
  window.open(router.resolve({ name: 'screen-play', params: { screenId: screen.id } }).href, '_blank')
}

function status(screen: ScreenDocument): { label: string; tone: string } {
  if (!screen.published) return { label: '未发布', tone: 'draft' }
  if (screen.published.signature !== contentSignature(screen)) return { label: '有修改未发布', tone: 'changed' }
  return { label: '已发布', tone: 'live' }
}

async function rename(screen: ScreenDocument): Promise<void> {
  menu.value = ''
  try {
    const { value } = await ElMessageBox.prompt('大屏名称', '重命名', {
      inputValue: screen.name,
      customClass: 'studio-dialog',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValidator: text => text.trim().length > 0 || '请输入名称',
    })
    await screens.save({ ...screen, name: value.trim(), updatedAt: new Date().toISOString() })
  } catch {
    // Cancelled.
  }
}

async function duplicate(screen: ScreenDocument): Promise<void> {
  menu.value = ''
  await screens.duplicate(screen)
  ElMessage.success('已创建副本')
}

async function remove(screen: ScreenDocument): Promise<void> {
  menu.value = ''
  try {
    await ElMessageBox.confirm(`删除「${screen.name}」？此操作不可撤销。`, '删除大屏', {
      type: 'warning',
      customClass: 'studio-dialog',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await screens.remove(screen.id)
}

/** The screen file carries the interfaces its widgets use (without passwords or tokens). */
async function exportScreen(screen: ScreenDocument): Promise<void> {
  menu.value = ''
  await sources.load()
  const ids = new Set(
    screen.widgets.flatMap(widget =>
      widget.data?.source === 'api' && widget.data.api ? [widget.data.api.datasetId] : [],
    ),
  )
  const datasets = sources.datasets.filter(item => ids.has(item.id))
  const connections = sources.connections
    .filter(item => datasets.some(dataset => dataset.connectionId === item.id))
    .map(shareableConnection)
  const file = datasets.length ? { ...screen, interfaces: { connections, datasets } } : screen
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${screen.name}.screen.json`
  link.click()
  URL.revokeObjectURL(link.href)
}

async function importScreen(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  try {
    const value: unknown = JSON.parse(await file.text())
    if (!isScreenDocument(value)) throw new Error('不是有效的数据大屏文件')
    const now = new Date().toISOString()
    const { interfaces, ...screen } = value as ScreenDocument & {
      interfaces?: { connections?: unknown[]; datasets?: unknown[] }
    }
    const added = interfaces
      ? await sources.merge({
          connections: (interfaces.connections ?? []).filter(isConnection),
          datasets: (interfaces.datasets ?? []).filter(isDataset),
        })
      : 0
    await screens.save({ ...screen, id: newScreenId(), createdAt: now, updatedAt: now, published: undefined })
    ElMessage.success(
      added
        ? `已导入「${value.name}」及 ${added} 个数据接口（如需认证，请在「数据接口」中填写 Token）`
        : `已导入「${value.name}」`,
    )
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导入失败')
  }
}
</script>

<template>
  <section class="screens" data-testid="screen-list">
    <header class="screens__head">
      <div>
        <h1>数据大屏</h1>
        <p>拖拽搭建可视化大屏，读取三维场景中设备的实时数据，并与三维场景双向联动</p>
      </div>
      <div class="screens__actions">
        <button class="s-btn" @click="importInput?.click()"><FileUp :size="14" />导入</button>
        <button class="s-btn s-btn--primary" data-testid="new-screen" @click="creating = true">
          <Plus :size="14" />新建大屏
        </button>
        <input ref="importInput" type="file" accept=".json,application/json" hidden @change="importScreen" />
      </div>
    </header>

    <div v-if="screens.screens.length" class="screens__grid">
      <article
        v-for="screen in screens.screens"
        :key="screen.id"
        class="card"
        :data-testid="`screen-card-${screen.name}`"
        @mouseleave="menu = ''"
      >
        <button class="card__cover" :title="`编辑 ${screen.name}`" @click="edit(screen)">
          <img v-if="screen.cover" class="card__image" :src="screen.cover" alt="" />
          <ScreenThumbnail v-else :screen="screen" />
          <span class="card__open"><PenLine :size="14" />进入编辑器</span>
        </button>
        <div class="card__body">
          <div class="card__text">
            <h3 :title="screen.name">
              {{ screen.name }}
              <span class="card__status" :class="`is-${status(screen).tone}`" data-testid="screen-status">{{
                status(screen).label
              }}</span>
            </h3>
            <p>
              {{ screen.page.width }}×{{ screen.page.height }} · {{ sceneName(screen) }} ·
              {{ updated(screen.updatedAt) }}
            </p>
          </div>
          <button class="s-icon-btn" title="放映（已发布的版本）" data-testid="screen-preview" @click="play(screen)">
            <MonitorPlay :size="15" />
          </button>
          <div class="card__more">
            <button class="s-icon-btn" title="更多" @click="menu = menu === screen.id ? '' : screen.id">
              <MoreHorizontal :size="15" />
            </button>
            <div v-if="menu === screen.id" class="card__menu s-float">
              <button @click="preview(screen)"><Eye :size="13" />预览草稿</button>
              <button @click="rename(screen)"><Type :size="13" />重命名</button>
              <button @click="duplicate(screen)"><Copy :size="13" />创建副本</button>
              <button @click="exportScreen(screen)"><FileUp :size="13" />导出 JSON</button>
              <button class="is-danger" @click="remove(screen)"><Trash2 :size="13" />删除</button>
            </div>
          </div>
        </div>
      </article>
    </div>
    <div v-else-if="screens.loaded" class="screens__empty">
      <LayoutDashboard :size="28" />
      <h2>还没有数据大屏</h2>
      <p>从「园区运营监控」模板开始：中央是三维场景，两侧是实时能源指标、设备图表和告警列表。</p>
      <button class="s-btn s-btn--primary" @click="creating = true"><Plus :size="14" />新建大屏</button>
    </div>

    <CreateScreenDialog v-model="creating" @created="edit" />
  </section>
</template>

<style scoped>
.screens {
  max-width: 1480px;
}
.screens__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
.screens__head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
}
.screens__head p {
  margin: 4px 0 0;
  color: var(--s-fg-3);
}
.screens__actions {
  display: flex;
  gap: 8px;
}
.screens__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 18px;
}
.card {
  border: 1px solid var(--s-line);
  border-radius: 10px;
  background: var(--s-panel);
  transition:
    border-color 160ms ease,
    transform 160ms ease;
}
.card:hover {
  border-color: var(--s-line-2);
  transform: translateY(-2px);
}
.card__cover {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  padding: 0;
  border: 0;
  border-radius: 10px 10px 0 0;
  background: #05080f;
  cursor: pointer;
}
.card__image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.card__open {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgb(0 0 0 / 0.45);
  color: #fff;
  font-size: 13px;
  opacity: 0;
  transition: opacity 160ms ease;
}
.card__cover:hover .card__open {
  opacity: 1;
}
.card__body {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 10px 10px 14px;
}
.card__text {
  min-width: 0;
  flex: 1;
}
.card__text h3 {
  overflow: hidden;
  margin: 0;
  font-size: 14px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card__text p {
  overflow: hidden;
  margin: 2px 0 0;
  color: var(--s-fg-3);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card__status {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 3px;
  font-size: 10.5px;
  font-weight: 500;
  vertical-align: 1px;
}
.card__status.is-draft {
  background: var(--s-raised);
  color: var(--s-fg-3);
}
.card__status.is-changed {
  background: rgb(226 180 86 / 0.14);
  color: var(--s-warn);
}
.card__status.is-live {
  background: rgb(116 192 142 / 0.14);
  color: var(--s-ok);
}
.card__more {
  position: relative;
}
.card__menu {
  position: absolute;
  z-index: 5;
  top: 30px;
  right: 0;
  display: flex;
  min-width: 140px;
  flex-direction: column;
  padding: 4px;
}
.card__menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--s-fg);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}
.card__menu button:hover {
  background: var(--s-hover);
}
.card__menu button.is-danger {
  color: var(--s-danger);
}
.screens__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 80px 20px;
  border: 1px dashed var(--s-line-2);
  border-radius: 12px;
  color: var(--s-fg-3);
  text-align: center;
}
.screens__empty h2 {
  margin: 4px 0 0;
  color: var(--s-fg);
  font-size: 17px;
}
.screens__empty p {
  max-width: 460px;
  margin: 0 0 8px;
}
</style>
