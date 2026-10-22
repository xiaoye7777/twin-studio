<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { allWidgets, widgetCategories } from '../widgets'
import { WIDGET_DRAG_MIME } from './dnd'
import { useScreenSession } from './session'

const session = useScreenSession()
const query = ref('')
const groups = computed(() =>
  widgetCategories
    .map(category => ({
      category,
      widgets: allWidgets().filter(
        widget => widget.category === category && (!query.value || widget.name.includes(query.value.trim())),
      ),
    }))
    .filter(group => group.widgets.length),
)

function onDragStart(event: DragEvent, type: string): void {
  event.dataTransfer?.setData(WIDGET_DRAG_MIME, type)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}
</script>

<template>
  <div class="library" data-testid="widget-library">
    <label class="library__search">
      <Search :size="13" />
      <input v-model="query" placeholder="搜索组件" />
    </label>
    <div class="library__groups s-scroll">
      <section v-for="group in groups" :key="group.category" class="group">
        <h4>{{ group.category }}</h4>
        <div class="group__grid">
          <button
            v-for="widget in group.widgets"
            :key="widget.type"
            class="item"
            draggable="true"
            :title="`${widget.description ?? widget.name} — 拖到画布或单击添加`"
            :data-testid="`widget-${widget.type}`"
            @dragstart="onDragStart($event, widget.type)"
            @click="session.addWidget(widget.type)"
          >
            <component :is="widget.icon" :size="18" />
            <span>{{ widget.name }}</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.library {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}
.library__search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 10px 4px;
  padding: 0 8px;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-field);
  color: var(--s-fg-3);
}
.library__search input {
  height: 28px;
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--s-fg);
  font-size: 12px;
  outline: none;
}
.library__groups {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 0 10px 12px;
}
.group h4 {
  margin: 12px 2px 6px;
  color: var(--s-fg-3);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
}
.group__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 4px 8px;
  border: 1px solid var(--s-line);
  border-radius: 7px;
  background: var(--s-panel-2);
  color: var(--s-fg-2);
  font-size: 11.5px;
  cursor: grab;
}
.item:hover {
  border-color: var(--s-accent-line);
  background: var(--s-raised);
  color: var(--s-fg);
}
.item svg {
  color: #7dd3fc;
}
.item span {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
