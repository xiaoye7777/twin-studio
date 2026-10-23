import { ChartBar, ChartColumn, ChartLine, ChartPie, CircleGauge, Radar } from 'lucide-vue-next'
import type { DataSourceKind } from '../model'
import ChartWidget from './charts/ChartWidget.vue'
import { screenPalette } from './format'
import type { FieldDef, WidgetDefinition } from './types'

const common = {
  palette: screenPalette,
  textColor: '#94a3b8',
  fontSize: 14,
  showLegend: true,
  legendPosition: 'top',
  unit: '',
}

const commonFields: FieldDef[] = [
  { key: 'palette', label: '配色', type: 'palette', group: '配色与文字' },
  { key: 'textColor', label: '文字颜色', type: 'color', group: '配色与文字' },
  { key: 'fontSize', label: '文字字号', type: 'number', min: 8, max: 48, step: 1, unit: 'px', group: '配色与文字' },
  { key: 'showLegend', label: '显示图例', type: 'switch', group: '图例' },
  {
    key: 'legendPosition',
    label: '图例位置',
    type: 'select',
    group: '图例',
    options: [
      { value: 'top', label: '顶部' },
      { value: 'bottom', label: '底部' },
      { value: 'right', label: '右侧' },
    ],
    visible: p => p.showLegend === true,
  },
]

const rowsSources: DataSourceKind[] = ['static', 'api', 'devices', 'history']
const rows = (json: unknown) => ({
  shape: 'rows' as const,
  sources: rowsSources,
  default: { source: 'static' as const, json: JSON.stringify(json, null, 2) },
})

const hours = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00']
const trend = hours.map((time, i) => ({
  time,
  发电: [62, 48, 85, 236, 328, 291, 142, 76][i],
  用电: [118, 96, 132, 214, 246, 238, 265, 188][i],
}))

