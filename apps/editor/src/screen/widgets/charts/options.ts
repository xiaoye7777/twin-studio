import { formatNumber, numberFont, screenPalette } from '../format'
import type { WidgetData } from '../types'
import type { ChartOption } from './echarts'

/** Props every chart shares. */
export interface ChartProps {
  palette: string[]
  textColor: string
  fontSize: number
  showLegend: boolean
  legendPosition: 'top' | 'bottom' | 'right'
  unit: string
  // line / bar / combo
  smooth?: boolean
  area?: boolean
  showSymbol?: boolean
  lineWidth?: number
  stack?: boolean
  horizontal?: boolean
  barWidth?: number
  radius?: number
  showLabel?: boolean
  gradient?: boolean
  showGrid?: boolean
  // pie
  ring?: number
  rose?: boolean
  labelType?: 'percent' | 'value' | 'name'
  // gauge
  min?: number
  max?: number
  title?: string
  decimals?: number
  style?: 'arc' | 'progress' | 'speed'
  // radar
  shape?: 'polygon' | 'circle'
}

const axisLine = 'rgba(148, 163, 184, 0.28)'
const splitLine = 'rgba(148, 163, 184, 0.12)'

function legend(p: ChartProps): Record<string, unknown> {
  if (!p.showLegend) return { show: false }
  const position = {
    top: { top: 0, left: 'center' },
    bottom: { bottom: 0, left: 'center' },
    right: { right: 0, top: 'middle', orient: 'vertical' },
  }[p.legendPosition]
  return {
    show: true,
    ...position,
    textStyle: { color: p.textColor, fontSize: p.fontSize },
    itemWidth: 14,
    itemHeight: 8,
  }
}

function grid(p: ChartProps): Record<string, unknown> {
  return {
    top: p.showLegend && p.legendPosition === 'top' ? p.fontSize * 3 : p.fontSize * 1.6,
    bottom: p.showLegend && p.legendPosition === 'bottom' ? p.fontSize * 3 : p.fontSize * 0.8,
    left: 8,
    right: p.showLegend && p.legendPosition === 'right' ? 110 : 16,
    containLabel: true,
  }
}

const tooltip = (trigger: 'axis' | 'item') => ({
  trigger,
  backgroundColor: 'rgba(8, 15, 30, 0.92)',
  borderColor: 'rgba(56, 189, 248, 0.45)',
  textStyle: { color: '#e2e8f0' },
})

function palette(p: ChartProps): string[] {
  return p.palette?.length ? p.palette : screenPalette
}

/** Linear gradient fill from a colour to transparent. */
function fade(color: string, from = 0.55, horizontal = false) {
  return {
    type: 'linear',
    x: 0,
    y: 0,
    x2: horizontal ? 1 : 0,
    y2: horizontal ? 0 : 1,
    colorStops: [
      { offset: 0, color: withAlpha(color, from) },
      { offset: 1, color: withAlpha(color, 0.02) },
    ],
  }
}

function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.replace('#', '').slice(0, 6), 16)
  if (Number.isNaN(value)) return hex
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

function categoryAxis(p: ChartProps, data: WidgetData) {
  return {
    id: 'category',
    type: 'category',
    data: data.rows.map(row => String(row[data.dimension] ?? '')),
    axisLine: { lineStyle: { color: axisLine } },
    axisTick: { show: false },
    axisLabel: { color: p.textColor, fontSize: p.fontSize },
  }
}

function valueAxis(p: ChartProps, id = 'value', unit = p.unit) {
  return {
    id,
    type: 'value',
    name: unit,
    nameTextStyle: { color: p.textColor, fontSize: p.fontSize * 0.9, align: 'left' },
    axisLine: { show: false },
    axisLabel: { color: p.textColor, fontSize: p.fontSize },
    splitLine: { show: p.showGrid !== false, lineStyle: { color: splitLine, type: 'dashed' } },
  }
}

const label = (key: string, data: WidgetData) => data.labels[key] ?? key
const valuesOf = (key: string, data: WidgetData) =>
  data.rows.map(row => (typeof row[key] === 'number' ? (row[key] as number) : null))

