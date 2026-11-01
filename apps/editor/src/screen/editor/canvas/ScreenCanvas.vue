<script setup lang="ts">
/**
 * 大屏编辑器中间的画布。
 *
 * 结构（从下到上）：
 *   ScreenPage    真实渲染的大屏页面（组件只负责显示，编辑时不响应鼠标）
 *   hit 层        每个组件一个透明块，接收点击和拖动（按绘制顺序，最上面的先被点到）
 *   选中框        ResizeFrame：单选 / 多选 / 组合
 *   吸附线        拖动时出现的粉色线
 *   CanvasRulers  标尺和参考线
 *   右键菜单      UiMenu
 *
 * 鼠标操作的细节在 useCanvasPointer.ts，吸附计算在 snapping.ts。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { MenuSections } from '@/components/ui/menu'
import { useContextMenu } from '@/components/ui/menu'
import UiMenu from '@/components/ui/UiMenu.vue'
import type { Widget } from '../../model'
import ScreenPage from '../../render/ScreenPage.vue'
import { WIDGET_DRAG_MIME } from '../dnd'
import { boundsOf, useScreenSession } from '../session'
import CanvasRulers from './CanvasRulers.vue'
import ResizeFrame from './ResizeFrame.vue'
import { useCanvasPointer } from './useCanvasPointer'

const session = useScreenSession()
const ui = session.ui
const viewport = ref<HTMLDivElement>()
const doc = computed(() => session.doc.value)
const selected = computed(() => new Set(session.selection.value))
/** 按住空格时拖动画布。 */
const spaceDown = ref(false)
const pointer = useCanvasPointer(session, viewport, spaceDown)
const menu = useContextMenu()

const stageStyle = computed(() => ({
  transform: `translate(${ui.panX}px, ${ui.panY}px) scale(${ui.zoom})`,
  width: `${doc.value.page.width}px`,
  height: `${doc.value.page.height}px`,
  '--zoom': ui.zoom,
}))

// ---------------------------------------------------------------- 选中状态

const single = computed(() => (session.selectedWidgets.length === 1 ? session.selectedWidgets[0]! : null))
const multiBox = computed(() => (session.selectedWidgets.length > 1 ? boundsOf(session.selectedWidgets) : null))
/** 选中的正好是一个组合时，框上显示组合名。 */
const selectedGroup = computed(() => {
  const widgets = session.selectedWidgets
  const groupId = widgets[0]?.groupId
  if (!groupId || widgets.length < 2 || widgets.some(widget => widget.groupId !== groupId)) return null
  return session.group(groupId) ?? null
})
const allUnlocked = computed(() => session.selectedWidgets.every(widget => !widget.locked))
/** 标尺上要标出的范围。 */
const selectionExtent = computed(() => multiBox.value ?? (single.value ? boundsOf([single.value]) : null))

// ---------------------------------------------------------------- 视口尺寸与按键

let resizeObserver: ResizeObserver | null = null
let fitted = false
onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    ui.viewport = { width: entry!.contentRect.width, height: entry!.contentRect.height }
    // 第一次有尺寸时让整个页面适应窗口。
    if (!fitted && entry!.contentRect.width > 0) {
      fitted = true
      session.fit()
    }
  })
  resizeObserver.observe(viewport.value!)
  session.attachPage(viewport.value!.querySelector<HTMLElement>('[data-testid="screen-page"]'))
  window.addEventListener('keydown', onSpace)
  window.addEventListener('keyup', onSpace)
})
onBeforeUnmount(() => {
  session.attachPage(null)
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onSpace)
  window.removeEventListener('keyup', onSpace)
})

function onSpace(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return
  if (event.code !== 'Space') return
  spaceDown.value = event.type === 'keydown'
  if (event.type === 'keydown') event.preventDefault()
}

