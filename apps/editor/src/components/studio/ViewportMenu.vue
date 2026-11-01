<script setup lang="ts">
import { Vector3 } from 'three'
import { computed } from 'vue'
import type { MenuItem } from '@/components/ui/menu'
import UiMenu from '@/components/ui/UiMenu.vue'
import { useSession } from '@/studio/context'
import { saveSelectionAsComponent } from '@/studio/saveComponent'
import { useShell } from '@/studio/shell'

type Item = MenuItem

const session = useSession()
const shell = useShell()
const menu = computed(() => session.ui.contextMenu)
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
        { label: '保存为组件…', action: () => void saveSelectionAsComponent(session) },
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
</script>

<template>
  <!-- 三维视口的右键菜单：内容随点到的东西变化（部件 / 选中的对象 / 空白处）。 -->
  <UiMenu
    v-if="menu"
    :x="menu.x"
    :y="menu.y"
    :sections="sections"
    testid="viewport-menu"
    @close="session.closeContextMenu()"
  />
</template>