export function lineOption(p: ChartProps, data: WidgetData): ChartOption {
  const colors = palette(p)
  return {
    color: colors,
    tooltip: tooltip('axis'),
    legend: legend(p),
    grid: grid(p),
    xAxis: { ...categoryAxis(p, data), boundaryGap: false },
    yAxis: valueAxis(p),
    series: data.measures.map((key, index) => ({
      id: key,
      name: label(key, data),
      type: 'line',
      data: valuesOf(key, data),
      smooth: p.smooth,
      stack: p.stack ? 'total' : undefined,
      showSymbol: p.showSymbol,
      symbolSize: 6,
      lineStyle: { width: p.lineWidth ?? 2 },
      areaStyle: p.area ? { color: fade(colors[index % colors.length]!) } : undefined,
    })),
  }
}

export function barOption(p: ChartProps, data: WidgetData): ChartOption {
  const colors = palette(p)
  const category = categoryAxis(p, data)
  const value = valueAxis(p)
  const horizontal = !!p.horizontal
  return {
    color: colors,
    tooltip: { ...tooltip('axis'), axisPointer: { type: 'shadow' } },
    legend: legend(p),
    grid: grid(p),
    xAxis: horizontal ? { ...value, id: 'value' } : category,
    yAxis: horizontal ? { ...category, inverse: true } : value,
    series: data.measures.map((key, index) => {
      const color = colors[index % colors.length]!
      const r = p.radius ?? 0
      return {
        id: key,
        name: label(key, data),
        type: 'bar',
        data: valuesOf(key, data),
        stack: p.stack ? 'total' : undefined,
        barMaxWidth: p.barWidth ?? 24,
        itemStyle: {
          color: p.gradient ? fade(color, 1, horizontal) : color,
          borderRadius: horizontal ? [0, r, r, 0] : [r, r, 0, 0],
        },
        label: {
          show: !!p.showLabel,
          position: horizontal ? 'right' : 'top',
          color: p.textColor,
          fontSize: p.fontSize,
          fontFamily: numberFont,
        },
      }
    }),
  }
}

/** Bars for the first measure, lines (on a second axis) for the rest. */
export function comboOption(p: ChartProps, data: WidgetData): ChartOption {
  const colors = palette(p)
  const [first, ...rest] = data.measures
  return {
    color: colors,
    tooltip: { ...tooltip('axis'), axisPointer: { type: 'shadow' } },
    legend: legend(p),
    grid: grid(p),
    xAxis: categoryAxis(p, data),
    yAxis: [valueAxis(p, 'value'), { ...valueAxis(p, 'value2', ''), splitLine: { show: false } }],
    series: [
      ...(first
        ? [
            {
              id: first,
              name: label(first, data),
              type: 'bar',
              data: valuesOf(first, data),
              barMaxWidth: p.barWidth ?? 22,
              itemStyle: { color: fade(colors[0]!, 1), borderRadius: [p.radius ?? 0, p.radius ?? 0, 0, 0] },
            },
          ]
        : []),
      ...rest.map(key => ({
        id: key,
        name: label(key, data),
        type: 'line',
        yAxisIndex: 1,
        data: valuesOf(key, data),
        smooth: p.smooth,
        showSymbol: p.showSymbol,
      })),
    ],
  }
}

export function pieOption(p: ChartProps, data: WidgetData): ChartOption {
  const measure = data.measures[0] ?? 'value'
  const total = data.rows.reduce(
    (sum, row) => sum + (typeof row[measure] === 'number' ? (row[measure] as number) : 0),
    0,
  )
  const formatter = { percent: '{b}\n{d}%', value: '{b}\n{c}', name: '{b}' }[p.labelType ?? 'percent']
  const inner = Math.max(0, Math.min(90, p.ring ?? 0))
  return {
    color: palette(p),
    tooltip: { ...tooltip('item'), formatter: '{b}：{c}（{d}%）' },
    legend: legend(p),
    title:
      inner > 30
        ? {
            text: formatNumber(total),
            subtext: p.unit || '合计',
            left: p.showLegend && p.legendPosition === 'right' ? '40%' : 'center',
            top: 'center',
            textAlign: 'center',
            textStyle: { color: '#e2e8f0', fontSize: p.fontSize * 2, fontFamily: numberFont },
            subtextStyle: { color: p.textColor, fontSize: p.fontSize },
            itemGap: 4,
          }
        : { show: false },
    series: [
      {
        id: 'pie',
        type: 'pie',
        radius: [`${inner}%`, '72%'],
        center: [p.showLegend && p.legendPosition === 'right' ? '40%' : '50%', '52%'],
        roseType: p.rose ? 'radius' : undefined,
        itemStyle: { borderColor: 'rgba(6, 11, 22, 0.9)', borderWidth: 2, borderRadius: 3 },
        label: { show: !!p.showLabel, color: p.textColor, fontSize: p.fontSize, formatter },
        labelLine: { lineStyle: { color: axisLine } },
        data: data.rows.map(row => ({ name: String(row[data.dimension] ?? ''), value: row[measure] })),
      },
    ],
  }
}

