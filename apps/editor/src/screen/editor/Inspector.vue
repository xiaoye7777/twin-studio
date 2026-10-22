<script setup lang="ts">
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
} from 'lucide-vue-next'
import { computed } from 'vue'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSlider from '@/components/ui/UiSlider.vue'
import { widgetDefinition } from '../widgets'
import DataPanel from './DataPanel.vue'
import EventsPanel from './EventsPanel.vue'
import FieldEditor from './FieldEditor.vue'
import PageSettings from './PageSettings.vue'
import { useScreenSession } from './session'

const session = useScreenSession()
const ui = session.ui
const widgets = computed(() => session.selectedWidgets)
const widget = computed(() => (widgets.value.length === 1 ? widgets.value[0]! : null))
const definition = computed(() => (widget.value ? widgetDefinition(widget.value.type) : undefined))
const groups = computed(() => {
  const w = widget.value
  const fields = (definition.value?.fields ?? []).filter(field => !field.visible || field.visible(w?.props ?? {}))
  const result = new Map<string, typeof fields>()
  for (const field of fields) {
    const group = field.group ?? '样式'
    result.set(group, [...(result.get(group) ?? []), field])
  }
  return [...result]
})
const tabs = computed(() => [
  { id: 'style' as const, label: '样式' },
  ...(definition.value?.data ? [{ id: 'data' as const, label: '数据' }] : []),
  { id: 'events' as const, label: '交互' },
])
const tab = computed(() => (tabs.value.some(item => item.id === ui.inspectorTab) ? ui.inspectorTab : 'style'))

function setProp(key: string, value: unknown, live?: boolean): void {
  const w = widget.value
  if (!w) return
  session.updateWidget(w.id, item => void (item.props[key] = value), '修改样式', live ? `${w.id}:${key}` : undefined)
}

function setGeometry(key: 'x' | 'y' | 'w' | 'h' | 'rotation', value: number): void {
  const w = widget.value
  if (!w) return
  const v = key === 'w' || key === 'h' ? Math.max(8, Math.round(value)) : key === 'rotation' ? value : Math.round(value)
  session.updateWidget(w.id, item => void (item[key] = v), '调整位置', `${w.id}:${key}`)
}
</script>

