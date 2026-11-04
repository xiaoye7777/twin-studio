<script setup lang="ts">
import { Download, MonitorPlay, MoreHorizontal, PenLine, Trash2, Type } from 'lucide-vue-next'
import { computed } from 'vue'
import type { MenuSections } from '@/components/ui/menu'
import UiDropdown from '@/components/ui/UiDropdown.vue'
import type { Project } from '@/stores/project'

const props = defineProps<{ project: Project; exporting?: boolean }>()
const emit = defineEmits<{
  edit: [project: Project]
  dashboard: [project: Project]
  export: [project: Project]
  rename: [project: Project]
  remove: [project: Project]
}>()
const image = computed(() => (props.project.cover?.startsWith('data:') ? props.project.cover : null))
const updated = computed(() =>
  new Date(props.project.updatedAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }),
)
const menu = computed<MenuSections>(() => [
  [
    {
      label: props.exporting ? '导出中…' : '导出项目包',
      icon: Download,
      action: () => emit('export', props.project),
    },
    { label: '重命名', icon: Type, action: () => emit('rename', props.project) },
  ],
  [{ label: '删除项目', icon: Trash2, danger: true, action: () => emit('remove', props.project) }],
])
</script>

<template>
  <article class="card" :data-testid="`project-card-${project.name}`">
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
      <UiDropdown :sections="menu" align="end" :width="160">
        <template #default="{ toggle }">
          <button class="s-icon-btn" title="更多" @click="toggle"><MoreHorizontal :size="15" /></button>
        </template>
      </UiDropdown>
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
  background: var(--s-canvas);
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
  background: radial-gradient(circle at 30% 30%, var(--s-raised), var(--s-panel-2) 70%);
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
  background: var(--s-float);
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
</style>
