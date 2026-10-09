<script setup lang="ts">
import { Vector3 } from 'three'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useSession } from '@/studio/context'
import { useShell } from '@/studio/shell'

interface Item {
  label: string
  shortcut?: string
  action: () => void
  danger?: boolean
}

const session = useSession()
const shell = useShell()
const menu = computed(() => session.ui.contextMenu)
const element = ref<HTMLElement>()
const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'
const point = computed(() => (menu.value?.point ? new Vector3(...menu.value.point) : null))

const sections = computed<Item[][]>(() => {
  const part = session.part.value
  const nodes = session.selectedNodes
  const paste: Item[] = session.ui.hasClipboard
    ? [{ label: '粘贴到这里', shortcut: `${mod}V`, action: () => session.paste(point.value) }]
    : []
  if (part) {
    const hidden = session.partOverride(part.nodeId, part.assetNodeId)?.visible === false
    return [
      [
        { label: '聚焦部件', shortcut: 'F', action: () => void session.focusSelection() },
        { label: hidden ? '显示部件' : '隐藏部件', shortcut: 'H', action: () => session.toggleVisibilityOfSelection() },
        { label: '绑定设备…', action: () => (shell.nodeTab = 'data') },
        { label: '添加特效…', action: () => (shell.nodeTab = 'effects') },
      ],
      [
        { label: '恢复部件', action: () => session.resetPart(part.nodeId, part.assetNodeId) },
        { label: '回到整个模型', shortcut: 'Esc', action: () => session.selectParent() },
      ],
      [{ label: '删除部件', shortcut: 'Del', action: () => session.deleteSelection(), danger: true }],
    ]
  }
  if (nodes.length) {
    const one = nodes.length === 1 ? nodes[0]! : null
    return [
      [
        { label: '聚焦', shortcut: 'F', action: () => void session.focusSelection() },
        { label: '复制', shortcut: `${mod}C`, action: () => session.copySelection() },
        ...paste,
        { label: '创建副本', shortcut: `${mod}D`, action: () => session.duplicateSelection() },
        { label: '阵列复制…', action: () => (shell.dialog = 'array') },
      ],
      [
        { label: '组合', shortcut: `${mod}G`, action: () => void session.groupSelection() },
        ...(nodes.some(node => node.kind === 'group')
          ? [{ label: '取消组合', shortcut: `${mod}⇧G`, action: () => session.ungroupSelection() }]
          : []),
        {
          label: nodes.every(node => node.visible) ? '隐藏' : '显示',
          shortcut: 'H',
          action: () => session.toggleVisibilityOfSelection(),
        },
        {
          label: nodes.every(node => node.locked) ? '解锁' : '锁定',
          action: () =>
            session.setLocked(
              nodes.map(node => node.id),
              !nodes.every(node => node.locked),
            ),
        },
        { label: '放到地面', shortcut: 'End', action: () => session.dropToGround() },
      ],
      [
        ...(one?.kind === 'model' ? [{ label: '替换模型…', action: () => (shell.dialog = 'replace-model') }] : []),
        {
          label: nodes.length > 1 ? '批量绑定设备…' : '绑定设备…',
          action: () => (nodes.length > 1 ? (shell.dialog = 'batch-bind') : (shell.nodeTab = 'data')),
        },
        ...(one ? [{ label: '添加特效…', action: () => (shell.nodeTab = 'effects') }] : []),
      ],
      [{ label: '删除', shortcut: 'Del', action: () => session.deleteSelection(), danger: true }],
    ]
  }
  return [
    [
      ...paste,
      { label: '在这里添加立方体', action: () => void session.addPrimitive('box', point.value) },
      { label: '在这里添加地块', action: () => void session.addPrimitive('plane', point.value) },
    ],
    [
      { label: '保存当前视角', action: () => void session.addBookmark() },
      { label: '设为初始视角', action: () => session.setOpeningView() },
      { label: '测量距离', shortcut: 'M', action: () => session.startMeasure('distance') },
    ],
    [{ label: '全选', shortcut: `${mod}A`, action: () => session.selectAll() }],
  ]
})

// Kept on screen: flips left / up near the right and bottom edges.
const position = computed(() => {
  const m = menu.value
  if (!m) return {}
  const width = 200
  const height = sections.value.flat().length * 28 + sections.value.length * 9 + 8
  return {
    left: `${Math.min(m.x, window.innerWidth - width - 8)}px`,
    top: `${m.y + height > window.innerHeight - 8 ? Math.max(8, m.y - height) : m.y}px`,
  }
})

function run(item: Item): void {
  // Actions read the clicked point from the open menu, so it closes afterwards.
  item.action()
  session.closeContextMenu()
}

const close = (event: Event) => {
  if (event instanceof KeyboardEvent && event.key !== 'Escape') return
  if (event.target instanceof Node && element.value?.contains(event.target)) return
  session.closeContextMenu()
}
const events = ['pointerdown', 'keydown', 'wheel'] as const
const unlisten = () => events.forEach(type => window.removeEventListener(type, close, true))
watch(menu, open => {
  unlisten()
  // Later than the pointerup that opened the menu, which must not close it.
  if (open) setTimeout(() => events.forEach(type => window.addEventListener(type, close, true)))
})
onBeforeUnmount(unlisten)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="menu"
      ref="element"
      class="viewport-menu s-float studio-popup"
      :style="position"
      data-testid="viewport-menu"
      @contextmenu.prevent
    >
      <template v-for="(section, index) in sections" :key="index">
        <div v-if="index > 0" class="viewport-menu__sep" />
        <button
          v-for="item in section"
          :key="item.label"
          class="viewport-menu__item"
          :class="{ 'is-danger': item.danger }"
          :data-testid="`menu-${item.label}`"
          @click="run(item)"
        >
          <span>{{ item.label }}</span>
          <span v-if="item.shortcut" class="viewport-menu__key">{{ item.shortcut }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.viewport-menu {
  position: fixed;
  z-index: 3000;
  display: flex;
  width: 200px;
  flex-direction: column;
  padding: 4px;
}
.viewport-menu__item {
  display: flex;
  height: 28px;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--s-fg);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}
.viewport-menu__item:hover {
  background: var(--s-hover);
}
.viewport-menu__item.is-danger {
  color: var(--s-danger);
}
.viewport-menu__key {
  color: var(--s-fg-3);
  font-family: var(--s-mono);
  font-size: 11px;
}
.viewport-menu__sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--s-line);
}
</style>