export const chartWidgets: WidgetDefinition[] = [
  {
    type: 'chart-line',
    name: '折线图',
    category: '图表',
    icon: ChartLine,
    description: '趋势变化；面积、平滑、堆叠可选',
    size: [480, 280],
    props: {
      ...common,
      unit: 'kW',
      smooth: true,
      area: true,
      showSymbol: false,
      lineWidth: 2,
      stack: false,
      showGrid: true,
    },
    fields: [
      { key: 'unit', label: '单位', type: 'text', group: '坐标轴' },
      { key: 'showGrid', label: '网格线', type: 'switch', group: '坐标轴' },
      { key: 'smooth', label: '平滑曲线', type: 'switch', group: '折线' },
      { key: 'area', label: '面积填充', type: 'switch', group: '折线' },
      { key: 'stack', label: '堆叠', type: 'switch', group: '折线' },
      { key: 'showSymbol', label: '数据点', type: 'switch', group: '折线' },
      { key: 'lineWidth', label: '线宽', type: 'number', min: 1, max: 8, step: 1, unit: 'px', group: '折线' },
      ...commonFields,
    ],
    data: rows(trend),
    clickable: true,
    component: ChartWidget,
  },
  {
    type: 'chart-bar',
    name: '柱状图',
    category: '图表',
    icon: ChartColumn,
    description: '分类对比；横向、堆叠、渐变可选',
    size: [480, 280],
    props: {
      ...common,
      unit: 'kWh',
      horizontal: false,
      stack: false,
      barWidth: 22,
      radius: 3,
      showLabel: false,
      gradient: true,
      showGrid: true,
    },
    fields: [
      { key: 'horizontal', label: '横向（条形图）', type: 'switch', group: '柱子' },
      { key: 'stack', label: '堆叠', type: 'switch', group: '柱子' },
      { key: 'gradient', label: '渐变填充', type: 'switch', group: '柱子' },
      { key: 'barWidth', label: '最大宽度', type: 'number', min: 4, max: 120, step: 1, unit: 'px', group: '柱子' },
      { key: 'radius', label: '圆角', type: 'number', min: 0, max: 30, step: 1, unit: 'px', group: '柱子' },
      { key: 'showLabel', label: '显示数值', type: 'switch', group: '柱子' },
      { key: 'unit', label: '单位', type: 'text', group: '坐标轴' },
      { key: 'showGrid', label: '网格线', type: 'switch', group: '坐标轴' },
      ...commonFields,
    ],
    data: rows(
      ['一月', '二月', '三月', '四月', '五月', '六月'].map((month, i) => ({
        月份: month,
        光伏: [820, 932, 1101, 1234, 1390, 1530][i],
        风电: [620, 712, 690, 820, 760, 701][i],
      })),
    ),
    clickable: true,
    component: ChartWidget,
  },
  {
    type: 'chart-combo',
    name: '柱线混合',
    category: '图表',
    icon: ChartBar,
    description: '第一列画柱，其余画线（右侧坐标轴）',
    size: [480, 280],
    props: { ...common, unit: 'kWh', smooth: true, showSymbol: true, barWidth: 20, radius: 3, showGrid: true },
    fields: [
      { key: 'unit', label: '单位', type: 'text', group: '坐标轴' },
      { key: 'showGrid', label: '网格线', type: 'switch', group: '坐标轴' },
      { key: 'barWidth', label: '柱子宽度', type: 'number', min: 4, max: 120, step: 1, unit: 'px', group: '图形' },
      { key: 'smooth', label: '平滑曲线', type: 'switch', group: '图形' },
      ...commonFields,
    ],
    data: rows(
      ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day, i) => ({
        日期: day,
        发电量: [3120, 2980, 3410, 3302, 3650, 2870, 2560][i],
        自用率: [82, 79, 85, 84, 88, 76, 72][i],
      })),
    ),
    clickable: true,
    component: ChartWidget,
  },
  {
    type: 'chart-pie',
    name: '饼图',
    category: '图表',
    icon: ChartPie,
    description: '占比；环形、玫瑰图可选',
    size: [420, 300],
    props: {
      ...common,
      legendPosition: 'right',
      ring: 55,
      rose: false,
      showLabel: false,
      labelType: 'percent',
      unit: '',
    },
    fields: [
      {
        key: 'ring',
        label: '内径',
        type: 'slider',
        min: 0,
        max: 85,
        step: 1,
        unit: '%',
        group: '饼图',
        hint: '0 为实心饼图；大于 30 时中心显示合计',
      },
      { key: 'rose', label: '玫瑰图', type: 'switch', group: '饼图' },
      { key: 'showLabel', label: '显示标签', type: 'switch', group: '饼图' },
      {
        key: 'labelType',
        label: '标签内容',
        type: 'select',
        group: '饼图',
        options: [
          { value: 'percent', label: '名称与百分比' },
          { value: 'value', label: '名称与数值' },
          { value: 'name', label: '仅名称' },
        ],
        visible: p => p.showLabel === true,
      },
      { key: 'unit', label: '合计说明', type: 'text', group: '饼图' },
      ...commonFields,
    ],
    data: rows([
      { 能源: '光伏', 占比: 45 },
      { 能源: '风电', 占比: 25 },
      { 能源: '储能放电', 占比: 18 },
      { 能源: '市电', 占比: 12 },
    ]),
    clickable: true,
    component: ChartWidget,
  },
  {
    type: 'chart-gauge',
    name: '仪表盘',
    category: '图表',
    icon: CircleGauge,
    description: '单个数值的进度或区间',
    size: [300, 260],
    props: {
      ...common,
      palette: ['#22d3ee'],
      style: 'progress',
      min: 0,
      max: 100,
      unit: '%',
      title: '储能 SOC',
      decimals: 0,
    },
    fields: [
      {
        key: 'style',
        label: '样式',
        type: 'select',
        group: '仪表',
        options: [
          { value: 'progress', label: '进度环' },
          { value: 'arc', label: '圆弧' },
          { value: 'speed', label: '刻度指针' },
        ],
      },
      { key: 'title', label: '名称', type: 'text', group: '仪表' },
      { key: 'min', label: '最小值', type: 'number', step: 1, group: '仪表' },
      { key: 'max', label: '最大值', type: 'number', step: 1, group: '仪表' },
      { key: 'unit', label: '单位', type: 'text', group: '仪表' },
      { key: 'decimals', label: '小数位', type: 'number', min: 0, max: 4, step: 1, group: '仪表' },
      { key: 'palette', label: '颜色', type: 'palette', group: '配色与文字' },
      { key: 'textColor', label: '文字颜色', type: 'color', group: '配色与文字' },
      { key: 'fontSize', label: '文字字号', type: 'number', min: 8, max: 48, step: 1, unit: 'px', group: '配色与文字' },
    ],
    data: {
      shape: 'value',
      sources: ['static', 'api', 'device', 'aggregate', 'stat'],
      default: { source: 'static', json: '72' },
    },
    component: ChartWidget,
  },
  {
    type: 'chart-radar',
    name: '雷达图',
    category: '图表',
    icon: Radar,
    description: '多维度对比',
    size: [420, 320],
    props: { ...common, shape: 'polygon' },
    fields: [
      {
        key: 'shape',
        label: '形状',
        type: 'select',
        group: '雷达',
        options: [
          { value: 'polygon', label: '多边形' },
          { value: 'circle', label: '圆形' },
        ],
      },
      ...commonFields,
    ],
    data: rows(
      ['发电效率', '储能利用', '碳减排', '设备在线', '负荷平衡', '能耗强度'].map((name, i) => ({
        指标: name,
        本月: [88, 76, 92, 97, 81, 70][i],
        上月: [80, 70, 85, 95, 78, 74][i],
      })),
    ),
    component: ChartWidget,
  },
]
