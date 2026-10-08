<script setup lang="ts">
import {
  Box,
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  Lightbulb,
  Lock,
  Radio,
  Search,
  Shapes,
  Sparkles,
  Spline,
  SquareDashed,
  Tag,
  Unlock,
} from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { targetNodeId, type SceneNodeV2 } from '@twin-studio/core'
import { useSession } from '@/studio/context'
import { useShell } from '@/studio/shell'

const session = useSession()
const shell = useShell()
const query = ref('')
const collapsed = reactive(new Set<string>())
const drag = reactive({ ids: [] as string[], over: '' as string, zone: '' as '' | 'before' | 'into' | 'after' })
const menu = reactive({ open: false, x: 0, y: 0 })
const renameText = ref('')
const renameInput = ref<HTMLInputElement[]>()

const icons: Record<string, unknown> = {
  model: Box,
  primitive: Shapes,
  group: Folder,
  path: Spline,
  area: SquareDashed,
  label: Tag,
  light: Lightbulb,
}

interface Row {
  node: SceneNodeV2
  depth: number
  hasChildren: boolean
  hiddenByParent: boolean
}

const counts = computed(() => {
  const doc = session.doc.value
  const bound = new Set(doc.bindings.map(binding => targetNodeId(binding.target)))
  const effects = new Map<string, number>()
  for (const effect of doc.effects) {
    const id = targetNodeId(effect.target)
    effects.set(id, (effects.get(id) ?? 0) + 1)
  }
  return { bound, effects }
})

const rows = computed<Row[]>(() => {
  const doc = session.doc.value
  const byParent = new Map<string | null, SceneNodeV2[]>()
  for (const node of doc.nodes) {
    const list = byParent.get(node.parentId) ?? []
    list.push(node)
    byParent.set(node.parentId, list)
  }
  const term = query.value.trim().toLowerCase()
  const matches = (node: SceneNodeV2): boolean =>
    node.name.toLowerCase().includes(term) || (byParent.get(node.id) ?? []).some(matches)
  const result: Row[] = []
  const walk = (parentId: string | null, depth: number, hiddenByParent: boolean) => {
    for (const node of byParent.get(parentId) ?? []) {
      if (term && !matches(node)) continue
      const children = byParent.get(node.id) ?? []
      result.push({ node, depth, hasChildren: children.length > 0, hiddenByParent })
      if (children.length && (term || !collapsed.has(node.id)))
        walk(node.id, depth + 1, hiddenByParent || !node.visible)
    }
  }
  walk(null, 0, false)
  return result
})

const selected = computed(() => new Set(session.selection.value))

function click(event: MouseEvent, row: Row): void {
  if (event.shiftKey && session.selection.value.length) {
    const ids = rows.value.map(item => item.node.id)
    const from = ids.indexOf(session.selection.value.at(-1)!)
    const to = ids.indexOf(row.node.id)
    if (from >= 0 && to >= 0) {
      session.select(ids.slice(Math.min(from, to), Math.max(from, to) + 1), 'add')
      return
    }
  }
  session.select([row.node.id], event.metaKey || event.ctrlKey ? 'toggle' : 'replace')
}

function toggleCollapse(id: string): void {
  if (collapsed.has(id)) collapsed.delete(id)
  else collapsed.add(id)
}

async function startRename(node: SceneNodeV2): Promise<void> {
  shell.renaming = node.id
  renameText.value = node.name
  await nextTick()
  renameInput.value?.[0]?.select()
}

function finishRename(node: SceneNodeV2): void {
  if (shell.renaming !== node.id) return
  shell.renaming = null
  session.rename(node.id, renameText.value)
}

// ---------------------------------------------------------------- drag to reparent / reorder

