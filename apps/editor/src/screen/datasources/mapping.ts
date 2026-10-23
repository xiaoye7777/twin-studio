import { emptyData } from '../runtime/staticData'
import type { WidgetData } from '../widgets/types'
import type { ApiBinding, ApiDataset, ApiField, ApiReduce } from './model'
import { getPath, toNumber } from './request'

/** Which mapping controls a widget needs. */
export type ApiUse = 'value' | 'chart' | 'table'

export function apiUse(widgetType: string, shape: 'value' | 'rows'): ApiUse {
  if (shape === 'value') return 'value'
  return widgetType.startsWith('chart-') ? 'chart' : 'table'
}

const numeric = (field: ApiField | undefined) => field?.type === 'number'
const category = (field: ApiField | undefined) => !!field && field.type !== 'number'

/** The records of a response (a single record counts as a list of one). */
export function recordsOf(dataset: ApiDataset, body: unknown): Array<Record<string, unknown>> {
  const result = getPath(body, dataset.resultPath)
  if (Array.isArray(result))
    return result.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
  if (result && typeof result === 'object') return [result as Record<string, unknown>]
  return []
}

/** Default field choices for a widget, so picking a dataset is enough to see data. */
export function defaultMapping(dataset: ApiDataset, use: ApiUse): Partial<ApiBinding> {
  const fields = dataset.fields
  if (use === 'value') {
    const value = fields.find(numeric) ?? fields[0]
    return { value: value?.key, reduce: dataset.resultShape === 'rows' ? 'sum' : 'first' }
  }
  if (use === 'chart') {
    const dimension = fields.find(category) ?? fields[0]
    return {
      dimension: dimension?.key,
      measures: fields
        .filter(field => numeric(field) && field.key !== dimension?.key)
        .slice(0, 3)
        .map(field => field.key),
    }
  }
  return { columns: fields.slice(0, 6).map(field => field.key) }
}

function reduce(values: number[], mode: ApiReduce): number | null {
  if (mode === 'count') return values.length
  if (!values.length) return null
  if (mode === 'sum') return values.reduce((a, b) => a + b, 0)
  if (mode === 'avg') return values.reduce((a, b) => a + b, 0) / values.length
  if (mode === 'max') return Math.max(...values)
  if (mode === 'min') return Math.min(...values)
  return mode === 'last' ? values[values.length - 1]! : values[0]!
}

/** A response as widget data, through the widget's field choices, sort and limit. */
export function apiWidgetData(binding: ApiBinding, dataset: ApiDataset, body: unknown, use: ApiUse): WidgetData {
  const data = emptyData()
  const fieldOf = (key: string | undefined) => dataset.fields.find(field => field.key === key)
  const read = (record: Record<string, unknown>, field: ApiField) => {
    const value = getPath(record, field.key)
    return field.type === 'number' ? toNumber(value) : (value ?? null)
  }

  if (dataset.resultShape === 'value') {
    const value = getPath(body, dataset.resultPath)
    data.value = toNumber(value) ?? value ?? null
    return data
  }

  let records = recordsOf(dataset, body)
  const sort = binding.sort && fieldOf(binding.sort.field)
  if (sort) {
    const direction = binding.sort!.order === 'desc' ? -1 : 1
    records = [...records].sort((a, b) => {
      const x = read(a, sort)
      const y = read(b, sort)
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * direction
      return String(x ?? '').localeCompare(String(y ?? ''), 'zh-CN') * direction
    })
  }
  if (binding.limit && binding.limit > 0) records = records.slice(0, binding.limit)

  const defaults = defaultMapping(dataset, use)
  if (use === 'value') {
    const field = fieldOf(binding.value) ?? fieldOf(defaults.value)
    if (!field) return data
    const mode = binding.reduce ?? defaults.reduce ?? 'first'
    if (field.type === 'number' || mode === 'count') {
      const values = records.map(record => read(record, field)).filter((v): v is number => typeof v === 'number')
      data.value = mode === 'count' ? records.length : reduce(values, mode)
    } else
      data.value = records.length ? read(mode === 'last' ? records[records.length - 1]! : records[0]!, field) : null
    data.labels.value = field.label
    data.units.value = field.unit ?? ''
    return data
  }

  const keys =
    use === 'chart'
      ? [
          binding.dimension ?? defaults.dimension,
          ...(binding.measures?.length ? binding.measures : (defaults.measures ?? [])),
        ]
      : binding.columns?.length
        ? binding.columns
        : (defaults.columns ?? [])
  const fields = keys.map(fieldOf).filter((field): field is ApiField => !!field)
  data.rows = records.map(record => {
    const row: Record<string, unknown> = {}
    for (const field of fields) row[field.key] = read(record, field)
    return row
  })
  for (const field of fields) {
    data.labels[field.key] = field.label
    data.units[field.key] = field.unit ?? ''
  }
  const dimension = use === 'chart' ? fieldOf(binding.dimension ?? defaults.dimension) : fields.find(category)
  data.dimension = dimension?.key ?? fields[0]?.key ?? ''
  data.measures = fields.filter(field => field.key !== data.dimension && numeric(field)).map(field => field.key)
  data.value = records.length
  return data
}
