<script setup lang="ts">
import { Download, MonitorPlay, MoreHorizontal, PenLine, Trash2, Type } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { Project } from '@/stores/project'

const props = defineProps<{ project: Project; exporting?: boolean }>()
const emit = defineEmits<{
  edit: [project: Project]
  dashboard: [project: Project]
  export: [project: Project]
  rename: [project: Project]
  remove: [project: Project]
}>()
const menu = ref(false)
const image = computed(() => (props.project.cover?.startsWith('data:') ? props.project.cover : null))
const updated = computed(() =>
  new Date(props.project.updatedAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }),
)
function act(event: 'dashboard' | 'export' | 'rename' | 'remove'): void {
  menu.value = false
  if (event === 'dashboard') emit('dashboard', props.project)
  else if (event === 'export') emit('export', props.project)
  else if (event === 'rename') emit('rename', props.project)
  else emit('remove', props.project)
}
</script>

<template>
  <article class="card" :data-testid="`project-card-${project.name}`" @mouseleave="menu = false">
    <button class="card__cover" :title="`编辑 ${project.name}`" @click="emit('edit', project)">
      <img v-if="image" :src="image" alt="" />
      <span v-else class="card__placeholder" :style="project.cover ? { background: project.cover } : undefined" />
      <span class="card__open"><PenLine :size="14" />进入编辑器</span>
    </button>
    <div class="card__body">
      <div class="card__text">
        <h3 :title="project.name">{{ project.name }}</h3>
        <p>更新于 {{ updated }}</p>
      </div>
      <button class="s-icon-btn" title="大屏预览" @click="emit('dashboard', project)">
        <MonitorPlay :size="15" />
      </button>
      <div class="card__more">
        <button class="s-icon-btn" title="更多" @click="menu = !menu"><MoreHorizontal :size="15" /></button>
        <div v-if="menu" class="card__menu s-float">
          <button @click="act('export')"><Download :size="13" />{{ exporting ? '导出中…' : '导出项目包' }}</button>
          <button @click="act('rename')"><Type :size="13" />重命名</button>
          <button class="is-danger" @click="act('remove')"><Trash2 :size="13" />删除项目</button>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.card {
  overflow: visible;
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
  aspect-ratio: 16 / 10;
  overflow: hidden;
  padding: 0;
  border: 0;
  border-radius: 10px 10px 0 0;
  background: #16181b;
  cursor: pointer;
}
.card__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.card__placeholder {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 30%, #2d3136, #17191c 70%);
  opacity: 0.9;
}
.card__open {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 6px;
  background: rgb(14 15 17 / 0.8);
  color: var(--s-fg);
  font-size: 12px;
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}
.card:hover .card__open {
  opacity: 1;
  transform: none;
}
.card__body {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 8px 10px 14px;
}
.card__text {
  min-width: 0;
  flex: 1;
}
.card__text h3 {
  overflow: hidden;
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card__text p {
  margin: 2px 0 0;
  color: var(--s-fg-3);
  font-size: 11.5px;
}
.card__more {
  position: relative;
}
.card__menu {
  position: absolute;
  z-index: 10;
  right: 0;
  bottom: calc(100% + 4px);
  min-width: 150px;
  padding: 4px;
}
.card__menu button {
  display: flex;
  width: 100%;
  height: 30px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--s-fg);
  font-size: 12px;
  cursor: pointer;
}
.card__menu button:hover {
  background: var(--s-accent-soft);
  color: var(--s-accent-2);
}
.card__menu button.is-danger:hover {
  background: rgb(229 103 92 / 0.15);
  color: var(--s-danger);
}
</style>