<template>
  <aside class="inspector" data-testid="screen-inspector">
    <template v-if="widget">
      <div class="inspector__tabs">
        <button
          v-for="item in tabs"
          :key="item.id"
          class="s-tab"
          :class="{ 'is-active': tab === item.id }"
          :data-testid="`inspector-${item.id}`"
          @click="ui.inspectorTab = item.id"
        >
          {{ item.label }}
        </button>
        <span class="inspector__type">{{ definition?.name ?? widget.type }}</span>
      </div>
      <div class="inspector__body s-scroll">
        <template v-if="tab === 'style'">
          <div class="inspector__name">
            <input
              class="s-input"
              :value="widget.name"
              data-testid="widget-name"
              @change="session.rename(widget.id, ($event.target as HTMLInputElement).value)"
            />
          </div>
          <UiSection title="位置与尺寸">
            <UiRow label="位置">
              <UiNumber
                label="X"
                :model-value="widget.x"
                :step="1"
                :precision="0"
                @update="setGeometry('x', $event)"
                @commit="session.commit()"
              />
              <UiNumber
                label="Y"
                :model-value="widget.y"
                :step="1"
                :precision="0"
                @update="setGeometry('y', $event)"
                @commit="session.commit()"
              />
            </UiRow>
            <UiRow label="尺寸">
              <UiNumber
                label="W"
                :model-value="widget.w"
                :step="1"
                :precision="0"
                :min="8"
                @update="setGeometry('w', $event)"
                @commit="session.commit()"
              />
              <UiNumber
                label="H"
                :model-value="widget.h"
                :step="1"
                :precision="0"
                :min="8"
                @update="setGeometry('h', $event)"
                @commit="session.commit()"
              />
            </UiRow>
            <UiRow label="旋转">
              <UiNumber
                :model-value="widget.rotation"
                :step="1"
                :precision="0"
                unit="°"
                @update="setGeometry('rotation', $event)"
                @commit="session.commit()"
              />
            </UiRow>
            <UiRow label="不透明度">
              <UiSlider
                :model-value="widget.opacity"
                :min="0"
                :max="1"
                @update="
                  session.updateWidget(
                    widget.id,
                    item => void (item.opacity = $event),
                    '不透明度',
                    `${widget.id}:opacity`,
                  )
                "
                @commit="session.commit()"
              />
            </UiRow>
          </UiSection>
          <UiSection v-for="[group, fields] in groups" :key="group" :title="group">
            <UiRow
              v-for="field in fields"
              :key="field.key"
              :label="field.label"
              :hint="field.hint"
              :stack="field.type === 'textarea' || field.type === 'palette' || field.type === 'image'"
            >
              <FieldEditor
                :field="field"
                :value="widget.props[field.key] ?? definition?.props[field.key]"
                @update="(value, live) => setProp(field.key, value, live)"
                @commit="session.commit()"
              />
            </UiRow>
          </UiSection>
        </template>
        <DataPanel v-else-if="tab === 'data'" :widget="widget" />
        <EventsPanel v-else :widget="widget" />
      </div>
    </template>
    <template v-else-if="widgets.length > 1">
      <div class="inspector__tabs">
        <span class="inspector__title">已选 {{ widgets.length }} 个组件</span>
      </div>
      <div class="inspector__body s-scroll">
        <UiSection title="对齐与分布">
          <div class="tools">
            <button class="s-icon-btn" title="左对齐" @click="session.align('left')">
              <AlignStartVertical :size="15" />
            </button>
            <button class="s-icon-btn" title="水平居中" @click="session.align('hcenter')">
              <AlignCenterVertical :size="15" />
            </button>
            <button class="s-icon-btn" title="右对齐" @click="session.align('right')">
              <AlignEndVertical :size="15" />
            </button>
            <button class="s-icon-btn" title="顶对齐" @click="session.align('top')">
              <AlignStartHorizontal :size="15" />
            </button>
            <button class="s-icon-btn" title="垂直居中" @click="session.align('vcenter')">
              <AlignCenterHorizontal :size="15" />
            </button>
            <button class="s-icon-btn" title="底对齐" @click="session.align('bottom')">
              <AlignEndHorizontal :size="15" />
            </button>
            <button class="s-icon-btn" title="水平均匀分布" @click="session.distribute('x')">
              <AlignHorizontalDistributeCenter :size="15" />
            </button>
            <button class="s-icon-btn" title="垂直均匀分布" @click="session.distribute('y')">
              <AlignVerticalDistributeCenter :size="15" />
            </button>
          </div>
        </UiSection>
        <UiSection title="外观">
          <UiRow label="不透明度">
            <UiSlider
              :model-value="widgets[0]!.opacity"
              :min="0"
              :max="1"
              @update="session.updateSelected(item => void (item.opacity = $event), '不透明度', 'multi:opacity')"
              @commit="session.commit()"
            />
          </UiRow>
        </UiSection>
      </div>
    </template>
    <template v-else>
      <div class="inspector__tabs"><span class="inspector__title">页面设置</span></div>
      <div class="inspector__body s-scroll"><PageSettings /></div>
    </template>
  </aside>
</template>

<style scoped>
.inspector {
  display: flex;
  min-height: 0;
  flex-direction: column;
  border-left: 1px solid var(--s-line);
  background: var(--s-panel);
}
.inspector__tabs {
  display: flex;
  height: 38px;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  border-bottom: 1px solid var(--s-line);
}
.inspector__type {
  margin-left: auto;
  color: var(--s-fg-3);
  font-size: 11px;
}
.inspector__title {
  padding: 0 6px;
  color: var(--s-fg);
  font-size: 12.5px;
  font-weight: 550;
}
.inspector__body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding-bottom: 24px;
}
.inspector__name {
  padding: 10px 12px 4px;
}
.tools {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 0 10px 6px;
}
</style>
