<script setup lang="ts">
/**
 * A drag handle on a panel edge. `edge` says which side of the panel it sits on, so dragging away from the
 * panel grows it. Double-click restores the default size.
 */
const props = defineProps<{
  modelValue: number
  edge: 'left' | 'right' | 'top'
  min: number
  max: number
  initial: number
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

function start(event: PointerEvent): void {
  if (event.button !== 0) return
  event.preventDefault()
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
  const origin = props.edge === 'top' ? event.clientY : event.clientX
  const startValue = props.modelValue
  document.body.style.cursor = props.edge === 'top' ? 'row-resize' : 'col-resize'
  const move = (moveEvent: PointerEvent) => {
    const position = props.edge === 'top' ? moveEvent.clientY : moveEvent.clientX
    // Panels grow away from their handle: a left panel's handle is on its right edge, and so on.
    const delta = props.edge === 'right' ? position - origin : origin - position
    emit('update:modelValue', Math.round(Math.min(props.max, Math.max(props.min, startValue + delta))))
  }
  const end = () => {
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', end)
    handle.removeEventListener('pointercancel', end)
    document.body.style.cursor = ''
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', end)
  handle.addEventListener('pointercancel', end)
}
</script>

<template>
  <div
    class="resize-handle"
    :class="`is-${edge}`"
    role="separator"
    :aria-orientation="edge === 'top' ? 'horizontal' : 'vertical'"
    title="拖动调整大小，双击恢复默认"
    @pointerdown="start"
    @dblclick="emit('update:modelValue', initial)"
  />
</template>

<style scoped>
.resize-handle {
  position: absolute;
  z-index: 15;
  touch-action: none;
}
.resize-handle::after {
  position: absolute;
  background: var(--s-accent);
  opacity: 0;
  transition: opacity 120ms ease;
  content: '';
}
.resize-handle:hover::after,
.resize-handle:active::after {
  opacity: 0.8;
}
.resize-handle.is-left,
.resize-handle.is-right {
  top: 0;
  bottom: 0;
  width: 7px;
  cursor: col-resize;
}
.resize-handle.is-right {
  right: -4px;
}
.resize-handle.is-left {
  left: -4px;
}
.resize-handle.is-left::after,
.resize-handle.is-right::after {
  top: 0;
  bottom: 0;
  left: 3px;
  width: 1px;
}
.resize-handle.is-top {
  top: -4px;
  right: 0;
  left: 0;
  height: 7px;
  cursor: row-resize;
}
.resize-handle.is-top::after {
  top: 3px;
  right: 0;
  left: 0;
  height: 1px;
}
</style>
