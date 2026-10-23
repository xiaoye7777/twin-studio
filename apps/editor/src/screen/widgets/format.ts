/** Number formatting shared by figure widgets. */
export function formatNumber(value: unknown, decimals = 0): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Imported files may carry any number here; toLocaleString only takes 0–20.
    const digits = Math.min(10, Math.max(0, Math.round(Number(decimals) || 0)))
    return value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  }
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

const pad = (value: number, size = 2) => String(value).padStart(size, '0')
const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

/** Date formatting with YYYY MM DD HH mm ss and dddd (weekday). */
export function formatDate(date: Date, pattern: string): string {
  return pattern
    .replace('YYYY', String(date.getFullYear()))
    .replace('MM', pad(date.getMonth() + 1))
    .replace('DD', pad(date.getDate()))
    .replace('HH', pad(date.getHours()))
    .replace('mm', pad(date.getMinutes()))
    .replace('ss', pad(date.getSeconds()))
    .replace('dddd', weekdays[date.getDay()]!)
}

/** A default palette tuned for dark data screens. */
export const screenPalette = ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee', '#f87171']

export const numberFont = '"DIN Alternate", "Bahnschrift", "D-DIN", "Roboto Condensed", "PingFang SC", sans-serif'
