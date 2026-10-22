import type { WidgetData } from '../widgets/types'

export function emptyData(): WidgetData {
  return { value: null, rows: [], dimension: '', measures: [], labels: {}, units: {} }
}

/** Describes rows: the first text column is the category, number columns are the measures. */
export function describeRows(rows: Array<Record<string, unknown>>): Pick<WidgetData, 'dimension' | 'measures'> {
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))]
  const numeric = (key: string) => rows.every(row => row[key] === undefined || typeof row[key] === 'number')
  const dimension = keys.find(key => !numeric(key)) ?? keys[0] ?? ''
  return { dimension, measures: keys.filter(key => key !== dimension && numeric(key)) }
}

/**
 * Static data typed by the user: a number or text (a value), an array of objects (rows), or an object
 * with `value` and/or `rows`.
 */
export function staticData(json: string | undefined): WidgetData {
  const data = emptyData()
  if (!json?.trim()) return data
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    // Plain text that is not JSON is a value.
    data.value = json
    return data
  }
  if (Array.isArray(parsed)) {
    data.rows = parsed.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    data.value = parsed.length && typeof parsed[0] !== 'object' ? parsed[0] : null
  } else if (parsed && typeof parsed === 'object') {
    const object = parsed as { value?: unknown; rows?: unknown }
    data.value = object.value ?? null
    if (Array.isArray(object.rows)) data.rows = object.rows as Array<Record<string, unknown>>
  } else data.value = parsed
  Object.assign(data, describeRows(data.rows))
  return data
}
