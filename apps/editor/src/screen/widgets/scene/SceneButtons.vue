<script setup lang="ts">
import { Eye, EyeOff, Play, Square } from 'lucide-vue-next'
import { computed, inject } from 'vue'
import { ScreenRuntimeKey } from '../../runtime/ScreenRuntime'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

/** Buttons that drive the 3D views: camera views, a tour, or layer switches. */
const props = defineProps<WidgetComponentProps>()
const emit = defineEmits<{ action: [click: { item?: string }] }>()
const runtime = inject(ScreenRuntimeKey)!
const p = computed(() =>
  propsOf<{
    direction: 'row' | 'column'
    fontSize: number
    color: string
    textColor: string
    tourId: string
    showReset: boolean
  }>(props.widget),
)
const kind = computed(() => props.widget.type)

const items = computed(() => {
  if (kind.value === 'view-buttons')
    return [...(p.value.showReset ? [{ id: '', name: '全景' }] : []), ...runtime.bookmarks.value]
  if (kind.value === 'layer-toggles') return runtime.layers.value
  return []
})
const tour = computed(() => runtime.tours.value.find(item => item.id === p.value.tourId) ?? runtime.tours.value[0])
const playing = computed(() => runtime.tourPlaying.value)

function click(id: string): void {
  if (props.editing) return
  if (kind.value === 'view-buttons')
    void runtime.run(id ? { type: 'fly-to-view', bookmarkId: id } : { type: 'reset-view' })
  else if (kind.value === 'layer-toggles') void runtime.run({ type: 'toggle-layer', nodeId: id })
  emit('action', { item: id })
}

function toggleTour(): void {
  if (props.editing || !tour.value) return
  void runtime.run(playing.value ? { type: 'stop-tour' } : { type: 'play-tour', tourId: tour.value.id })
}
</script>

<template>
  <div
    class="buttons"
    :class="`is-${p.direction}`"
    :style="{ fontSize: `${p.fontSize}px`, '--c': p.color, color: p.textColor }"
  >
    <template v-if="kind === 'tour-control'">
      <button class="button is-wide" :class="{ 'is-active': playing }" :disabled="!tour" @click="toggleTour">
        <Square v-if="playing" :size="p.fontSize" /><Play v-else :size="p.fontSize" />
        {{ tour ? (playing ? `停止「${tour.name}」` : `播放「${tour.name}」`) : '场景中没有导览' }}
      </button>
    </template>
    <template v-else>
      <button
        v-for="item in items"
        :key="item.id"
        class="button"
        :class="{
          'is-active':
            kind === 'view-buttons'
              ? runtime.activeView.value === (item.id || null)
              : !runtime.hiddenLayers.has(item.id),
        }"
        :data-testid="`scene-button-${item.name}`"
        @click="click(item.id)"
      >
        <template v-if="kind === 'layer-toggles'">
          <Eye v-if="!runtime.hiddenLayers.has(item.id)" :size="p.fontSize" /><EyeOff v-else :size="p.fontSize" />
        </template>
        {{ item.name }}
      </button>
      <span v-if="!items.length" class="buttons__empty">{{
        runtime.scene.value ? '场景中没有可用项' : '关联三维场景后显示'
      }}</span>
    </template>
  </div>
</template>

<style scoped>
.buttons {
  display: flex;
  width: 100%;
  height: 100%;
  flex-wrap: wrap;
  align-content: center;
  align-items: center;
  gap: 0.6em;
}
.buttons.is-column {
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: stretch;
}
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
  padding: 0.45em 1em;
  border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--c) 10%, transparent);
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition:
    background 160ms ease,
    box-shadow 160ms ease;
}
.button:hover {
  background: color-mix(in srgb, var(--c) 22%, transparent);
}
.button.is-active {
  border-color: var(--c);
  background: color-mix(in srgb, var(--c) 30%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--c) 45%, transparent);
  color: #fff;
}
.button.is-wide {
  flex: 1;
  height: 100%;
}
.button:disabled {
  opacity: 0.5;
  cursor: default;
}
.buttons__empty {
  opacity: 0.6;
}
</style>
