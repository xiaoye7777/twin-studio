<script setup lang="ts">
/**
 * 底栏的资源库：标签分类 + 搜索 + 卡片网格。卡片数据和缩略图在 studio/useAssetLibrary.ts。
 * 卡片可以拖进视口，也可以单击放置（绘制工具单击后进入绘制状态）。
 */
import { ChevronDown, Search, Upload, X } from 'lucide-vue-next'
import { ref } from 'vue'
import { useShell } from '@/studio/shell'
import { useAssetLibrary } from '@/studio/useAssetLibrary'

const shell = useShell()
const { filter, tabs, visible, thumbs, uploading, upload } = useAssetLibrary()
const fileInput = ref<HTMLInputElement>()

/** 标签放不下时可以横向滚动；普通鼠标只有竖向滚轮，这里转成横向。 */
function scrollTabs(event: WheelEvent): void {
  const strip = event.currentTarget as HTMLElement
  if (strip.scrollWidth <= strip.clientWidth) return
  event.preventDefault()
  strip.scrollLeft += event.deltaY || event.deltaX
}

function selectTab(id: string): void {
  shell.assetTab = id
  shell.dockOpen = true
}

function onFiles(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (files.length) void upload(files)
}

const emptyHints: Record<string, string> = {
  mine: '建模同事交付的 .glb 模型导入后出现在这里，可在多个项目中复用。',
  components:
    '选中配置好的对象（如带设备绑定和告警规则的储能柜），右键「保存为组件」，即可在任何项目中拖入复用，设备编号自动递增。',
}
</script>

<template>
  <div class="library" data-testid="asset-library">
    <header class="library__head">
      <button
        class="library__toggle"
        :title="shell.dockOpen ? '收起资源面板' : '展开资源面板'"
        @click="shell.dockOpen = !shell.dockOpen"
      >
        <ChevronDown :size="13" />
        资源
      </button>
      <nav class="library__tabs" @wheel="scrollTabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="s-tab library__tab"
          :class="{ 'is-active': shell.dockOpen && shell.assetTab === tab.id }"
          :data-testid="`asset-tab-${tab.id}`"
          @click="selectTab(tab.id)"
        >
          {{ tab.label }}<small>{{ tab.count }}</small>
        </button>
      </nav>
      <label class="library__search">
        <Search :size="12" />
        <input v-model="filter" placeholder="搜索资源" data-testid="asset-search" />
      </label>
      <button class="s-btn s-btn--sm" :disabled="uploading" @click="fileInput?.click()">
        <Upload :size="12" />{{ uploading ? '导入中…' : '导入 GLB' }}
      </button>
      <input
        ref="fileInput"
        type="file"
        accept=".glb,model/gltf-binary"
        multiple
        hidden
        data-testid="asset-upload"
        @change="onFiles"
      />
    </header>

    <div v-if="shell.dockOpen" class="library__body s-scroll" :style="{ height: `${shell.dockHeight}px` }">
      <div v-if="visible.length" class="library__grid">
        <div
          v-for="item in visible"
          :key="item.key"
          class="card"
          role="button"
          tabindex="0"
          :draggable="!!item.drag"
          :class="{ 'is-draggable': !!item.drag }"
          :title="item.title"
          :data-testid="item.testid"
          @dragstart="item.drag?.($event.dataTransfer!)"
          @click="item.activate()"
          @keydown.enter="item.activate()"
        >
          <span class="card__thumb">
            <img v-if="item.thumb && thumbs[item.thumb]" :src="thumbs[item.thumb]" alt="" loading="lazy" />
            <component :is="item.icon" v-else :size="22" />
          </span>
          <span class="card__name">{{ item.name }}</span>
          <button v-if="item.remove" class="card__remove" title="从组件库删除" @click.stop="item.remove()">
            <X :size="11" />
          </button>
        </div>
      </div>
      <p v-else class="library__note s-hint">{{ filter ? '没有匹配的资源' : emptyHints[shell.assetTab] }}</p>
    </div>
  </div>
</template>

<style scoped>
.library__head {
  display: flex;
  height: 32px;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
}
.library__toggle {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--s-fg);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}
.library__toggle svg {
  color: var(--s-fg-3);
  transform: rotate(-90deg);
  transition: transform 140ms ease;
}
.dock.is-open .library__toggle svg {
  transform: none;
}
.library__tabs {
  display: flex;
  min-width: 0;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--s-line-2) transparent;
}
.library__tab {
  flex-shrink: 0;
  height: 32px;
  font-size: 11.5px;
  white-space: nowrap;
}
.library__tab small {
  margin-left: 4px;
  color: var(--s-fg-4);
  font-size: 10px;
}
.library__search {
  display: flex;
  width: 150px;
  height: 24px;
  flex-shrink: 0;
  align-items: center;
  gap: 5px;
  padding: 0 7px;
  border: 1px solid var(--s-line-2);
  border-radius: var(--s-radius-sm);
  background: var(--s-field);
  color: var(--s-fg-3);
}
.library__search:focus-within {
  border-color: var(--s-accent-line);
}
.library__search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: none;
  font-size: 11.5px;
}
.library__body {
  flex: none;
  border-top: 1px solid var(--s-line);
}
.library__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 6px;
  padding: 8px;
}
.card {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  padding: 4px 4px 5px;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-panel-2);
  color: var(--s-fg);
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background-color 120ms ease;
}
.card.is-draggable {
  cursor: grab;
}
.card:hover {
  border-color: var(--s-accent-line);
  background: var(--s-raised);
}
.card__thumb {
  display: grid;
  aspect-ratio: 4 / 3;
  place-items: center;
  overflow: hidden;
  border-radius: 4px;
  background: radial-gradient(circle at 50% 40%, var(--s-raised), var(--s-panel-2) 75%);
  color: var(--s-fg-3);
}
.card__thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.card__name {
  overflow: hidden;
  padding: 0 2px;
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card__remove {
  position: absolute;
  top: 6px;
  right: 6px;
  display: none;
  width: 18px;
  height: 18px;
  place-items: center;
  border: 0;
  border-radius: 4px;
  background: var(--s-float);
  color: var(--s-fg);
  cursor: pointer;
}
.card:hover .card__remove {
  display: grid;
}
.library__note {
  margin: 0;
  padding: 16px;
  text-align: center;
}
</style>
