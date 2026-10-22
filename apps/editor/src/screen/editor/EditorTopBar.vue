<script setup lang="ts">
import { ArrowLeft, Magnet, Maximize, MonitorPlay, Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useScreenSession } from './session'

const session = useScreenSession()
const ui = session.ui
const router = useRouter()
const saveLabel = computed(() => {
  if (ui.saveState === 'saving') return '保存中…'
  if (ui.saveState === 'unsaved') return '未保存'
  if (ui.saveState === 'error') return `保存失败：${ui.saveError}`
  return ui.lastSaved ? `已保存 ${ui.lastSaved}` : '已保存'
})

async function preview(): Promise<void> {
  await session.save()
  window.open(router.resolve({ name: 'screen-preview', params: { screenId: session.doc.value.id } }).href, '_blank')
}
</script>

<template>
  <header class="topbar">
    <button class="s-icon-btn" title="返回数据大屏列表" @click="router.push('/screens')">
      <ArrowLeft :size="16" />
    </button>
    <span class="topbar__mark">大屏</span>
    <input
      class="topbar__name"
      :value="session.doc.value.name"
      data-testid="screen-title"
      @change="session.renameScreen(($event.target as HTMLInputElement).value)"
    />
    <span class="topbar__save" :class="`is-${ui.saveState}`" data-testid="screen-save-state">{{ saveLabel }}</span>
    <div class="topbar__center">
      <button class="s-icon-btn" :disabled="!ui.canUndo" :title="`撤销 ${ui.undoLabel}`" @click="session.undo()">
        <Undo2 :size="15" />
      </button>
      <button class="s-icon-btn" :disabled="!ui.canRedo" :title="`重做 ${ui.redoLabel}`" @click="session.redo()">
        <Redo2 :size="15" />
      </button>
      <span class="topbar__sep" />
      <button class="s-icon-btn" title="缩小" @click="session.zoomTo(ui.zoom / 1.2)"><ZoomOut :size="15" /></button>
      <button class="topbar__zoom" title="适应窗口" data-testid="screen-zoom" @click="session.fit()">
        {{ Math.round(ui.zoom * 100) }}%
      </button>
      <button class="s-icon-btn" title="放大" @click="session.zoomTo(ui.zoom * 1.2)"><ZoomIn :size="15" /></button>
      <button class="s-icon-btn" title="适应窗口（⌘0）" @click="session.fit()"><Maximize :size="15" /></button>
      <span class="topbar__sep" />
      <button
        class="s-icon-btn"
        :class="{ 'is-active': ui.snap }"
        title="吸附对齐（拖动时按住 Alt 临时关闭）"
        @click="ui.snap = !ui.snap"
      >
        <Magnet :size="15" />
      </button>
    </div>
    <button class="s-btn s-btn--primary" data-testid="screen-preview-open" @click="preview">
      <MonitorPlay :size="14" />预览
    </button>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  height: 46px;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-bottom: 1px solid var(--s-line);
  background: var(--s-panel);
}
.topbar__mark {
  padding: 2px 7px;
  border-radius: 4px;
  background: rgb(56 189 248 / 0.15);
  color: #7dd3fc;
  font-size: 11px;
  font-weight: 600;
}
.topbar__name {
  width: 240px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--s-fg);
  font-size: 13.5px;
  font-weight: 550;
  outline: none;
}
.topbar__name:hover,
.topbar__name:focus {
  border-color: var(--s-line-2);
  background: var(--s-field);
}
.topbar__save {
  color: var(--s-fg-3);
  font-size: 11.5px;
}
.topbar__save.is-error {
  color: var(--s-danger);
}
.topbar__center {
  display: flex;
  align-items: center;
  gap: 2px;
  margin: 0 auto;
}
.topbar__sep {
  width: 1px;
  height: 18px;
  margin: 0 6px;
  background: var(--s-line-2);
}
.topbar__zoom {
  min-width: 52px;
  height: 26px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--s-fg-2);
  font: 12px var(--s-mono);
  cursor: pointer;
}
.topbar__zoom:hover {
  background: var(--s-hover);
}
</style>
