import { Box, Clapperboard, Layers, Navigation } from 'lucide-vue-next'
import SceneButtons from './scene/SceneButtons.vue'
import SceneWidget from './scene/SceneWidget.vue'
import type { FieldDef, WidgetDefinition } from './types'

const buttonFields: FieldDef[] = [
  {
    key: 'direction',
    label: '排列',
    type: 'select',
    options: [
      { value: 'row', label: '横向' },
      { value: 'column', label: '纵向' },
    ],
  },
  { key: 'fontSize', label: '字号', type: 'number', min: 8, max: 60, step: 1, unit: 'px' },
  { key: 'color', label: '主色', type: 'color' },
  { key: 'textColor', label: '文字颜色', type: 'color' },
]
const buttonProps = { direction: 'row', fontSize: 16, color: '#38bdf8', textColor: '#e0f2fe' }

export const sceneWidgets: WidgetDefinition[] = [
  {
    type: 'scene',
    name: '三维场景',
    category: '三维',
    icon: Box,
    description: '显示关联的三维场景；点击设备会在大屏中选中它',
    size: [1000, 620],
    props: { quality: 'auto', captions: true, radius: 0, border: false, borderColor: 'rgba(56, 189, 248, 0.5)' },
    fields: [
      {
        key: 'quality',
        label: '画质',
        type: 'select',
        options: [
          { value: 'auto', label: '自动' },
          { value: 'low', label: '流畅' },
          { value: 'medium', label: '均衡' },
          { value: 'high', label: '高清' },
        ],
        hint: '编辑时固定为流畅',
      },
      { key: 'captions', label: '导览字幕', type: 'switch' },
      { key: 'radius', label: '圆角', type: 'number', min: 0, max: 80, step: 1, unit: 'px' },
      { key: 'border', label: '边框', type: 'switch' },
      { key: 'borderColor', label: '边框颜色', type: 'color', visible: p => p.border === true },
    ],
    component: SceneWidget,
  },
  {
    type: 'view-buttons',
    name: '视角切换',
    category: '控件',
    icon: Navigation,
    description: '场景中保存的视角，点击后三维视图飞到该视角',
    size: [640, 56],
    props: { ...buttonProps, showReset: true },
    fields: [{ key: 'showReset', label: '全景按钮', type: 'switch' }, ...buttonFields],
    component: SceneButtons,
  },
  {
    type: 'tour-control',
    name: '导览控制',
    category: '控件',
    icon: Clapperboard,
    description: '播放 / 停止场景中的导览',
    size: [260, 56],
    props: { ...buttonProps, tourId: '' },
    fields: [
      { key: 'tourId', label: '导览', type: 'select', optionsFrom: 'tours', hint: '留空使用第一个导览' },
      ...buttonFields.slice(1),
    ],
    component: SceneButtons,
  },
  {
    type: 'layer-toggles',
    name: '图层开关',
    category: '控件',
    icon: Layers,
    description: '显示 / 隐藏场景中的分区（顶层分组）',
    size: [640, 56],
    props: { ...buttonProps, color: '#2dd4bf' },
    fields: buttonFields,
    component: SceneButtons,
  },
]
