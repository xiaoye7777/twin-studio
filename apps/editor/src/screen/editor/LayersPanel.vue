<script setup lang="ts">
import { ChevronRight, Eye, EyeOff, Group, Lock, Unlock } from 'lucide-vue-next'
import { computed, nextTick, reactive, ref } from 'vue'
import type { ScreenGroup, Widget } from '../model'
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
const collapsed = reactive(new Set<string>())

/** Rows with groups as headers above their members (shown where the group's front-most member is). */
const entries = computed(() => {
  const list: Array<
    | { kind: 'widget'; widget: Widget; index: number; member: boolean }
    | { kind: 'group'; group: ScreenGroup; members: Widget[] }
  > = []
  const done = new Set<string>()
  rows.value.forEach((widget, index) => {
    if (!widget.groupId) return list.push({ kind: 'widget', widget, index, member: false })
    if (done.has(widget.groupId)) return
    done.add(widget.groupId)
    const members = rows.value.filter(item => item.groupId === widget.groupId)
    const group = session.group(widget.groupId) ?? { id: widget.groupId, name: '组合' }
    list.push({ kind: 'group', group, members })
    if (!collapsed.has(group.id))
      for (const member of members)
        list.push({ kind: 'widget', widget: member, index: rows.value.indexOf(member), member: true })
  })
  return list
})

function clickGroup(event: MouseEvent, members: Widget[]): void {
  session.select(
    members.map(member => member.id),
    event.shiftKey || event.metaKey || event.ctrlKey ? 'toggle' : 'replace',
  )
}

function toggleCollapsed(id: string): void {
  if (collapsed.has(id)) collapsed.delete(id)
  else collapsed.add(id)
}

const renamingGroup = ref('')
async function startGroupRename(group: ScreenGroup): Promise<void> {
  renamingGroup.value = group.id
  renameText.value = group.name
  await nextTick()
  renameInput.value?.[0]?.select()
}
function finishGroupRename(): void {
  if (renamingGroup.value) session.renameGroup(renamingGroup.value, renameText.value)
  renamingGroup.value = ''
}

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
    <template v-for="entry in entries" :key="entry.kind === 'group' ? `g-${entry.group.id}` : entry.widget.id">
      <div
        v-if="entry.kind === 'group'"
        class="row is-group"
        :class="{ 'is-selected': entry.members.every(member => selected.has(member.id)) }"
        :data-testid="`layer-group-${entry.group.name}`"
        @click="clickGroup($event, entry.members)"
        @dblclick="startGroupRename(entry.group)"
      >
        <button
          class="row__chevron"
          :class="{ 'is-open': !collapsed.has(entry.group.id) }"
          @click.stop="toggleCollapsed(entry.group.id)"
        >
          <ChevronRight :size="12" />
        </button>
        <Group :size="14" class="row__icon" />
        <input
          v-if="renamingGroup === entry.group.id"
          ref="renameInput"
          v-model="renameText"
          class="row__rename"
          @click.stop
          @blur="finishGroupRename"
          @keydown.enter.prevent="finishGroupRename"
          @keydown.esc.prevent="renamingGroup = ''"
        />
        <span v-else class="row__name"
          >{{ entry.group.name }}<small>{{ entry.members.length }}</small></span
        >
        <button
          class="row__toggle"
          :class="{ 'is-on': entry.members.every(member => member.locked) }"
          title="锁定 / 解锁组合"
          @click.stop="
            session.setLocked(
              entry.members.map(member => member.id),
              !entry.members.every(member => member.locked),
            )
          "
        >
          <Lock v-if="entry.members.every(member => member.locked)" :size="12" /><Unlock v-else :size="12" />
        </button>
        <button
          class="row__toggle"
          :class="{ 'is-on': entry.members.every(member => member.hidden) }"
          title="显示 / 隐藏组合"
          @click.stop="
            session.setHidden(
              entry.members.map(member => member.id),
              !entry.members.every(member => member.hidden),
            )
          "
        >
          <EyeOff v-if="entry.members.every(member => member.hidden)" :size="12" /><Eye v-else :size="12" />
        </button>
      </div>
      <div
        v-else
        class="row"
        :class="{
          'is-member': entry.member,
          'is-selected': selected.has(entry.widget.id),
          'is-hidden': entry.widget.hidden,
          'drop-before': dropAt === entry.index,
          'drop-after': dropAt === entry.index + 1 && entry.index === rows.length - 1,
        }"
        draggable="true"
        :data-testid="`layer-${entry.widget.name}`"
        @click="click($event, entry.widget.id)"
        @dblclick="startRename(entry.widget.id, entry.widget.name)"
        @mouseenter="session.ui.hovered = entry.widget.id"
        @mouseleave="session.ui.hovered = null"
        @dragstart="dragId = entry.widget.id"
        @dragover="onDragOver($event, entry.index)"
        @drop.prevent="onDrop"
      >
        <component :is="widgetDefinition(entry.widget.type)?.icon" :size="14" class="row__icon" />
        <input
          v-if="renaming === entry.widget.id"
          ref="renameInput"
          v-model="renameText"
          class="row__rename"
          @click.stop
          @blur="finishRename"
          @keydown.enter.prevent="finishRename"
          @keydown.esc.prevent="renaming = ''"
        />
        <span v-else class="row__name">{{ entry.widget.name }}</span>
        <button
          class="row__toggle"
          :class="{ 'is-on': entry.widget.locked }"
          :title="entry.widget.locked ? '解锁' : '锁定'"
          @click.stop="session.setLocked([entry.widget.id], !entry.widget.locked)"
        >
          <Lock v-if="entry.widget.locked" :size="12" /><Unlock v-else :size="12" />
        </button>
        <button
          class="row__toggle"
          :class="{ 'is-on': entry.widget.hidden }"
          :title="entry.widget.hidden ? '显示' : '隐藏'"
          @click.stop="session.setHidden([entry.widget.id], !entry.widget.hidden)"
        >
          <EyeOff v-if="entry.widget.hidden" :size="12" /><Eye v-else :size="12" />
        </button>
      </div>
    </template>
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
.row.is-group .row__icon {
  color: var(--s-accent-2);
}
.row.is-group {
  padding-left: 4px;
}
.row.is-member {
  padding-left: 34px;
}
.row__name small {
  margin-left: 6px;
  color: var(--s-fg-3);
  font-size: 11px;
}
.row__chevron {
  display: grid;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--s-fg-3);
  cursor: pointer;
}
.row__chevron svg {
  transition: transform 120ms ease;
}
.row__chevron.is-open svg {
  transform: rotate(90deg);
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
