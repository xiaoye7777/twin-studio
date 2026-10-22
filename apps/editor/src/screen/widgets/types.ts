import type { Component } from 'vue'
import type { DataBinding, DataSourceKind, Widget } from '../model'

export type WidgetCategory = '图表' | '指标' | '文字' | '列表' | '媒体' | '装饰' | '三维' | '控件'
export const widgetCategories: WidgetCategory[] = ['三维', '图表', '指标', '文字', '列表', '控件', '媒体', '装饰']

export type FieldType = 'text' | 'textarea' | 'number' | 'slider' | 'color' | 'select' | 'switch' | 'image' | 'palette'

/** One property in the widget's style panel; the panel is generated from these. */
export interface FieldDef {
  key: string
  label: string
  type: FieldType
  group?: string
  options?: ReadonlyArray<{ value: string | number; label: string }>
  min?: number
  max?: number
  step?: number
  unit?: string
  hint?: string
  /** Show only when this returns true for the current props. */
  visible?: (props: Record<string, unknown>) => boolean
}

/**
 * Data a widget receives, normalised whatever the source: one `value`, or `rows` (a table with a category
 * column `dimension` and number columns `measures`).
 */
export interface WidgetData {
  value: unknown
  rows: Array<Record<string, unknown>>
  dimension: string
  measures: string[]
  /** Display names and units of columns, when known (device variables). */
  labels: Record<string, string>
  units: Record<string, string>
}

export interface WidgetDefinition {
  type: string
  name: string
  category: WidgetCategory
  icon: Component
  description?: string
  /** Default size on a 1920 × 1080 page. */
  size: [number, number]
  props: Record<string, unknown>
  fields: FieldDef[]
  data?: {
    shape: 'value' | 'rows'
    sources: DataSourceKind[]
    default: DataBinding
  }
  /** Supports click actions (on the widget or an item in it). */
  clickable?: boolean
  component: Component
}

/** What widget components receive. */
export interface WidgetComponentProps {
  widget: Widget
  data: WidgetData | null
  editing: boolean
}

/** Emitted by widgets when clicked; `item` names the clicked item (a bar, a row, a button). */
export type WidgetClick = { item?: string }