export function gaugeOption(p: ChartProps, data: WidgetData): ChartOption {
  const value = typeof data.value === 'number' ? data.value : Number(data.value)
  const color = palette(p)[0]!
  const min = p.min ?? 0
  const max = p.max ?? 100
  const progress = p.style !== 'speed'
  return {
    series: [
      {
        id: 'gauge',
        type: 'gauge',
        min,
        max,
        startAngle: p.style === 'arc' ? 200 : 225,
        endAngle: p.style === 'arc' ? -20 : -45,
        radius: '92%',
        center: ['50%', '58%'],
        progress: { show: progress, width: 14, roundCap: true, itemStyle: { color } },
        axisLine: {
          roundCap: progress,
          lineStyle: progress
            ? { width: 14, color: [[1, 'rgba(148, 163, 184, 0.16)']] }
            : {
                width: 10,
                color: [
                  [0.6, '#34d399'],
                  [0.85, '#fbbf24'],
                  [1, '#f87171'],
                ],
              },
        },
        pointer: { show: !progress, length: '60%', width: 5, itemStyle: { color } },
        axisTick: { show: !progress, distance: -14, length: 6, lineStyle: { color: axisLine } },
        splitLine: { show: !progress, distance: -18, length: 12, lineStyle: { color: axisLine, width: 2 } },
        axisLabel: { show: !progress, distance: 18, color: p.textColor, fontSize: p.fontSize * 0.85 },
        anchor: { show: !progress, size: 12, itemStyle: { color } },
        title: {
          show: !!p.title,
          offsetCenter: [0, progress ? '42%' : '72%'],
          color: p.textColor,
          fontSize: p.fontSize,
        },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, progress ? '0%' : '42%'],
          fontSize: p.fontSize * 2.4,
          fontFamily: numberFont,
          fontWeight: 700,
          color: '#e2e8f0',
          formatter: (v: number) => `${formatNumber(v, p.decimals ?? 0)}${p.unit ? ` ${p.unit}` : ''}`,
        },
        data: [{ value: Number.isFinite(value) ? value : 0, name: p.title ?? '' }],
      },
    ],
  }
}

export function radarOption(p: ChartProps, data: WidgetData): ChartOption {
  const colors = palette(p)
  const max = Math.max(1, ...data.rows.flatMap(row => data.measures.map(key => Number(row[key]) || 0))) * 1.1
  return {
    color: colors,
    tooltip: tooltip('item'),
    legend: legend(p),
    radar: {
      id: 'radar',
      shape: p.shape ?? 'polygon',
      radius: '64%',
      center: ['50%', p.showLegend && p.legendPosition === 'top' ? '56%' : '50%'],
      indicator: data.rows.map(row => ({ name: String(row[data.dimension] ?? ''), max })),
      axisName: { color: p.textColor, fontSize: p.fontSize },
      splitLine: { lineStyle: { color: splitLine } },
      splitArea: { areaStyle: { color: ['rgba(56, 189, 248, 0.03)', 'rgba(56, 189, 248, 0.07)'] } },
      axisLine: { lineStyle: { color: splitLine } },
    },
    series: [
      {
        id: 'radar',
        type: 'radar',
        data: data.measures.map((key, index) => ({
          name: label(key, data),
          value: data.rows.map(row => Number(row[key]) || 0),
          areaStyle: { color: withAlpha(colors[index % colors.length]!, 0.22) },
          symbolSize: 5,
        })),
      },
    ],
  }
}

export const chartBuilders: Record<string, (p: ChartProps, data: WidgetData) => ChartOption> = {
  'chart-line': lineOption,
  'chart-bar': barOption,
  'chart-combo': comboOption,
  'chart-pie': pieOption,
  'chart-gauge': gaugeOption,
  'chart-radar': radarOption,
}
