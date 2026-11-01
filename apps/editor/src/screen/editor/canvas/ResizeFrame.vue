<script setup lang="ts">
/**
 * 选中框：8 个缩放手柄 + 一个标签（单选时显示尺寸，选中整个组合时显示组合名）。
 * 画在缩放后的舞台里，所以线宽、手柄大小都除以 --zoom，保证屏幕上看起来一样大。
 */
import type { Rect } from '../session'
import { type Handle, handles } from './useCanvasPointer'

defineProps<{
  rect: Rect
  /** 虚线框（多选）还是实线框（单选、组合）。 */
  dashed?: boolean
  /** 显示手柄（锁定的组件不能缩放）。 */
  resizable?: boolean
  /** 框下方的标签，如 "320 × 200"。 */
  size?: string
  /** 框上方的标签，如组合名。 */
  name?: string
  /** 手柄的 data-testid 前缀。 */
  testid?: string
}>()
const emit = defineEmits<{ handleDown: [event: PointerEvent, handle: Handle] }>()
</script>

<template>
  <div
    class="frame"
    :class="{ 'is-dashed': dashed }"
    :style="{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` }"
  >
    <span v-if="name" class="frame__name">{{ name }}</span>
    <template v-if="resizable">
      <span
        v-for="handle in handles"
        :key="handle"
        class="frame__handle"
        :class="`is-${handle}`"
        :data-testid="`${testid ?? 'handle'}-${handle}`"
        @pointerdown="emit('handleDown', $event, handle)"
      />
    </template>
    <span v-if="size" class="frame__size">{{ size }}</span>
  </div>
</template>

<style scoped>
.frame {
  position: absolute;
  outline: calc(1.5px / var(--zoom)) solid var(--s-accent);
  pointer-events: none;
}
.frame.is-dashed {
  outline-width: calc(1px / var(--zoom));
  outline-style: dashed;
}
.frame__handle {
  position: absolute;
  width: calc(9px / var(--zoom));
  height: calc(9px / var(--zoom));
  border: calc(1.5px / var(--zoom)) solid var(--s-accent);
  border-radius: calc(2px / var(--zoom));
  background: #fff;
  pointer-events: auto;
  transform: translate(-50%, -50%);
}
.frame__handle.is-nw {
  top: 0;
  left: 0;
  cursor: nwse-resize;
}
.frame__handle.is-n {
  top: 0;
  left: 50%;
  cursor: ns-resize;
}
.frame__handle.is-ne {
  top: 0;
  left: 100%;
  cursor: nesw-resize;
}
.frame__handle.is-e {
  top: 50%;
  left: 100%;
  cursor: ew-resize;
}
.frame__handle.is-se {
  top: 100%;
  left: 100%;
  cursor: nwse-resize;
}
.frame__handle.is-s {
  top: 100%;
  left: 50%;
  cursor: ns-resize;
}
.frame__handle.is-sw {
  top: 100%;
  left: 0;
  cursor: nesw-resize;
}
.frame__handle.is-w {
  top: 50%;
  left: 0;
  cursor: ew-resize;
}
.frame__size,
.frame__name {
  position: absolute;
  left: 50%;
  padding: calc(1px / var(--zoom)) calc(6px / var(--zoom));
  border-radius: calc(3px / var(--zoom));
  background: var(--s-accent);
  color: var(--s-on-accent);
  font:
    600 calc(11px / var(--zoom)) / 1.4 ui-monospace,
    monospace;
  transform: translateX(-50%);
  white-space: nowrap;
}
.frame__size {
  top: 100%;
  margin-top: calc(8px / var(--zoom));
}
.frame__name {
  bottom: 100%;
  left: 0;
  margin-bottom: calc(4px / var(--zoom));
  font-family: var(--s-font);
  transform: none;
}
</style>
