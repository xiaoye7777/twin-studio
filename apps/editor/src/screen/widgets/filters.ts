import { CalendarDays, ListFilter, MousePointerClick, PanelTop } from 'lucide-vue-next'
import ButtonWidget from './filters/ButtonWidget.vue'
import ChoiceFilter from './filters/ChoiceFilter.vue'
import DateFilter from './filters/DateFilter.vue'
import type { FieldDef, WidgetDefinition } from './types'

const variableField: FieldDef = {
  key: 'variable',
  label: '设置变量',
  type: 'select',
  optionsFrom: 'variables',
  hint: '选择后改变这个大屏变量；参数跟随它的接口组件会重新请求。变量在页面设置中添加',
}

const lookFields: FieldDef[] = [
  { key: 'fontSize', label: '字号', type: 'number', min: 8, max: 60, step: 1, unit: 'px' },
  { key: 'color', label: '主色', type: 'color' },
  { key: 'textColor', label: '文字颜色', type: 'color' },
  { key: 'background', label: '底色', type: 'color' },
  { key: 'radius', label: '圆角', type: 'number', min: 0, max: 40, step: 1, unit: 'px' },
]

const lookProps = {
  fontSize: 16,
  color: '#38bdf8',
  textColor: '#e0f2fe',
  background: 'rgba(8, 47, 73, 0.55)',
  radius: 4,
}

/** Options as data: the first column is the value, a second text column the label. */
const optionsData = {
  shape: 'rows' as const,
  sources: ['static' as const, 'api' as const, 'devices' as const],
  default: {
    source: 'static' as const,
    json: JSON.stringify([{ 园区: '东区' }, { 园区: '西区' }, { 园区: '南区' }], null, 2),
  },
}

export const filterWidgets: WidgetDefinition[] = [
  {
    type: 'filter-select',
    name: '下拉筛选',
    category: '筛选',
    icon: ListFilter,
    description: '下拉选择一项，设置大屏变量，联动其他组件',
    size: [260, 44],
    props: { variable: '', label: '', allOption: true, allLabel: '全部', ...lookProps },
    fields: [
      variableField,
      { key: 'label', label: '前缀文字', type: 'text' },
      { key: 'allOption', label: '「全部」选项', type: 'switch', hint: '选中时变量为空，接口不传该参数' },
      { key: 'allLabel', label: '「全部」文字', type: 'text', visible: p => p.allOption === true },
      ...lookFields,
    ],
    data: optionsData,
    clickable: true,
    component: ChoiceFilter,
  },
  {
    type: 'filter-tabs',
    name: '标签切换',
    category: '筛选',
    icon: PanelTop,
    description: '一排标签，点击切换，设置大屏变量',
    size: [420, 44],
    props: { variable: '', label: '', allOption: false, allLabel: '全部', ...lookProps },
    fields: [
      variableField,
      { key: 'label', label: '前缀文字', type: 'text' },
      { key: 'allOption', label: '「全部」标签', type: 'switch' },
      { key: 'allLabel', label: '「全部」文字', type: 'text', visible: p => p.allOption === true },
      ...lookFields,
    ],
    data: optionsData,
    clickable: true,
    component: ChoiceFilter,
  },
  {
    type: 'filter-date',
    name: '日期选择',
    category: '筛选',
    icon: CalendarDays,
    description: '选择日期或月份，设置大屏变量',
    size: [260, 44],
    props: { variable: '', mode: 'date', label: '', ...lookProps },
    fields: [
      variableField,
      {
        key: 'mode',
        label: '类型',
        type: 'select',
        options: [
          { value: 'date', label: '日期（YYYY-MM-DD）' },
          { value: 'month', label: '月份（YYYY-MM）' },
        ],
      },
      { key: 'label', label: '前缀文字', type: 'text' },
      ...lookFields,
    ],
    clickable: true,
    component: DateFilter,
  },
  {
    type: 'button',
    name: '按钮',
    category: '控件',
    icon: MousePointerClick,
    description: '点击执行交互中设置的动作：切换视角、设置变量、打开网址等',
    size: [180, 48],
    props: { text: '查看详情', look: 'glow', fontSize: 18, color: '#38bdf8', textColor: '#e0f2fe', radius: 4 },
    fields: [
      { key: 'text', label: '文字', type: 'text' },
      {
        key: 'look',
        label: '样式',
        type: 'select',
        options: [
          { value: 'glow', label: '科技发光' },
          { value: 'solid', label: '实心' },
          { value: 'outline', label: '描边' },
        ],
      },
      { key: 'fontSize', label: '字号', type: 'number', min: 8, max: 80, step: 1, unit: 'px' },
      { key: 'color', label: '主色', type: 'color' },
      { key: 'textColor', label: '文字颜色', type: 'color' },
      { key: 'radius', label: '圆角', type: 'number', min: 0, max: 40, step: 1, unit: 'px' },
    ],
    clickable: true,
    component: ButtonWidget,
  },
]
