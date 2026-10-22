<script setup lang="ts">
import { computed, inject } from 'vue'
import type { Widget } from '../model'
import { ScreenRuntimeKey } from '../runtime/ScreenRuntime'
import { widgetDefinition, type WidgetClick } from '../widgets'

const props = defineProps<{ widget: Widget; editing: boolean }>()
const runtime = inject(ScreenRuntimeKey)!
const definition = computed(() => widgetDefinition(props.widget.type))
const data = computed(() => runtime.dataFor(props.widget))
const style = computed(() => {
  const w = props.widget
  return {
    left: `${w.x}px`,
    top: `${w.y}px`,
    width: `${w.w}px`,
    height: `${w.h}px`,
    opacity: w.opacity,
    transform: w.rotation ? `rotate(${w.rotation}deg)` : undefined,
    visibility: w.hidden ? ('hidden' as const) : undefined,
  }
})

function onAction(click: WidgetClick): void {
  if (!props.editing) runtime.trigger(props.widget, click)
}
</script>

<template>
  <div
    class="widget"
    :class="{ 'is-editing': editing, 'is-clickable': !editing && widget.events?.length }"
    :style="style"
    :data-widget-id="widget.id"
    :data-widget-type="widget.type"
  >
    <component
      :is="definition.component"
      v-if="definition"
      :widget="widget"
      :data="data"
      :editing="editing"
      @action="onAction"
    />
    <div v-else class="widget__missing">未知组件 {{ widget.type }}</div>
  </div>
</template>

<style scoped>
.widget {
  position: absolute;
  box-sizing: border-box;
}
/* While editing, the canvas handles the pointer; widgets only draw. */
.widget.is-editing > :deep(*) {
  pointer-events: none;
}
.widget.is-clickable {
  cursor: pointer;
}
.widget__missing {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  border: 1px dashed #f87171;
  color: #f87171;
  font-size: 14px;
}
</style>