function onDragStart(event: DragEvent, row: Row): void {
  drag.ids = selected.value.has(row.node.id) ? [...session.selection.value] : [row.node.id]
  event.dataTransfer?.setData('text/plain', drag.ids.join(','))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event: DragEvent, row: Row): void {
  if (!drag.ids.length || drag.ids.includes(row.node.id)) return
  event.preventDefault()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const y = (event.clientY - rect.top) / rect.height
  drag.over = row.node.id
  drag.zone = row.node.kind === 'group' && y > 0.28 && y < 0.72 ? 'into' : y < 0.5 ? 'before' : 'after'
}

function onDrop(event: DragEvent, row: Row): void {
  event.preventDefault()
  const ids = drag.ids
  const zone = drag.zone
  resetDrag()
  if (!ids.length || ids.includes(row.node.id)) return
  if (zone === 'into') session.reparent(ids, row.node.id)
  else if (zone === 'before') session.reparent(ids, row.node.parentId, row.node.id)
  else {
    const siblings = session.doc.value.nodes.filter(
      node => node.parentId === row.node.parentId && !ids.includes(node.id),
    )
    const next = siblings[siblings.findIndex(node => node.id === row.node.id) + 1]
    session.reparent(ids, row.node.parentId, next?.id)
  }
}

function onDropRoot(event: DragEvent): void {
  if (!drag.ids.length) return
  event.preventDefault()
  const ids = drag.ids
  resetDrag()
  session.reparent(ids, null)
}

function resetDrag(): void {
  drag.ids = []
  drag.over = ''
  drag.zone = ''
}

// ---------------------------------------------------------------- context menu

function openMenu(event: MouseEvent, row: Row | null): void {
  event.preventDefault()
  if (row && !selected.value.has(row.node.id)) session.select([row.node.id])
  menu.open = true
  menu.x = event.clientX
  menu.y = event.clientY
  setTimeout(() => document.addEventListener('pointerdown', closeMenu, { once: true }))
}

function closeMenu(): void {
  menu.open = false
}

function act(action: () => void): void {
  menu.open = false
  action()
}

const menuItems = computed(() => {
  const nodes = session.selectedNodes
  const one = nodes.length === 1 ? nodes[0]! : null
  const items: Array<{ label: string; action: () => void; danger?: boolean } | null> = [
    one ? { label: '重命名', action: () => void startRename(one) } : null,
    nodes.length ? { label: '聚焦', action: () => void session.focusSelection() } : null,
    nodes.length ? { label: '创建副本', action: () => session.duplicateSelection() } : null,
    nodes.length ? { label: '组合', action: () => void session.groupSelection() } : null,
    nodes.some(node => node.kind === 'group') ? { label: '取消组合', action: () => session.ungroupSelection() } : null,
    nodes.length
      ? {
          label: nodes.every(node => node.visible) ? '隐藏' : '显示',
          action: () => session.toggleVisibilityOfSelection(),
        }
      : null,
    nodes.length
      ? {
          label: nodes.every(node => node.locked) ? '解锁' : '锁定',
          action: () =>
            session.setLocked(
              nodes.map(node => node.id),
              !nodes.every(node => node.locked),
            ),
        }
      : null,
    nodes.length
      ? {
          label: '移到最外层',
          action: () =>
            session.reparent(
              nodes.map(node => node.id),
              null,
            ),
        }
      : null,
    { label: '新建分组', action: () => void session.addGroup() },
    nodes.length ? { label: '删除', action: () => session.deleteSelection(), danger: true } : null,
  ]
  return items.filter((item): item is NonNullable<typeof item> => item !== null)
})

onBeforeUnmount(() => document.removeEventListener('pointerdown', closeMenu))
</script>

