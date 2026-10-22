<script setup lang="ts">
import { Eye, EyeOff, Lock, Unlock } from 'lucide-vue-next'
import { computed, nextTick, ref } from 'vue'
import { widgetDefinition } from '../widgets'
import { useScreenSession } from './session'

const session = useScreenSession()
/** Front-most first, like design tools. */
const rows = computed(() => [...session.doc.value.widgets].reverse())
const selected = computed(() => new Set(session.selection.value))
const renaming = ref('')
const renameText = ref('')
const renameInput = ref<HTMLInputElement[]>()
const dragId = ref('')
const dropAt = ref(-1)

function click(event: MouseEvent, id: string): void {
  session.select([id], event.shiftKey || event.metaKey || event.ctrlKey ? 'toggle' : 'replace')
}

async function startRename(id: string, name: string): Promise<void> {
  renaming.value = id
  renameText.value = name
  await nextTick()
  renameInput.value?.[0]?.select()
}

function finishRename(): void {
  if (renaming.value) session.rename(renaming.value, renameText.value)
  renaming.value = ''
}

function onDragOver(event: DragEvent, rowIndex: number): void {
  if (!dragId.value) return
  event.preventDefault()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dropAt.value = event.clientY - rect.top < rect.height / 2 ? rowIndex : rowIndex + 1
}

function onDrop(): void {
  const id = dragId.value
  const at = dropAt.value
  dragId.value = ''
  dropAt.value = -1
  if (!id || at < 0) return
  // Rows are front-first; the document is back-to-front.
  const count = session.doc.value.widgets.length
  const from = session.doc.value.widgets.findIndex(widget => widget.id === id)
  let target = count - at
  if (from < target) target -= 1
  session.moveLayer(id, target)
}
</script>

<template>
  <div class="layers s-scroll" data-testid="layers-panel" @dragend="((dragId = ''), (dropAt = -1))">
    <div
      v-for="(widget, index) in rows"
      :key="widget.id"
      class="row"
      :class="{
        'is-selected': selected.has(widget.id),
        'is-hidden': widget.hidden,
        'drop-before': dropAt === index,
        'drop-after': dropAt === index + 1 && index === rows.length - 1,
      }"
      draggable="true"
      :data-testid="`layer-${widget.name}`"
      @click="click($event, widget.id)"
      @dblclick="startRename(widget.id, widget.name)"
      @mouseenter="session.ui.hovered = widget.id"
      @mouseleave="session.ui.hovered = null"
      @dragstart="dragId = widget.id"
      @dragover="onDragOver($event, index)"
      @drop.prevent="onDrop"
    >
      <component :is="widgetDefinition(widget.type)?.icon" :size="14" class="row__icon" />
      <input
        v-if="renaming === widget.id"
        ref="renameInput"
        v-model="renameText"
        class="row__rename"
        @click.stop
        @blur="finishRename"
        @keydown.enter.prevent="finishRename"
        @keydown.esc.prevent="renaming = ''"
      />
      <span v-else class="row__name">{{ widget.name }}</span>
      <button
        class="row__toggle"
        :class="{ 'is-on': widget.locked }"
        :title="widget.locked ? '解锁' : '锁定'"
        @click.stop="session.setLocked([widget.id], !widget.locked)"
      >
        <Lock v-if="widget.locked" :size="12" /><Unlock v-else :size="12" />
      </button>
      <button
        class="row__toggle"
        :class="{ 'is-on': widget.hidden }"
        :title="widget.hidden ? '显示' : '隐藏'"
        @click.stop="session.setHidden([widget.id], !widget.hidden)"
      >
        <EyeOff v-if="widget.hidden" :size="12" /><Eye v-else :size="12" />
      </button>
    </div>
    <p v-if="!rows.length" class="layers__empty s-hint">画布还是空的。从「组件」中拖入组件。</p>
  </div>
</template>

<style scoped>
.layers {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 6px 0;
}
.row {
  display: flex;
  height: 30px;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 12px;
  color: var(--s-fg-2);
  font-size: 12.5px;
  cursor: pointer;
}
.row:hover {
  background: var(--s-hover);
}
.row.is-selected {
  background: var(--s-accent-soft);
  color: var(--s-fg);
}
.row.is-hidden .row__name {
  opacity: 0.45;
}
.row.drop-before {
  box-shadow: inset 0 2px 0 var(--s-accent);
}
.row.drop-after {
  box-shadow: inset 0 -2px 0 var(--s-accent);
}
.row__icon {
  flex-shrink: 0;
  color: #7dd3fc;
}
.row__name {
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row__rename {
  min-width: 0;
  height: 22px;
  flex: 1;
  padding: 0 6px;
  border: 1px solid var(--s-accent);
  border-radius: 4px;
  background: var(--s-field);
  color: var(--s-fg);
  font-size: 12px;
  outline: none;
}
.row__toggle {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--s-fg-3);
  opacity: 0;
  cursor: pointer;
}
.row:hover .row__toggle,
.row__toggle.is-on {
  opacity: 1;
}
.row__toggle:hover {
  background: var(--s-raised);
  color: var(--s-fg);
}
.layers__empty {
  padding: 16px;
}
</style>
