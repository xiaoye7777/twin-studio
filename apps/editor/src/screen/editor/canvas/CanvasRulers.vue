<script setup lang="ts">
/**
 * 画布的标尺和参考线。
 *
 * - 标尺：上方和左侧，刻度随缩放自动变疏密，选中组件的范围用主题色标出。
 * - 参考线：从标尺按住往画布里拖出；拖动可移动；拖回标尺删除；左上角按钮清除全部。
 *   参考线存在文档里（doc.guides），所以能撤销，也会参与吸附（见 snapping.ts）。
 *
 * 自己处理参考线的拖动（pointer capture 在被按下的元素上），不和画布的拖动逻辑混在一起。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useTheme } from '@/theme/themes'
import { type Rect, useScreenSession } from '../session'

const props = defineProps<{ selection: Rect | null }>()
const session = useScreenSession()
const ui = session.ui
const { active: theme } = useTheme()

/** 标尺宽度（屏幕像素）。 */
const RULER = 20
const root = ref<HTMLElement>()
const rulerX = ref<HTMLCanvasElement>()
const rulerY = ref<HTMLCanvasElement>()

// ---------------------------------------------------------------- 参考线

type Axis = 'x' | 'y'
const lines = computed(() => [
  ...(session.doc.value.guides?.x ?? []).map((at, index) => ({ axis: 'x' as const, at, index })),
  ...(session.doc.value.guides?.y ?? []).map((at, index) => ({ axis: 'y' as const, at, index })),
])
/** 从标尺拖出、还没松手的参考线（松手在画布上才真正加入文档）。 */
const pending = ref<{ axis: Axis; at: number } | null>(null)
/** 正在拖的参考线：已有的（index）或新拉出的（index = -1）。 */
let dragging: { axis: Axis; index: number } | null = null

/** 页面坐标 → 参考线在画布上的屏幕位置。 */
const screenOffset = (axis: Axis, at: number) => (axis === 'x' ? ui.panX : ui.panY) + at * ui.zoom

function pagePoint(event: PointerEvent): { x: number; y: number } {
  const rect = root.value!.getBoundingClientRect()
  return {
    x: Math.round((event.clientX - rect.left - ui.panX) / ui.zoom),
    y: Math.round((event.clientY - rect.top - ui.panY) / ui.zoom),
  }
}

function startGuide(event: PointerEvent, axis: Axis, index = -1): void {
  if (event.button !== 0) return
  event.stopPropagation()
  ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  dragging = { axis, index }
  if (index < 0) pending.value = { axis, at: pagePoint(event)[axis] }
}

function moveGuide(event: PointerEvent): void {
  if (!dragging) return
  const at = pagePoint(event)[dragging.axis]
  if (dragging.index < 0) pending.value = { axis: dragging.axis, at }
  else session.moveGuide(dragging.axis, dragging.index, at)
}

/** 松手：落在标尺上表示删除（或者不创建），落在画布上就保留。 */
function endGuide(event: PointerEvent): void {
  if (!dragging) return
  const { axis, index } = dragging
  dragging = null
  const rect = root.value!.getBoundingClientRect()
  const onRuler = axis === 'x' ? event.clientX - rect.left < RULER + 4 : event.clientY - rect.top < RULER + 4
  if (index < 0) {
    if (pending.value && !onRuler) session.addGuide(axis, pending.value.at)
    pending.value = null
    return
  }
  session.commit()
  if (onRuler) session.removeGuide(axis, index)
}

// ---------------------------------------------------------------- 标尺绘制

/** 主题里的颜色（标尺画在 canvas 上，不能直接用 CSS 变量）。 */
function color(name: string): string {
  return getComputedStyle(root.value!).getPropertyValue(name).trim()
}

/** 刻度间隔取 1/2/5 × 10ⁿ 页面像素，让标注之间至少隔 70 个屏幕像素。 */
function drawRuler(canvas: HTMLCanvasElement | undefined, axis: Axis): void {
  const length = axis === 'x' ? ui.viewport.width : ui.viewport.height
  if (!canvas || !length) return
  const ratio = window.devicePixelRatio || 1
  const width = axis === 'x' ? length : RULER
  const height = axis === 'x' ? RULER : length
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const g = canvas.getContext('2d')
  if (!g) return
  g.setTransform(ratio, 0, 0, ratio, 0, 0)
  g.fillStyle = color('--s-ruler')
  g.fillRect(0, 0, width, height)

  const pan = axis === 'x' ? ui.panX : ui.panY
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
  const major = steps.find(step => step * ui.zoom >= 70) ?? 5000
  const minor = major / (String(major).startsWith('5') ? 5 : 10)

  // 选中组件的范围
  const box = props.selection
  if (box) {
    const from = pan + (axis === 'x' ? box.x : box.y) * ui.zoom
    const size = (axis === 'x' ? box.w : box.h) * ui.zoom
    g.fillStyle = color('--s-accent-soft')
    if (axis === 'x') g.fillRect(from, 0, size, height)
    else g.fillRect(0, from, width, size)
  }

  // 刻度和数字
  g.strokeStyle = color('--s-line-strong')
  g.fillStyle = color('--s-fg-3')
  g.font = '10px ui-monospace, monospace'
  g.lineWidth = 1
  g.beginPath()
  const first = Math.floor(-pan / ui.zoom / minor) * minor
  const last = (length - pan) / ui.zoom
  for (let value = first; value <= last; value += minor) {
    const at = Math.round(pan + value * ui.zoom) + 0.5
    const isMajor = Math.abs(value / major - Math.round(value / major)) < 1e-6
    const tick = isMajor ? RULER : RULER / 4
    if (axis === 'x') {
      g.moveTo(at, RULER - tick)
      g.lineTo(at, RULER)
      if (isMajor) g.fillText(String(Math.round(value)), at + 3, 10)
    } else {
      g.moveTo(RULER - tick, at)
      g.lineTo(RULER, at)
      if (isMajor) {
        g.save()
        g.translate(10, at + 3)
        g.rotate(-Math.PI / 2)
        g.fillText(String(Math.round(value)), 0, 0)
        g.restore()
      }
    }
  }
  g.stroke()

  // 与画布之间的分隔线
  g.fillStyle = color('--s-line')
  if (axis === 'x') g.fillRect(0, RULER - 1, width, 1)
  else g.fillRect(RULER - 1, 0, 1, height)
}

