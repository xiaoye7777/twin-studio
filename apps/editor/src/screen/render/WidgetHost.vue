<script setup lang="ts">
import { computed, inject } from 'vue'
import type { Widget } from '../model'
import { ScreenRuntimeKey } from '../runtime/ScreenRuntime'
import { widgetDefinition, type WidgetClick } from '../widgets'

const props = defineProps<{ widget: Widget; editing: boolean }>()
const runtime = inject(ScreenRuntimeKey)!
const definition = computed(() => widgetDefinition(props.widget.type))
const data = computed(() => runtime.dataFor(props.widget, definition.value?.data?.shape))
/** Interface trouble, shown on the widget while editing (a running screen keeps its last data quietly). */
const apiProblem = computed(() => {
  if (!props.editing || props.widget.data?.source !== 'api') return ''
  if (!props.widget.data.api?.datasetId) return '未选择接口'
  const state = runtime.apiState(props.widget)
  if (!state) return runtime.sources.loaded ? '接口已被删除' : ''
  if (state.status === 'error') return state.error
  return state.status === 'loading' ? '加载中…' : ''
})
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
    <div
      v-if="apiProblem"
      class="widget__api"
      :class="{ 'is-loading': apiProblem === '加载中…' }"
      :title="apiProblem"
      data-testid="widget-api-problem"
    >
      {{ apiProblem }}
    </div>
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
.widget__api {
  position: absolute;
  top: 4px;
  right: 4px;
  max-width: calc(100% - 8px);
  overflow: hidden;
  padding: 2px 8px;
  border-radius: 3px;
  background: rgba(220, 38, 38, 0.88);
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}
.widget__api.is-loading {
  background: rgba(14, 116, 144, 0.85);
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
