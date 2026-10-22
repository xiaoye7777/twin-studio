import { Clock, Frame, Hash, Image, PanelTop, Type, TextCursorInput } from 'lucide-vue-next'
import BorderWidget from './basic/BorderWidget.vue'
import ClockWidget from './basic/ClockWidget.vue'
import HeaderWidget from './basic/HeaderWidget.vue'
import ImageWidget from './basic/ImageWidget.vue'
import KpiWidget from './basic/KpiWidget.vue'
import TextWidget from './basic/TextWidget.vue'
import TitleWidget from './basic/TitleWidget.vue'
import type { FieldDef, WidgetDefinition } from './types'

const align: FieldDef = {
  key: 'align',
  label: '对齐',
  type: 'select',
  options: [
    { value: 'left', label: '左对齐' },
    { value: 'center', label: '居中' },
    { value: 'right', label: '右对齐' },
  ],
}

export const basicWidgets: WidgetDefinition[] = [
  {
    type: 'title',
    name: '标题',
    category: '文字',
    icon: Type,
    size: [600, 80],
    props: {
      text: '大屏标题',
      fontSize: 44,
      fontWeight: 700,
      letterSpacing: 6,
      align: 'center',
      color: '#e0f2fe',
      gradient: true,
      gradientTo: '#38bdf8',
      glow: true,
    },
    fields: [
      { key: 'text', label: '文字', type: 'text' },
      { key: 'fontSize', label: '字号', type: 'number', min: 8, max: 300, step: 1, unit: 'px' },
      {
        key: 'fontWeight',
        label: '字重',
        type: 'select',
        options: [
          { value: 400, label: '常规' },
          { value: 600, label: '中粗' },
          { value: 700, label: '粗体' },
          { value: 900, label: '特粗' },
        ],
      },
      { key: 'letterSpacing', label: '字间距', type: 'number', min: 0, max: 60, step: 1, unit: 'px' },
      align,
      { key: 'color', label: '颜色', type: 'color' },
      { key: 'gradient', label: '渐变', type: 'switch' },
      { key: 'gradientTo', label: '渐变到', type: 'color', visible: p => p.gradient === true },
      { key: 'glow', label: '发光', type: 'switch' },
    ],
    component: TitleWidget,
  },
  {
    type: 'text',
    name: '文本',
    category: '文字',
    icon: TextCursorInput,
    description: '用 {value} 显示绑定的数据',
    size: [360, 120],
    props: {
      text: '在这里输入说明文字。\n用 {value} 显示绑定的数据。',
      fontSize: 18,
      color: '#cbd5e1',
      lineHeight: 1.6,
      align: 'left',
      decimals: 1,
    },
    fields: [
      { key: 'text', label: '文字', type: 'textarea', hint: '{value} 处显示数据' },
      { key: 'fontSize', label: '字号', type: 'number', min: 8, max: 200, step: 1, unit: 'px' },
      { key: 'lineHeight', label: '行高', type: 'number', min: 1, max: 3, step: 0.1 },
      align,
      { key: 'color', label: '颜色', type: 'color' },
      { key: 'decimals', label: '小数位', type: 'number', min: 0, max: 4, step: 1 },
    ],
    data: {
      shape: 'value',
      sources: ['static', 'device', 'aggregate', 'stat'],
      default: { source: 'static', json: '' },
    },
    component: TextWidget,
  },
  {
    type: 'clock',
    name: '时间',
    category: '文字',
    icon: Clock,
    size: [360, 50],
    props: { format: 'YYYY-MM-DD HH:mm:ss dddd', fontSize: 22, color: '#bae6fd', align: 'right' },
    fields: [
      {
        key: 'format',
        label: '格式',
        type: 'select',
        options: [
          { value: 'YYYY-MM-DD HH:mm:ss dddd', label: '2026-10-23 08:00:00 星期五' },
          { value: 'YYYY-MM-DD HH:mm:ss', label: '2026-10-23 08:00:00' },
          { value: 'YYYY年MM月DD日 HH:mm', label: '2026年10月23日 08:00' },
          { value: 'HH:mm:ss', label: '08:00:00' },
          { value: 'YYYY-MM-DD dddd', label: '2026-10-23 星期五' },
        ],
      },
      { key: 'fontSize', label: '字号', type: 'number', min: 8, max: 200, step: 1, unit: 'px' },
      align,
      { key: 'color', label: '颜色', type: 'color' },
    ],
    component: ClockWidget,
  },
  {
    type: 'kpi',
    name: '指标卡',
    category: '指标',
    icon: Hash,
    size: [260, 120],
    props: {
      title: '指标名称',
      unit: 'kW',
      decimals: 0,
      fontSize: 44,
      titleSize: 16,
      color: '#38bdf8',
      titleColor: '#94a3b8',
      style: 'card',
    },
    fields: [
      { key: 'title', label: '名称', type: 'text' },
      { key: 'unit', label: '单位', type: 'text' },
      { key: 'decimals', label: '小数位', type: 'number', min: 0, max: 4, step: 1 },
      {
        key: 'style',
        label: '样式',
        type: 'select',
        options: [
          { value: 'card', label: '卡片' },
          { value: 'bar', label: '侧边条' },
          { value: 'plain', label: '无背景' },
        ],
      },
      { key: 'fontSize', label: '数字字号', type: 'number', min: 8, max: 200, step: 1, unit: 'px' },
      { key: 'titleSize', label: '名称字号', type: 'number', min: 8, max: 80, step: 1, unit: 'px' },
      { key: 'color', label: '主色', type: 'color' },
      { key: 'titleColor', label: '名称颜色', type: 'color' },
    ],
    data: {
      shape: 'value',
      sources: ['static', 'device', 'aggregate', 'stat'],
      default: { source: 'static', json: '1286' },
    },
    clickable: true,
    component: KpiWidget,
  },
  {
    type: 'image',
    name: '图片',
    category: '媒体',
    icon: Image,
    size: [320, 200],
    props: { src: '', fit: 'contain', radius: 0 },
    fields: [
      { key: 'src', label: '图片', type: 'image' },
      {
        key: 'fit',
        label: '填充',
        type: 'select',
        options: [
          { value: 'contain', label: '完整显示' },
          { value: 'cover', label: '铺满裁切' },
          { value: 'fill', label: '拉伸' },
        ],
      },
      { key: 'radius', label: '圆角', type: 'number', min: 0, max: 200, step: 1, unit: 'px' },
    ],
    clickable: true,
    component: ImageWidget,
  },
  {
    type: 'decor-border',
    name: '边框',
    category: '装饰',
    icon: Frame,
    size: [460, 300],
    props: { style: 'corners', color: '#38bdf8', fill: 'rgba(8, 20, 40, 0.55)', title: '', titleColor: '#e0f2fe' },
    fields: [
      {
        key: 'style',
        label: '样式',
        type: 'select',
        options: [
          { value: 'corners', label: '科技角框' },
          { value: 'panel', label: '面板' },
          { value: 'glow', label: '发光' },
          { value: 'double', label: '双线' },
        ],
      },
      { key: 'title', label: '标题', type: 'text', hint: '留空则不显示标题栏' },
      { key: 'color', label: '线条颜色', type: 'color' },
      { key: 'fill', label: '底色', type: 'color' },
      { key: 'titleColor', label: '标题颜色', type: 'color' },
    ],
    component: BorderWidget,
  },
  {
    type: 'decor-header',
    name: '标题栏',
    category: '装饰',
    icon: PanelTop,
    size: [1920, 100],
    props: { text: '零碳园区运营监控中心', fontSize: 40, color: '#38bdf8', textColor: '#e0f2fe' },
    fields: [
      { key: 'text', label: '标题', type: 'text' },
      { key: 'fontSize', label: '字号', type: 'number', min: 8, max: 200, step: 1, unit: 'px' },
      { key: 'color', label: '线条颜色', type: 'color' },
      { key: 'textColor', label: '文字颜色', type: 'color' },
    ],
    component: HeaderWidget,
  },
]