let frame = 0
function redraw(): void {
  if (frame || !ui.rulers) return
  frame = requestAnimationFrame(() => {
    frame = 0
    drawRuler(rulerX.value, 'x')
    drawRuler(rulerY.value, 'y')
  })
}
watch(
  () => [ui.rulers, ui.zoom, ui.panX, ui.panY, ui.viewport.width, ui.viewport.height, props.selection, theme.value],
  redraw,
  { flush: 'post' },
)
onMounted(redraw)
</script>

<template>
  <div v-if="ui.rulers" ref="root" class="rulers">
    <div
      v-for="line in lines"
      :key="`${line.axis}${line.index}`"
      class="guide"
      :class="`is-${line.axis}`"
      :style="
        line.axis === 'x' ? { left: `${screenOffset('x', line.at)}px` } : { top: `${screenOffset('y', line.at)}px` }
      "
      :data-testid="`guide-${line.axis}-${line.at}`"
      :title="`${line.at} px（拖回标尺删除）`"
      @pointerdown="startGuide($event, line.axis, line.index)"
      @pointermove="moveGuide"
      @pointerup="endGuide"
    />
    <div
      v-if="pending"
      class="guide is-pending"
      :class="`is-${pending.axis}`"
      :style="
        pending.axis === 'x'
          ? { left: `${screenOffset('x', pending.at)}px` }
          : { top: `${screenOffset('y', pending.at)}px` }
      "
    >
      <span>{{ pending.at }}</span>
    </div>
    <!-- 上方标尺拖出横向参考线（y），左侧标尺拖出纵向参考线（x） -->
    <canvas
      ref="rulerX"
      class="ruler is-x"
      data-testid="ruler-x"
      title="按住拖出参考线"
      @pointerdown="startGuide($event, 'y')"
      @pointermove="moveGuide"
      @pointerup="endGuide"
    />
    <canvas
      ref="rulerY"
      class="ruler is-y"
      data-testid="ruler-y"
      title="按住拖出参考线"
      @pointerdown="startGuide($event, 'x')"
      @pointermove="moveGuide"
      @pointerup="endGuide"
    />
    <button class="corner" title="清除全部参考线" @pointerdown.stop @click="session.clearGuides()" />
  </div>
</template>

<style scoped>
.rulers {
  position: absolute;
  z-index: 5;
  inset: 0;
  pointer-events: none;
}
.rulers > * {
  pointer-events: auto;
}
.ruler {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
}
.ruler.is-x {
  cursor: s-resize;
}
.ruler.is-y {
  cursor: e-resize;
}
.corner {
  position: absolute;
  z-index: 1;
  top: 0;
  left: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-right: 1px solid var(--s-line);
  border-bottom: 1px solid var(--s-line);
  background: var(--s-ruler);
  cursor: pointer;
}
.corner:hover {
  background: var(--s-hover);
}
/* 参考线本身 1px，两侧各留 3px 好抓 */
.guide {
  position: absolute;
}
.guide.is-x {
  top: 0;
  bottom: 0;
  width: 7px;
  margin-left: -3px;
  background: linear-gradient(90deg, transparent 3px, var(--s-guide) 3px, var(--s-guide) 4px, transparent 4px);
  cursor: ew-resize;
}
.guide.is-y {
  right: 0;
  left: 0;
  height: 7px;
  margin-top: -3px;
  background: linear-gradient(180deg, transparent 3px, var(--s-guide) 3px, var(--s-guide) 4px, transparent 4px);
  cursor: ns-resize;
}
.guide.is-pending {
  pointer-events: none;
}
.guide span {
  position: absolute;
  top: 24px;
  left: 8px;
  padding: 0 5px;
  border-radius: 3px;
  background: var(--s-guide);
  color: #fff;
  font:
    10.5px/1.6 ui-monospace,
    monospace;
}
.guide.is-y span {
  top: 6px;
  left: 24px;
}
</style>