/** 滚轮平移；按住 ⌘ / Ctrl 时以鼠标为中心缩放。 */
function onWheel(event: WheelEvent): void {
  event.preventDefault()
  const rect = viewport.value!.getBoundingClientRect()
  if (event.ctrlKey || event.metaKey)
    session.zoomTo(ui.zoom * Math.exp(-event.deltaY * 0.0025), {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  else {
    ui.panX -= event.deltaX
    ui.panY -= event.deltaY
  }
}

// ---------------------------------------------------------------- 从组件库拖入

const dropping = ref(false)
function onDragOver(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes(WIDGET_DRAG_MIME)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
  dropping.value = true
}
function onDrop(event: DragEvent): void {
  dropping.value = false
  const type = event.dataTransfer?.getData(WIDGET_DRAG_MIME)
  if (!type) return
  event.preventDefault()
  session.addWidget(type, pointer.toPage(event.clientX, event.clientY))
}

// ---------------------------------------------------------------- 右键菜单

function openMenu(event: MouseEvent, widget?: Widget): void {
  if (widget && !selected.value.has(widget.id)) session.select(session.groupOf(widget.id))
  menu.openAt(event)
}

const menuSections = computed<MenuSections>(() => {
  const widgets = session.selectedWidgets
  if (!widgets.length) return [[{ label: '全选', shortcut: '⌘A', action: () => session.selectAll() }]]
  const ids = widgets.map(widget => widget.id)
  const locked = widgets.every(widget => widget.locked)
  const hidden = widgets.every(widget => widget.hidden)
  return [
    [
      ...(widgets.length > 1 ? [{ label: '组合', shortcut: '⌘G', action: () => session.groupSelected() }] : []),
      ...(widgets.some(widget => widget.groupId)
        ? [{ label: '取消组合', shortcut: '⇧⌘G', action: () => session.ungroupSelected() }]
        : []),
    ],
    [
      { label: '置于顶层', action: () => session.arrange('front') },
      { label: '上移一层', shortcut: ']', action: () => session.arrange('forward') },
      { label: '下移一层', shortcut: '[', action: () => session.arrange('backward') },
      { label: '置于底层', action: () => session.arrange('back') },
    ],
    [
      { label: '复制', shortcut: '⌘C', action: () => session.copy() },
      { label: '创建副本', shortcut: '⌘D', action: () => session.duplicateSelected() },
      { label: locked ? '解锁' : '锁定', action: () => session.setLocked(ids, !locked) },
      { label: hidden ? '显示' : '隐藏', action: () => session.setHidden(ids, !hidden) },
    ],
    [{ label: '删除', shortcut: 'Del', action: () => session.removeSelected(), danger: true }],
  ]
})
</script>

<template>
  <div
    ref="viewport"
    class="canvas"
    :class="{ 'is-panning': pointer.panning.value, 'is-space': spaceDown, 'is-dropping': dropping }"
    data-testid="screen-canvas"
    @pointerdown="pointer.onViewportDown"
    @pointermove="pointer.onMove"
    @pointerup="pointer.onUp"
    @pointercancel="pointer.onUp"
    @wheel="onWheel"
    @dragover="onDragOver"
    @dragleave="dropping = false"
    @drop="onDrop"
    @contextmenu="openMenu($event)"
  >
    <div class="stage" :style="stageStyle">
      <ScreenPage :screen="doc" editing />

      <div
        v-for="widget in doc.widgets"
        v-show="!widget.hidden && !widget.locked"
        :key="widget.id"
        class="hit"
        :class="{ 'is-hovered': ui.hovered === widget.id && !selected.has(widget.id) }"
        :style="{ left: `${widget.x}px`, top: `${widget.y}px`, width: `${widget.w}px`, height: `${widget.h}px` }"
        :data-testid="`hit-${widget.name}`"
        @pointerdown="pointer.onWidgetDown($event, widget)"
        @dblclick.stop="widget.groupId && session.select([widget.id])"
        @pointerenter="ui.hovered = widget.id"
        @pointerleave="ui.hovered === widget.id && (ui.hovered = null)"
        @contextmenu.stop.prevent="openMenu($event, widget)"
      />

      <!-- 多选时每个组件的细框 -->
      <template v-if="multiBox">
        <div
          v-for="widget in session.selectedWidgets"
          :key="`sel-${widget.id}`"
          class="outline"
          :class="{ 'is-locked': widget.locked }"
          :style="{ left: `${widget.x}px`, top: `${widget.y}px`, width: `${widget.w}px`, height: `${widget.h}px` }"
        />
        <ResizeFrame
          :rect="multiBox"
          :dashed="!selectedGroup"
          :resizable="allUnlocked"
          :name="selectedGroup?.name"
          testid="group-handle"
          @handle-down="pointer.onHandleDown"
        />
      </template>
      <ResizeFrame
        v-else-if="single"
        :rect="single"
        :dashed="single.locked"
        :resizable="!single.locked"
        :size="single.locked ? undefined : `${single.w} × ${single.h}`"
        @handle-down="pointer.onHandleDown"
      />

      <!-- 吸附线 -->
      <div
        v-for="(line, index) in ui.guides"
        :key="index"
        class="snap"
        :class="`is-${line.axis}`"
        :style="
          line.axis === 'x'
            ? { left: `${line.at}px`, top: `${line.from}px`, height: `${line.to - line.from}px` }
            : { top: `${line.at}px`, left: `${line.from}px`, width: `${line.to - line.from}px` }
        "
      />
    </div>

    <CanvasRulers :selection="selectionExtent" />

    <div
      v-if="ui.marquee"
      class="marquee"
      :style="{
        left: `${ui.marquee.x}px`,
        top: `${ui.marquee.y}px`,
        width: `${ui.marquee.w}px`,
        height: `${ui.marquee.h}px`,
      }"
    />
    <UiMenu v-if="menu.visible" :x="menu.x" :y="menu.y" :sections="menuSections" @close="menu.close()" />
  </div>
</template>

<style scoped>
.canvas {
  position: relative;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background-color: var(--s-canvas);
  background-image: radial-gradient(var(--s-canvas-dot) 1px, transparent 1px);
  background-size: 20px 20px;
  cursor: default;
  touch-action: none;
  user-select: none;
}
.canvas.is-space {
  cursor: grab;
}
.canvas.is-panning {
  cursor: grabbing;
}
.canvas.is-dropping {
  box-shadow: inset 0 0 0 2px var(--s-accent-line);
}
.stage {
  position: absolute;
  top: 0;
  left: 0;
  box-shadow: 0 10px 50px rgb(0 0 0 / 0.45);
  transform-origin: 0 0;
}
.hit {
  position: absolute;
  cursor: move;
}
.canvas.is-space .hit {
  cursor: grab;
}
.hit.is-hovered {
  outline: calc(1px / var(--zoom)) solid var(--s-accent-line);
}
.outline {
  position: absolute;
  outline: calc(1.5px / var(--zoom)) solid var(--s-accent);
  pointer-events: none;
}
.outline.is-locked {
  outline-style: dashed;
}
.snap {
  position: absolute;
  background: var(--s-snap);
  pointer-events: none;
}
.snap.is-x {
  width: calc(1px / var(--zoom));
}
.snap.is-y {
  height: calc(1px / var(--zoom));
}
.marquee {
  position: absolute;
  border: 1px solid var(--s-accent);
  background: var(--s-accent-soft);
  pointer-events: none;
}
</style>
