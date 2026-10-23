<script setup lang="ts">
import { MousePointerClick, Plus, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import { newScreenId, type ScreenAction, type Widget } from '../model'
import { widgetDefinition } from '../widgets'
import { useScreenSession } from './session'

const props = defineProps<{ widget: Widget }>()
const session = useScreenSession()
const runtime = session.runtime
const definition = computed(() => widgetDefinition(props.widget.type))
const events = computed(() => props.widget.events ?? [])
const itemHint = computed(() =>
  ['table', 'alarm-list'].includes(props.widget.type)
    ? '点击的行'
    : props.widget.type.startsWith('chart-')
      ? '点击的柱子 / 扇区 / 数据点'
      : props.widget.type.startsWith('filter-')
        ? '选中的选项'
        : '点击的按钮',
)

const actionTypes: Array<{ value: ScreenAction['type']; label: string }> = [
  { value: 'select-device', label: '选中并定位设备' },
  { value: 'fly-to-view', label: '三维视图飞到视角' },
  { value: 'reset-view', label: '三维视图回到全景' },
  { value: 'play-tour', label: '播放导览' },
  { value: 'stop-tour', label: '停止导览' },
  { value: 'toggle-layer', label: '显示 / 隐藏图层' },
  { value: 'set-variable', label: '设置大屏变量（联动其他组件）' },
  { value: 'open-url', label: '打开网址' },
]
const variables = computed(() => session.doc.value.variables ?? [])

function defaultAction(type: ScreenAction['type']): ScreenAction {
  switch (type) {
    case 'select-device':
      return { type, deviceId: '$item' }
    case 'fly-to-view':
      return { type, bookmarkId: runtime.bookmarks.value[0]?.id ?? '' }
    case 'play-tour':
      return { type, tourId: runtime.tours.value[0]?.id ?? '' }
    case 'toggle-layer':
      return { type, nodeId: runtime.layers.value[0]?.id ?? '' }
    case 'open-url':
      return { type, url: 'https://' }
    case 'set-variable':
      return { type, variable: variables.value[0]?.name ?? '', value: '$item' }
    default:
      return { type }
  }
}

function add(): void {
  session.updateWidget(
    props.widget.id,
    w => {
      w.events = [
        ...(w.events ?? []),
        { id: newScreenId('event'), trigger: 'click', action: defaultAction('select-device') },
      ]
    },
    '添加交互',
  )
}

function setAction(id: string, action: ScreenAction): void {
  session.updateWidget(
    props.widget.id,
    w => {
      const event = w.events?.find(item => item.id === id)
      if (event) event.action = action
    },
    '修改交互',
  )
}

function remove(id: string): void {
  session.updateWidget(
    props.widget.id,
    w => {
      w.events = (w.events ?? []).filter(item => item.id !== id)
      if (!w.events.length) delete w.events
    },
    '删除交互',
  )
}
</script>

<template>
  <div class="events" data-testid="events-panel">
    <UiSection title="点击时">
      <template v-if="definition?.clickable">
        <div v-for="event in events" :key="event.id" class="event">
          <div class="event__head">
            <MousePointerClick :size="13" />
            <select
              class="s-select"
              :value="event.action.type"
              data-testid="event-action"
              @change="
                setAction(event.id, defaultAction(($event.target as HTMLSelectElement).value as ScreenAction['type']))
              "
            >
              <option v-for="type in actionTypes" :key="type.value" :value="type.value">{{ type.label }}</option>
            </select>
            <button class="s-icon-btn" title="删除" @click="remove(event.id)"><Trash2 :size="13" /></button>
          </div>
          <UiRow v-if="event.action.type === 'select-device'" label="设备">
            <select
              class="s-select"
              :value="event.action.deviceId"
              @change="
                setAction(event.id, { type: 'select-device', deviceId: ($event.target as HTMLSelectElement).value })
              "
            >
              <option value="$item">{{ itemHint }}对应的设备</option>
              <option v-for="device in runtime.devices.value" :key="device.id" :value="device.id">
                {{ device.name }}
              </option>
            </select>
          </UiRow>
          <UiRow v-else-if="event.action.type === 'fly-to-view'" label="视角">
            <select
              class="s-select"
              :value="event.action.bookmarkId"
              @change="
                setAction(event.id, { type: 'fly-to-view', bookmarkId: ($event.target as HTMLSelectElement).value })
              "
            >
              <option v-for="view in runtime.bookmarks.value" :key="view.id" :value="view.id">{{ view.name }}</option>
            </select>
          </UiRow>
          <UiRow v-else-if="event.action.type === 'play-tour'" label="导览">
            <select
              class="s-select"
              :value="event.action.tourId"
              @change="setAction(event.id, { type: 'play-tour', tourId: ($event.target as HTMLSelectElement).value })"
            >
              <option v-for="tour in runtime.tours.value" :key="tour.id" :value="tour.id">{{ tour.name }}</option>
            </select>
          </UiRow>
          <UiRow v-else-if="event.action.type === 'toggle-layer'" label="图层">
            <select
              class="s-select"
              :value="event.action.nodeId"
              @change="
                setAction(event.id, { type: 'toggle-layer', nodeId: ($event.target as HTMLSelectElement).value })
              "
            >
              <option v-for="layer in runtime.layers.value" :key="layer.id" :value="layer.id">{{ layer.name }}</option>
            </select>
          </UiRow>
          <template v-else-if="event.action.type === 'set-variable'">
            <UiRow label="变量">
              <select
                class="s-select"
                :value="event.action.variable"
                data-testid="event-variable"
                @change="
                  setAction(event.id, {
                    type: 'set-variable',
                    variable: ($event.target as HTMLSelectElement).value,
                    value: (event.action as { value: string }).value,
                  })
                "
              >
                <option v-if="!variables.length" value="">（请先在页面设置中添加变量）</option>
                <option v-for="variable in variables" :key="variable.name" :value="variable.name">
                  {{ variable.name }}
                </option>
              </select>
            </UiRow>
            <UiRow label="设为">
              <select
                class="s-select"
                :value="event.action.value === '$item' ? '$item' : 'fixed'"
                @change="
                  setAction(event.id, {
                    type: 'set-variable',
                    variable: (event.action as { variable: string }).variable,
                    value: ($event.target as HTMLSelectElement).value === '$item' ? '$item' : '',
                  })
                "
              >
                <option value="$item">{{ itemHint }}的名称</option>
                <option value="fixed">固定值</option>
              </select>
            </UiRow>
            <UiRow v-if="event.action.value !== '$item'" label="值">
              <input
                class="s-input"
                :value="event.action.value"
                @change="
                  setAction(event.id, {
                    type: 'set-variable',
                    variable: (event.action as { variable: string }).variable,
                    value: ($event.target as HTMLInputElement).value,
                  })
                "
              />
            </UiRow>
          </template>
          <UiRow v-else-if="event.action.type === 'open-url'" label="网址">
            <input
              class="s-input"
              :value="event.action.url"
              @change="setAction(event.id, { type: 'open-url', url: ($event.target as HTMLInputElement).value })"
            />
          </UiRow>
        </div>
        <div class="events__add">
          <button class="s-btn s-btn--sm" data-testid="add-event" @click="add"><Plus :size="12" />添加点击动作</button>
        </div>
        <p class="s-hint note">
          在预览和大屏中生效。三维相关的动作作用于大屏上的三维场景组件；选中的设备会显示在「设备详情」等使用「选中设备」数据的组件中。
        </p>
      </template>
      <p v-else class="s-hint note">这个组件没有点击交互。视角切换、导览控制、图层开关等控件自带对应的三维操作。</p>
    </UiSection>
    <UiSection title="三维联动说明" :open="false">
      <p class="s-hint note">
        三维 → 大屏：在三维场景组件中点击设备，会把它设为「选中设备」，设备详情等组件随之更新。<br />
        大屏 → 三维：表格行、告警、图表、按钮的点击动作可以选中并定位设备、切换视角、播放导览或开关图层。<br />
        组件 → 组件：点击动作「设置大屏变量」后，参数跟随该变量的接口组件会自动重新请求。
      </p>
    </UiSection>
  </div>
</template>

<style scoped>
.event {
  margin: 0 10px 8px;
  padding: 6px 0 4px;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-panel-2);
}
.event__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px 4px;
  color: #7dd3fc;
}
.event__head .s-select {
  flex: 1;
}
.events__add {
  padding: 0 12px;
}
.note {
  margin: 6px 0 0;
  padding: 0 12px;
  line-height: 1.6;
}
</style>