<template>
  <div class="tree">
    <div class="tree__search">
      <Search :size="13" />
      <input v-model="query" placeholder="搜索对象" data-testid="tree-search" />
    </div>
    <div
      class="tree__list s-scroll"
      data-testid="scene-tree"
      @contextmenu="openMenu($event, null)"
      @dragover.prevent
      @drop="onDropRoot"
      @click.self="session.clearSelection()"
    >
      <div
        v-for="row in rows"
        :key="row.node.id"
        class="tree__row"
        :class="{
          'is-selected': selected.has(row.node.id),
          'is-hovered': session.hovered.value === row.node.id,
          'is-hidden': !row.node.visible || row.hiddenByParent,
          'is-drop-into': drag.over === row.node.id && drag.zone === 'into',
          'is-drop-before': drag.over === row.node.id && drag.zone === 'before',
          'is-drop-after': drag.over === row.node.id && drag.zone === 'after',
        }"
        :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
        :data-testid="`tree-row-${row.node.name}`"
        :data-node-id="row.node.id"
        draggable="true"
        @click="click($event, row)"
        @dblclick="startRename(row.node)"
        @contextmenu.stop="openMenu($event, row)"
        @mouseenter="session.setHovered(row.node.id)"
        @mouseleave="session.setHovered(null)"
        @dragstart="onDragStart($event, row)"
        @dragover="onDragOver($event, row)"
        @dragleave="drag.over === row.node.id && (drag.over = '')"
        @drop.stop="onDrop($event, row)"
        @dragend="resetDrag"
      >
        <button
          class="tree__chevron"
          :class="{ 'is-open': !collapsed.has(row.node.id), 'is-empty': !row.hasChildren }"
          tabindex="-1"
          @click.stop="toggleCollapse(row.node.id)"
        >
          <ChevronRight :size="12" />
        </button>
        <component
          :is="
            row.node.kind === 'group' && !collapsed.has(row.node.id) && row.hasChildren
              ? FolderOpen
              : icons[row.node.kind]
          "
          class="tree__icon"
          :class="`is-${row.node.kind}`"
          :size="14"
        />
        <input
          v-if="shell.renaming === row.node.id"
          ref="renameInput"
          v-model="renameText"
          class="tree__rename"
          @click.stop
          @blur="finishRename(row.node)"
          @keydown.enter.prevent="finishRename(row.node)"
          @keydown.esc.prevent="shell.renaming = null"
        />
        <span v-else class="tree__name">{{ row.node.name }}</span>
        <span class="tree__badges">
          <Radio v-if="counts.bound.has(row.node.id)" class="tree__badge is-data" :size="12" title="已绑定设备" />
          <Sparkles v-if="counts.effects.get(row.node.id)" class="tree__badge is-effect" :size="12" title="有特效" />
        </span>
        <button
          class="tree__toggle"
          :class="{ 'is-on': row.node.locked }"
          :title="row.node.locked ? '解锁' : '锁定'"
          @click.stop="session.setLocked([row.node.id], !row.node.locked)"
        >
          <Lock v-if="row.node.locked" :size="12" /><Unlock v-else :size="12" />
        </button>
        <button
          class="tree__toggle"
          :class="{ 'is-on': !row.node.visible }"
          :title="row.node.visible ? '隐藏' : '显示'"
          @click.stop="session.setVisible([row.node.id], !row.node.visible)"
        >
          <EyeOff v-if="!row.node.visible" :size="12" /><Eye v-else :size="12" />
        </button>
      </div>
      <div v-if="!rows.length" class="s-empty">
        <Shapes :size="22" />
        <span>{{ query ? '没有匹配的对象' : '场景还是空的' }}</span>
        <span v-if="!query" class="s-hint">在「资源」中拖入模型，或用视口左侧工具绘制</span>
      </div>
    </div>
    <div class="tree__footer s-hint">
      {{ session.doc.value.nodes.length }} 个对象 · 已选 {{ session.selection.value.length }}
    </div>

    <Teleport to="body">
      <div
        v-if="menu.open"
        class="tree-menu s-float studio-popup"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        @pointerdown.stop
      >
        <button
          v-for="item in menuItems"
          :key="item.label"
          class="tree-menu__item"
          :class="{ 'is-danger': item.danger }"
          @click="act(item.action)"
        >
          {{ item.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tree {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}
.tree__search {
  display: flex;
  height: 28px;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  margin: 8px 8px 4px;
  padding: 0 8px;
  border: 1px solid var(--s-line-2);
  border-radius: 5px;
  background: var(--s-field);
  color: var(--s-fg-3);
}
.tree__search:focus-within {
  border-color: var(--s-accent-line);
}
.tree__search input {
  width: 100%;
  border: 0;
  background: transparent;
  outline: none;
  font-size: 12px;
}
.tree__list {
  padding: 2px 0 12px;
}
.tree__row {
  position: relative;
  display: flex;
  height: 26px;
  align-items: center;
  gap: 4px;
  padding-right: 6px;
  color: var(--s-fg);
  cursor: default;
}
.tree__row:hover,
.tree__row.is-hovered {
  background: rgb(255 255 255 / 0.035);
}
.tree__row.is-selected {
  background: var(--s-accent-soft);
}
.tree__row.is-selected::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 2px;
  background: var(--s-accent);
  content: '';
}
.tree__row.is-hidden .tree__name,
.tree__row.is-hidden .tree__icon {
  opacity: 0.45;
}
.tree__row.is-drop-into {
  box-shadow: inset 0 0 0 1px var(--s-accent);
}
.tree__row.is-drop-before {
  box-shadow: inset 0 2px 0 var(--s-accent);
}
.tree__row.is-drop-after {
  box-shadow: inset 0 -2px 0 var(--s-accent);
}
.tree__chevron {
  display: grid;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  place-items: center;
  padding: 0;
  border: 0;
  background: none;
  color: var(--s-fg-3);
  cursor: pointer;
  transition: transform 120ms ease;
}
.tree__chevron.is-open {
  transform: rotate(90deg);
}
.tree__chevron.is-empty {
  visibility: hidden;
}
.tree__icon {
  flex-shrink: 0;
  color: var(--s-fg-3);
}
.tree__icon.is-model {
  color: #c9b28f;
}
.tree__icon.is-group {
  color: #c7a35a;
}
.tree__icon.is-path {
  color: #5fc7e8;
}
.tree__icon.is-area {
  color: #5cc4ae;
}
.tree__icon.is-label {
  color: #e8a26c;
}
.tree__icon.is-light {
  color: #f0d070;
}
.tree__name {
  overflow: hidden;
  min-width: 0;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree__rename {
  min-width: 0;
  flex: 1;
  height: 20px;
  padding: 0 4px;
  border: 1px solid var(--s-accent-line);
  border-radius: 3px;
  background: var(--s-field);
  outline: none;
  font-size: 12px;
}
.tree__badges {
  display: flex;
  gap: 3px;
}
.tree__badge.is-data {
  color: var(--s-data);
}
.tree__badge.is-effect {
  color: var(--s-accent-2);
}
.tree__toggle {
  display: grid;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: none;
  color: var(--s-fg-3);
  opacity: 0;
  cursor: pointer;
}
.tree__row:hover .tree__toggle,
.tree__toggle.is-on {
  opacity: 1;
}
.tree__toggle:hover {
  background: var(--s-hover);
  color: var(--s-fg);
}
.tree__toggle.is-on {
  color: var(--s-accent-2);
}
.tree__footer {
  flex-shrink: 0;
  padding: 6px 12px;
  border-top: 1px solid var(--s-line);
}
.tree-menu {
  position: fixed;
  z-index: 3000;
  min-width: 150px;
  padding: 4px;
  font:
    12px/1.45 Inter,
    system-ui,
    'PingFang SC',
    sans-serif;
}
.tree-menu__item {
  display: block;
  width: 100%;
  height: 27px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #e8e6e1;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.tree-menu__item:hover {
  background: rgb(232 137 74 / 0.14);
  color: #f4ab78;
}
.tree-menu__item.is-danger:hover {
  background: rgb(229 103 92 / 0.15);
  color: #e5675c;
}
</style>
