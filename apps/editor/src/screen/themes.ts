import type { ScreenDocument, Widget } from './model'
import { widgetDefinition } from './widgets'

/** A colour scheme for a whole screen; applying it recolours the page and every widget (one undo step). */
export interface ScreenTheme {
  id: string
  name: string
  background: string
  primary: string
  palette: string[]
  /** Body text and secondary text. */
  text: string
  muted: string
  /** Panel fills, control fills and table header / stripes. */
  panel: string
  control: string
  header: string
  stripe: string
}

export const themes: ScreenTheme[] = [
  {
    id: 'tech-blue',
    name: '科技蓝',
    background: '#060b16',
    primary: '#38bdf8',
    palette: ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee', '#f87171'],
    text: '#cbd5e1',
    muted: '#94a3b8',
    panel: 'rgba(6, 18, 36, 0.62)',
    control: 'rgba(8, 47, 73, 0.55)',
    header: 'rgba(56, 189, 248, 0.16)',
    stripe: 'rgba(56, 189, 248, 0.05)',
  },
  {
    id: 'energy-green',
    name: '能源绿',
    background: '#03110d',
    primary: '#34d399',
    palette: ['#34d399', '#a3e635', '#22d3ee', '#facc15', '#4ade80', '#2dd4bf', '#86efac', '#fb923c'],
    text: '#d1fae5',
    muted: '#86b8a4',
    panel: 'rgba(4, 30, 22, 0.62)',
    control: 'rgba(6, 78, 59, 0.5)',
    header: 'rgba(52, 211, 153, 0.16)',
    stripe: 'rgba(52, 211, 153, 0.05)',
  },
  {
    id: 'dark-gold',
    name: '暗金',
    background: '#0d0a05',
    primary: '#fbbf24',
    palette: ['#fbbf24', '#f59e0b', '#fde68a', '#fb923c', '#facc15', '#d97706', '#fcd34d', '#f87171'],
    text: '#fef3c7',
    muted: '#c4ab78',
    panel: 'rgba(32, 22, 6, 0.62)',
    control: 'rgba(120, 83, 12, 0.35)',
    header: 'rgba(251, 191, 36, 0.14)',
    stripe: 'rgba(251, 191, 36, 0.05)',
  },
  {
    id: 'cyber-purple',
    name: '赛博紫',
    background: '#0a0617',
    primary: '#a78bfa',
    palette: ['#a78bfa', '#f472b6', '#22d3ee', '#818cf8', '#e879f9', '#38bdf8', '#c4b5fd', '#fb7185'],
    text: '#ede9fe',
    muted: '#a59cc8',
    panel: 'rgba(24, 14, 48, 0.62)',
    control: 'rgba(76, 29, 149, 0.35)',
    header: 'rgba(167, 139, 250, 0.16)',
    stripe: 'rgba(167, 139, 250, 0.05)',
  },
  {
    id: 'gov-red',
    name: '政务红',
    background: '#140406',
    primary: '#f87171',
    palette: ['#f87171', '#fbbf24', '#fb923c', '#fca5a5', '#facc15', '#f43f5e', '#fdba74', '#e879f9'],
    text: '#fee2e2',
    muted: '#c9a2a2',
    panel: 'rgba(40, 8, 12, 0.62)',
    control: 'rgba(127, 29, 29, 0.38)',
    header: 'rgba(248, 113, 113, 0.16)',
    stripe: 'rgba(248, 113, 113, 0.05)',
  },
]

/** Widgets where each instance keeps its own colour from the palette (a row of KPI cards stays varied). */
const varied = new Set(['kpi', 'progress', 'ring'])
/** Widgets whose `color` is their text colour. */
const textual = new Set(['text', 'clock', 'marquee'])

/** The colour a themed prop takes, or undefined to leave it. */
function themedColor(widget: Widget, key: string, current: unknown, from: ScreenTheme, to: ScreenTheme): unknown {
  switch (key) {
    case 'palette': {
      const list = Array.isArray(current) ? current : []
      return list.length === 1 ? [to.primary] : [...to.palette]
    }
    case 'color': {
      if (textual.has(widget.type)) return to.text
      if (varied.has(widget.type)) {
        const index = from.palette.findIndex(color => color.toLowerCase() === String(current).toLowerCase())
        return index >= 0 ? to.palette[index % to.palette.length] : to.primary
      }
      return to.primary
    }
    case 'colorTo':
    case 'gradientTo':
      return to.palette[1]
    case 'highlight':
      return to.palette[2]
    case 'textColor':
      return to.text
    case 'titleColor':
    case 'headerColor':
      return to.muted
    case 'background':
      return to.control
    case 'fill':
    case 'boxColor':
      return to.panel
    case 'headerBackground':
      return to.header
    case 'stripe':
      return to.stripe
    case 'borderColor':
      return to.primary
  }
  return undefined
}

export function themeOf(document: ScreenDocument): ScreenTheme {
  return themes.find(theme => theme.id === document.page.theme) ?? themes[0]!
}

/** Recolours the page and every widget's colour props (in a document draft). */
export function applyTheme(draft: ScreenDocument, to: ScreenTheme): void {
  const from = themeOf(draft)
  draft.page.theme = to.id
  draft.page.background.color = to.background
  for (const widget of draft.widgets) {
    const fields = widgetDefinition(widget.type)?.fields ?? []
    for (const field of fields) {
      if (field.type !== 'color' && field.type !== 'palette') continue
      const current = widget.props[field.key] ?? widgetDefinition(widget.type)?.props[field.key]
      const next = themedColor(widget, field.key, current, from, to)
      if (next !== undefined) widget.props[field.key] = next
    }
  }
}
